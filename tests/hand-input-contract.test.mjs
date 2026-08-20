import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('hand tracking retains a user gesture, retries safely, and releases the camera on skip', async () => {
  const [handInput, app, stage] = await Promise.all([
    readFile(new URL('../src/input/HandInput.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/core/App.js', import.meta.url), 'utf8'),
    readFile(new URL('../app/GrimoireStage.tsx', import.meta.url), 'utf8')
  ]);

  assert.match(handInput, /this\._startPromise/);
  assert.match(handInput, /this\._startAttempt/);
  assert.match(handInput, /attempt !== this\._startAttempt/);
  assert.match(handInput, /delegate: 'GPU'/);
  assert.match(handInput, /delegate: 'CPU'/);
  assert.match(handInput, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);

  assert.doesNotMatch(stage, /attunementQueued/);
  assert.match(stage, /if \(!stageReady\) \{/);
  assert.match(stage, /event\('grimoire:attune'\)/);
  assert.match(stage, /event\('grimoire:stop-hands'\)/);
  assert.match(app, /grimoire:stop-hands/);
  assert.match(app, /this\.handInput\.stop\(\)/);
});
