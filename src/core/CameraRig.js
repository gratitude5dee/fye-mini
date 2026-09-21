import { PerspectiveCamera, Vector3, MathUtils, MOUSE, TOUCH, Raycaster, Plane } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { settings } from '../config/settings.js';
import { clamp, damp } from '../utils/math.js';
import { LAYER } from './Layers.js';

const _dir = new Vector3();
const _desiredTarget = new Vector3();
const _left = new Vector3();
const _right = new Vector3();
const _ground = new Plane(new Vector3(0, 1, 0), 0);
const _ray = new Raycaster();

/**
 * Ritual-stage orbit rig.
 *
 * - Left mouse is reserved for drawing, so orbiting is bound to right-drag.
 * - The distance resolves back to `settings.camera.distance` times a framing
 *   scale derived from the viewport, so framing stays consistent no matter where
 *   the orbit target drifts. The wheel zooms by writing that same setting, which
 *   means zoom keeps working while the rig is following an ability, and the
 *   editor slider stays the single source of truth for the authored distance.
 * - The rig gently drifts its look-at point toward whatever ability is casting.
 *
 * ## Why the framing scale exists
 *
 * The camera's `fov` is *vertical*, so how much ground is visible **across** the
 * screen is proportional to the aspect ratio. Measured against the real rig: a
 * 1280x720 laptop sees 22.8 m of ground across, a 900x1200 tablet 9.62 m, and a
 * 390x844 phone 5.93 m. Generated Rite layouts span a median 8.0 m and up to
 * 12.1 m — so on a phone **83% of them do not fit on screen at all**, and the
 * player would have to orbit mid-Rite to find a waystone they are meant to be
 * drawing to.
 *
 * The fix is to frame wider on narrow viewports, not to shrink the layouts: a
 * layout that changes size with the window is a different puzzle on every
 * machine, and the daily seed is supposed to give everyone the same one. So the
 * rig holds a **minimum visible ground span** and pushes the camera back until
 * it has it, clamped by `maxDistance`.
 *
 * It holds it for what is actually on the ground, not for the worst layout the
 * generator can produce. Framing every viewport for the 16.5 m worst case would
 * leave a phone permanently pushed so far back that the caster is fifty pixels
 * tall, in free play, where there is nothing wide to see. `requireGroundSpan`
 * is how the Rite asks for the line in front of the player and nothing more.
 *
 * (An early draft of the spec said to move the camera *closer* on a phone. That
 * is backwards for a perspective camera and would have made this worse.)
 */
export class CameraRig {
  constructor(domElement) {
    this.camera = new PerspectiveCamera(
      settings.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    this.camera.position.set(-6.5, 6.0, 9.5);
    this.camera.layers.enable(LAYER.VFX);
    this.camera.layers.enable(LAYER.SPLAT);

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.enableZoom = false; // the wheel drives `settings.camera.distance` instead
    this.controls.minPolarAngle = settings.camera.minPolar;
    this.controls.maxPolarAngle = settings.camera.maxPolar;
    this.controls.rotateSpeed = 0.65;

    // Free the left button for path drawing.
    this.controls.mouseButtons = { LEFT: null, MIDDLE: null, RIGHT: MOUSE.ROTATE };
    this.controls.touches = { ONE: null, TWO: TOUCH.DOLLY_ROTATE };

    this.anchor = new Vector3(0, 0, 0); // the centre of the ritual ground
    this.focus = new Vector3(0, 0, 0); // point of interest (ability head)
    this.focusWeight = 0;
    this.shakeOffset = new Vector3();
    this.shakeRoll = 0;

    this.controls.target.set(0, settings.camera.targetHeight, 0);
    this.controls.update();

    // Multiplier on the authored distance, ≥ 1, derived from how much ground the
    // viewport can actually show. Recomputed each frame because it depends on
    // the polar angle the player may have orbited to, not only on the window.
    this.framingScale = 1;
    /** Metres the current line needs; 0 in free play. See `requireGroundSpan`. */
    this.requiredSpan = 0;

    // Actual distance, eased toward `settings.camera.distance` so a wheel flick
    // glides instead of snapping.
    this.distance = settings.camera.distance;

    this.domElement = domElement;
    this._onWheel = this._onWheel.bind(this);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /** Wheel zoom. Multiplicative, so each notch feels the same at any distance. */
  _onWheel(event) {
    event.preventDefault();

    const cam = settings.camera;
    // Firefox reports lines (deltaMode 1) and pages (2) rather than pixels.
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
    const delta = (event.deltaY * scale) / 100;

    cam.distance = clamp(
      cam.distance * Math.exp(delta * 0.12 * cam.zoomSpeed),
      cam.minDistance,
      cam.maxDistance
    );
  }

  /** Point the rig should orbit around (the ritual-ground anchor). */
  setAnchor(x, y, z) {
    this.anchor.set(x, y, z);
  }

  /** Nudge the look-at point toward an ability. `weight` 0..1, decays on its own. */
  lookAt(point, weight = 1) {
    this.focus.copy(point);
    this.focusWeight = Math.max(this.focusWeight, weight);
  }

  update(dt) {
    const cam = settings.camera;

    if (this.camera.fov !== cam.fov) {
      this.camera.fov = cam.fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.minPolarAngle = cam.minPolar;
    this.controls.maxPolarAngle = cam.maxPolar;

    // Blend the orbit target between the ritual ground and any active ability.
    const blend = MathUtils.clamp(this.focusWeight * cam.autoFrame, 0, 0.85);
    _desiredTarget.copy(this.anchor);
    _desiredTarget.y += cam.targetHeight;
    _desiredTarget.lerp(this.focus, blend);

    this.controls.target.set(
      damp(this.controls.target.x, _desiredTarget.x, cam.damping, dt),
      damp(this.controls.target.y, _desiredTarget.y, cam.damping, dt),
      damp(this.controls.target.z, _desiredTarget.z, cam.damping, dt)
    );

    this.focusWeight = damp(this.focusWeight, 0, 0.08, dt);

    this.controls.update();

    // Enforce the orbit distance (zoom and the editor slider both land here),
    // widened by whatever this viewport needs to show a whole layout.
    this._updateFraming(cam);
    const wanted = Math.min(cam.distance * this.framingScale, cam.maxDistance);
    this.distance = damp(this.distance, wanted, cam.zoomDamping, dt);
    _dir.copy(this.camera.position).sub(this.controls.target);
    const len = _dir.length() || 1;
    _dir.multiplyScalar(1 / len);
    this.camera.position.copy(this.controls.target).addScaledVector(_dir, this.distance);

    // Camera shake is additive and applied after the controls have settled.
    if (this.shakeOffset.lengthSq() > 0) {
      this.camera.position.add(this.shakeOffset);
      this.camera.rotateZ(this.shakeRoll);
    }
  }

  /**
   * How much ground is visible across the middle of the screen, in metres.
   *
   * Two rays through the left and right edges at the vertical centre, onto the
   * same ground plane `PathDrawer` draws on — so this is measured in the same
   * terms as everything the player can reach, rather than derived from a
   * frustum formula that would have to assume a pitch.
   */
  groundSpan() {
    _ray.setFromCamera({ x: -1, y: 0 }, this.camera);
    if (!_ray.ray.intersectPlane(_ground, _left)) return Infinity;
    _ray.setFromCamera({ x: 1, y: 0 }, this.camera);
    if (!_ray.ray.intersectPlane(_ground, _right)) return Infinity;
    return _left.distanceTo(_right);
  }

  /**
   * Ask for enough framing to show `metres` of ground across the screen.
   *
   * Called by the Rite with the extent of the line it is presenting, and with 0
   * when it sets itself aside. The margin is added here so callers can pass the
   * raw extent of what they want visible.
   */
  requireGroundSpan(metres) {
    this.requiredSpan = metres > 0 ? metres + settings.camera.groundSpanMargin : 0;
  }

  _updateFraming(cam) {
    const wantSpan = Math.max(cam.minGroundSpan, this.requiredSpan);
    const span = this.groundSpan();
    // A camera pitched at or above the horizon has no finite span. Nothing
    // sensible to solve for, so hold whatever scale is already in force.
    if (!Number.isFinite(span) || span <= 0 || this.distance <= 0) return;
    if (span >= wantSpan) {
      // Ease back toward the authored framing rather than snapping: this runs
      // every frame, and a hard reset would pop the camera the moment a wide
      // line resolved.
      this.framingScale = Math.max(1, this.framingScale * 0.98);
      return;
    }
    // The span grows linearly with the orbit distance for a fixed direction, so
    // one measurement gives the whole relationship and the solve is exact
    // rather than a search that would visibly hunt.
    const perMetre = span / this.distance;
    const needed = wantSpan / perMetre;
    this.framingScale = clamp(needed / cam.distance, 1, cam.maxDistance / cam.distance);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.domElement.removeEventListener('wheel', this._onWheel);
    this.controls.dispose();
  }
}
