import test from 'node:test';
import assert from 'node:assert/strict';
import { RANGES, snapshotSpellSettings, validateSpellSettings, validateSpellwrightPatch } from '../src/config/spell-contract.js';

test('public spell snapshot has only bindable blocks and uses air', () => {
  const snapshot = snapshotSpellSettings();
  assert.deepEqual(Object.keys(snapshot), ['global', 'trail', 'fire', 'water', 'earth', 'air']);
  assert.equal(snapshot.air.speed, 14);
  assert.equal(snapshot.wind, undefined);
});

test('settings reject unknown leaves and clamp finite numeric values', () => {
  const snapshot = snapshotSpellSettings();
  snapshot.fire.speed = RANGES['fire.speed'].max + 100;
  snapshot.fire.unboundDial = 2;
  const checked = validateSpellSettings(snapshot);
  assert.equal(checked.ok, false);
  assert.equal(checked.value.fire.speed, RANGES['fire.speed'].max);
  assert.match(checked.issues.join('\n'), /unboundDial/);
});

test('Spellwright only receives whitelisted, bounded paths', () => {
  const checked = validateSpellwrightPatch({ 'air.speed': 9999, 'post.exposure': 8 });
  assert.equal(checked.ok, false);
  assert.equal(checked.value['air.speed'], RANGES['air.speed'].max);
  assert.match(checked.issues.join('\n'), /post\.exposure/);
});
