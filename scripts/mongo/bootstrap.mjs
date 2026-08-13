import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
import { snapshotSpellSettings, deriveGenome } from '../../src/config/spell-contract.js';

const databaseName = process.env.ATLAS_DB || 'living_grimoire';
const uri = process.env.ATLAS_URI;
const apply = process.argv.includes('--apply');
const withSearch = process.argv.includes('--with-search');

if (!apply) {
  console.log('Preview only. This script creates no data unless you run: npm run mongo:bootstrap -- --apply');
  console.log('Add --with-search only after reviewing scripts/mongo/search-indexes.json; Atlas Search index creation can incur costs.');
  process.exit(0);
}
if (!uri) throw new Error('ATLAS_URI must be set before bootstrap can run.');

const now = () => new Date();
const colors = {
  fire: ['#ff6a3c', '#ffbf58', '#5b170f'], water: ['#3fb8c9', '#c8f3fb', '#164b70'],
  earth: ['#a08a63', '#d5b78c', '#35291e'], air: ['#bfe8df', '#f3fffd', '#41666a']
};

const seed = [
  ['moon-whip', 'Moon Whip', 'water', 'a thin cold arc of moonlit water that snaps at the end', 'Cut from a low tide beneath a cloudless moon, this narrow lash keeps its silence until the final crack.', ['cold', 'precise', 'lunar']],
  ['cinderwake', 'Cinderwake', 'fire', 'a low hungry flame that hugs the ground and detonates twice', 'It runs close to the floor, red at its teeth and gold at its heart. The second answer arrives as the first ember settles.', ['hungry', 'low', 'double-strike']],
  ['terrace-of-the-patient-king', 'Terrace of the Patient King', 'earth', 'a slow wide paving that ends in a tall tower', 'Stone rises in deliberate syllables, each plate bearing the memory of the one below it.', ['steady', 'wide', 'regal']],
  ['sparrow-gale', 'Sparrow Gale', 'air', 'a quick light spiral that scatters leaves and is gone', 'A small wind with a bird’s sudden nerve takes the loose things first, then slips through the fingers.', ['quick', 'light', 'restless']],
  ['glass-comet', 'Glass Comet', 'fire', 'a brilliant red comet that shatters into bright dust', 'A fast star taught to burn close to the earth.', ['bright', 'swift', 'shattering']],
  ['heron-step', 'Heron Step', 'water', 'three quiet blue steps across still water', 'Each footfall opens a brief path that remembers the sky.', ['quiet', 'balanced', 'blue']],
  ['root-crown', 'Root Crown', 'earth', 'a ring of roots that rises into a sheltering crown', 'The ground keeps an old kindness for those who listen long enough.', ['shelter', 'rooted', 'patient']],
  ['north-window', 'North Window', 'air', 'a clear vertical wind that opens a window through fog', 'It does not push the mist aside; it persuades it to part.', ['clear', 'cool', 'precise']],
  ['saffron-ember', 'Saffron Ember', 'fire', 'a gold ember that blooms slowly in the palm', 'A small held sun for the moment before courage arrives.', ['gold', 'gentle', 'held']],
  ['undertow-choir', 'Undertow Choir', 'water', 'a curling tide that sings below the surface', 'Its voices circle just beneath the bright water, calling home every loose reflection.', ['deep', 'curling', 'choral']],
  ['fallow-bell', 'Fallow Bell', 'earth', 'a warm stone bell that rings dust from the ground', 'One low note gives the tired field permission to rest.', ['warm', 'resonant', 'restful']],
  ['thistle-flight', 'Thistle Flight', 'air', 'a prickly burst of wind that spins outward like seed', 'It carries sharp little wishes far beyond the hedge.', ['wild', 'seeded', 'outward']]
];

const spellValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['schemaVersion', 'slug', 'name', 'element', 'incantation', 'lore', 'tags', 'settings', 'genome', 'portrait', 'stats', 'lineage', 'creator', 'createdAt', 'updatedAt'],
    properties: {
      schemaVersion: { bsonType: 'int' }, slug: { bsonType: 'string', maxLength: 64 }, name: { bsonType: 'string', maxLength: 56 },
      element: { enum: ['fire', 'water', 'earth', 'air'] }, incantation: { bsonType: 'string', maxLength: 420 }, lore: { bsonType: 'string', maxLength: 520 },
      tags: { bsonType: 'array', maxItems: 5 }, embedding: { bsonType: 'array', maxItems: 1024 }, createdAt: { bsonType: 'date' }, updatedAt: { bsonType: 'date' }
    }
  }
};
const castValidator = {
  $jsonSchema: {
    bsonType: 'object', required: ['spellId', 'element', 'benderId', 'pathLenM', 'createdAt'],
    properties: { spellId: { bsonType: 'objectId' }, element: { enum: ['fire', 'water', 'earth', 'air'] }, benderId: { bsonType: 'string', maxLength: 80 }, pathLenM: { bsonType: ['double', 'int', 'long', 'decimal'] }, createdAt: { bsonType: 'date' } }
  }
};
const benderValidator = { $jsonSchema: { bsonType: 'object', required: ['benderId', 'createdAt', 'lastSeenAt'], properties: { benderId: { bsonType: 'string', maxLength: 80 }, bookmarks: { bsonType: 'array', maxItems: 200 }, createdAt: { bsonType: 'date' }, lastSeenAt: { bsonType: 'date' } } } };

async function ensureCollection(db, name, validator, options = {}) {
  try { await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error', ...options }); }
  catch (error) { if (error?.codeName !== 'NamespaceExists') throw error; await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' }); }
}

const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db(databaseName);
  await ensureCollection(db, 'spells', spellValidator);
  await ensureCollection(db, 'casts', castValidator);
  await ensureCollection(db, 'benders', benderValidator);
  await ensureCollection(db, 'craft_log', { $jsonSchema: { bsonType: 'object', required: ['createdAt'], properties: { createdAt: { bsonType: 'date' } } } }, { capped: true, size: 10 * 1024 * 1024, max: 10_000 });
  await Promise.all([
    db.collection('spells').createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' }),
    db.collection('spells').createIndex({ element: 1, 'stats.casts': -1, createdAt: -1 }, { name: 'spell_feed' }),
    db.collection('spells').createIndex({ 'lineage.rootId': 1, 'lineage.depth': 1 }, { name: 'lineage_tree' }),
    db.collection('casts').createIndex({ spellId: 1, createdAt: -1 }, { name: 'casts_by_spell' }),
    db.collection('casts').createIndex({ benderId: 1, createdAt: -1 }, { name: 'casts_by_bender' }),
    db.collection('casts').createIndex({ createdAt: 1 }, { name: 'cast_expiry', expireAfterSeconds: 90 * 24 * 60 * 60 }),
    db.collection('benders').createIndex({ benderId: 1 }, { unique: true, name: 'bender_unique' })
  ]);
  for (const [slug, name, element, incantation, lore, tags] of seed) {
    const settings = snapshotSpellSettings();
    const document = { schemaVersion: 1, slug, name, element, incantation, lore, tags, settings, genome: deriveGenome(settings, element), portrait: { imageUrl: null, palette: colors[element] }, stats: { casts: 0, remixes: 0 }, lineage: { parentId: null, rootId: slug, depth: 0 }, creator: { seed: true }, createdAt: now(), updatedAt: now() };
    await db.collection('spells').updateOne({ slug }, { $setOnInsert: document }, { upsert: true });
  }
  if (withSearch) {
    const indexes = JSON.parse(await readFile(new URL('./search-indexes.json', import.meta.url), 'utf8'));
    await db.collection('spells').createSearchIndexes([indexes.text, indexes.vector]);
  }
  console.log(`Living Grimoire bootstrap complete in ${databaseName}.`);
} finally {
  await client.close();
}
