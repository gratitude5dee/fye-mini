import test from 'node:test';
import assert from 'node:assert/strict';

import { InputManager } from '../src/input/InputManager.js';

test('the shared analog axis stays within unit magnitude and resets with held keys', () => {
  const input = Object.create(InputManager.prototype);
  input.axis = { x: 0, y: 0 };
  input.keys = new Set(['KeyW']);

  input.setAxis(3, 4);
  assert.equal(Math.hypot(input.axis.x, input.axis.y), 1);
  assert.ok(Math.abs(input.axis.x - 0.6) < 1e-12);
  assert.ok(Math.abs(input.axis.y - 0.8) < 1e-12);

  input.releaseAllKeys();
  assert.deepEqual([...input.keys], []);
  assert.deepEqual(input.axis, { x: 0, y: 0 });

  input.setAxis(-0.25, 0.5);
  input.clearAxis();
  assert.deepEqual(input.axis, { x: 0, y: 0 });
});
