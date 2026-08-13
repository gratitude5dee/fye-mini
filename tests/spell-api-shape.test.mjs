import test from 'node:test';
import assert from 'node:assert/strict';
import { readableSpellForClient } from '../app/api/_lib/spells.ts';
import { snapshotSpellSettings } from '../src/config/spell-contract.js';

test('public spell serialization normalizes readable versions and keeps a positive allow-list', () => {
  const spell = readableSpellForClient({
    _id: 'spell-id',
    schemaVersion: 1,
    slug: 'moon-whip',
    name: 'Moon Whip',
    element: 'water',
    incantation: 'A pale lash crosses the tide.',
    lore: 'A quiet tide waits beneath the moon.',
    tags: ['cold', 'lunar', 'precise'],
    settings: snapshotSpellSettings(),
    genome: { pace: .7, mass: .2, chaos: .3, radiance: .6, menace: .3 },
    portrait: { imageUrl: null, palette: ['#3fb8c9', '#c8f3fb', '#164b70'] },
    stats: { casts: 12, remixes: 1, bookmarks: 2 },
    lineage: { parentId: null, rootId: 'spell-id', depth: 0 },
    creator: { benderId: 'private-bender-id', handle: 'Ash Cartographer' },
    embedding: [0.1, 0.2],
    incantationHistory: [{ text: 'private history', at: new Date() }],
    privateNotes: 'never cross the public boundary'
  });

  assert.ok(spell);
  assert.equal(spell.creator.handle, 'Ash Cartographer');
  assert.equal(spell.creator.benderId, undefined);
  assert.equal(spell.embedding, undefined);
  assert.equal(spell.incantationHistory, undefined);
  assert.equal(spell.privateNotes, undefined);
});

test('public spell serialization skips a future schema version', () => {
  const spell = readableSpellForClient({
    _id: 'spell-id', schemaVersion: 2, slug: 'future-spell', name: 'Future Spell', element: 'air', incantation: 'Soon.', settings: {}
  });
  assert.equal(spell, null);
});
