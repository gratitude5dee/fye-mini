import { Raycaster, Plane, Vector3, CatmullRomCurve3, MathUtils } from 'three';
import { settings } from '../config/settings.js';
import { EventEmitter } from '../utils/EventEmitter.js';
import { PathTrail } from '../effects/PathTrail.js';

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/**
 * Turns a mouse drag into a smooth, castable spline.
 *
 * Pipeline:
 *   pointer NDC → raycast onto the ground plane → jitter-filtered sample list
 *   → exponential smoothing → CatmullRomCurve3 → uniform arc-length resample.
 *
 * The resampled polyline is what the preview ribbon and the abilities consume,
 * so the visible trail and the ability trajectory are guaranteed to agree.
 *
 * Emits: `cast` (curve, points, length), `start`, `cancel`.
 */
export class PathDrawer extends EventEmitter {
  constructor(camera) {
    super();
    this.camera = camera;
    this.raycaster = new Raycaster();
    this.raycaster.far = 500;

    /** Raw (filtered) samples on the ground. */
    this.samples = [];
    /** Smoothed + resampled polyline, reused every frame. */
    this.resampled = [];
    this.resampledCount = 0;

    this.trail = new PathTrail(240);
    this.active = false;

    this._hit = new Vector3();
    this._smoothed = new Vector3();
    this._tmp = new Vector3();

    // Pre-allocate the resample buffer so drawing never allocates.
    for (let i = 0; i < 320; i++) this.resampled.push(new Vector3());

    /**
     * Per-sample lift, in metres above the ground plane.
     *
     * A pointer stroke is pinned to y = 0 by the raycast, so with a mouse this
     * stays zero and nothing downstream changes. A hand has a height, and this
     * is where it rides along the stroke so the cast can rise exactly where the
     * player's hand did.
     *
     * Preallocated in step with `samples` and `resampled`, matching this file's
     * standing rule that drawing never allocates.
     */
    this.sampleLift = new Float32Array(320);
    this.resampledLift = new Float32Array(320);
    this._lift = 0;
  }

  get object3D() {
    return this.trail.mesh;
  }

  /** Project a pointer position onto the ground plane. @returns {boolean} hit */
  _project(pointer, out) {
    this.raycaster.setFromCamera(pointer, this.camera);
    return this.raycaster.ray.intersectPlane(GROUND_PLANE, out) !== null;
  }

  /**
   * Set the height the next accepted sample will carry.
   *
   * Written by whoever owns the input before each `move`, rather than added to
   * the draw event's signature, so pointer and hand stay indistinguishable
   * downstream — which is the property the whole input layer is built on.
   *
   * @param {number} metres
   */
  setLift(metres) {
    this._lift = Number.isFinite(metres) ? Math.max(0, metres) : 0;
  }

  begin(pointer) {
    if (!this._project(pointer, this._hit)) return;
    this.samples.length = 0;
    this._smoothed.copy(this._hit);
    this.sampleLift[0] = this._lift;
    this.samples.push(this._hit.clone());
    this.active = true;
    this.trail.hide();
    this.emit('start', this._hit);
  }

  move(pointer) {
    if (!this.active) return;
    if (!this._project(pointer, this._hit)) return;

    const input = settings.input;

    // Exponential smoothing removes hand tremor without adding latency.
    this._smoothed.lerp(this._hit, MathUtils.clamp(1 - input.smoothing, 0.05, 1));

    const last = this.samples[this.samples.length - 1];
    if (last && this._smoothed.distanceTo(last) < input.minPointDistance) return;
    if (this.samples.length >= input.maxPoints) return;

    this.sampleLift[this.samples.length] = this._lift;
    this.samples.push(this._smoothed.clone());
    this._rebuild();
  }

  end() {
    if (!this.active) return;
    this.active = false;

    const length = this.pathLength();
    if (this.samples.length < 3 || length < settings.input.minPathLength) {
      this.trail.hide();
      this.samples.length = 0;
      this.emit('cancel');
      return;
    }

    const curve = this._buildCurve();
    this.trail.release(); // burn the preview away
    this.emit('cast', curve, this.resampled, this.resampledCount, length);
    this.samples.length = 0;
  }

  pathLength() {
    let total = 0;
    for (let i = 1; i < this.samples.length; i++) total += this.samples[i].distanceTo(this.samples[i - 1]);
    return total;
  }

  _buildCurve() {
    // CatmullRom needs at least 2 points; we guarantee 3+ before calling.
    const curve = new CatmullRomCurve3(
      this.samples.map((p) => p.clone()),
      false,
      'catmullrom',
      settings.input.curveTension
    );
    curve.arcLengthDivisions = Math.max(64, this.samples.length * 8);
    return curve;
  }

  /** Resample the current stroke into `this.resampled` for the preview ribbon. */
  _rebuild() {
    if (this.samples.length < 2) return;

    const curve = this._buildCurve();
    const length = curve.getLength();
    const wanted = MathUtils.clamp(Math.round(length * settings.input.samplesPerUnit), 2, this.resampled.length);

    for (let i = 0; i < wanted; i++) {
      const t = i / (wanted - 1);
      curve.getPointAt(t, this.resampled[i]);
      this.resampled[i].y = settings.trail.height;
      // `getPointAt` walks the curve by arc length; the lift channel is indexed
      // by sample. Those agree only if the samples are evenly spaced, and they
      // are not — `minPointDistance` is a floor, so a slow drag gives a sample
      // every 0.22 m and a fast flick gives one every several metres. Reading
      // the lift at the raw `t` therefore attributed the hand's rise to
      // whichever part of the stroke was drawn slowly. `getUtoTmapping` is the
      // curve's own inverse: it returns the index parameter `u` for which
      // `getPoint(u)` is the point `getPointAt(t)` just produced.
      this.resampledLift[i] = this._sampleLiftAt(curve.getUtoTmapping(t));
    }
    this.resampledCount = wanted;
    this.trail.setPoints(this.resampled, wanted);
  }

  /** Linear read of the raw lift channel at normalised progress `t`. */
  _sampleLiftAt(t) {
    const last = this.samples.length - 1;
    if (last <= 0) return this.sampleLift[0] ?? 0;
    const at = Math.min(last, Math.max(0, t * last));
    const i = Math.floor(at);
    const frac = at - i;
    const a = this.sampleLift[i] ?? 0;
    const b = this.sampleLift[Math.min(last, i + 1)] ?? a;
    return a + (b - a) * frac;
  }

  /**
   * The stroke's own height profile, for the cast that flies it.
   *
   * Returned as a closure over the resampled channel rather than the live
   * buffer, because the buffer is recycled by the next stroke and an ability
   * outlives the gesture that made it.
   */
  liftProfile() {
    const count = this.resampledCount;
    if (count < 2) return null;
    const lift = Float32Array.prototype.slice.call(this.resampledLift, 0, count);
    let peak = 0;
    for (let i = 0; i < count; i++) peak = Math.max(peak, lift[i]);
    if (peak <= 0.001) return null;
    return (u) => {
      const at = Math.min(count - 1, Math.max(0, u * (count - 1)));
      const i = Math.floor(at);
      const frac = at - i;
      const a = lift[i];
      const b = lift[Math.min(count - 1, i + 1)];
      return a + (b - a) * frac;
    };
  }

  update(dt) {
    this.trail.update(dt);
  }

  dispose() {
    this.trail.dispose();
    this.clear();
  }
}
