import { readFile } from 'node:fs/promises';
import { MongoClient, ObjectId } from 'mongodb';
import { deriveGenome, snapshotSpellSettings, spellSettingsBsonSchema } from '../../src/config/spell-contract.js';

const databaseName = process.env.ATLAS_DB || 'living_grimoire';
const uri = process.env.ATLAS_URI;
const apply = process.argv.includes('--apply');
const withSearch = process.argv.includes('--with-search');
const withEmbeddings = process.argv.includes('--with-embeddings');

if (!apply) {
  console.log('Preview only. This script creates no data unless you run: npm run mongo:bootstrap -- --apply');
  console.log('Add --with-search only after reviewing scripts/mongo/search-indexes.json; Atlas Search index creation can incur costs.');
  console.log('Add --with-embeddings only with OPENAI_API_KEY configured to embed the 12 house spells.');
  process.exit(0);
}
if (!uri) throw new Error('ATLAS_URI must be set before bootstrap can run.');
if (withEmbeddings && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required with --with-embeddings.');

const now = () => new Date();
const colors = {
  fire: ['#ff6a3c', '#ffbf58', '#5b170f'], water: ['#3fb8c9', '#c8f3fb', '#164b70'],
  earth: ['#a08a63', '#d5b78c', '#35291e'], air: ['#bfe8df', '#f3fffd', '#41666a']
};

// The house pages are deliberately the same 12 names and incantations used in
// the product brief. `slug` makes this loop idempotent on every bootstrap.
const seed = [
  ['cinderwake', 'Cinderwake', 'fire', 'a low, hungry flame that hugs the ground and detonates twice', 'It runs close to the floor, red at its teeth and gold at its heart. The second answer arrives just as the first ember begins to settle, leaving a warm seam in the dark.', ['hungry', 'low', 'double-strike']],
  ['sun-petal', 'Sun-Petal', 'fire', 'a slow blossom of white-gold fire that opens at the end of the path', 'A patient spark gathers its light until the path has ended, then unfolds in quiet white-gold layers. Its warmth lingers in the air like a held breath finally released.', ['white-gold', 'slow', 'blossom']],
  ['vermilion-adder', 'Vermilion Adder', 'fire', 'a fast violet-red serpent that strikes hard at the finish', 'Violet light threads a red body that refuses to travel straight. At the last instant it gathers its heat, snaps forward, and leaves a thin ember-bright scar in the air.', ['violet-red', 'serpent', 'striking']],
  ['moon-whip', 'Moon Whip', 'water', 'a thin cold arc of moonlit water that snaps at the end', 'Cut from a low tide beneath a cloudless moon, this narrow lash keeps its silence until the final crack. It favors a sure hand and leaves pale foam where it has passed.', ['cold', 'precise', 'lunar']],
  ['harbor-bell', 'Harbor Bell', 'water', 'a heavy, slow swell that rings out wide foam rings on impact', 'A broad blue weight rolls forward without hurry, carrying the stillness of a harbor at dusk. When it lands, pale rings travel outward as if the water has remembered a distant bell.', ['heavy', 'slow', 'foam']],
  ['undertow', 'Undertow', 'water', 'a deep teal surge that drags low and crowns tall', 'Deep teal water stays close to the ground before rising into a bright, crowned finish. Its pull is steady rather than violent, the kind that asks loose things to follow.', ['teal', 'low', 'crowned']],
  ['terrace-of-the-patient-king', 'Terrace of the Patient King', 'earth', 'a slow, wide paving that ends in a tall tower', 'Stone rises in deliberate syllables, each plate bearing the memory of the one below it. At the end, a quiet column waits for the world to speak first.', ['steady', 'wide', 'regal']],
  ['gravel-psalm', 'Gravel Psalm', 'earth', 'quick shallow plates that crack early and settle softly', 'Small plates answer in a quick rhythm, splitting before their edges have found the ground. The dust settles sooner than expected, as though the earth has finished a familiar prayer.', ['quick', 'shallow', 'soft']],
  ['basalt-procession', 'Basalt Procession', 'earth', 'narrow dark plates marching in file to a squat obelisk', 'Dark slabs move one after another with no wasted motion. Their final obelisk is short, broad, and certain, a marker for a road that exists only while the spell is spoken.', ['basalt', 'narrow', 'obelisk']],
  ['sparrow-gale', 'Sparrow Gale', 'air', 'a quick, light spiral that scatters leaves and is gone', 'A small wind with a bird’s sudden nerve takes the loose things first, then slips through the fingers of anyone who thinks to hold it. Only the leaves remember where it went.', ['quick', 'light', 'restless']],
  ['whistling-door', 'Whistling Door', 'air', 'a slow wide vortex that ends in a pressure clap', 'The air opens gradually, a wide pale doorway turning on its own hinge. At the end it closes with a soft, startling clap that rearranges dust and attention alike.', ['wide', 'vortex', 'pressure']],
  ['sky-lathe', 'Sky Lathe', 'air', 'a tight, fast helix that polishes the air white', 'A tight helix cuts upward so quickly that its center turns white. It does not tear the sky; it burnishes it, leaving the stage briefly brighter than it was before.', ['tight', 'fast', 'white']]
];

const numeric = { bsonType: ['double', 'int', 'long', 'decimal'] };
const counter = { bsonType: ['int', 'long', 'double', 'decimal'], minimum: 0 };
const objectIdOrNull = { bsonType: ['objectId', 'null'] };

const spellValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'slug', 'name', 'element', 'incantation', 'lore', 'tags', 'settings', 'genome', 'portrait', 'stats', 'lineage', 'creator', 'createdAt', 'updatedAt'],
    properties: {
      _id: { bsonType: 'objectId' },
      schemaVersion: { bsonType: 'int' },
      slug: { bsonType: 'string', minLength: 1, maxLength: 64 },
      name: { bsonType: 'string', minLength: 1, maxLength: 56 },
      element: { enum: ['fire', 'water', 'earth', 'air'] },
      incantation: { bsonType: 'string', minLength: 1, maxLength: 420 },
      lore: { bsonType: 'string', minLength: 1, maxLength: 600 },
      tags: { bsonType: 'array', minItems: 3, maxItems: 6, items: { bsonType: 'string', minLength: 1, maxLength: 24 } },
      settings: spellSettingsBsonSchema(),
      genome: { bsonType: 'object', additionalProperties: false, required: ['pace', 'mass', 'chaos', 'radiance', 'menace'], properties: { pace: { ...numeric, minimum: 0, maximum: 1 }, mass: { ...numeric, minimum: 0, maximum: 1 }, chaos: { ...numeric, minimum: 0, maximum: 1 }, radiance: { ...numeric, minimum: 0, maximum: 1 }, menace: { ...numeric, minimum: 0, maximum: 1 } } },
      portrait: { bsonType: 'object', additionalProperties: false, required: ['imageUrl', 'palette'], properties: { imageUrl: { bsonType: ['string', 'null'], maxLength: 512 }, palette: { bsonType: 'array', minItems: 3, maxItems: 4, items: { bsonType: 'string', pattern: '^#[0-9a-fA-F]{6}$' } } } },
      embedding: { bsonType: 'array', minItems: 1024, maxItems: 1024, items: numeric },
      embeddingModel: { bsonType: 'string', maxLength: 80 },
      embeddingDimensions: { bsonType: 'int', minimum: 1024, maximum: 1024 },
      lineage: { bsonType: 'object', additionalProperties: false, required: ['parentId', 'rootId', 'depth'], properties: { parentId: objectIdOrNull, rootId: { bsonType: 'objectId' }, depth: { bsonType: 'int', minimum: 0 } } },
      stats: { bsonType: 'object', additionalProperties: false, required: ['casts', 'remixes', 'bookmarks', 'lastCastAt'], properties: { casts: counter, remixes: counter, bookmarks: counter, lastCastAt: { bsonType: ['date', 'null'] } } },
      creator: { bsonType: 'object', additionalProperties: false, required: ['benderId', 'handle'], properties: { benderId: { bsonType: 'objectId' }, handle: { bsonType: 'string', minLength: 1, maxLength: 56 } } },
      incantationHistory: { bsonType: 'array', maxItems: 20, items: { bsonType: 'object', additionalProperties: false, required: ['text', 'at'], properties: { text: { bsonType: 'string', maxLength: 420 }, at: { bsonType: 'date' } } } },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' }
    }
  }
};

const castValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['eventId', 'spellId', 'spellKey', 'element', 'benderId', 'travelMs', 'pathLenM', 'client', 'at'],
    properties: {
      _id: { bsonType: 'objectId' }, eventId: { bsonType: 'string', minLength: 16, maxLength: 64 }, spellId: objectIdOrNull,
      spellKey: { bsonType: 'string', minLength: 1, maxLength: 64 }, element: { enum: ['fire', 'water', 'earth', 'air'] }, benderId: { bsonType: 'objectId' },
      travelMs: { bsonType: 'int', minimum: 0, maximum: 120_000 }, pathLenM: { ...numeric, minimum: 0, maximum: 250 },
      client: { bsonType: 'object', additionalProperties: false, required: ['input', 'deviceClass'], properties: { input: { enum: ['hands', 'mouse', 'touch'] }, deviceClass: { enum: ['desktop', 'mobile'] } } }, at: { bsonType: 'date' }
    }
  }
};

const benderValidator = {
  $jsonSchema: {
    bsonType: 'object', additionalProperties: false, required: ['tokenId', 'handle', 'sigilSeed', 'bookmarks', 'createdAt', 'lastSeenAt'],
    properties: { _id: { bsonType: 'objectId' }, tokenId: { bsonType: 'string', minLength: 16, maxLength: 96 }, handle: { bsonType: 'string', minLength: 3, maxLength: 56 }, sigilSeed: { bsonType: 'string', minLength: 16, maxLength: 96 }, bookmarks: { bsonType: 'array', maxItems: 200, items: { bsonType: 'objectId' } }, createdAt: { bsonType: 'date' }, lastSeenAt: { bsonType: 'date' } }
  }
};

const craftLogValidator = {
  $jsonSchema: {
    bsonType: 'object', additionalProperties: false, required: ['kind', 'benderId', 'createdAt'],
    properties: { _id: { bsonType: 'objectId' }, kind: { bsonType: 'string', maxLength: 48 }, action: { bsonType: 'string', maxLength: 48 }, benderId: { bsonType: 'objectId' }, draftId: { bsonType: 'string', maxLength: 64 }, incantation: { bsonType: 'string', maxLength: 420 }, element: { enum: ['fire', 'water', 'earth', 'air'] }, payload: { bsonType: 'object' }, createdAt: { bsonType: 'date' }, consumedAt: { bsonType: 'date' } }
  }
};

async function ensureCollection(db, name, validator, createOptions = {}) {
  try {
    await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error', ...createOptions });
  } catch (error) {
    if (error?.codeName !== 'NamespaceExists') throw error;
    await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
  }
}

async function embed(text) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 1024 })
  });
  if (!response.ok) throw new Error(`House-spell embedding failed (${response.status}).`);
  const body = await response.json();
  const vector = body?.data?.[0]?.embedding;
  if (!Array.isArray(vector) || vector.length !== 1024) throw new Error('House-spell embedding response had the wrong dimensions.');
  return vector;
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function ensureSearchIndex(collection, index) {
  const existing = await collection.listSearchIndexes(index.name).toArray();
  if (existing.length) await collection.updateSearchIndex(index.name, index.definition);
  else await collection.createSearchIndex(index);

  for (let attempt = 0; attempt < 120; attempt++) {
    const [current] = await collection.listSearchIndexes(index.name).toArray();
    if (current?.status === 'READY' || current?.queryable === true) return;
    await pause(5_000);
  }
  throw new Error(`Atlas Search index ${index.name} did not become queryable within 10 minutes.`);
}

const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db(databaseName);
  await ensureCollection(db, 'spells', spellValidator);
  await ensureCollection(db, 'casts', castValidator);
  await ensureCollection(db, 'benders', benderValidator);
  await ensureCollection(db, 'craft_log', craftLogValidator, { capped: true, size: 512 * 1024 * 1024, max: 1_000_000 });

  await Promise.all([
    db.collection('spells').createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' }),
    db.collection('spells').createIndex({ element: 1, 'stats.casts': -1, createdAt: -1 }, { name: 'spell_feed_by_element' }),
    db.collection('spells').createIndex({ 'stats.casts': -1, createdAt: -1 }, { name: 'spell_feed_global' }),
    db.collection('spells').createIndex({ 'stats.remixes': -1, createdAt: -1 }, { name: 'spell_remixes_global' }),
    db.collection('spells').createIndex({ 'lineage.rootId': 1, 'lineage.depth': 1 }, { name: 'lineage_tree' }),
    db.collection('casts').createIndex({ spellId: 1, at: -1 }, { name: 'casts_by_spell' }),
    db.collection('casts').createIndex({ element: 1, at: -1 }, { name: 'casts_by_element' }),
    db.collection('casts').createIndex({ benderId: 1, at: -1 }, { name: 'casts_by_bender' }),
    db.collection('casts').createIndex({ eventId: 1 }, { unique: true, name: 'cast_event_unique' }),
    db.collection('casts').createIndex({ at: 1 }, { name: 'cast_expiry', expireAfterSeconds: 90 * 24 * 60 * 60 }),
    db.collection('benders').createIndex({ tokenId: 1 }, { unique: true, name: 'bender_token_unique' }),
    db.collection('benders').createIndex({ handle: 1 }, { unique: true, name: 'bender_handle_unique' }),
    db.collection('craft_log').createIndex({ benderId: 1, action: 1, createdAt: -1 }, { name: 'craft_rate_window' })
  ]);

  const houseToken = 'house-first-binder';
  const houseBender = await db.collection('benders').findOneAndUpdate(
    { tokenId: houseToken },
    { $set: { lastSeenAt: now() }, $setOnInsert: { tokenId: houseToken, handle: 'The First Binder', sigilSeed: 'first-binder-sigil', bookmarks: [], createdAt: now() } },
    { upsert: true, returnDocument: 'after' }
  );
  if (!houseBender?._id) throw new Error('Could not resolve the house bender.');

  for (const [slug, name, element, incantation, lore, tags] of seed) {
    const settings = snapshotSpellSettings();
    const id = new ObjectId();
    const document = {
      _id: id,
      schemaVersion: 1,
      slug,
      name,
      element,
      incantation,
      incantationHistory: [{ text: incantation, at: now() }],
      lore,
      tags,
      settings,
      genome: deriveGenome(settings, element),
      portrait: { imageUrl: null, palette: colors[element] },
      stats: { casts: 0, remixes: 0, bookmarks: 0, lastCastAt: null },
      lineage: { parentId: null, rootId: id, depth: 0 },
      creator: { benderId: houseBender._id, handle: 'The First Binder' },
      createdAt: now(),
      updatedAt: now()
    };
    if (withEmbeddings) {
      const vector = await embed([name, incantation, lore, ...tags].join('\n'));
      document.embedding = vector;
      document.embeddingModel = 'text-embedding-3-small';
      document.embeddingDimensions = 1024;
    }
    await db.collection('spells').updateOne({ slug }, { $setOnInsert: document }, { upsert: true });
  }

  if (withSearch) {
    const indexes = JSON.parse(await readFile(new URL('./search-indexes.json', import.meta.url), 'utf8'));
    await ensureSearchIndex(db.collection('spells'), indexes.text);
    await ensureSearchIndex(db.collection('spells'), indexes.vector);
  }
  console.log(`Living Grimoire bootstrap complete in ${databaseName}.`);
} finally {
  await client.close();
}
