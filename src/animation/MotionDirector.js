import { LoopOnce, LoopRepeat } from 'three';

/**
 * Turns locomotion state into clip choices on the character's mixer.
 *
 * The motion pack (`public/models/caster-motion.glb`, fal.ai / Meshy) carries
 * named clips; this director only decides which one is running.
 * `CasterPerformance` still layers procedurally on top of the chosen clip, and
 * `SittingPose` still owns the meditation seat, so a missing clip degrades to
 * `idle` and the older procedural-only rig keeps working.
 *
 * One-shot clips (jump, runjump, cast) play through their wind-up to impact;
 * loop clips (idle/walk/run/sprint/fall) cross-fade freely.
 */
const FALLBACK = 'idle';

/**
 * Per-clip playback rate. Authored stride speeds rarely match the game's
 * travel speeds exactly; these keep feet honest at 4.2 / 7.1 m/s.
 */
const SPEED = {
  idle: 1, walk: 1.05, run: 1.2, sprint: 1.1,
  jump: 1.15, runjump: 1.15, fall: 1, cast: 1
};

/**
 * Where a one-shot starts, in clip seconds — skips wind-up frames that would
 * otherwise play *after* the character is already airborne or mid-gesture.
 */
const START_AT = { jump: .4, runjump: .6, cast: 0, sit_enter: 0, sit_exit: 0, celebrate: 0 };

const FADE_LOOP = .24;
const FADE_ONCE = .16;

export class MotionDirector {
  /**
   * @param {import('./CharacterController.js').CharacterController} character
   * @param {import('./LocomotionController.js').LocomotionController} locomotion
   * @param {import('./CasterPerformance.js').CasterPerformance} [caster]
   */
  constructor(character, locomotion, caster = null) {
    this.character = character;
    this.locomotion = locomotion;
    this.caster = caster;
    this._playing = null;
    // Seated sequence state: 'enter' plays once, then 'sit' loops; the exit
    // edge gets its own one-shot timer so a stand-up reads deliberately.
    this._sitPhase = null;
    this._sitT = 0;
    this._exitT = 0;
    this._celebrateT = 0;
  }

  _clipLen(name) {
    const action = this.character.actions?.get(name);
    return action ? action.getClip().duration : 0;
  }

  /** Play the rite-complete flourish once, if the pack carries it. */
  celebrate() {
    // Victory_Cheer runs ~9s — cap the flourish so it can't out-stay the win.
    if (this.has('celebrate')) this._celebrateT = Math.min(6, this._clipLen('celebrate') * .95);
  }

  _movePick(s) {
    if (s.sprinting) return { name: 'sprint' };
    return { name: s.speed > 2.4 ? 'run' : 'walk' };
  }

  has(name) {
    return this.character.actions?.has(name);
  }

  _pick(dt) {
    const s = this.locomotion?.state;
    if (!s) return { name: 'idle' };

    // The rite-complete flourish rides above everything until it plays out.
    if (this._celebrateT > 0) {
      this._celebrateT -= dt;
      return { name: 'celebrate', once: true };
    }

    const sitting = this.character.isSitting;
    if (!sitting && this._sitPhase) {
      this._sitPhase = null;
      this._sitT = 0;
      if (this.has('sit_exit')) this._exitT = Math.min(1.4, this._clipLen('sit_exit') * .5);
    }
    if (this._exitT > 0) {
      this._exitT -= dt;
      return { name: 'sit_exit', once: true };
    }

    // The seated pose is still baked procedurally on top; the authored
    // enter/loop clips carry the transition underneath (and become the pose
    // itself on rigs where the procedural layer is off).
    if (sitting) {
      if (!this._sitPhase) {
        this._sitPhase = this.has('sit_enter') ? 'enter' : 'sit';
        this._sitT = 0;
      }
      if (this._sitPhase === 'enter') {
        this._sitT += dt;
        // Walk_to_Sit spends its tail already seated — hand off to the loop
        // once the transition part has played, not when the whole clip ends.
        if (this._sitT >= Math.min(2.8, this._clipLen('sit_enter') * .5)) this._sitPhase = 'sit';
        else return { name: 'sit_enter', once: true };
      }
      return { name: this.has('sit') ? 'sit' : 'idle' };
    }

    if (!s.grounded) {
      if (s.jumpPhase === 'fall' && this.has('fall')) return { name: 'fall' };
      if (s.jumpPhase === 'landing') {
        // Keep the stride clip through the ground-contact beat while still
        // travelling; only a stopped landing drops to idle.
        return s.moving && s.speed > .5 ? this._movePick(s) : { name: 'idle' };
      }
      return { name: s.speed > 1.4 ? 'runjump' : 'jump', once: true };
    }

    // Speed easing means a released key still reads as walk/run for the
    // deceleration tail instead of snapping straight to idle.
    if (s.moving || s.speed > .45) return this._movePick(s);

    // A full-body cast only reads while planted; running casts stay on the
    // procedural gesture layer so the stride keeps driving the legs.
    const gesture = this.caster?.gesture;
    if (gesture === 'gather' || gesture === 'aim' || gesture === 'release') {
      return { name: 'cast', once: true };
    }

    return { name: 'idle' };
  }

  update(dt) {
    if (dt <= 0) return; // paused — freezes whatever is mid-fade
    const want = this._pick(dt);
    if (want.name === this._playing) return;

    const name = this.has(want.name) ? want.name : FALLBACK;
    const action = this.character.actions.get(name);
    if (!action) return;

    action.setLoop(want.once ? LoopOnce : LoopRepeat, want.once ? 1 : Infinity);
    action.clampWhenFinished = !!want.once;
    this.character.play(name, want.once ? FADE_ONCE : FADE_LOOP);
    action.setEffectiveTimeScale(SPEED[name] ?? 1);
    if (want.once) action.time = Math.min(START_AT[name] ?? 0, action.getClip().duration * .4);

    this._playing = want.name;
  }
}
