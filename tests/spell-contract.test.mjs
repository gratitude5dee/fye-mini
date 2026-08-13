import test from 'node:test';
import assert from 'node:assert/strict';
import { RANGES, deriveGenome, snapshotSpellSettings, spellSettingsBsonSchema, validateSpellSettings, validateSpellwrightPatch } from '../src/config/spell-contract.js';

test('public spell snapshot has only bindable blocks, post, and air', () => {
  const snapshot = snapshotSpellSettings();
  assert.deepEqual(Object.keys(snapshot), ['global', 'trail', 'fire', 'water', 'earth', 'air', 'post']);
  assert.equal(snapshot.air.speed, 14);
  assert.equal(snapshot.wind, undefined);
  assert.equal(snapshot.post.exposure, 1.05);
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

test('genome mass follows each element’s real size dial', () => {
  for (const [element, path] of Object.entries({ fire: 'flameWidth', water: 'radius', earth: 'crustWidth', air: 'ribbonWidth' })) {
    const low = snapshotSpellSettings();
    const high = snapshotSpellSettings();
    low[element][path] = RANGES[`${element}.${path}`].min;
    high[element][path] = RANGES[`${element}.${path}`].max;
    assert.ok(deriveGenome(high, element).mass > deriveGenome(low, element).mass, `${element} mass should respond to ${path}`);
  }
});

test('Atlas BSON settings schema refuses unknown leaves', () => {
  const schema = spellSettingsBsonSchema();
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.fire.additionalProperties, false);
  assert.ok(schema.required.includes('post'));
});
