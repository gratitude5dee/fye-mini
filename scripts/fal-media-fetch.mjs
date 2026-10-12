/**
 * Generate UI/media assets through fal.ai — same shape as fal-motion-fetch.mjs.
 *
 * Models are pinned by the project:
 *   video → fal-ai/minimax/h3-max-turbo   (image-to-video / text-to-video)
 *   image → openai/gpt-image-2.5/sunburst (text-to-image)
 *
 * Every job in scripts/media-manifest.mjs is submitted, polled, and its
 * output downloaded to output/fal/media/<name>.<ext> for review. Reviewed
 * assets are then copied to public/media/ by the script's --publish step.
 * Runtime never calls fal — everything ships as static files.
 *
 * Requires FAL_KEY in the environment.
 *
 *   FAL_KEY=... node scripts/fal-media-fetch.mjs [--only <name[,name]>] [--publish]
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOBS } from './media-manifest.mjs';

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) throw new Error('FAL_KEY env var required');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = join(ROOT, 'output', 'fal', 'media');

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const publish = args.includes('--publish');

const VIDEO_ENDPOINT = 'minimax/h3-max-turbo/image-to-video';
const IMAGE_ENDPOINT = 'openai/gpt-image-2.5/sunburst/text-to-image';
// fal queue status/result paths live under the first two endpoint segments
// (minimax/h3-max-turbo, openai/gpt-image-2.5). Note h3-max-turbo's endpoint
// id carries no fal-ai/ prefix — queue.fal.run/minimax/... not fal-ai/minimax.
const queueBase = (endpoint) => `https://queue.fal.run/${endpoint.split('/').slice(0, 2).join('/')}`;

const fal = async (url, { method = 'GET', body } = {}) => {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text().catch(() => '')}`);
  return res.json();
};

const upload = async (filePath, contentType) => {
  const init = await fal('https://rest.fal.ai/storage/upload/initiate', {
    method: 'POST',
    body: { file_name: basename(filePath), content_type: contentType }
  });
  await fetch(init.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: await readFile(filePath)
  });
  return init.file_url;
};

const poll = async (endpoint, rid) => {
  for (;;) {
    const { status } = await fal(`${queueBase(endpoint)}/requests/${rid}/status`);
    if (status === 'COMPLETED') return fal(`${queueBase(endpoint)}/requests/${rid}`);
    if (status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') throw new Error(`${rid} → ${status}`);
    process.stdout.write(status + ' ');
    await new Promise((r) => setTimeout(r, 12000));
  }
};

const CONTENT_TYPE = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const runJob = async (job) => {
  let endpoint, input;
  if (job.kind === 'image') {
    endpoint = IMAGE_ENDPOINT;
    input = { prompt: job.prompt, image_size: 'landscape_16_9', quality: 'high' };
  } else {
    endpoint = VIDEO_ENDPOINT;
    input = { prompt: job.prompt, resolution: '768P', duration: 6 };
    if (job.source) {
      const srcPath = join(ROOT, 'public', job.source);
      const ext = job.source.slice(job.source.lastIndexOf('.'));
      input.image_url = await upload(srcPath, CONTENT_TYPE[ext] ?? 'image/png');
      console.log(`  uploaded ${job.source}`);
    }
  }

  const { request_id: rid } = await fal(`https://queue.fal.run/${endpoint}`, { method: 'POST', body: input });
  console.log(`  request ${rid}`);
  const result = await poll(endpoint, rid);
  const file = result.video ?? result.images?.[0] ?? result.image;
  if (!file?.url) throw new Error(`${job.name}: no file in result`);
  const dest = join(STAGE, basename(job.out));
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await (await fetch(file.url)).arrayBuffer()));
  console.log(`  done → ${dest}`);
};

await mkdir(STAGE, { recursive: true });
if (!publish) for (const job of JOBS) {
  if (only && !only.includes(job.name)) continue;
  console.log(`job ${job.name} (${job.kind})`);
  try {
    await runJob(job);
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
  }
}

if (publish) {
  for (const job of JOBS) {
    if (only && !only.includes(job.name)) continue;
    const src = join(STAGE, basename(job.out));
    const dest = join(ROOT, 'public', job.out);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    console.log(`published ${job.out}`);
  }
}
