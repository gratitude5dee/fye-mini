import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('binding replays a frozen spell and captures only after its rendered impact frame', async () => {
  const [app, stage, renderer] = await Promise.all([
    readFile(new URL('../src/core/App.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/GrimoireStage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/core/Renderer.js', import.meta.url), 'utf8')
  ]);
  const capture = stage.slice(stage.indexOf('async function capturePortrait'), stage.indexOf('\nfunction CanvasMark'));
  const render = app.indexOf('this.post.render();');
  const flush = app.indexOf('this._flushPortraitCapture();');

  assert.match(app, /validateSpellSettings\(event\.detail\?\.settings\)/);
  assert.match(app, /clearEffects\(\{ preservePortrait: true \}\)/);
  assert.match(app, /this\.input\.enabled = false/);
  assert.match(app, /applySettings\(this\._portraitCapture\.snapshot\)/);
  assert.match(app, /impactReached = true/);
  assert.ok(render >= 0 && flush > render, 'portrait readiness is dispatched only after post-processing renders');
  assert.doesNotMatch(app, /_startHouseSpellLoop|_retireHouseSpellLoop|houseFirstCastTimer/);
  assert.match(renderer, /preserveDrawingBuffer:\s*true/);

  assert.match(capture, /event\('grimoire:portrait', \{ requestId, settings, element \}\)/);
  assert.match(capture, /grimoire:portrait-failed/);
  assert.doesNotMatch(capture, /requestAnimationFrame|650/);
  assert.match(stage, /bindingSnapshot/);
  assert.match(stage, /settings: binding\.settings/);
  assert.match(stage, /if \(!portraitUrl\) throw new Error\('The portrait gallery could not seal this impact/);
  assert.match(stage, /setBindStatus\(error instanceof Error/);
});
