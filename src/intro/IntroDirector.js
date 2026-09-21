import { MathUtils } from 'three';
import { settings } from '../config/settings.js';
import { TO_UI } from '../state/events.js';

/**
 * The opening.
 *
 * It is not a sequence that plays before the product starts; it is the product
 * starting. The canvas is the real renderer from the first frame, the fade is a
 * real grade, and it ends with the first problem on the ground.
 *
 * **One path, three durations.** An earlier design had four separate
 * choreographies — full, skip, reduced-motion and returning-visitor — each with
 * its own camera handoff and its own regression, for the least replayed seconds
 * in the product. Here there is one sequence and only the durations change.
 * Skip is therefore lossless by construction rather than by testing: it
 * shortens what is already running, so it cannot land the player elsewhere.
 *
 * **It cannot outrun the load.** The reveal is gated on the stage actually
 * being playable, not on a timer, because the opening it replaces ran a fixed
 * 7.6 seconds that could finish before the assets did or long after.
 *
 * The camera is never written directly. `CameraRig` re-derives its position
 * every frame from `settings.camera.distance` and the orbit target, so anything
 * assigned to `camera.position` is overwritten immediately. Driving the same
 * settings the rig already resolves means handing control back is a value
 * settling rather than a mode change.
 */

/** Beat durations in seconds: [normal, reduced motion, skipped]. */
const BEATS = {
  dark: [0.4, 0.4, 0.05],
  // The sigil, once the load is done: a held moment on the assembled shape,
  // then it lets go. Under reduced motion it is barely a beat — the cloud is
  // already crisp by then and holding it is the only part that is motion.
  sigil: [1.1, 0.25, 0.08],
  // The live stage is still the exit; the film simply gives its fade a richer
  // eight-second surface on capable, motion-permitting devices.
  reveal: [6.1, 0.6, 0.12],
  settle: [0.4, 0.4, 0.05]
};

/** Where the camera starts before it settles to the play framing. */
const OPENING_DISTANCE = 19;

export class IntroDirector {
  /**
   * @param {object} ctx { rig }
   * @param {object} [options]
   * @param {boolean} [options.reducedMotion] no camera move at all
   * @param {boolean} [options.returning] the visitor has been here before
   */
  constructor(ctx, { reducedMotion = false, returning = false } = {}) {
    this.ctx = ctx;
    this.reducedMotion = reducedMotion;
    this.returning = returning;
    this.skipped = false;
    this.finished = false;

    this.beat = 'dark';
    this._elapsed = 0;
    this._ready = false;
    /** How far the load has got, 0..1. Drives the sigil's convergence. */
    this._progress = 0;
    this._assembled = 0;

    // Remembered so the stage is handed back exactly as it was authored.
    this._restore = {
      gain: settings.post.gain,
      distance: settings.camera.distance,
      autoFrame: settings.camera.autoFrame
    };

    // The last value this director wrote to each key. The restore compares
    // against these so it hands back only what it is still holding: a wheel
    // zoom or a `grimoire:patch` landing during the two seconds the opening
    // runs used to be discarded by a restore of construction-time values.
    this._wrote = {};

    // Black through the grade rather than behind an overlay, so the renderer is
    // genuinely running underneath from the first frame.
    this._write('post', 'gain', 0);
    // A scripted framing must not be dragged toward whatever is casting.
    this._write('camera', 'autoFrame', 0);
    this._write('camera', 'distance', this._wantsCameraMove ? OPENING_DISTANCE : this._restore.distance);

    this._publish();
  }

  get _wantsCameraMove() {
    return !this.reducedMotion && !this.returning;
  }

  /** Duration of one beat under the current conditions. */
  _duration(beat) {
    const [normal, reduced, skipped] = BEATS[beat];
    if (this.skipped) return skipped;
    if (this.reducedMotion) return reduced;
    // A returning visitor gets the same path, briskly. Not nothing, and not
    // the whole thing again.
    return this.returning ? normal * 0.6 : normal;
  }

  /**
   * How far the load has got.
   *
   * The sigil converges on this, so the loading bar is not a bar beside the
   * picture — it *is* the picture, and there is nothing else to say about how
   * far through it is.
   */
  onProgress(ratio) {
    this._progress = MathUtils.clamp(ratio, 0, 1);
  }

  /** The stage is playable. Until this lands, `dark` simply holds. */
  onStageReady() {
    this._ready = true;
    this._progress = 1;
  }

  /** Collapse what is left. Never a cut, and never a different ending. */
  skip() {
    if (!this.finished) this.skipped = true;
  }

  update(dt) {
    if (this.finished) return;
    this._elapsed += dt;

    if (this.beat === 'dark') {
      // The sigil assembles on the load's own progress, and eases rather than
      // snapping: a load that jumps from 5% to 62% in one step should not make
      // the cloud teleport.
      this._assembled += (this._progress - this._assembled) * Math.min(1, dt * 3.2);
      this.ctx.sigil?.set(this._assembled, Math.min(1, this._elapsed * 2.4));
      // Hold on the gate rather than on a clock: the stage is not allowed to
      // claim it is opening before it can be played.
      if (this._elapsed >= this._duration('dark') && this._ready) this._advance('sigil');
      return;
    }

    const duration = this._duration(this.beat);
    const t = MathUtils.clamp(this._elapsed / duration, 0, 1);

    if (this.beat === 'sigil') {
      // Crisp, and held. The one still moment in the opening, and the only
      // place the shape is fully legible.
      this._assembled += (1 - this._assembled) * Math.min(1, dt * 6);
      this.ctx.sigil?.set(this._assembled, 1);
      if (t >= 1) this._advance('reveal');
      return;
    }

    if (this.beat === 'reveal') {
      // Ease out, so the stage arrives and settles rather than creeping in.
      const eased = 1 - (1 - t) ** 3;
      // The sigil lets go as the stage arrives: it scatters back outward and
      // fades, so the stage is revealed *through* it rather than after it. It
      // scatters rather than simply fading because a cloud that dims in place
      // reads as a mistake, and one that disperses reads as an ending.
      this.ctx.sigil?.set(1 - eased, 1 - eased ** 0.7);
      this._write('post', 'gain', this._restore.gain * eased);
      if (this._wantsCameraMove) {
        this._write('camera', 'distance', MathUtils.lerp(OPENING_DISTANCE, this._restore.distance, eased));
      }
      if (t >= 1) this._advance('settle');
      return;
    }

    if (this.beat === 'settle') {
      this.ctx.sigil?.set(0, 0);
      if (t >= 1) this._finish();
    }
  }

  _advance(beat) {
    this.beat = beat;
    this._elapsed = 0;
    this._publish();
  }

  /** Write a setting and remember doing so, so the restore can tell it apart. */
  _write(group, key, value) {
    settings[group][key] = value;
    this._wrote[`${group}.${key}`] = value;
  }

  /** Hand a key back, unless someone else has since claimed it. */
  _release(group, key) {
    if (settings[group][key] === this._wrote[`${group}.${key}`]) {
      settings[group][key] = this._restore[key];
    }
  }

  _finish() {
    // Whatever beat this was called from — including a skip straight out of
    // `dark` — the cloud is not left on the stage.
    this.ctx.sigil?.set(0, 0);
    // Restore what the director is still holding, so nothing it touched
    // survives it — and nothing the player did during it is thrown away.
    this._release('post', 'gain');
    this._release('camera', 'distance');
    this._release('camera', 'autoFrame');
    this.finished = true;
    this.beat = 'play';
    this._publish();
  }

  /** Hand the stage back immediately, whatever beat it is on. */
  dispose() {
    if (!this.finished) this._finish();
  }

  _publish() {
    window.dispatchEvent(new CustomEvent(TO_UI.INTRO, {
      detail: { beat: this.beat, finished: this.finished, skipped: this.skipped, reducedMotion: this.reducedMotion }
    }));
  }
}
