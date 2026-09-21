import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const text = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the local stage loads a bundled caster, HDR, and all five performance phases', async () => {
  const [app, performance, character, plugin] = await Promise.all([
    text('../src/core/App.js'), text('../src/animation/CasterPerformance.js'), text('../src/animation/CharacterController.js'), text('../build/sites-vite-plugin.js')
  ]);

  assert.match(app, /AssetLoader/);
  assert.match(app, /CharacterController/);
  assert.match(app, /WalkController/);
  assert.match(app, /CasterPerformance/);
  assert.match(character, /Standing Idle\.fbx/);
  assert.match(app, /spruit_sunrise\.hdr/);
  assert.match(app, /this\.character\.update\(dt\)/);
  assert.match(app, /this\.walk\?\.update\(dt\)/);
  for (const gesture of ['idle', 'gather', 'aim', 'release', 'recovery']) assert.match(performance, new RegExp(`'${gesture}'`));
  assert.match(performance, /setGesture\(/);
  assert.doesNotMatch(plugin, /Standing Idle\.fbx/);
  assert.doesNotMatch(plugin, /spruit_sunrise\.hdr/);
});

test('hand tracking remains direct-click, local, mirrored, and fallback-safe', async () => {
  const [hand, stage, events] = await Promise.all([
    text('../src/input/HandInput.js'), text('../app/GrimoireStage.tsx'), text('../src/state/events.js')
  ]);
  for (const term of ['getUserMedia', 'delegate: \'GPU\'', 'delegate: \'CPU\'', '_createMirror', 'HAND_CONNECTIONS', 'getTracks().forEach']) assert.match(hand, new RegExp(term.replace(/[()]/g, '\\$&')));
  assert.match(hand, /Camera permission or hand tracking was unavailable/);
  assert.match(stage, /emit\(TO_ENGINE\.ATTUNE\)/);
  assert.match(events, /ATTUNE: 'grimoire:attune'/);
  assert.match(stage, /Mobile never requests your camera/);
  assert.match(stage, /Hold an open palm until the ring fills/);
});

test('the public interface is local-only and opens with a motion-safe, skippable sequence', async () => {
  const [stage, css, app, packageJson, layout] = await Promise.all([
    text('../app/GrimoireStage.tsx'), text('../app/grimoire-stage.css'), text('../src/core/App.js'), text('../package.json'), text('../app/layout.tsx')
  ]);
  assert.doesNotMatch(stage, /fetch\(/);
  assert.doesNotMatch(app, /fetch\(/);
  assert.doesNotMatch(packageJson, /mongodb/);
  assert.doesNotMatch(layout, /next\/headers|generateMetadata/);
  const intro = await text('../src/intro/IntroDirector.js');
  // The opening is the renderer, not a picture of it: it fades the real grade
  // and drives the rig's own settings rather than covering the stage.
  assert.match(intro, /settings\.post\.gain/);
  assert.match(intro, /settings\.camera\.distance/);
  // An assignment, not a mention — the file's own comment explains why writing
  // the camera directly does not work, and that explanation must not trip this.
  assert.doesNotMatch(intro, /camera\.position\s*[.=]/);
  // It cannot advance until the stage is genuinely playable.
  assert.match(intro, /onStageReady/);
  assert.match(stage, /Skip intro/);
  // And the raster montage it replaced is gone from the bundle and the repo.
  assert.doesNotMatch(stage, /elemental-montage/);
  await assert.rejects(access(new URL('../public/intro/elemental-montage.png', import.meta.url)));
  await assert.rejects(access(new URL('../output/imagegen/elemental-montage-source.png', import.meta.url)));
  assert.match(css, /prefers-reduced-motion/);
  const preferences = await text('../src/state/preferences.js');
  assert.match(preferences, /local-preferences/);
  assert.match(stage, /state\/preferences/);
  assert.doesNotMatch(stage, /localStorage/);
  await assert.rejects(access(new URL('../app/api/casts/route.ts', import.meta.url)));
  await assert.rejects(access(new URL('../gateway/server.mjs', import.meta.url)));
});
