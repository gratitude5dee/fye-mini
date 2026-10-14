import test from 'node:test';
import assert from 'node:assert/strict';

import { clampRect, flickVelocity, shouldDock, snapToEdge } from '../src/input/drag.js';

test('clampRect keeps a dragged rectangle inside the viewport', () => {
  assert.deepEqual(
    clampRect({ x: -40, y: 500, w: 100, h: 80 }, { vw: 320, vh: 400 }, 8),
    { x: 8, y: 312, w: 100, h: 80 }
  );
});

test('snapToEdge chooses the nearer edge and clamps vertical placement', () => {
  const viewport = { vw: 400, vh: 300 };
  assert.deepEqual(
    snapToEdge({ x: 30, y: 290, w: 80, h: 60 }, viewport),
    { x: 12, y: 228, w: 80, h: 60, side: 'left' }
  );
  assert.equal(snapToEdge({ x: 260, y: 40, w: 80, h: 60 }, viewport).side, 'right');
});

test('shouldDock accepts a deep drag or fast downward flick only', () => {
  assert.equal(shouldDock({ dy: 29, height: 100, velocity: 0.1 }), true);
  assert.equal(shouldDock({ dy: 4, height: 100, velocity: 0.56 }), true);
  assert.equal(shouldDock({ dy: 20, height: 100, velocity: 0.2 }), false);
});

test('flickVelocity measures recent samples instead of time since pointerdown', () => {
  const samples = [
    { y: 10, t: 0 },
    { y: 12, t: 12 },
    { y: 12, t: 1000 },
    { y: 72, t: 1050 }
  ];
  const velocity = flickVelocity(samples, 1050);
  assert.equal(velocity, 1.2);
  assert.equal(shouldDock({ dy: 4, height: 100, velocity }), true);
});

test('flickVelocity ignores stale and insufficient samples', () => {
  assert.equal(flickVelocity([{ y: 0, t: 0 }, { y: 60, t: 50 }], 131), 0);
  assert.equal(flickVelocity([{ y: 60, t: 1050 }], 1050), 0);
});
