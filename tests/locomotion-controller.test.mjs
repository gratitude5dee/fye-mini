import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';

import { LocomotionController } from '../src/animation/LocomotionController.js';

function makeController() {
  const input = { keys: new Set() };
  const character = {
    position: new Vector3(),
    facing: 0,
    lean: 0,
    setFacing(value) { this.facing = value; },
    setLean(value) { this.lean = value; }
  };
  const camera = {
    getWorldDirection(out) { return out.set(0, 0, -1); }
  };
  const worlds = {
    groundAt(point, out) {
      out.set(point.x, 0, point.z);
      return true;
    },
    canTraverse() { return true; }
  };
  return { input, character, controller: new LocomotionController(character, camera, input, worlds) };
}

test('WASD movement is camera-relative and sprint increases travel speed', () => {
  const { input, character, controller } = makeController();
  input.keys.add('KeyW');
  for (let frame = 0; frame < 10; frame++) controller.update(.1);
  const walkingDistance = -character.position.z;
  assert.ok(walkingDistance > .4);
  assert.equal(controller.state.moving, true);
  assert.equal(controller.state.sprinting, false);

  controller.resetToSpawn();
  input.keys.add('ShiftLeft');
  for (let frame = 0; frame < 10; frame++) controller.update(.1);
  assert.ok(-character.position.z > walkingDistance);
  assert.equal(controller.state.sprinting, true);
});

test('a grounded jump rises, lands on the collider floor, and reports its phase', () => {
  const { input, character, controller } = makeController();
  input.keys.add('Space');
  controller.update(.1);
  assert.ok(character.position.y > 0);
  assert.equal(controller.state.grounded, false);
  assert.equal(controller.state.jumpPhase, 'rise');

  input.keys.delete('Space');
  for (let frame = 0; frame < 120; frame++) controller.update(1 / 60);
  assert.equal(character.position.y, 0);
  assert.equal(controller.state.grounded, true);
});

test('ground speed ramps toward the target instead of snapping', () => {
  const { input, controller } = makeController();
  input.keys.add('KeyW');
  controller.update(1 / 60);
  const early = controller.state.speed;
  assert.ok(early > 0 && early < 4.2, 'first frame should be mid-ramp');

  for (let frame = 0; frame < 60; frame++) controller.update(1 / 60);
  assert.equal(controller.state.speed, 4.2);

  input.keys.delete('KeyW');
  controller.update(1 / 60);
  assert.ok(controller.state.speed < 4.2 && controller.state.speed > 0, 'release eases down');
});

test('the analog axis ramps by deflection and yields to keyboard input', () => {
  const { input, character, controller } = makeController();
  input.axis = { x: 0, y: 0.4 };
  for (let frame = 0; frame < 60; frame++) controller.update(1 / 60);
  assert.equal(controller.state.moving, true);
  assert.ok(-character.position.z > 0, 'positive Y moves forward');
  assert.ok(Math.abs(controller.state.speed - Math.max(1.2, 4.2 * ((0.4 - 0.15) / 0.75))) < 1e-9);

  controller.resetToSpawn();
  input.axis = { x: 0, y: 1 };
  for (let frame = 0; frame < 60; frame++) controller.update(1 / 60);
  assert.equal(controller.state.speed, 4.2);

  input.keys.add('KeyW');
  input.axis = { x: 1, y: 0 };
  controller.update(1 / 60);
  assert.ok(controller.state.speed <= 4.2, 'held keyboard direction overrides the axis');

  input.keys.clear();
  input.keys.add('ShiftLeft');
  input.axis = { x: 0, y: 1 };
  for (let frame = 0; frame < 60; frame++) controller.update(1 / 60);
  assert.equal(controller.state.speed, 7.1);

  input.keys.clear();
  input.axis = { x: 0, y: 0.14 };
  controller.update(1 / 60);
  assert.equal(controller.state.moving, false);
});

test('modal and loading lockout leave the caster still', () => {
  const { input, character, controller } = makeController();
  input.keys.add('KeyD');
  controller.update(.2, { locked: true });
  assert.equal(character.position.length(), 0);
  assert.equal(controller.state.moving, false);
});
