import { Color } from 'three';
import { settings } from '../config/settings.js';
import { damp } from '../utils/math.js';

/**
 * Full-screen colour flash for impacts.
 *
 * Holds nothing but state — the composite pass reads `color` and `strength`
 * every frame, so a flash costs no extra draw call.
 */
export class ScreenFlash {
  constructor() {
    this.color = new Color(1, 1, 1);
    this.strength = 0;
    this._decay = 0.0004;
    this._windowAt = 0;
    this._inWindow = 0;
  }

  /**
   * @param {THREE.Color} color
   * @param {number} strength 0..1
   * @param {number} [decay]  fraction remaining after one second
   */
  trigger(color, strength, decay = 0.0004) {
    const scaled = strength * settings.post.flashStrength;
    if (scaled <= this.strength) return;

    // WCAG 2.3.1 puts the general flash threshold at three flashes in any one
    // second. Refusing a weaker flash than the current one already thins these
    // out, but it does not bound the rate, so a burst of impacts can strobe.
    // Past the budget the flash is admitted at a fraction of its strength: the
    // cast still reads, the screen stops pulsing.
    const now = this._now();
    if (now - this._windowAt >= 1) {
      this._windowAt = now;
      this._inWindow = 0;
    }
    const overBudget = this._inWindow >= 3;
    const admitted = Math.min(1, overBudget ? scaled * 0.25 : scaled);
    // The guard at the top only proves `scaled` beats the live flash; a quarter
    // of it need not. Admitting it anyway snapped the screen *down* mid-decay
    // and recoloured it to the new element on the way — a pop-down, which is
    // the opposite of what a rate limiter is for.
    if (admitted <= this.strength) return;
    this._inWindow++;

    this.color.copy(color);
    this.strength = admitted;
    this._decay = decay;
  }

  /** Seconds. Split out so a test can drive the window without a clock. */
  _now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }

  update(dt) {
    if (this.strength <= 0.0005) {
      this.strength = 0;
      return;
    }
    this.strength = damp(this.strength, 0, this._decay, dt);
  }

  reset() {
    this.strength = 0;
    // Both, or the first flash after a reset lands in a window that is already
    // most of a second old and is rate-limited against flashes that are gone.
    this._inWindow = 0;
    this._windowAt = this._now();
  }
}
