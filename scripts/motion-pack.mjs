/**
 * Merge the fal.ai (Meshy rigging / animation library) deliverables into the
 * single runtime asset `public/models/caster-motion.glb`.
 *
 * Input: the rigged-character GLB plus one animation GLB per requested action,
 * downloaded by scripts/fal-motion-fetch.mjs into ~/fye-motion.
 *
 * Two edits happen here, offline, once:
 *
 *  1. Bone rename. Meshy's rig uses Mixamo-style names without the
 *     `mixamorig` namespace, and numbers its spine chain in the opposite
 *     direction (Hips → Spine02 → Spine01 → Spine-as-chest). The runtime
 *     expects `mixamorig*` names — `CasterPerformance.JOINTS` matches them
 *     exactly — so every bone is renamed to its Mixamo equivalent. The clips
 *     ride the same skeleton, so after the rename the animation binds the
 *     same way the FBX does.
 *
 *  2. Semantic clip names. Each animation GLB carries a clip named
 *     `Armature|<LibraryName>|baselayer`; the file is renamed to the action
 *     id the game asks for (`idle`, `run`, `sprint`, `jump`, …) and its track
 *     targets are renamed to match (1).
 *
 * Output stays a static asset in `public/` — the runtime never talks to fal;
 * the no-network contract keeps holding.
 *
 *   node scripts/motion-pack.mjs [motion-dir]   (default ~/fye-motion/b3)
 *
 * IMPORTANT — one rigging job, one convention. Every fal multi-animation call
 * produces a *new* auto-rig, and armature conventions differ between jobs
 * (e.g. one job anchored Hips at -119.5 m, the next at +0.9 m). Clips from a
 * different job will not graft: the mesh teleports or flips. All input files
 * must come from a single fal response — rigged_character_glb, its
 * animations[] and its basic_animations. The pack verifies each clip GLB's
 * Hips rest position matches the base rig before merging.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/* Minimal browser shims so three's GLTFLoader/GLTFExporter run under Node. */
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = {
  createElementNS: () => ({ getContext: () => null, style: {}, addEventListener() {} }),
  createElement: () => ({ getContext: () => null, style: {}, addEventListener() {} }),
  addEventListener() {},
  removeEventListener() {},
  body: { appendChild() {}, removeChild() {} }
};
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((r) => { this.result = 'data:;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); }); }
};
if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:noop';

const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
const { AnimationClip } = await import('three');

/** Meshy bone → runtime bone (Mixamo namespace, chest = Spine2). */
const BONE_RENAME = {
  Hips: 'mixamorigHips',
  Spine02: 'mixamorigSpine',
  Spine01: 'mixamorigSpine1',
  Spine: 'mixamorigSpine2',
  neck: 'mixamorigNeck',
  Head: 'mixamorigHead',
  head_end: 'mixamorigHeadTop_End',
  headfront: 'mixamorigHeadFront_End',
  LeftShoulder: 'mixamorigLeftShoulder',
  LeftArm: 'mixamorigLeftArm',
  LeftForeArm: 'mixamorigLeftForeArm',
  LeftHand: 'mixamorigLeftHand',
  RightShoulder: 'mixamorigRightShoulder',
  RightArm: 'mixamorigRightArm',
  RightForeArm: 'mixamorigRightForeArm',
  RightHand: 'mixamorigRightHand',
  LeftUpLeg: 'mixamorigLeftUpLeg',
  LeftLeg: 'mixamorigLeftLeg',
  LeftFoot: 'mixamorigLeftFoot',
  LeftToeBase: 'mixamorigLeftToeBase',
  RightUpLeg: 'mixamorigRightUpLeg',
  RightLeg: 'mixamorigRightLeg',
  RightFoot: 'mixamorigRightFoot',
  RightToeBase: 'mixamorigRightToeBase'
};

/**
 * file → in-game action name. `source` records which Meshy library action the
 * clip actually is — clip names inside the GLBs were verified by parsing, not
 * trusted from the request ids.
 */
const CLIPS = [
  { file: 'clip_0.glb', name: 'idle',      source: 'Idle (action 0)' },
  { file: 'walk.glb',   name: 'walk',      source: 'walking_man (basic set)' },
  { file: 'run.glb',    name: 'run',       source: 'running (basic set)' },
  { file: 'clip_9.glb', name: 'sprint',    source: 'Lean_Forward_Sprint (509)' },
  { file: 'clip_2.glb', name: 'jump',      source: '360_Power_Spin_Jump (397)' },
  { file: 'clip_3.glb', name: 'runjump',   source: 'Run_and_Jump (463)' },
  { file: 'clip_4.glb', name: 'fall',      source: 'Fall4 (505)' },
  { file: 'clip_5.glb', name: 'cast',      source: 'mage_soell_cast_3 (132)' },
  { file: 'clip_8.glb', name: 'sit_enter', source: 'Walk_to_Sit (60)' },
  { file: 'clip_6.glb', name: 'sit',       source: 'Chair_Sit_Idle_F (32)' },
  { file: 'clip_7.glb', name: 'sit_exit',  source: 'Sit_to_Stand_Transition_F (52)' }
];

const motionDir = process.argv[2] ?? join(process.env.HOME, 'fye-motion', 'b3');
const outPath = new URL('../public/models/caster-motion.glb', import.meta.url).pathname;

const loadGLB = async (file) => {
  const buf = await readFile(join(motionDir, file));
  return new Promise((resolve, reject) =>
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', resolve, reject)
  );
};

const renameBones = (root) => {
  let renamed = 0;
  root.traverse((node) => {
    if (node.isBone && BONE_RENAME[node.name]) {
      node.name = BONE_RENAME[node.name];
      renamed++;
    }
  });
  return renamed;
};

const renameTracks = (clip) => {
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    const node = track.name.slice(0, dot);
    const prop = track.name.slice(dot);
    if (BONE_RENAME[node]) track.name = BONE_RENAME[node] + prop;
  }
};

const model = await loadGLB('rigged.glb');
const boneCount = renameBones(model.scene);
if (boneCount < 20) throw new Error(`only ${boneCount} bones renamed — rig layout changed?`);
const baseHips = model.scene.getObjectByName('mixamorigHips')?.position;

const clips = [];
for (const { file, name, source } of CLIPS) {
  const glb = await loadGLB(file);
  const clip = glb.animations[0];
  if (!clip) throw new Error(`${file}: no animation clip`);
  // Convention guard: a clip GLB from another rigging job shares the bone
  // names but a different armature origin — its Hips rest position diverges.
  const clipHips = glb.scene.getObjectByName('Hips')?.position;
  if (clipHips && baseHips && clipHips.distanceTo(baseHips) > 0.5)
    throw new Error(`${file}: armature convention mismatch (hips ${clipHips.y.toFixed(1)} vs base ${baseHips.y.toFixed(1)}) — regenerate clips in one fal job`);
  renameTracks(clip);
  clip.name = name;
  // Optimise for the runtime: keep quaternion tracks plus Hips translation —
  // per-bone position/scale tracks are redundant on a shared skeleton and
  // double the clip's weight.
  clip.tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === 'mixamorigHips.position');
  clips.push(clip);
  console.log(`${name.padEnd(10)} ← ${file}  (${source}; ${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s)`);
}
model.animations = clips;

const glb = await new Promise((resolve, reject) =>
  new GLTFExporter().parse(model.scene, resolve, reject, { binary: true, animations: clips })
);
await mkdir(new URL('../public/models', import.meta.url).pathname, { recursive: true });
await writeFile(outPath, Buffer.from(glb));
console.log(`\n${outPath}  ${(glb.byteLength / 1024).toFixed(0)} KiB, ${clips.length} clips`);
