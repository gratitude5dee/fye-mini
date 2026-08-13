import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the completed stage keeps its primary product surfaces', async () => {
  const stage = await readFile(new URL('../app/GrimoireStage.tsx', import.meta.url), 'utf8');
  for (const phrase of ['The Living Grimoire', 'The Spellwright', 'Bind this spell', 'The Almanac', 'Show your hands.']) assert.match(stage, new RegExp(phrase));
});
