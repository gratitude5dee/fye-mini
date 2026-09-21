import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

import { RITUAL_WORLD, WORLD_PRIORS } from '../src/world/world-seeds.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the catalog has four fixed original image priors plus a local fallback', async () => {
  assert.equal(WORLD_PRIORS.length, 4);
  assert.deepEqual(WORLD_PRIORS.map((world) => world.slug), [
    'jade-citadel', 'ember-basin', 'emerald-bay', 'sky-sanctuary'
  ]);
  assert.equal(RITUAL_WORLD.slug, 'ritual-stage');
  for (const world of WORLD_PRIORS) {
    assert.match(world.imagePath, /^\/world-priors\/[a-z-]+\.jpg$/);
    await access(new URL(`../public${world.imagePath}`, import.meta.url));
    assert.doesNotMatch(world.prompt, /avatar|nickelodeon|aang|fire nation/i);
  }
});

test('the World Labs operator is fixed-only and keeps secrets server-side', async () => {
  const worker = await source('../worker/worlds.ts');
  const start = worker.slice(worker.indexOf('async function startFixedJobs'), worker.indexOf('function validCalibration'));
  assert.match(worker, /FYE_WORLD_OPERATOR_TOKEN/);
  assert.match(worker, /x-fye-operator-token/);
  assert.match(worker, /WORLD_LABS_API_KEY/);
  assert.match(worker, /marble-1\.1-plus/);
  assert.match(worker, /WORLD_PRIORS/);
  assert.match(worker, /image_prompt: \{ source: 'uri'/);
  assert.match(worker, /ALLOWED_ASSET_HOSTS/);
  assert.doesNotMatch(worker, /VITE_WORLD_LABS|VITE_.*TOKEN/);
  assert.doesNotMatch(start, /request\.json\(/, 'generation must not accept a player prompt, image URL, or model');
  assert.doesNotMatch(worker, /\/api\/worlds\/generate/);
  assert.match(worker, /status = 'calibrating'/);
  assert.match(worker, /World must be calibrated before publication/);
});

test('public catalog output exposes only ready calibrated worlds', async () => {
  const [worker, vite] = await Promise.all([source('../worker/worlds.ts'), source('../vite.config.js')]);
  assert.match(worker, /active = 1 AND status = 'ready'/);
  assert.match(worker, /pathname === '\/api\/worlds'/);
  assert.match(worker, /pathname\.startsWith\('\/internal\/worlds\/'\)/);
  assert.match(vite, /triggers: \{ crons: \['\* \* \* \* \*'\] \}/);
  const migration = await source('../migrations/0001_world_catalog.sql');
  for (const table of ['world_jobs', 'worlds']) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration, /calibrating/);
});

test('world rendering applies Marble alignment and disposes the prior world', async () => {
  const [manager, renderer, post] = await Promise.all([
    source('../src/world/WorldManager.js'), source('../src/core/Renderer.js'), source('../src/postprocessing/PostProcessing.js')
  ]);
  assert.match(manager, /new SparkRenderer/);
  assert.match(manager, /new SplatMesh/);
  assert.match(manager, /group\.rotation\.x = Math\.PI/);
  assert.match(manager, /metricScaleFactor/);
  assert.match(manager, /groundPlaneOffset/);
  assert.match(manager, /_disposeCurrent\(\)/);
  assert.match(manager, /deviceMemory/);
  assert.match(renderer, /antialias: false/);
  assert.match(post, /camera\.layers\.enable\(LAYER\.COLLIDER\)/);
});

test('third-person controls coexist with casting, air travel, and opt-in hands', async () => {
  const [app, locomotion, stage] = await Promise.all([
    source('../src/core/App.js'), source('../src/animation/LocomotionController.js'), source('../app/GrimoireStage.tsx')
  ]);
  for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft']) assert.match(locomotion, new RegExp(key));
  assert.match(locomotion, /camera\.getWorldDirection/);
  assert.match(locomotion, /groundAt/);
  assert.match(locomotion, /canTraverse/);
  assert.match(app, /this\.walk\?\.active/);
  assert.match(app, /this\.pathDrawer\.active/);
  assert.match(app, /new LocomotionController/);
  assert.match(app, /new WorldManager/);
  assert.match(stage, /Hand mode/);
  assert.match(stage, /Enable hands/);
  assert.match(stage, /Mobile never requests your camera/);
  assert.match(stage, /movement-hint/);
  assert.match(stage, /world-drawer/);
});
