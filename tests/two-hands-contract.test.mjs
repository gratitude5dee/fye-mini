import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

/** A synthetic hand. Landmark 0 is the wrist, 4 the thumb tip, 8 the index tip. */
function hand({ pinch = 0.5, scale = 0.2, x = 0.5 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));
  points[0] = { x, y: 0.5, z: 0 };
  points[9] = { x, y: 0.5 - scale, z: 0 };          // sets hand scale
  points[4] = { x, y: 0.5, z: 0 };
  points[8] = { x: x + pinch * scale, y: 0.5, z: 0 }; // thumb-to-index gap
  return points;
}

// The constructor binds a `SELECTED` listener, so a window has to exist before
// the module graph is built. Stubbed rather than mocked: nothing here exercises
// the listener, it just has to be addressable.
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const { HandInput } = await import('../src/input/HandInput.js');

/* ------------------------------------------------------------------------ */

test('handedness is mirrored, because everything the player sees is', async () => {
  // MediaPipe's handedness is mirror-relative and this class mirrors x
  // everywhere it reaches the player — the preview and the pointer mapping both
  // use `1 - x`. The spec calls an unmirrored Left/Right the single most likely
  // bug in two-handed work, so it is one function rather than a comparison at
  // each use, and this is that function.
  const right = { handednesses: [[{ categoryName: 'Right' }]] };
  const left = { handednesses: [[{ categoryName: 'Left' }]] };
  assert.equal(HandInput.handOf(right, 0), 'left', "MediaPipe's Right is the player's left");
  assert.equal(HandInput.handOf(left, 0), 'right');

  // Older builds of tasks-vision spell the field `handedness`. Both are read.
  assert.equal(HandInput.handOf({ handedness: [[{ categoryName: 'Left' }]] }, 0), 'right');
  // And a missing or unlabelled hand is not guessed at.
  assert.equal(HandInput.handOf({}, 0), null);
  assert.equal(HandInput.handOf(right, 1), null);

  const hand = await source('../src/input/HandInput.js');
  assert.match(hand, /static handOf\(result, index\) \{/);
  // Nothing may compare a raw category name anywhere else.
  const outside = hand.replace(/static handOf\(result, index\) \{[\s\S]*?\n  \}/, '');
  assert.doesNotMatch(outside, /categoryName === '(?:Left|Right)'/);
});

test('the pinching hand draws, whoever it belongs to', () => {
  const tracker = new HandInput({ lift: 0, spread: 0 });
  // A left-handed player should not have to be told which hand is expected.
  const open = hand({ pinch: 0.9 });
  const pinched = hand({ pinch: 0.1 });

  assert.deepEqual(tracker._assignHands({ landmarks: [open, pinched] }), { draw: 1, off: 0 });
  assert.deepEqual(tracker._assignHands({ landmarks: [pinched, open] }), { draw: 0, off: 1 });
  // One hand in frame: nothing to choose, and no off hand.
  assert.deepEqual(tracker._assignHands({ landmarks: [open] }), { draw: 0, off: -1 });
  assert.deepEqual(tracker._assignHands({ landmarks: [] }), { draw: 0, off: -1 });
});

test('a stroke is never handed to the other hand halfway through', () => {
  const tracker = new HandInput({ lift: 0, spread: 0 });
  tracker.isDrawing = true;
  tracker._drawHand = 0;
  // Hand 0 is still pinched, hand 1 pinches harder. Without the mid-stroke
  // guard the stroke would jump to hand 1 and the line would tear across the
  // screen to wherever that hand happens to be.
  const held = hand({ pinch: 0.3 });
  const tighter = hand({ pinch: 0.05 });
  assert.deepEqual(tracker._assignHands({ landmarks: [held, tighter] }), { draw: 0, off: 1 });

  // Once hand 0 opens past the release threshold it is no longer drawing, and
  // the pinching hand takes over as usual.
  const released = hand({ pinch: 0.9 });
  assert.deepEqual(tracker._assignHands({ landmarks: [released, tighter] }), { draw: 1, off: 0 });
});

test('both hands are classified by the same rules', async () => {
  const hand = await source('../src/input/HandInput.js');
  // Two classifiers would be two sets of rules that could disagree, and a
  // player whose off hand means something different from their drawing hand
  // has no way to discover why.
  assert.match(hand, /_poseOf\(landmarks\) \{/);
  // The *definition*, not the call sites: matching the bare name would count
  // the two places that use it and report three.
  assert.equal((hand.match(/\n  _poseOf\(landmarks\) \{/g) ?? []).length, 1, 'defined once');
  assert.match(hand, /const next = this\._poseOf\(landmarks\);/, 'the drawing hand uses it');
  assert.match(hand, /const pose = this\._poseOf\(landmarks\);/, 'and so does the off hand');
  // One pinch measure too, or the hand picked as "drawing" is not the one the
  // draw gate lets draw.
  assert.match(hand, /_pinchRatio\(landmarks, handScale =/);
  assert.match(hand, /const pinchRatio = this\._pinchRatio\(landmarks, handScale\);/);
});

test('the off hand only speaks while a stroke is live, and never takes it back', async () => {
  const hand = await source('../src/input/HandInput.js');
  const start = hand.indexOf('  _trackOffHand(landmarks, now) {');
  assert.ok(start > 0);
  const body = hand.slice(start, hand.indexOf('\n  }', start));

  // Outside a stroke the dock and the drawing hand's own pose decide the
  // element; a third thing quietly overriding them makes the dock look broken.
  assert.match(body, /if \(!landmarks \|\| !this\.isDrawing\)/);
  // It must hold a pose longer than the drawing hand does. The off hand is idle
  // in frame for the whole stroke, so it has far more chance to be misread, and
  // a change it makes is already in the line by the time it is wrong.
  assert.match(body, /OFF_HAND_HOLD_MS/);
  assert.match(hand, /const OFF_HAND_HOLD_MS = (\d+);/);
  const off = Number(hand.match(/const OFF_HAND_HOLD_MS = (\d+);/)[1]);
  const pose = Number(hand.match(/const POSE_HOLD_MS = (\d+);/)[1]);
  assert.ok(off < pose, `the off hand should commit sooner than a deliberate pose (${off} vs ${pose})`);
  // It writes to the shared input, not a private field (hazard 8).
  assert.match(body, /this\.input\.elementIndex = index/);
});

test('two hands cost a second inference pass, so the ladder can refuse them', async () => {
  const hand = await source('../src/input/HandInput.js');
  assert.match(hand, /numHands: this\._wantsTwoHands\(\) \? 2 : 1/);
  assert.match(hand, /this\.quality\?\.allowsTwoHands !== false/);
  const ladder = await source('../src/core/QualityLadder.js');
  assert.match(ladder, /this\.allowsTwoHands = tier !== 'conservative'/);
});

test('one buffer, so a draw event has to say which stroke it belongs to', async () => {
  const drawer = await source('../src/input/PathDrawer.js');
  // Hazard 7: `PathDrawer` is a singleton with one `samples` array, and two
  // hands emitting into one `draw:*` channel interleave into a single corrupt
  // stroke that belongs to neither.
  assert.match(drawer, /begin\(pointer, strokeId = \+\+this\.strokeId\) \{/);
  assert.match(drawer, /move\(pointer, strokeId = this\.strokeId\) \{/);
  assert.match(drawer, /end\(strokeId = this\.strokeId\) \{/);
  // Every one of the three checks it, so a late event from the other hand is
  // dropped rather than appended.
  assert.equal((drawer.match(/strokeId !== this\.strokeId/g) ?? []).length, 2,
    'move and end both guard; begin defines the identity');
});

test('the keyboard reaches mid-stroke elements too, by holding a digit', async () => {
  const input = await source('../src/input/InputManager.js');
  // The honest claim about hands is that they are uninterrupted, not that they
  // are uniquely capable. If this were hands-only that claim would be false.
  assert.match(input, /_digit\(index\) \{\n\s*if \(this\.isDrawing\) this\.elementIndex = index;\n\s*else this\.emit\('element', index\);/);
  assert.match(input, /this\.elementIndex = -1;/, 'and the channel lives on the shared input');

  const hand = await source('../src/input/HandInput.js');
  // A hand stroke has to set the shared flag the keyboard reads, or holding a
  // digit during a hand-drawn line would select instead of writing the channel.
  assert.match(hand, /this\.input\.isDrawing = true;/);
  assert.match(hand, /this\.input\.isDrawing = false;/);
});

test('a new stroke starts from the selected element, not the last one held', async () => {
  const app = await source('../src/core/App.js');
  const start = app.indexOf("this.input.on('draw:start'");
  const body = app.slice(start, app.indexOf("this.input.on('draw:move'"));
  assert.match(body, /this\.input\.elementIndex = -1;/);
  // And the channels are read just before the sample lands, not pushed when
  // the source last happened to change.
  assert.match(app, /_carryChannels\(\) \{[\s\S]*?setLift\(this\.input\.lift\)[\s\S]*?setElementIndex\(/);
});
