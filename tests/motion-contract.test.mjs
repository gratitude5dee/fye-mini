import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { AnimationClip, Bone, Object3D, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three';

import { CasterPerformance } from '../src/animation/CasterPerformance.js';
import { splitClip } from '../src/animation/CharacterController.js';
import { MotionDirector } from '../src/animation/MotionDirector.js';

const text = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const asset = (path) => access(new URL(path, import.meta.url));

test('the motion pack ships as a bundled asset the controller prefers, with the FBX kept as fallback', async () => {
  const [character, loader, app] = await Promise.all([
    text('../src/animation/CharacterController.js'),
    text('../src/loaders/AssetLoader.js'),
    text('../src/core/App.js')
  ]);

  // Offline-built by scripts/motion-pack.mjs from fal.ai / Meshy output —
  // the runtime itself never talks to fal (see no-network contract).
  await asset('../public/models/caster-motion.glb');
  assert.match(character, /\/models\/caster-motion\.glb/);
  assert.match(character, /loadGLB\(MOTION_URL\)\.catch/);
  assert.match(character, /Standing Idle\.fbx/); // fallback path stays
  assert.match(loader, /GLTFLoader/);
  assert.match(loader, /loadGLB/);
  assert.match(app, /MotionDirector/);
  assert.match(app, /this\.motion\?\.update\(dt\)/);
});

test('the director maps locomotion state onto the named clips with loop/once discipline', async () => {
  const director = await text('../src/animation/MotionDirector.js');
  for (const clip of ['idle', 'walk', 'run', 'sprint', 'jump', 'runjump', 'fall', 'cast'])
    assert.match(director, new RegExp(`'${clip}'`));
  assert.match(director, /LoopOnce/);
  assert.match(director, /LoopRepeat/);
  assert.match(director, /clampWhenFinished/);
  // Missing clips must degrade to idle, never to silence on the mixer.
  assert.match(director, /FALLBACK\s*=\s*'idle'/);
});

test('a stripped asset still answers every pick with the idle action', () => {
  const plays = [];
  const idleAction = {
    setLoop() {},
    setEffectiveTimeScale() {},
    getClip: () => ({ duration: 1 })
  };
  const character = {
    isSitting: false,
    actions: new Map([['idle', idleAction]]),
    play(name) { plays.push(name); },
  };
  const locomotion = { state: { moving: true, sprinting: true, speed: 7, grounded: false, jumpPhase: 'rise' } };
  const director = new MotionDirector(character, locomotion, { gesture: 'idle' });
  director.update(1 / 60);
  assert.deepEqual(plays, ['idle']); // 'runjump' absent → idle fallback
});

test('GLB clips split normalized Mixamo upper tracks from the lower body', () => {
  const clip = new AnimationClip('run', 1, [
    new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 0, 0, 0, 0, 1]),
    new QuaternionKeyframeTrack('mixamorigSpine2.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.99]),
    new QuaternionKeyframeTrack('mixamorigLeftForeArm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.99]),
    new QuaternionKeyframeTrack('mixamorigLeftUpLeg.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.99])
  ]);
  const { upper, lower } = splitClip(clip, (name) =>
    /^mixamorig(?::)?(?:Spine2|Neck|Head(?:Top_End|Front_End)?|(?:Left|Right)(?:Shoulder|Arm|ForeArm|Hand(?:Thumb|Index|Middle|Ring|Pinky)?(?:[1-4])?))\./i.test(name)
  );
  assert.deepEqual(upper.tracks.map((track) => track.name), [
    'mixamorigSpine2.quaternion', 'mixamorigLeftForeArm.quaternion'
  ]);
  assert.deepEqual(lower.tracks.map((track) => track.name), [
    'mixamorigHips.position', 'mixamorigLeftUpLeg.quaternion'
  ]);
});

test('moving casts layer cast_upper over a lower stride, while planted casts stay full-body', () => {
  const makeAction = () => ({
    time: 0,
    setLoop() {},
    setEffectiveTimeScale() {},
    setEffectiveWeight() {},
    getClip: () => ({ duration: 2 }),
    reset() {},
    fadeIn() {},
    fadeOut() {},
    play() {}
  });
  const actions = new Map(['idle', 'walk', 'run', 'run_lower', 'cast', 'cast_upper'].map((name) => [name, makeAction()]));
  const played = [];
  const character = {
    actions,
    isSitting: false,
    play(name) { played.push(name); }
  };
  const locomotion = { state: { moving: true, sprinting: false, speed: 3, grounded: true } };
  const director = new MotionDirector(character, locomotion, { gesture: 'gather' });
  director.update(1 / 60);
  assert.equal(director._playing, 'run_lower');
  assert.equal(director._upperPlaying, 'cast_upper');
  assert.deepEqual(played, ['run_lower']);

  const planted = new MotionDirector(character, {
    state: { moving: false, sprinting: false, speed: 0, grounded: true }
  }, { gesture: 'gather' });
  planted.update(1 / 60);
  assert.equal(planted._playing, 'cast');
  assert.equal(planted._upperPlaying, null);
});

test('the performance layer finds joints under either mixamorig spelling', () => {
  // FBXLoader sanitises "mixamorig:Hips" to "mixamorigHips"; GLB exports keep
  // the colon. JOINTS is written in the colon form, so both must match — this
  // was a live bug: on prod the layer found zero joints and every gait,
  // lean and cast gesture silently no-opped.
  const model = new Object3D();
  for (const [short, name] of [['Hips', 'mixamorigHips'], ['Spine', 'mixamorig:Spine'], ['LeftArm', 'mixamorigLeftArm']]) {
    const bone = new Bone();
    bone.name = name;
    model.add(bone);
  }
  const perf = new CasterPerformance({ model });
  assert.equal(perf.joints.size, 3);
  assert.ok(perf.joints.has('mixamorig:Hips'));
  assert.ok(perf.joints.has('mixamorig:Spine'));
});
