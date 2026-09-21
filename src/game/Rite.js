import { settings } from '../config/settings.js';
import * as store from '../state/riteStore.js';
import { isPersistent } from '../state/preferences.js';
import { TO_UI } from '../state/events.js';
import { generateRite, dailySeed } from './layouts.js';
import { resolveStroke, outcomeStrength } from './resolveStroke.js';
import { Ward } from './Ward.js';

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
    this._present();
    this._publish();
  }

  /** Set the Rite aside. Free play is always one key away. */
  setAside() {
    store.setFree();
    this.ward.clear();
    this.layouts = [];
    this._pending = null;
    this._publish();
  }

  _present() {
    const { lineIndex } = store.get();
    const layout = this.layouts[lineIndex];
    if (!layout) return;
    this._failedAttempts = 0;
    store.presentLine(layout);
    this.ward.setLayout(layout, ELEMENT_ACCENT[layout.elements[0]] ?? '#bfe8df');
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

    // Each failed attempt widens the accept rings a little. The player is never
    // told; being quietly helped is the only kind of help that does not sting.
    const forgiveness = settings.rite.waystoneForgiveness ** this._failedAttempts;
    const liftAt = ability ? (u) => ability.pathHeight(u) : () => 0;
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

    const state = store.get();
    this.ward.showWard(state.ward);

    if (result === 'retry') {
      // Same problem, wider rings, nothing said.
      this.ward.setLayout(state.layout, ELEMENT_ACCENT[state.layout?.elements?.[0]] ?? '#bfe8df');
    } else if (state.phase === 'close') {
      this.ward.setLayout(null);
    } else {
      this._present();
    }
    this._publish();
  }

  update(dt) {
    if (!this.active) return;
    this.ward.update(dt);

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
    this.ward.dispose();
    this.layouts = [];
  }
}
