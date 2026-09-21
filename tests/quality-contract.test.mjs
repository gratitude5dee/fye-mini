import test from 'node:test';
import assert from 'node:assert/strict';

// The ladder publishes through `window.dispatchEvent`. Stubbed before the
// import so the module graph sees it, and kept — several of these tests want
// to read what was published.
const published = [];
globalThis.window = {
  dispatchEvent: (event) => { published.push({ type: event.type, detail: event.detail }); return true; }
};
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

const { QualityLadder } = await import('../src/core/QualityLadder.js');
const { CalmMode } = await import('../src/core/CalmMode.js');
const { SettingsLease } = await import('../src/config/settingsLease.js');
const { settings } = await import('../src/config/settings.js');

/** Just enough renderer and environment for the ladder to talk to. */
const rig = () => ({
  renderer: { maxPixelRatio: 1.75, setPixelRatioCap(cap) { this.maxPixelRatio = cap; } },
  environment: { sun: { castShadow: true, shadow: { mapSize: { x: 4096, set(a) { this.x = a; } }, map: null } } }
});

/** Feed `n` frames of `ms` each. */
const feed = (ladder, ms, n = 90) => { for (let i = 0; i < n; i++) ladder.sample(ms / 1000); };

const authored = {
  bloomStrength: settings.post.bloomStrength,
  bloomRadius: settings.post.bloomRadius,
  particleCount: settings.global.particleCount,
  distortion: settings.global.distortion,
  glow: settings.global.glow,
  cameraShake: settings.global.cameraShake,
  flashStrength: settings.post.flashStrength,
  autoFrame: settings.camera.autoFrame
};
const restoreAuthored = () => {
  settings.post.bloomStrength = authored.bloomStrength;
  settings.post.bloomRadius = authored.bloomRadius;
  settings.global.particleCount = authored.particleCount;
  settings.global.distortion = authored.distortion;
  settings.global.glow = authored.glow;
  settings.global.cameraShake = authored.cameraShake;
  settings.post.flashStrength = authored.flashStrength;
  settings.camera.autoFrame = authored.autoFrame;
};

/* ------------------------------------------------------------------------ */

test('a partial window decides nothing, because the first frames are not the steady state', () => {
  const ladder = new QualityLadder(rig());
  feed(ladder, 60, 89);
  // Shader compiles and first uploads land in these frames. Stepping on them
  // would drop every machine two tiers for a hitch it saw once.
  assert.equal(ladder.tier, 'high');
  restoreAuthored();
});

test('one long hitch does not move the ladder; sustained slowness does', () => {
  const ladder = new QualityLadder(rig());
  feed(ladder, 8, 89);
  ladder.sample(0.4);            // a 400ms shader compile
  assert.equal(ladder.tier, 'high', 'the median ignores the outlier the mean would not');

  feed(ladder, 30);
  assert.equal(ladder.tier, 'conservative');
  restoreAuthored();
});

test('each tier makes exactly the changes it advertises', () => {
  const ctx = rig();
  const ladder = new QualityLadder(ctx);

  feed(ladder, 18);
  assert.equal(ladder.tier, 'balanced');
  assert.equal(ladder.cadence, 2);
  assert.equal(ladder.allowsTwoHands, true);
  assert.equal(ctx.renderer.maxPixelRatio, 1.25);
  assert.equal(ctx.environment.sun.shadow.mapSize.x, 2048);
  assert.equal(settings.post.bloomStrength, authored.bloomStrength, 'balanced keeps bloom');
  assert.ok(Math.abs(settings.global.particleCount - authored.particleCount * 0.7) < 1e-9);

  feed(ladder, 30);
  assert.equal(ladder.tier, 'conservative');
  assert.equal(ladder.cadence, 3);
  assert.equal(ladder.allowsTwoHands, false, 'two hands cost a second inference pass');
  assert.equal(ctx.renderer.maxPixelRatio, 1);
  assert.equal(ctx.environment.sun.castShadow, false);
  assert.equal(settings.post.bloomStrength, 0);
  assert.equal(settings.global.distortion, 0);
  restoreAuthored();
});

test('stepping down twice does not compound the reduction', () => {
  const ladder = new QualityLadder(rig());
  feed(ladder, 18);
  feed(ladder, 30);
  feed(ladder, 18);
  // 0.7 of the authored value, not 0.7 of 0.4 of 0.7 of it. The lease scales
  // from what it first took, which is why it remembers that separately.
  assert.ok(Math.abs(settings.global.particleCount - authored.particleCount * 0.7) < 1e-9,
    `particleCount was ${settings.global.particleCount}`);
  restoreAuthored();
});

test('recovery needs real headroom, not a threshold brush', () => {
  const ladder = new QualityLadder(rig());
  feed(ladder, 30);
  assert.equal(ladder.tier, 'conservative');

  // 22ms is under the 24ms step-down line but over the 21ms step-up line: a
  // stage that recovered here would oscillate between two looks.
  feed(ladder, 22);
  assert.equal(ladder.tier, 'conservative');

  feed(ladder, 18);
  assert.equal(ladder.tier, 'balanced', 'one tier at a time, not straight to high');

  feed(ladder, 10);
  assert.equal(ladder.tier, 'high');
  restoreAuthored();
});

test('climbing back to high returns every authored value', () => {
  const ctx = rig();
  const ladder = new QualityLadder(ctx);
  feed(ladder, 30);
  feed(ladder, 18);
  feed(ladder, 10);
  assert.equal(ladder.tier, 'high');
  assert.equal(settings.post.bloomStrength, authored.bloomStrength);
  assert.equal(settings.post.bloomRadius, authored.bloomRadius);
  assert.equal(settings.global.particleCount, authored.particleCount);
  assert.equal(settings.global.distortion, authored.distortion);
  assert.equal(ctx.renderer.maxPixelRatio, 1.75);
  assert.equal(ctx.environment.sun.castShadow, true);
  restoreAuthored();
});

test('a lease never reverts a dial the player moved while it held the key', () => {
  const lease = new SettingsLease();
  lease.write('global', 'particleCount', 0.4);
  settings.global.particleCount = 0.85;          // the player moves it
  assert.equal(lease.release('global', 'particleCount'), false, 'the lease reports it let go');
  assert.equal(settings.global.particleCount, 0.85, 'and left the player’s value alone');
  restoreAuthored();

  // The undisturbed case still restores.
  lease.write('global', 'particleCount', 0.4);
  assert.equal(lease.release('global', 'particleCount'), true);
  assert.equal(settings.global.particleCount, authored.particleCount);
  restoreAuthored();
});

test('calm mode turns the stage down and hands all of it back', () => {
  const calm = new CalmMode();
  calm.set(true);
  assert.equal(settings.global.cameraShake, 0);
  assert.equal(settings.post.flashStrength, 0);
  assert.equal(settings.camera.autoFrame, 0);
  assert.ok(Math.abs(settings.global.glow - authored.glow * 0.3) < 1e-9);

  calm.set(false);
  assert.equal(settings.global.cameraShake, authored.cameraShake);
  assert.equal(settings.post.flashStrength, authored.flashStrength);
  assert.equal(settings.camera.autoFrame, authored.autoFrame);
  assert.equal(settings.global.glow, authored.glow);
  restoreAuthored();
});

test('calm mode and the quality ladder never reach for the same key', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
  const keysIn = (source) => new Set(
    [...source.matchAll(/(?:lease|this\._lease)\.write\('(\w+)', '(\w+)'/g)].map((m) => `${m[1]}.${m[2]}`)
  );
  const ladderKeys = keysIn(await read('../src/core/QualityLadder.js'));
  const calmKeys = keysIn(await read('../src/core/CalmMode.js'));
  assert.ok(ladderKeys.size > 0 && calmKeys.size > 0, 'both must actually take something');

  // Two leases on one key do not compose: whichever released second would put
  // back a value the other had chosen. Calm mode reaches bloom through
  // `global.glow` for exactly this reason.
  const shared = [...ladderKeys].filter((k) => calmKeys.has(k));
  assert.deepEqual(shared, [], `contested: ${shared.join(', ')}`);
});

test('the ladder names itself once, quietly, and never as a toast', async () => {
  const { readFile } = await import('node:fs/promises');
  const stage = await readFile(new URL('../app/GrimoireStage.tsx', import.meta.url), 'utf8');
  // The line lives in the Workshop, next to the dials, not over the stage.
  assert.match(stage, /stage-settings__note/);
  assert.match(stage, /quality\.tier !== 'high'/);
  assert.doesNotMatch(stage, /showToast[\s\S]{0,120}balanced/);
});
