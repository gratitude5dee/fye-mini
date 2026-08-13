import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '../src/config/settings.js';
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

test('every persisted numeric leaf has its exact editor range', () => {
  const persisted = {
    global: DEFAULT_SETTINGS.global,
    trail: DEFAULT_SETTINGS.trail,
    fire: DEFAULT_SETTINGS.fire,
    water: DEFAULT_SETTINGS.water,
    earth: DEFAULT_SETTINGS.earth,
    air: DEFAULT_SETTINGS.wind,
    post: DEFAULT_SETTINGS.post,
  };
  for (const [block, settings] of Object.entries(persisted)) {
    for (const [key, value] of Object.entries(settings)) {
      if (typeof value === 'number') assert.ok(RANGES[`${block}.${key}`], `${block}.${key} needs a declared range`);
    }
  }
  assert.deepEqual(RANGES['fire.tempCore'], { min: 1500, max: 6000, step: 10 });
  assert.deepEqual(RANGES['fire.volumeSteps'], { min: 6, max: 72, step: 1 });
  assert.deepEqual(RANGES['earth.crackDelay'], { min: 0.02, max: 3, step: 0.01 });
});

test('Spellwright only receives whitelisted, bounded paths', () => {
  const checked = validateSpellwrightPatch({ 'air.speed': 9999, 'post.exposure': 8 });
  assert.equal(checked.ok, false);
  assert.equal(checked.value['air.speed'], RANGES['air.speed'].max);
  assert.match(checked.issues.join('\n'), /post\.exposure/);
});

test('Spellwright can make fire violet without opening arbitrary string settings', () => {
  const violet = validateSpellwrightPatch({ 'fire.colorCore': '#9d4edd', 'fire.flameHeight': 99 });
  assert.equal(violet.ok, true);
  assert.equal(violet.value['fire.colorCore'], '#9d4edd');
  assert.equal(violet.value['fire.flameHeight'], RANGES['fire.flameHeight'].max);
  assert.equal(validateSpellwrightPatch({ 'water.lightColor': '#9d4edd' }).ok, false);
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
