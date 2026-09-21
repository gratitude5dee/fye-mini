import { Euler, MathUtils, Quaternion } from 'three';

const GESTURES = new Set(['idle', 'gather', 'aim', 'release', 'recovery']);

// The supplied FBX uses the ordinary Mixamo hierarchy. Keeping this mapping
// here makes the performance layer intentionally small and replaceable: a
// different licensed rig only needs an equivalent list of joint names.
const JOINTS = [
  'mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
  'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
  'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand'
];

const COLORLESS = Object.freeze({ fire: 1, water: .82, earth: .72, wind: 1 });
const _euler = new Euler();
const _delta = new Quaternion();

/**
 * A lightweight performance layer over the character's idle rig.
 *
 * It deliberately has no renderer or network dependency. The app speaks to it
 * only through `setGesture()`, so pointer and hand input share exactly the
 * same character performance: gather → aim → release → recovery.
 */
export class CasterPerformance {
  constructor(character) {
    this.character = character;
    this.joints = new Map();
    this.rest = new Map();
    this.gesture = 'idle';
    this.element = 'wind';
    this.elapsed = 0;
    this.gestureAt = 0;
    this.intensity = 1;

    character.model?.traverse((node) => {
      if (!JOINTS.includes(node.name)) return;
      this.joints.set(node.name, node);
      this.rest.set(node.name, node.quaternion.clone());
    });
  }

  /**
   * Set a named casting phase. Invalid values intentionally settle to idle so
   * a future input source cannot leave the character frozen in a cast pose.
   * @param {'idle'|'gather'|'aim'|'release'|'recovery'} gesture
   * @param {{ element?: string, intensity?: number }} [options]
   */
  setGesture(gesture, options = {}) {
    this.gesture = GESTURES.has(gesture) ? gesture : 'idle';
    this.element = options.element === 'air' ? 'wind' : (options.element ?? this.element);
    this.intensity = MathUtils.clamp(Number(options.intensity) || 1, .35, 1.6);
    this.gestureAt = this.elapsed;
  }

  _joint(name, x = 0, y = 0, z = 0, weight = 1) {
    const joint = this.joints.get(name);
    const rest = this.rest.get(name);
    if (!joint || !rest) return;
    _euler.set(x * weight, y * weight, z * weight, 'XYZ');
    _delta.setFromEuler(_euler);
    joint.quaternion.copy(rest).multiply(_delta);
  }

  update(dt, isRiding = false) {
    if (this.joints.size === 0) return;
    this.elapsed += dt;
    if (isRiding) return;

    const t = Math.max(0, this.elapsed - this.gestureAt);
    const pulse = 1 + Math.sin(this.elapsed * 3.2) * .045;
    const elementWeight = COLORLESS[this.element] ?? 1;
    const strength = this.intensity * elementWeight;

    let gather = 0;
    let aim = 0;
    let release = 0;
    let recovery = 0;
    if (this.gesture === 'gather') gather = MathUtils.smoothstep(Math.min(1, t * 2.6), 0, 1);
    if (this.gesture === 'aim') { gather = 1; aim = MathUtils.smoothstep(Math.min(1, t * 3.3), 0, 1); }
    if (this.gesture === 'release') { gather = 1; aim = 1; release = Math.sin(Math.min(1, t * 8) * Math.PI * .5); }
    if (this.gesture === 'recovery') recovery = MathUtils.smoothstep(Math.min(1, t * 2.8), 0, 1);

    // A quiet breathing posture keeps the caster readable even before a hand
    // enters frame. Each later phase adds a clear, purposeful silhouette.
    this._joint('mixamorig:Hips', 0, 0, Math.sin(this.elapsed * 1.6) * .01);
    this._joint('mixamorig:Spine', -.035 * pulse - .08 * gather + .04 * recovery, 0, 0);
    this._joint('mixamorig:Spine1', -.025 * pulse - .11 * gather + .05 * recovery, .04 * aim, 0);
    this._joint('mixamorig:Spine2', -.02 * pulse - .09 * gather, .05 * aim, 0);

    const lead = .2 * gather + .38 * aim + .56 * release - .18 * recovery;
    const trail = .16 * gather + .18 * aim - .28 * release - .08 * recovery;
    this._joint('mixamorig:RightShoulder', -.12 * lead, .07 * lead, -.08 * lead, strength);
    this._joint('mixamorig:RightArm', -.36 * lead, .06 * lead, -.44 * lead, strength);
    this._joint('mixamorig:RightForeArm', -.18 * lead, 0, -.62 * lead, strength);
    this._joint('mixamorig:RightHand', .14 * lead, .12 * release, -.18 * lead, strength);
    this._joint('mixamorig:LeftShoulder', -.12 * trail, -.08 * trail, .1 * trail, strength);
    this._joint('mixamorig:LeftArm', -.22 * trail, -.06 * trail, .4 * trail, strength);
    this._joint('mixamorig:LeftForeArm', -.2 * trail, 0, .45 * trail, strength);
    this._joint('mixamorig:LeftHand', -.06 * trail, -.1 * release, .16 * trail, strength);

    // Release is intentionally short; then the live figure visibly settles.
    if (this.gesture === 'release' && t > .28) this.setGesture('recovery');
    if (this.gesture === 'recovery' && t > .78) this.setGesture('idle');
  }

  dispose() {
    this.joints.clear();
    this.rest.clear();
  }
}
