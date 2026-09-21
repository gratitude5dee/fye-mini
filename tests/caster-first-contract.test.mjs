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
  assert.match(performance, /live\.get\(name\).*copy\(joint\.quaternion\)/);
  assert.match(performance, /copy\(base\)\.multiply\(_delta\)/);
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
  assert.match(stage, /Guide for \{currentElement\.label\}/);
  assert.match(stage, /Open palm/);
});

test('the public interface keeps camera data local and opens with a motion-safe, skippable sequence', async () => {
  const [stage, css, app, packageJson, layout] = await Promise.all([
    text('../app/GrimoireStage.tsx'), text('../app/grimoire-stage.css'), text('../src/core/App.js'), text('../package.json'), text('../app/layout.tsx')
  ]);
  assert.match(stage, /fetch\('\/api\/worlds'\)/);
  assert.doesNotMatch(app, /fetch\(/);
  assert.doesNotMatch(packageJson, /mongodb/);
  assert.doesNotMatch(layout, /next\/headers|generateMetadata/);
  assert.match(layout, /const title = 'FYE'/);
  assert.match(stage, />FYE</);
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
  assert.match(stage, /INTRO_VIDEO_URL/);
  assert.match(stage, /className="intro__title">FYE/);
  assert.match(stage, /muted/);
  assert.match(css, /intro__video/);
  assert.match(css, /intro--title \.intro__title/);
  assert.match(intro, /title: \[2\.0, 0\.25, 0\.08\]/);
  await access(new URL('../public/intro/elemental-arrival.mp4', import.meta.url));
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

test('help is reachable by button and by key, and lands in one place', async () => {
  const [stage, help, app, events] = await Promise.all([
    text('../app/GrimoireStage.tsx'), text('../app/HelpSheet.tsx'),
    text('../src/core/App.js'), text('../src/state/events.js')
  ]);

  assert.match(stage, /className="help-button"/);
  assert.match(stage, /<HelpSheet/);

  // `H` is bound in the engine's InputManager. It used to call a HUD method
  // that reached for markup React has never rendered, so the key did nothing.
  // It now forwards, and the key and the button open the same panel.
  // Through the shared contract, not a literal: `events.js` below pins the wire
  // name, and this pins that the engine reaches it by the constant.
  assert.match(app, /case 'toggleHelp'.*TO_UI\.HELP/s);
  assert.doesNotMatch(app, /'grimoire:/);
  assert.doesNotMatch(app, /case 'toggleHelp': this\.hud\.toggleHelp/);
  assert.match(events, /HELP: 'grimoire:help'/);
  assert.match(stage, /TO_UI\.HELP/);

  // It is a real dialog, with the same focus machinery as the other sheets.
  assert.match(help, /role="dialog"/);
  assert.match(help, /aria-modal="true"/);
  assert.match(help, /useDialog/);

  // And it documents the rules a player would otherwise have to lose to learn.
  for (const rule of ['crosses a hazard on its own', 'Three attempts per line', 'leaves the ground', 'Camera frames and landmarks remain']) {
    assert.ok(help.includes(rule), `help must explain: ${rule}`);
  }
});

test('the modal background is genuinely inert, at every level', async () => {
  // Every panel in this product renders inside one <main>, so a sweep over
  // document.body found nothing to hide and left the whole stage reachable
  // behind an element announcing itself as modal.
  const dialog = await text('../app/useDialog.ts');
  assert.match(dialog, /cursor\.parentElement/, 'the walk must climb, not stop at body');
  assert.match(dialog, /setAttribute\('inert', ''\)/);
  assert.match(dialog, /removeAttribute\('inert'\)/);
  assert.match(dialog, /NON_RENDERED/, 'skip scripts and styles rather than writing to all of them');
});
