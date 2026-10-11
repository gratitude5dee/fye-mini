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
const START_AT = { jump: .4, runjump: .6, cast: 0 };

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
  }

  has(name) {
    return this.character.actions?.has(name);
  }

  _pick() {
    const s = this.locomotion?.state;
    if (!s) return { name: 'idle' };

    // The seated pose is baked procedurally over whatever clip runs — the
    // mixer just needs a calm base underneath it.
    if (this.character.isSitting) return { name: 'idle' };

    if (!s.grounded) {
      if (s.jumpPhase === 'fall' && this.has('fall')) return { name: 'fall' };
      if (s.jumpPhase === 'landing') return { name: 'idle' };
      return { name: s.speed > 1.4 ? 'runjump' : 'jump', once: true };
    }

    if (s.moving) {
      if (s.sprinting) return { name: 'sprint' };
      return { name: s.speed > 2.4 ? 'run' : 'walk' };
    }

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
    const want = this._pick();
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
