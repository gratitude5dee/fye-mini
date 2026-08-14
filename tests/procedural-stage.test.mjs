import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the Grimoire boot path is procedural and never loads or ships the foundation character or HDR', async () => {
  const [app, environment, sitesPlugin] = await Promise.all([
    readFile(new URL('../src/core/App.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/world/Environment.js', import.meta.url), 'utf8'),
    readFile(new URL('../build/sites-vite-plugin.js', import.meta.url), 'utf8')
  ]);

  assert.match(app, /loadProceduralEnvironment\(\)/);
  assert.doesNotMatch(app, /AssetLoader|CharacterController|WalkController|spruit_sunrise|Standing Idle/);
  assert.match(app, /_startArrivalSpellLoop\(\)/);
  assert.match(app, /this\.abilities\.cast\(path, 'fire'\)/);
  assert.match(app, /this\._retireArrivalSpellLoop\(\)/);
  assert.match(environment, /function proceduralSkyProbe\(\)/);
  assert.match(environment, /new DataTexture\(/);
  assert.match(sitesPlugin, /dist', 'client', 'models', 'Standing Idle\.fbx'/);
  assert.match(sitesPlugin, /dist', 'client', 'hdri', 'spruit_sunrise\.hdr'/);
});
