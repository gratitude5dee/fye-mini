import { Euler, MathUtils, Quaternion } from 'three';

const GESTURES = new Set(['idle', 'gather', 'aim', 'release', 'recovery']);

// The supplied FBX uses the ordinary Mixamo hierarchy. Keeping this mapping
// here makes the performance layer intentionally small and replaceable: a
// different licensed rig only needs an equivalent list of joint names.
const JOINTS = [
  'mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
  'mixamorig:LeftShoulder', 'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
  'mixamorig:RightShoulder', 'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
  'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg', 'mixamorig:LeftFoot',
  'mixamorig:RightUpLeg', 'mixamorig:RightLeg', 'mixamorig:RightFoot'
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

  update(dt, isRiding = false, locomotion = {}) {
    if (this.joints.size === 0) return;
    this.elapsed += dt;
    if (isRiding) return;

    const t = Math.max(0, this.elapsed - this.gestureAt);
    const pulse = 1 + Math.sin(this.elapsed * 3.2) * .045;
    const elementWeight = COLORLESS[this.element] ?? 1;
    const strength = this.intensity * elementWeight;
    const travelling = Boolean(locomotion.moving && locomotion.grounded !== false);
    const sprinting = Boolean(locomotion.sprinting);
    const gait = travelling ? Math.sin(this.elapsed * (sprinting ? 11.2 : 7.2)) : 0;
    const gaitWeight = travelling ? (sprinting ? .82 : .56) : 0;
    const armGaitWeight = gaitWeight * (this.gesture === 'idle' ? .48 : .12);
    const jumpPhase = locomotion.jumpPhase ?? 'grounded';
    const jumping = jumpPhase !== 'grounded';

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
    const runningLean = travelling ? (sprinting ? -.11 : -.045) : 0;
    const jumpLean = jumpPhase === 'rise' ? -.13 : jumpPhase === 'apex' ? -.04 :
      jumpPhase === 'fall' ? .04 : jumpPhase === 'landing' ? -.16 : 0;
    this._joint('mixamorig:Hips', jumpLean * .55, 0, Math.sin(this.elapsed * 1.6) * .01 + gait * gaitWeight * .045);
    this._joint('mixamorig:Spine', -.035 * pulse - .08 * gather + .04 * recovery + runningLean + jumpLean, 0, 0);
    this._joint('mixamorig:Spine1', -.025 * pulse - .11 * gather + .05 * recovery + runningLean * .65 + jumpLean * .7, .04 * aim, 0);
    this._joint('mixamorig:Spine2', -.02 * pulse - .09 * gather + runningLean * .35 + jumpLean * .35, .05 * aim, 0);

    const lead = .2 * gather + .38 * aim + .56 * release - .18 * recovery;
    const trail = .16 * gather + .18 * aim - .28 * release - .08 * recovery;
    const rightSwing = -gait * armGaitWeight;
    const leftSwing = gait * armGaitWeight;
    this._joint('mixamorig:RightShoulder', -.12 * lead + rightSwing * .2, .07 * lead, -.08 * lead, strength);
    this._joint('mixamorig:RightArm', -.36 * lead + rightSwing, .06 * lead, -.44 * lead, strength);
    this._joint('mixamorig:RightForeArm', -.18 * lead - Math.max(0, rightSwing) * .16, 0, -.62 * lead, strength);
    this._joint('mixamorig:RightHand', .14 * lead, .12 * release, -.18 * lead, strength);
    this._joint('mixamorig:LeftShoulder', -.12 * trail + leftSwing * .2, -.08 * trail, .1 * trail, strength);
    this._joint('mixamorig:LeftArm', -.22 * trail + leftSwing, -.06 * trail, .4 * trail, strength);
    this._joint('mixamorig:LeftForeArm', -.2 * trail - Math.max(0, leftSwing) * .16, 0, .45 * trail, strength);
    this._joint('mixamorig:LeftHand', -.06 * trail, -.1 * release, .16 * trail, strength);

    // The asset only ships an idle clip. This lower-body layer supplies a
    // complete travelling performance — weight shift, heel recovery, a faster
    // run cadence, and a compact crouch → air → landing arc — while keeping
    // the casting silhouette in control of the upper body.
    let leftThigh = gait * gaitWeight;
    let rightThigh = -gait * gaitWeight;
    let leftKnee = -Math.max(0, gait) * gaitWeight * .58;
    let rightKnee = Math.min(0, gait) * gaitWeight * .58;
    let leftFoot = -Math.min(0, gait) * gaitWeight * .28;
    let rightFoot = Math.max(0, gait) * gaitWeight * .28;

    if (jumping) {
      if (jumpPhase === 'rise') {
        leftThigh = .36; rightThigh = .36;
        leftKnee = -.72; rightKnee = -.72;
        leftFoot = .22; rightFoot = .22;
      } else if (jumpPhase === 'apex') {
        leftThigh = .24; rightThigh = .24;
        leftKnee = -.58; rightKnee = -.58;
        leftFoot = .14; rightFoot = .14;
      } else if (jumpPhase === 'fall') {
        leftThigh = .11; rightThigh = .11;
        leftKnee = -.31; rightKnee = -.31;
        leftFoot = .06; rightFoot = .06;
      } else if (jumpPhase === 'landing') {
        leftThigh = -.44; rightThigh = -.44;
        leftKnee = .68; rightKnee = .68;
        leftFoot = -.16; rightFoot = -.16;
      }
    }

    this._joint('mixamorig:LeftUpLeg', leftThigh, 0, 0);
    this._joint('mixamorig:RightUpLeg', rightThigh, 0, 0);
    this._joint('mixamorig:LeftLeg', leftKnee, 0, 0);
    this._joint('mixamorig:RightLeg', rightKnee, 0, 0);
    this._joint('mixamorig:LeftFoot', leftFoot, 0, 0);
    this._joint('mixamorig:RightFoot', rightFoot, 0, 0);

    // Release is intentionally short; then the live figure visibly settles.
    if (this.gesture === 'release' && t > .28) this.setGesture('recovery');
    if (this.gesture === 'recovery' && t > .78) this.setGesture('idle');
  }

  dispose() {
    this.joints.clear();
    this.rest.clear();
  }
}
