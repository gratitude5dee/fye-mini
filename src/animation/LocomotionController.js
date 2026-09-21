import { MathUtils, Vector3 } from 'three';

const _forward = new Vector3();
const _right = new Vector3();
const _wish = new Vector3();
const _next = new Vector3();
const _ground = new Vector3();
const _up = new Vector3(0, 1, 0);

/**
 * Grounded third-person movement.  The character remains an ordinary Three
 * object: this class owns only placement, velocity, and the small state that
 * the procedural performance layer needs to read as a walk or run.
 */
export class LocomotionController {
  constructor(character, camera, input, worlds) {
    this.character = character;
    this.camera = camera;
    this.input = input;
    this.worlds = worlds;
    this.velocityY = 0;
    this.grounded = true;
    this.jumpHeld = false;
    this.state = { moving: false, sprinting: false, speed: 0 };
    this.spawn = new Vector3(0, 0, 0);
    this.spawnYaw = 0;
  }

  setSpawn(spawn = {}) {
    this.spawn.set(Number(spawn.x) || 0, Number(spawn.y) || 0, Number(spawn.z) || 0);
    this.spawnYaw = Number(spawn.yaw) || 0;
    this.resetToSpawn();
  }

  resetToSpawn() {
    this.character.position.copy(this.spawn);
    this.character.setFacing(this.spawnYaw);
    this.character.setLean(0);
    this.velocityY = 0;
    this.grounded = true;
  }

  stop() {
    this.state.moving = false;
    this.state.sprinting = false;
    this.state.speed = 0;
    this.velocityY = 0;
    this.jumpHeld = this.input.keys.has('Space');
  }

  update(dt, { locked = false } = {}) {
    if (locked || dt <= 0) {
      this.stop();
      return;
    }

    const keys = this.input.keys;
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const moving = forward !== 0 || side !== 0;
    const sprinting = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
    const speed = sprinting ? 7.1 : 4.2;

    this.state.moving = moving;
    this.state.sprinting = sprinting;
    this.state.speed = moving ? speed : 0;

    this.camera.getWorldDirection(_forward).setY(0);
    if (_forward.lengthSq() < 1e-5) _forward.set(0, 0, -1);
    _forward.normalize();
    _right.crossVectors(_forward, _up).normalize();
    _wish.copy(_forward).multiplyScalar(forward).addScaledVector(_right, side);
    if (_wish.lengthSq() > 0) {
      _wish.normalize();
      const yaw = Math.atan2(_wish.x, _wish.z);
      this.character.setFacing(MathUtils.damp(this.character.facing, yaw, 12, dt));

      _next.copy(this.character.position).addScaledVector(_wish, speed * dt);
      if (this.worlds.canTraverse(this.character.position, _next) && this.worlds.groundAt(_next, _ground)) {
        const rise = _ground.y - this.character.position.y;
        if (rise <= 0.62 || !this.grounded) {
          this.character.position.x = _next.x;
          this.character.position.z = _next.z;
          if (this.grounded) this.character.position.y = _ground.y;
        }
      }
    }

    const wantsJump = keys.has('Space');
    if (wantsJump && !this.jumpHeld && this.grounded) {
      this.velocityY = 6.1;
      this.grounded = false;
    }
    this.jumpHeld = wantsJump;

    if (!this.grounded) {
      this.velocityY -= 17.5 * dt;
      this.character.position.y += this.velocityY * dt;
      if (this.worlds.groundAt(this.character.position, _ground) && this.character.position.y <= _ground.y) {
        this.character.position.y = _ground.y;
        this.velocityY = 0;
        this.grounded = true;
      } else if (this.character.position.y < this.spawn.y - 8) {
        this.resetToSpawn();
      }
    } else if (this.worlds.groundAt(this.character.position, _ground)) {
      this.character.position.y = _ground.y;
    }
  }
}
