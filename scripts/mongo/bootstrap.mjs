import { readFile } from 'node:fs/promises';
import { MongoClient, ObjectId } from 'mongodb';
import { deriveGenome, spellSettingsBsonSchema } from '../../src/config/spell-contract.js';
import { HOUSE_PALETTE, HOUSE_SEED_SPELLS, houseSpellSettings } from '../../src/config/house-spells.js';

const databaseName = process.env.ATLAS_DB || 'living_grimoire';
const uri = process.env.ATLAS_URI;
const apply = process.argv.includes('--apply');
const withSearch = process.argv.includes('--with-search');
const withEmbeddings = process.argv.includes('--with-embeddings');
// Lore drafts must remain redeemable for 15 minutes and rate records for an
// hour. Two hours gives the TTL monitor comfortable slack without retaining
// anonymous prompt data indefinitely.
const CRAFT_LOG_RETENTION_SECONDS = 2 * 60 * 60;

if (!apply) {
  console.log('Preview only. This script creates no data unless you run: npm run mongo:bootstrap -- --apply');
  console.log('Add --with-search only after reviewing scripts/mongo/search-indexes.json; Atlas Search index creation can incur costs.');
  console.log('Add --with-embeddings only with OPENAI_API_KEY configured to embed the 12 house spells.');
  process.exit(0);
}
if (!uri) throw new Error('ATLAS_URI must be set before bootstrap can run.');
if (withEmbeddings && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required with --with-embeddings.');

const now = () => new Date();

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
      schemaVersion: { bsonType: 'int', enum: [1] },
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
  const existing = await db.listCollections({ name }, { nameOnly: false }).next();
  if (!existing) {
    await db.createCollection(name, { validator, validationLevel: 'strict', validationAction: 'error', ...createOptions });
    return;
  }
  // A capped collection cannot participate in the bind transaction: MongoDB
  // rejects writes to capped collections in transactions. Do not attempt a
  // destructive conversion in a bootstrap script; make the operator choose a
  // reviewed migration instead.
  if (name === 'craft_log' && existing.options?.capped) {
    throw new Error('craft_log is capped from an earlier bootstrap. Migrate it to a normal collection before applying this version; bind drafts are transactionally consumed.');
  }
  await db.command({ collMod: name, validator, validationLevel: 'strict', validationAction: 'error' });
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
  // This is deliberately a normal collection. `POST /api/spells` consumes a
  // lore draft inside a transaction with the spell insert, and MongoDB forbids
  // transaction writes to capped collections. The TTL index below bounds it.
  await ensureCollection(db, 'craft_log', craftLogValidator);

  await Promise.all([
    db.collection('spells').createIndex({ slug: 1 }, { unique: true, name: 'slug_unique' }),
    db.collection('spells').createIndex({ element: 1, 'stats.casts': -1, createdAt: -1 }, { name: 'spell_feed_by_element' }),
    db.collection('spells').createIndex({ 'stats.casts': -1, createdAt: -1 }, { name: 'spell_feed_global' }),
    db.collection('spells').createIndex({ element: 1, createdAt: -1 }, { name: 'spell_newest_by_element' }),
    db.collection('spells').createIndex({ createdAt: -1 }, { name: 'spell_newest_global' }),
    db.collection('spells').createIndex({ element: 1, 'stats.remixes': -1, createdAt: -1 }, { name: 'spell_remixes_by_element' }),
    db.collection('spells').createIndex({ 'stats.remixes': -1, createdAt: -1 }, { name: 'spell_remixes_global' }),
    db.collection('spells').createIndex({ 'lineage.rootId': 1, 'lineage.depth': 1 }, { name: 'lineage_tree' }),
    db.collection('spells').createIndex({ 'lineage.parentId': 1, 'lineage.depth': 1 }, { name: 'lineage_children' }),
    db.collection('casts').createIndex({ spellId: 1, at: -1 }, { name: 'casts_by_spell' }),
    db.collection('casts').createIndex({ element: 1, at: -1 }, { name: 'casts_by_element' }),
    db.collection('casts').createIndex({ benderId: 1, at: -1 }, { name: 'casts_by_bender' }),
    // The Discover and Almanac trend pipelines first bound a seven-day time
    // window, then group by spell. This avoids scanning the full TTL history.
    db.collection('casts').createIndex({ at: -1, spellId: 1 }, { name: 'casts_trending_window' }),
    db.collection('casts').createIndex({ eventId: 1 }, { unique: true, name: 'cast_event_unique' }),
    db.collection('casts').createIndex({ at: 1 }, { name: 'cast_expiry', expireAfterSeconds: 90 * 24 * 60 * 60 }),
    db.collection('benders').createIndex({ tokenId: 1 }, { unique: true, name: 'bender_token_unique' }),
    db.collection('benders').createIndex({ handle: 1 }, { unique: true, name: 'bender_handle_unique' }),
    db.collection('craft_log').createIndex({ benderId: 1, action: 1, createdAt: -1 }, { name: 'craft_rate_window' }),
    db.collection('craft_log').createIndex({ kind: 1, draftId: 1, benderId: 1, consumedAt: 1, createdAt: -1 }, { name: 'craft_draft_redemption' }),
    db.collection('craft_log').createIndex({ createdAt: 1 }, { name: 'craft_log_expiry', expireAfterSeconds: CRAFT_LOG_RETENTION_SECONDS })
  ]);

  const houseToken = 'house-first-binder';
  const houseBender = await db.collection('benders').findOneAndUpdate(
    { tokenId: houseToken },
    { $set: { lastSeenAt: now() }, $setOnInsert: { tokenId: houseToken, handle: 'The First Binder', sigilSeed: 'first-binder-sigil', bookmarks: [], createdAt: now() } },
    { upsert: true, returnDocument: 'after' }
  );
  if (!houseBender?._id) throw new Error('Could not resolve the house bender.');

  const spells = db.collection('spells');
  for (const { slug, name, element, incantation, lore, tags, settingsPatch } of HOUSE_SEED_SPELLS) {
    const existing = await spells.findOne(
      { slug },
      { projection: { _id: 1, embedding: 1, 'creator.benderId': 1 } },
    );
    const isHouseSpell = !existing || String(existing.creator?.benderId ?? '') === String(houseBender._id);
    if (existing) {
      // A user who happened to choose a reserved slug must never have their
      // document overwritten. A previous preview/bootstrap run, however, can
      // be repaired in place when embeddings are requested later.
      if (withEmbeddings && isHouseSpell && (!Array.isArray(existing.embedding) || existing.embedding.length !== 1024)) {
        const vector = await embed([name, incantation, lore, ...tags].join('\n'));
        await spells.updateOne(
          { _id: existing._id },
          { $set: { embedding: vector, embeddingModel: 'text-embedding-3-small', embeddingDimensions: 1024, updatedAt: now() } },
        );
      }
      continue;
    }

    const settings = houseSpellSettings(settingsPatch);
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
      portrait: { imageUrl: null, palette: HOUSE_PALETTE[element] },
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
    await spells.updateOne({ slug }, { $setOnInsert: document }, { upsert: true });
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
