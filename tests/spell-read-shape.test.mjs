import test from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_SPELL_SCHEMA_VERSION, normalizeSpellForRead } from '../src/config/spell-read-shape.js';
import { snapshotSpellSettings } from '../src/config/spell-contract.js';

const validV1 = {
  _id: 'spell-id',
  schemaVersion: 1,
  slug: 'moon-whip',
  name: 'Moon Whip',
  element: 'water',
  incantation: 'A pale lash crosses the tide.',
  settings: snapshotSpellSettings()
};

test('rebuilds an already-current page with a fully valid settings seal', () => {
  const result = normalizeSpellForRead(validV1);
  assert.equal(result.ok, true);
  assert.notEqual(result.value, validV1);
  assert.deepEqual(result.value.settings, validV1.settings);
  assert.equal(result.value.genome.pace >= 0, true);
});

test('adapts the bounded v0 wind spelling without writing a migration', () => {
  const result = normalizeSpellForRead({ ...validV1, schemaVersion: undefined, element: 'wind', settings: { wind: { speed: 7 } }, privateNotes: 'never expose this' });
  assert.equal(result.ok, true);
  assert.equal(result.migratedFrom, 0);
  assert.equal(result.value.schemaVersion, CURRENT_SPELL_SCHEMA_VERSION);
  assert.equal(result.value.element, 'air');
  assert.equal(result.value.settings.air.speed, 7);
  assert.equal(result.value.settings.wind, undefined);
  assert.deepEqual(result.value.lineage, { parentId: null, rootId: 'spell-id', depth: 0 });
  assert.equal(result.value.privateNotes, undefined);
});

test('refuses a future or malformed schema version instead of guessing', () => {
  assert.equal(normalizeSpellForRead({ ...validV1, schemaVersion: 2 }).ok, false);
  assert.equal(normalizeSpellForRead({ ...validV1, schemaVersion: '1' }).ok, false);
});
