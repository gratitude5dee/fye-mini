import { CatmullRomCurve3, Vector3 } from 'three';
import { PathTrail } from '../effects/PathTrail.js';
import { settings } from '../config/settings.js';
import { saturate } from '../utils/math.js';

/**
 * The whole tutorial, and it has no words.
 *
 * A faint line runs from the caster to the first waystone. The player draws
 * along it, it brightens where their stroke is near and dims where it is not,
 * and once they succeed it never appears again. Their second line is already
 * entirely their own.
 *
 * Its job is not to show a shape to copy. It shows, once, that *a line can be
 * drawn from here to there* — which is the verb, and the only thing a new
 * player is actually missing. A lit stone on a dark stage with a glowing line
 * running to it needs no caption, and every word after that would compete with
 * something the player is now actively doing.
 *
 * It also never finishes itself. An earlier design had it complete the line in
 * front of the player after two failures, which is the game taking the pen out
 * of your hand in the first thirty seconds. Being quietly given a wider target
 * instead — see `Rite.judge` — is the only kind of help that does not sting.
 */

const SAMPLES = 48;

export class GhostLine {
  constructor(scene) {
    this.trail = new PathTrail(SAMPLES + 4);
    // Under the player's own trail, so their line always reads on top of the
    // suggestion rather than fighting it.
    this.trail.mesh.renderOrder = 18;
    scene.add(this.trail.mesh);

    this._points = Array.from({ length: SAMPLES }, () => new Vector3());
    this._curve = null;
    this.visible = false;
    // Burning away is not the same as being gone: the dissolve is advanced by
    // `PathTrail.update`, so the line has to keep being updated after it stops
    // being visible or it freezes on the ground at full opacity.
    this._retiring = false;
    this._proximity = 1;
  }

  /**
   * Lay a suggestion from `from` to the first waystone of `layout`.
   *
   * Bowed rather than straight: a straight line reads as a diagram, and the
   * point is to suggest a drawn gesture.
   */
  show(from, layout) {
    const target = layout?.waystones?.[0];
    if (!target) return this.hide();

    const start = new Vector3(from.x, settings.trail.height, from.z);
    const end = new Vector3(target.x, settings.trail.height, target.z);
    const mid = start.clone().lerp(end, 0.5);
    // Bow perpendicular to the run, by a fraction of its length.
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz) || 1;
    mid.x += (-dz / length) * length * 0.16;
    mid.z += (dx / length) * length * 0.16;
    mid.y = settings.trail.height;

    this._curve = new CatmullRomCurve3([start, mid, end], false, 'catmullrom', 0.5);
    for (let i = 0; i < SAMPLES; i++) {
      this._curve.getPointAt(i / (SAMPLES - 1), this._points[i]);
      this._points[i].y = settings.trail.height;
    }
    this.trail.setPoints(this._points, SAMPLES);
    this.visible = true;
    this._proximity = 0;
  }

  /**
   * React to where the player's hand actually is.
   *
   * Brightens as the pointer nears the suggestion and fades as it strays, so
   * the correction is spatial and continuous rather than a sentence after the
   * fact. Costs one pass over 48 points on the frames a stroke is live.
   */
  trackPointer(x, z) {
    if (!this.visible) return;
    let nearest = Infinity;
    for (let i = 0; i < SAMPLES; i++) {
      const p = this._points[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < nearest) nearest = d;
    }
    // Full brightness within a metre, gone by four.
    this._proximity = saturate(1 - (Math.sqrt(nearest) - 1) / 3);
  }

  update(dt) {
    if (!this.visible && !this._retiring) return;
    this.trail.update(dt);
    if (this._retiring) {
      // The dissolve owns the look now. `PathTrail` hides itself at the end of
      // the burn, which is the only thing that can tell us it is over.
      if (!this.trail.mesh.visible) this._retiring = false;
      return;
    }
    const u = this.trail.material.uniforms;
    // Idles faint and legible; answers the player's hand as it approaches.
    u.uOpacity.value = (0.14 + this._proximity * 0.5) * settings.trail.opacity;
  }

  /** Burn it away. Used once, on the first success, and then never again. */
  retire() {
    if (!this.visible) return;
    this.trail.release();
    this.visible = false;
    this._retiring = true;
  }

  /**
   * Stop showing the suggestion.
   *
   * A burn already under way is left to finish. `Rite._settle` calls `retire()`
   * and then `_present()`, which calls this — so hiding hard here meant the
   * burn-away was cut dead on the frame it started, every time but the last
   * line of a Rite.
   */
  hide() {
    if (this._retiring) { this.visible = false; return; }
    this.trail.hide();
    this.visible = false;
  }

  /** Stop everything, burn included. For teardown, and for setting a Rite aside. */
  cut() {
    this.trail.hide();
    this.visible = false;
    this._retiring = false;
  }

  dispose() {
    this.cut();
    // Taken out of the graph before its buffers go, or the scene keeps a mesh
    // whose geometry and material have been freed.
    this.trail.mesh.parent?.remove(this.trail.mesh);
    this.trail.dispose();
  }
}
