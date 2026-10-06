import { SettingsLease } from '../config/settingsLease.js';
import { TO_UI } from '../state/events.js';

/**
 * Three tiers, chosen by measured frame time — never by a user-agent sniff.
 *
 * A device is not fast or slow; a *frame* is. A 2021 phone plugged in on a cold
 * scene and the same phone hot with four abilities in flight are different
 * machines, and the only honest way to tell them apart is to watch the clock.
 *
 * The ladder writes to `settings`, which the editor and the presets also write
 * to. It therefore remembers every value it wrote, and on the way back up it
 * restores a key only if the live value is still the one it left there — so a
 * dial the player moved while the stage was stepped down is not silently
 * reverted when the frames recover.
 *
 * Stepping down is quick and stepping up is slow, deliberately: a stutter the
 * player already felt should be answered at once, but recovering the moment the
 * window dips under a threshold produces a stage that oscillates between two
 * looks, which is worse than either of them.
 */

const WINDOW = 90;

/** Frame-time thresholds in milliseconds. */
const DOWN_TO_BALANCED = 14;
const DOWN_TO_CONSERVATIVE = 24;
// Recovery needs real headroom, not a threshold brush: 2 ms of hysteresis on
// each boundary, and a full clean window rather than a single good frame.
const UP_TO_HIGH = 12;
const UP_TO_BALANCED = 21;

export const TIERS = Object.freeze(['high', 'balanced', 'conservative']);

/** Inference passes per animation frame. 1 = every frame. */
const CADENCE = Object.freeze({ high: 1, balanced: 2, conservative: 3 });

export class QualityLadder {
  /**
   * @param {object} ctx
   * @param {import('./Renderer.js').Renderer} ctx.renderer
   * @param {import('../world/Environment.js').Environment} ctx.environment
   */
  constructor({ renderer, environment }) {
    this.renderer = renderer;
    this.environment = environment;
    this.tier = 'high';
    /** Inference passes per frame, read by `HandInput`. */
    this.cadence = 1;
    /** Two hands cost a second inference pass; the bottom tier refuses them. */
    this.allowsTwoHands = true;
    /** The tier has been named to the player once, and once is enough. */
    this.announced = false;

    this._samples = new Float32Array(WINDOW);
    this._filled = 0;
    this._cursor = 0;
    // The ladder's keys, disjoint from calm mode's and the opening's.
    this._lease = new SettingsLease();
  }

  /** Feed one frame's raw duration, in seconds. */
  sample(dt) {
    this._samples[this._cursor] = dt * 1000;
    this._cursor = (this._cursor + 1) % WINDOW;
    if (this._filled < WINDOW) this._filled++;
    // A partial window says nothing: the first frames include shader compiles
    // and the first upload of every buffer, which is not the steady state.
    if (this._filled < WINDOW) return;

    const median = this._median();
    const next = this._tierFor(median);
    if (next !== this.tier) this._apply(next, median);
  }

  /**
   * The middle frame, not the mean.
   *
   * One 400 ms shader compile drags a 90-frame mean over the conservative
   * threshold on its own, and the stage would drop two tiers for a hitch the
   * player saw once.
   */
  _median() {
    const sorted = Array.prototype.slice.call(this._samples, 0, this._filled).sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
  }

  /**
   * Where `ms` puts us, given where we already are.
   *
   * The current tier decides which question is being asked. Asking both — "is
   * it slow enough to drop?" and then "is it fast enough to climb?" — lets the
   * two overlap in the 14–21 ms band, and since the drop test runs first it
   * answers for the climb as well: from the bottom tier every frame time above
   * 14 ms read as "stay", so the ladder could go down and never come back up.
   */
  _tierFor(ms) {
    switch (this.tier) {
      case 'high':
        // Down is allowed to skip a rung. A frame time past a threshold is a
        // fact about frames the player has already sat through.
        if (ms > DOWN_TO_CONSERVATIVE) return 'conservative';
        return ms > DOWN_TO_BALANCED ? 'balanced' : 'high';
      case 'balanced':
        if (ms > DOWN_TO_CONSERVATIVE) return 'conservative';
        return ms < UP_TO_HIGH ? 'high' : 'balanced';
      default:
        // Up, one rung at a time and only with real headroom under the band.
        return ms < UP_TO_BALANCED ? 'balanced' : 'conservative';
    }
  }

  _apply(tier, median) {
    this.tier = tier;
    this.cadence = CADENCE[tier];
    this.allowsTwoHands = tier !== 'conservative';

    // Scaled against what the lease first took, not against the live value, or
    // stepping down twice would compound the reduction each time.
    const lease = this._lease;
    const radius = lease.original('post', 'bloomRadius');
    const particles = lease.original('global', 'particleCount');

    if (tier === 'high') {
      lease.releaseAll();
      this.renderer.setPixelRatioCap(1.75);
      this._setShadows(4096);
    } else if (tier === 'balanced') {
      lease.release('post', 'bloomStrength');
      lease.release('global', 'distortion');
      lease.write('post', 'bloomRadius', radius * 0.7);
      lease.write('global', 'particleCount', particles * 0.7);
      this.renderer.setPixelRatioCap(1.25);
      this._setShadows(2048);
    } else {
      lease.write('post', 'bloomStrength', 0);
      lease.write('post', 'bloomRadius', radius * 0.7);
      lease.write('global', 'particleCount', particles * 0.4);
      lease.write('global', 'distortion', 0);
      this.renderer.setPixelRatioCap(1);
      this._setShadows(0);
    }

    // The window is cleared on every step so the next decision is made from
    // frames rendered at the tier the ladder just chose, not from the ones that
    // caused the step.
    this._filled = 0;
    this._cursor = 0;

    window.dispatchEvent(new CustomEvent(TO_UI.QUALITY, {
      detail: { tier, median: Math.round(median * 10) / 10, cadence: this.cadence, announced: this.announced }
    }));
    if (tier !== 'high') this.announced = true;
  }

  /** `size` of 0 turns the sun's shadow off entirely. */
  _setShadows(size) {
    const sun = this.environment?.sun;
    if (!sun) return;
    if (size === 0) {
      sun.castShadow = false;
      return;
    }
    sun.castShadow = true;
    if (sun.shadow.mapSize.x === size) return;
    sun.shadow.mapSize.set(size, size);
    // The map is allocated at the old size; it has to go before three.js will
    // build a new one, or the resize is silently ignored.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
}
