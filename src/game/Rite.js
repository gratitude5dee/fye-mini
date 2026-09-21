import { settings } from '../config/settings.js';
import * as store from '../state/riteStore.js';
import { isPersistent, read as readPreferences, write as writePreferences } from '../state/preferences.js';
import { TO_UI } from '../state/events.js';
import { generateRite, dailySeed } from './layouts.js';
import { resolveStroke, outcomeStrength } from './resolveStroke.js';
import { Ward } from './Ward.js';
import { GhostLine } from './GhostLine.js';

/**
 * The session: problems posed, lines judged, the Ward answering.
 *
 * Lives in `App.frame()` between the abilities stepping and the particles
 * flushing, which is the only place that can read what the casts just did and
 * still write effects before the frame is uploaded.
 *
 * It owns no state of its own — `riteStore` does — so the interface and the
 * frame loop always agree about what line is up and how many attempts are left.
 */

const ELEMENT_ACCENT = {
  fire: '#ff6a3c', water: '#3fb8c9', earth: '#c6a372', air: '#bfe8df', wind: '#bfe8df'
};

/** The pause between resolving a line and posing the next one, seconds. */
const BEAT = 1.6;
/** How long the close holds before free play resumes, seconds. */
const CLOSE_HOLD = 4.5;

export class Rite {
  /**
   * @param {object} ctx { scene, decals, bursts, shake, flash, abilities }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.ward = new Ward(ctx.scene);
    this.ghost = new GhostLine(ctx.scene);
    // The suggestion is for people who have never solved one. After that it
    // would be noise, so it is never laid again.
    this._teaching = !readPreferences().onboarding.firstSolve;
    this.layouts = [];
    this._timer = 0;
    this._pending = null;
    this._failedAttempts = 0;
    store.setPersistent(isPersistent());
  }

  get active() {
    return store.get().phase !== 'free';
  }

  /** True while a drawn stroke should be judged rather than simply admired. */
  get judging() {
    const phase = store.get().phase;
    return phase === 'present' || phase === 'draw';
  }

  /** Open a Rite. Seeded by the day unless a seed is supplied. */
  begin(seed = dailySeed(new Date()), riteIndex = 0) {
    const lines = settings.rite.lines;
    this.layouts = generateRite(seed, lines, riteIndex);
    store.beginRite(seed, lines, settings.rite.attempts);
    this.ward.setRite(lines);
    this.ward.showWard(store.get().ward);
    this._failedAttempts = 0;
    this._timer = 0;
    // An outcome left over from a previous Rite would be settled against line 0
    // of this one, lighting a stone nobody earned.
    this._pending = null;
    this._present();
    this._publish();
  }

  /** Set the Rite aside. Free play is always one key away. */
  setAside() {
    store.setFree();
    this.ward.clear();
    // `update()` stops the moment the phase is free, so anything left showing
    // here is left showing for the rest of the session. `clear()` takes the
    // stones; this takes the suggestion, which used to survive into free play.
    this.ghost.cut();
    // Back to the authored framing: free play has nothing wide to show.
    this.ctx.frameGround?.(0);
    this.layouts = [];
    this._pending = null;
    this._timer = 0;
    this._publish();
  }

  /**
   * The widest the line is, left to right, including the caster at the origin
   * and the outer edge of every ring — which is what has to be on screen, not
   * the centres.
   */
  static extentOf(layout) {
    let min = 0;
    let max = 0;
    for (const list of [layout.waystones, layout.hazards]) {
      for (const feature of list) {
        min = Math.min(min, feature.x - feature.radius);
        max = Math.max(max, feature.x + feature.radius);
      }
    }
    return max - min;
  }

  _present() {
    const { lineIndex } = store.get();
    const layout = this.layouts[lineIndex];
    if (!layout) return;
    this._failedAttempts = 0;
    // Asked for per line rather than once per Rite: most lines need far less
    // than the widest one, and framing every line for the widest would push a
    // phone's camera back for the whole session.
    this.ctx.frameGround?.(Rite.extentOf(layout));
    store.presentLine(layout);
    this.ward.setLayout(layout, ELEMENT_ACCENT[layout.elements[0]] ?? '#bfe8df');
    if (this._teaching) this.ghost.show(this.ctx.casterPosition?.() ?? { x: 0, z: 0 }, layout);
    else this.ghost.hide();
  }

  /**
   * Judge one drawn line.
   *
   * Called from the cast handler with the polyline `PathDrawer` just built and
   * the ability that actually flew — so the lift asked about is the real
   * altitude of the real cast, not an assumption about the element.
   *
   * @param {Array<{x:number,z:number}>} points recycled buffer; read, never kept
   * @param {number} count live entries in `points`
   * @param {import('../abilities/Ability.js').Ability|null} ability
   * @returns {number} 0..1 how much of the problem the line got
   */
  judge(points, count, ability) {
    const state = store.get();
    if (!this.judging || !state.layout) return 1;
    // One line, one outcome. `judging` admits `'draw'`, which is the phase the
    // first cast puts us in, so a second cast inside the 1.6 s beat used to
    // overwrite the outcome and reset the timer — a player casting faster than
    // once per beat never resolved the line at all, and a burst of any length
    // cost exactly one attempt. The cast still flies and still looks like a
    // cast; it simply does not get a second verdict on a line already judged.
    if (this._pending) return outcomeStrength(this._pending);

    // Each failed attempt widens the accept rings a little. The player is never
    // told; being quietly helped is the only kind of help that does not sting.
    const forgiveness = settings.rite.waystoneForgiveness ** this._failedAttempts;
    // Both terms: how high this element flies, and whatever the stroke carried.
    //
    // The element's contribution is the declared `flightFloor`, not its live
    // `pathHeight` — water's altitude includes a time-driven swell, and judging
    // against it meant the clock decided whether a line cleared a hazard.
    // The stroke's lift stays live, because that is the player's own input.
    const floors = settings.rite.flightFloor;
    const element = ability ? (ability.element === 'wind' ? 'air' : ability.element) : null;
    const floor = element ? (floors[element] ?? 0) : 0;
    const liftAt = ability ? (u) => floor + ability.lift(u) : () => 0;
    const outcome = resolveStroke(points, count, state.layout, liftAt, forgiveness);

    this.ward.showOutcome(outcome);
    // Resolve on a beat rather than instantly, so the cast is seen to arrive
    // before the world answers it.
    this._pending = outcome;
    this._timer = 0;
    store.beginDraw();
    return outcomeStrength(outcome);
  }

  _settle(outcome) {
    const result = store.resolveLine(outcome.solved);
    if (!outcome.solved) this._failedAttempts += 1;
    if (outcome.solved && this._teaching) {
      // One success is the whole lesson. Burn it away and never lay another.
      this._teaching = false;
      this.ghost.retire();
      writePreferences({ onboarding: { ...readPreferences().onboarding, firstSolve: true } });
    }

    const state = store.get();
    this.ward.showWard(state.ward);

    if (result === 'retry') {
      // Same problem, wider rings, nothing said.
      this.ward.setLayout(state.layout, ELEMENT_ACCENT[state.layout?.elements?.[0]] ?? '#bfe8df');
    } else if (state.phase === 'close') {
      this.ward.setLayout(null);
      // Not `cut()`: a burn started by the `retire()` above belongs to this same
      // settle, and the close beat is long enough to let it play out.
      this.ghost.hide();
    } else {
      this._present();
    }
    this._publish();
  }

  /** Feed the suggestion the pointer's ground position while a stroke is live. */
  trackPointer(x, z) {
    if (this._teaching) this.ghost.trackPointer(x, z);
  }

  update(dt) {
    if (!this.active) return;
    this.ward.update(dt);
    this.ghost.update(dt);

    if (this._pending) {
      this._timer += dt;
      if (this._timer >= BEAT) {
        const outcome = this._pending;
        this._pending = null;
        this._timer = 0;
        this._settle(outcome);
      }
      return;
    }

    if (store.get().phase === 'close') {
      this._timer += dt;
      if (this._timer >= CLOSE_HOLD) this.setAside();
    }
  }

  _publish() {
    const state = store.get();
    window.dispatchEvent(new CustomEvent(TO_UI.RITE_STATE, {
      detail: {
        phase: state.phase,
        lineIndex: state.lineIndex,
        lineCount: state.lineCount,
        attemptsLeft: state.attemptsLeft,
        ward: [...state.ward],
        elements: state.layout?.elements ?? [],
        persistent: state.persistent
      }
    }));
  }

  dispose() {
    this.ghost.dispose();
    this.ward.dispose();
    this.layouts = [];
  }
}
