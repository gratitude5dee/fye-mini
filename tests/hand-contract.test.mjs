import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { resolveStroke } from '../src/game/resolveStroke.js';
import { settings } from '../src/config/settings.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const straight = Array.from({ length: 40 }, (_, i) => ({ x: 0, z: -5 + (10 * i) / 39 }));
const LAYOUT = {
  waystones: [{ x: 0, z: -4, radius: 1.15 }, { x: 0, z: 4, radius: 1.15 }],
  hazards: [{ x: 0, z: 0, radius: 1.25 }]
};

test('a raised hand takes an element over a hazard a flat one cannot', () => {
  // This is the whole justification for hand tracking. PathDrawer raycasts onto
  // the ground plane, so a pointer stroke has no third axis to offer; if this
  // stops being true, hands are a demo again.
  const clearance = settings.rite.hazardClearance;
  const flat = resolveStroke(straight, straight.length, LAYOUT, () => 0);
  const raised = resolveStroke(straight, straight.length, LAYOUT, (u) => (u > 0.32 && u < 0.68 ? clearance + 0.5 : 0));
  assert.equal(flat.solved, false);
  assert.equal(raised.solved, true);
});

test('the lift is summed in both places, or a climbing cast points the wrong way', async () => {
  const ability = await source('../src/abilities/Ability.js');
  assert.match(ability, /lift\(u\)\s*\{/, 'Ability must expose a per-cast lift');
  assert.match(ability, /setLift\(/);

  // `_samplePath` places the cast and `_tiltTangent` aims it. A lift applied to
  // one and not the other produces an element that rises while still pointing
  // flat, which reads as a bug long before anyone finds this file.
  // Slice from the *definitions*, not the first call sites — both methods are
  // called from `spawn` long before they are declared.
  const samplePath = ability.slice(ability.indexOf('_samplePath(u, out) {'), ability.indexOf('_tiltTangent(u) {'));
  const tilt = ability.slice(ability.indexOf('_tiltTangent(u) {'), ability.indexOf('_updateOrientation(alpha) {'));
  assert.ok(samplePath.length > 40 && tilt.length > 40, 'the slices must contain the method bodies');
  assert.match(samplePath, /this\.lift\(/, '_samplePath must add the cast lift');
  assert.match(tilt, /this\.lift\(/, '_tiltTangent must add the cast lift');
});

test('a pooled ability cannot inherit the previous cast height', async () => {
  const ability = await source('../src/abilities/Ability.js');
  const destroy = ability.slice(ability.indexOf('  destroy()'));
  assert.match(destroy, /_lift = null/, 'destroy must clear the profile, or the next cast flies');
});

test('the lift is applied before the cast is spawned', async () => {
  const manager = await source('../src/abilities/AbilityManager.js');
  const setLift = manager.indexOf('setLift(');
  const spawn = manager.indexOf('.spawn(curve)');
  assert.ok(setLift > 0 && spawn > 0, 'AbilityManager must apply the lift and spawn');
  assert.ok(setLift < spawn, 'spawn samples the trajectory immediately; a later lift jumps');
});

test('the Rite judges the element floor and the stroke lift together', async () => {
  // Superseded formula: this used to add the live `pathHeight`, which made
  // solvability depend on the clock for water. See the rite contract test.
  const rite = await source('../src/game/Rite.js');
  assert.match(rite, /run\.floor \+ run\.ability\.lift\(local\)/);
  // `local`, not the stroke-wide progress: a line can carry more than one
  // element now, each cast along its own sub-curve, and an ability's lift
  // profile is parameterised over *its* curve. Reading it at the whole
  // stroke's `u` would take a second run's height from the wrong end.
  assert.match(rite, /\(index - run\.from\) \/ \(run\.to - run\.from\)/);
});

test('hand channels live on the shared input, not on the tracker', async () => {
  // Everything downstream is built on pointer and hand being indistinguishable.
  // A private field on HandInput would fork that.
  const manager = await source('../src/input/InputManager.js');
  const hand = await source('../src/input/HandInput.js');
  assert.match(manager, /this\.lift = 0/);
  assert.match(manager, /this\.spread = 0/);
  assert.match(hand, /this\.input\.lift =/);
  assert.match(hand, /this\.input\.spread =/);
});

test('stopping the tracker clears the lift', async () => {
  const hand = await source('../src/input/HandInput.js');
  const stop = hand.slice(hand.indexOf('  stop()'));
  assert.match(stop, /this\.input\.lift = 0/, 'a stale lift would keep raising pointer strokes');
});

test('the stroke keeps its own copy of the height channel', async () => {
  // `resampled` and its lift are preallocated and recycled by the next stroke,
  // while the ability that flew outlives the gesture that made it.
  const drawer = await source('../src/input/PathDrawer.js');
  assert.match(drawer, /liftProfile\(\)/);
  assert.match(drawer, /Float32Array/);
  const profile = drawer.slice(drawer.indexOf('liftProfile()'));
  assert.match(profile, /slice\.call|slice\(/, 'the profile must copy, not alias the live buffer');
});

test('drawing still allocates nothing per stroke', async () => {
  const drawer = await source('../src/input/PathDrawer.js');
  const ctor = drawer.slice(drawer.indexOf('constructor(camera)'), drawer.indexOf('get object3D'));
  // Every per-sample channel is preallocated at the same length as the sample
  // buffers, raw and resampled alike. The count is deliberately not pinned:
  // what matters is that nothing on the drawing path allocates, not how many
  // channels a stroke happens to carry this month.
  for (const channel of ['sampleLift', 'resampledLift', 'sampleElement', 'resampledElement', '_arc']) {
    assert.match(
      ctor,
      new RegExp(`this\\.${channel} = new (?:Float32|Uint8)Array\\(320\\)`),
      `${channel} must be preallocated`
    );
  }
  // And nothing in `begin` or `move` may allocate a typed array or a list.
  const drawing = drawer.slice(drawer.indexOf('  begin(pointer'), drawer.indexOf('  end('));
  assert.doesNotMatch(drawing, /new (?:Float32|Uint8)Array|\.slice\(|\.map\(/);
});

test('all four anti-misfire guards are present, not two of four', async () => {
  // The spec is explicit that these only work together: shipping some of them
  // produces a tracker that fires on its own, which is worse than none.
  const hand = await source('../src/input/HandInput.js');

  // 1. Boots disengaged behind a held open palm.
  assert.match(hand, /this\.engaged = false/, 'must boot disengaged');
  assert.match(hand, /WAKE_MS/, 'must have a wake gate');
  assert.match(hand, /_isOpenPalm/);

  // 2. Schmitt triggers rather than bare thresholds.
  assert.match(hand, /PINCH_DOWN/);
  assert.match(hand, /PINCH_UP/);
  assert.match(hand, /EXTEND_RATIO/, 'extension must be a ratio, not a bare comparison');

  // 3. A pose must agree with itself before it is believed.
  assert.match(hand, /AGREE_FRAMES/);
  assert.match(hand, /_agreed/);

  // 4. A refractory window after a cast and at engagement.
  assert.match(hand, /REFRACTORY_MS/);
  assert.match(hand, /_refractoryUntil/);
});

test('lowering the hand is a control, and disengages rather than erroring', async () => {
  const hand = await source('../src/input/HandInput.js');
  assert.match(hand, /LOST_MS/);
  // Anchored on the definition, not the call site above it.
  const dropout = hand.slice(hand.indexOf('  _handleDropout(now) {'), hand.indexOf('  _isOpenPalm(landmarks) {'));
  assert.ok(dropout.length > 80, 'the slice must contain the method body');
  assert.match(dropout, /this\.engaged = false/, 'a lost hand must have to be woken again');
});

test('the tracker publishes its state, throttled, never per frame', async () => {
  const hand = await source('../src/input/HandInput.js');
  assert.match(hand, /PUBLISH_MS/);
  const publish = hand.slice(hand.indexOf('  _publish(now, tracking) {'));
  assert.match(publish, /now - this\._publishedAt < PUBLISH_MS/, 'must be throttled');
  // The interface cannot show a player that their hand height is doing anything
  // until these two reach it.
  assert.match(publish, /lift: this\.lift/);
  assert.match(publish, /spread: this\.spread/);
  assert.match(publish, /wake: this\.wake/);
  assert.match(publish, /pose: this\.pose/, 'the contextual guide needs the live pose');
  assert.match(publish, /tracking,/, 'the contextual guide needs the lost state');
});

test('hand mode is visibly available and the guide follows the armed slot', async () => {
  const stage = await source('../app/GrimoireStage.tsx');

  // The consent sheet remains opt-in and camera permission is still reached
  // only through Enable hands. The old two-success invitation is gone: users
  // do not have to discover a hidden prerequisite before finding the control.
  assert.match(stage, /!coarsePointer && <button[^>]*>Hand mode<\/button>/);
  assert.match(stage, /Enable hands/);
  assert.match(stage, /Not now/);
  assert.doesNotMatch(stage, /pointerSuccesses >= 2/);
  assert.doesNotMatch(stage, /handOfferVisible/);

  // A fixed legend turns live tracker state into a manual. The selected element
  // chooses the rows, while pose and loss light the relevant one.
  assert.match(stage, /GESTURE_GUIDES/);
  assert.match(stage, /const gestureGuide = GESTURE_GUIDES\[element\]/);
  assert.match(stage, /hand\.pose === element/);
  assert.match(stage, /hand\.tracking === 'lost'/);
});

test('the two things fye-mini does better than either reference survive', async () => {
  // Neither reference repository has a delegate fallback or a frame-rate
  // watchdog. Porting their model must not quietly drop ours.
  const hand = await source('../src/input/HandInput.js');
  assert.match(hand, /delegate: 'GPU'/);
  assert.match(hand, /delegate: 'CPU'/);
  // The threshold is now proportional to the inference cadence, because `fps`
  // counts inference passes: thinning the cadence lowers the measured rate by
  // construction, and a fixed 15 would make the watchdog kill tracking exactly
  // when the quality ladder had just stepped down to keep it alive.
  assert.match(hand, /const WATCHDOG_FPS = 15;/);
  assert.match(hand, /if \(fps < WATCHDOG_FPS \/ cadence\)/);
});
