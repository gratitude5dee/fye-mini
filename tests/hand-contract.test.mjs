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

test('the Rite judges the element altitude and the stroke lift together', async () => {
  const rite = await source('../src/game/Rite.js');
  assert.match(rite, /pathHeight\(u\)\s*\+\s*ability\.lift\(u\)/);
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
  assert.match(ctor, /new Float32Array\(320\)/);
  assert.equal((ctor.match(/new Float32Array\(320\)/g) ?? []).length, 2, 'both the raw and resampled channels are preallocated');
});
