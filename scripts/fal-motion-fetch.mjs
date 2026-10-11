/**
 * Regenerate the caster motion pack through fal.ai's Meshy rigging service.
 *
 * Pipeline: this script uploads the exported character mesh
 * (`public/models/caster-mesh.glb`, produced by scripts/export-caster-glb.mjs),
 * submits one `fal-ai/meshy/rigging/multi-animation` job for every action the
 * game needs, and downloads the deliverables into `~/fye-motion/<outDir>/`.
 * Then `node scripts/motion-pack.mjs <dir>` merges them into
 * `public/models/caster-motion.glb`.
 *
 * One job → one armature. Every multi-animation call produces a new auto-rig
 * and armature conventions differ between jobs (hips anchored at different
 * offsets), so all files used by the pack must come from a single response —
 * do not mix downloads across runs.
 *
 * Requires FAL_KEY in the environment. Runtime never calls fal — the pack
 * ships as a static asset.
 *
 *   FAL_KEY=... node scripts/fal-motion-fetch.mjs [outDir]   (default b3)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) throw new Error('FAL_KEY env var required');

const OUT_DIR = process.argv[2] ?? 'b3';
const MESH = new URL('../public/models/caster-mesh.glb', import.meta.url).pathname;
const DEST = join(process.env.HOME, 'fye-motion', OUT_DIR);

/** Meshy animation-library action ids → semantic name (see motion-pack CLIPS). */
const ACTIONS = [
  { id: 0,   name: 'idle' },
  { id: 16,  name: 'runfast (spare)' },
  { id: 397, name: 'jump (360_Power_Spin_Jump)' },
  { id: 463, name: 'runjump (Run_and_Jump)' },
  { id: 505, name: 'fall (Fall4)' },
  { id: 132, name: 'cast (mage_soell_cast_3)' },
  { id: 32,  name: 'sit (Chair_Sit_Idle_F)' },
  { id: 52,  name: 'sit_exit (Sit_to_Stand_Transition_F)' },
  { id: 60,  name: 'sit_enter (Walk_to_Sit)' },
  { id: 509, name: 'sprint (Lean_Forward_Sprint)' }
];

const fal = async (url, { method = 'GET', body } = {}) => {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status}`);
  return res.json();
};

const init = await fal('https://rest.fal.ai/storage/upload/initiate', {
  method: 'POST',
  body: { file_name: 'caster-mesh.glb', content_type: 'model/gltf-binary' }
});
await fetch(init.upload_url, {
  method: 'PUT',
  headers: { 'Content-Type': 'model/gltf-binary' },
  body: await readFile(MESH)
});
console.log('uploaded', init.file_url);

const { request_id: rid } = await fal('https://queue.fal.run/fal-ai/meshy/rigging/multi-animation', {
  method: 'POST',
  body: {
    model_url: init.file_url,
    height_meters: 1.78,
    animation_action_ids: ACTIONS.map((a) => a.id),
    enable_safety_checker: true
  }
});
console.log('request', rid);

let result;
for (;;) {
  const { status } = await fal(`https://queue.fal.run/fal-ai/meshy/requests/${rid}/status`);
  if (status === 'COMPLETED') { result = await fal(`https://queue.fal.run/fal-ai/meshy/requests/${rid}`); break; }
  if (status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') throw new Error(`job ${status}`);
  process.stdout.write(status + ' ');
  await new Promise((r) => setTimeout(r, 12000));
}

await mkdir(DEST, { recursive: true });
await writeFile(join(DEST, 'result.json'), JSON.stringify(result, null, 1));
const get = async (url, file) => {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(join(DEST, file), buf);
  console.log(' ', file, buf.length);
};
await get(result.rigged_character_glb.url, 'rigged.glb');
await get(result.basic_animations.walking_glb.url, 'walk.glb');
await get(result.basic_animations.running_glb.url, 'run.glb');
for (const [i, anim] of result.animations.entries())
  await get(anim.animation_glb.url, `clip_${i}.glb`);
console.log(`\ndone → ${DEST}. Next: node scripts/motion-pack.mjs ${DEST}`);
