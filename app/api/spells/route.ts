import type { Db } from 'mongodb';
import { deriveGenome, SPELL_ELEMENTS, validateSpellSettings } from '../../../src/config/spell-contract';
import { deviceIdentity, ensureBender, withSessionCookie } from '../_lib/identity';
import { RequestError, json, message, readJson, runtime, text } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';
import { embedding } from '../_lib/openai';
import { paletteFor, readableSpellForClient, slugify, spellForClient, spellSearchText } from '../_lib/spells';
const FEED_SORTS = {
  trending: { 'stats.casts': -1, createdAt: -1 },
  newest: { createdAt: -1 },
  remixed: { 'stats.remixes': -1, createdAt: -1 }
} as const;
const SEARCH_LIMIT = 24;
// Atlas Vector Search generally needs a wider candidate pool than the final
// result set. Keeping this at 20x the page size preserves semantic recall
// without ever exceeding Atlas's 10,000-candidate ceiling.
const VECTOR_NUM_CANDIDATES = SEARCH_LIMIT * 20;
const PUBLICATION_BLOCKLIST = /\b(?:hitler|nazi|terrorist|rapist|suicide|genocide)\b/i;
type PublicSpell = ReturnType<typeof spellForClient>;

function publicationName(value: unknown) {
  const name = text(value, 56);
  // Custom names are public pages, not free-form prompts. This keeps names
  // readable, prevents links/handles, and catches a small high-confidence set
  // of harmful terms before a page reaches shared discovery.
  if (!/^[A-Z][A-Za-z'’-]*(?:[ -][A-Z][A-Za-z'’-]*){0,5}$/.test(name) || PUBLICATION_BLOCKLIST.test(name)) {
    throw new RequestError(422, 'Choose a concise, title-cased name that is safe to share.');
  }
  return name;
}

const publicSpells = (documents: Record<string, unknown>[]) => documents
  .map((document) => readableSpellForClient(document as any))
  .filter((spell): spell is PublicSpell => spell !== null);

async function trendingSpells(db: Db, element: string | undefined) {
  const moment = new Date();
  const since = new Date(moment.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ranked = await db.collection('casts').aggregate([
    { $match: { at: { $gte: since }, spellId: { $type: 'objectId' } } },
    { $addFields: { ageMs: { $subtract: [moment, '$at'] } } },
    { $addFields: { decay: { $exp: { $multiply: [-1 / (2 * 24 * 60 * 60 * 1000), '$ageMs'] } } } },
    { $group: { _id: '$spellId', casts: { $sum: 1 }, trend: { $sum: '$decay' } } },
    { $sort: { trend: -1, casts: -1, _id: 1 } },
    { $lookup: { from: 'spells', localField: '_id', foreignField: '_id', as: 'spell' } },
    { $unwind: '$spell' },
    ...(element ? [{ $match: { 'spell.element': element } }] : []),
    { $limit: 36 },
    { $replaceRoot: { newRoot: '$spell' } }
  ]).toArray();
  return publicSpells(ranked as Record<string, unknown>[]);
}

async function hybridSearch(query: string, element: string | undefined) {
  const filter = element ? { element } : {};
  const isShortQuery = query.trim().split(/\s+/).filter(Boolean).length <= 3;
  const autocomplete = isShortQuery
    ? [{ autocomplete: { query, path: 'name', tokenOrder: 'sequential', fuzzy: { maxEdits: 1, prefixLength: 2, maxExpansions: 50 } } }]
    : [];
  return withDb(async (db) => {
    const spells = db.collection('spells');
    // Keep input pipelines to only the stages permitted by $rankFusion. Any
    // client-facing shaping belongs after fusion (the serializer below).
    const lexicalPipeline = [
      {
        $search: {
          index: 'spell_text',
          compound: {
            should: [...autocomplete, { text: { query, path: ['name', 'incantation', 'lore', 'tags'] } }],
            minimumShouldMatch: 1,
            ...(element ? { filter: [{ equals: { path: 'element', value: element } }] } : {})
          }
        }
      },
      { $limit: SEARCH_LIMIT }
    ];
    let vector: number[] | null = null;
    if (runtime('OPENAI_API_KEY')) {
      try {
        vector = await embedding(query);
      } catch (error) {
        // A transient embedding failure must never turn a keyword search into
        // an error page. Atlas Search remains useful while the model recovers.
        console.warn('[Living Grimoire] Query embedding unavailable.', error);
      }
    }
    const semanticPipeline = vector
      ? [{ $vectorSearch: { index: 'spell_vector', path: 'embedding', queryVector: vector, numCandidates: VECTOR_NUM_CANDIDATES, limit: SEARCH_LIMIT, ...(element ? { filter } : {}) } }]
      : [];

    if (semanticPipeline.length) {
      try {
        const fused = await spells.aggregate([
          {
            $rankFusion: {
              input: { pipelines: { lexical: lexicalPipeline, semantic: semanticPipeline } },
              // Short queries are usually named pages; descriptive phrases
              // benefit slightly more from meaning. Both paths always remain.
              combination: { weights: isShortQuery ? { lexical: 1.35, semantic: 1 } : { lexical: 1, semantic: 1.25 } }
            }
          },
          { $limit: SEARCH_LIMIT }
        ]).toArray();
        if (fused.length) return publicSpells(fused as Record<string, unknown>[]);
      } catch (error) {
        // Atlas Search index creation is asynchronous and $rankFusion may be
        // unavailable during an upgrade. Fall through to the same RRF formula
        // in application code rather than breaking the one search box.
        console.warn('[Living Grimoire] Atlas rank fusion unavailable; using RRF fallback.', error);
      }
    }

    const searches: Array<Promise<unknown>> = [spells.aggregate(lexicalPipeline).toArray()];
    if (semanticPipeline.length) searches.push(spells.aggregate(semanticPipeline).toArray());
    const settled = await Promise.allSettled(searches);
    const ranked = new Map<string, { document: Record<string, unknown>; score: number }>();
    for (const result of settled) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue;
      result.value.forEach((document, index) => {
        const item = document as Record<string, unknown>;
        const id = String(item._id);
        const entry = ranked.get(id) ?? { document: item, score: 0 };
        entry.score += 1 / (60 + index + 1); // Atlas 8.0 compatible reciprocal-rank fusion fallback.
        ranked.set(id, entry);
      });
    }
    if (ranked.size) return publicSpells([...ranked.values()].sort((a, b) => b.score - a.score).slice(0, SEARCH_LIMIT).map(({ document }) => document));
    return [];
  });
}

function draftValue(value: unknown) {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const lore = text(payload.lore, 600);
  const tags = Array.isArray(payload.tags) ? payload.tags.map((entry) => text(entry, 24).toLowerCase()).filter(Boolean).slice(0, 6) : [];
  return { lore, tags: [...new Set(tags)] };
}

function portraitValue(value: unknown, element: string) {
  const portrait = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const imageUrl = text(portrait.imageUrl, 512);
  if (!imageUrl) throw new RequestError(503, 'The portrait gallery must seal this spell before it can be bound.');
  if (imageUrl && !imageUrl.startsWith('/api/portraits?key=portraits%2F')) throw new RequestError(400, 'The portrait must come from the Grimoire’s sealed gallery.');
  return { imageUrl, palette: paletteFor(element) };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = text(url.searchParams.get('q'), 160);
    const rawElement = text(url.searchParams.get('element'), 12);
    const element = SPELL_ELEMENTS.includes(rawElement) ? rawElement : undefined;
    const rawSort = text(url.searchParams.get('sort'), 12) as keyof typeof FEED_SORTS;
    const sort = FEED_SORTS[rawSort] ?? FEED_SORTS.trending;
    if (!atlasReady()) return json({ spells: [], source: 'stage' });
    if (query) return json({ spells: await hybridSearch(query, element), source: 'hybrid' });
    if (rawSort === 'trending') {
      const spells = await withDb(async (db) => {
        const ranked = await trendingSpells(db, element);
        if (ranked.length) return ranked;
        const recent = await db.collection('spells').find(element ? { element } : {}).sort({ 'stats.casts': -1, createdAt: -1 }).limit(36).toArray();
        return publicSpells(recent as Record<string, unknown>[]);
      });
      return json({ spells, source: 'atlas' });
    }
    const spells = await withDb(async (db) => db.collection('spells').find(element ? { element } : {}).sort(sort).limit(36).toArray());
    return json({ spells: publicSpells(spells as Record<string, unknown>[]), source: 'atlas' });
  } catch (error) {
    return message(error, 'The book cannot reach its distant shelves.');
  }
}

export async function POST(request: Request) {
  try {
    if (!atlasReady()) throw new RequestError(503, 'Atlas is not yet attuned for binding.');
    const identity = await deviceIdentity(request);
    const body = await readJson(request);
    const name = publicationName(body.name);
    const incantation = text(body.incantation, 420);
    const incantationHistory = Array.isArray(body.incantationHistory)
      ? [...new Set(body.incantationHistory.map((entry) => text(entry, 420)).filter(Boolean))].slice(-20)
      : [incantation];
    if (!incantationHistory.includes(incantation)) incantationHistory.push(incantation);
    const element = text(body.element, 12);
    const draftId = text(body.draftId, 64);
    if (!name || !incantation || !draftId) throw new RequestError(400, 'Choose a name after the Lorekeeper has written this page.');
    if (!SPELL_ELEMENTS.includes(element)) throw new RequestError(400, 'A bound spell must belong to one element.');
    const checked = validateSpellSettings(body.settings);
    if (!checked.ok) throw new RequestError(400, checked.issues[0]);
    const portrait = portraitValue(body.portrait, element);
    const createdAt = new Date();

    const spell = await withDb(async (db, client) => {
      const bender = await ensureBender(db, identity);
      const draft = await db.collection('craft_log').findOne({ kind: 'lore_draft', draftId, benderId: bender._id, consumedAt: { $exists: false }, createdAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } });
      if (!draft) throw new RequestError(409, 'That Lorekeeper page has faded. Ask for a fresh page before binding.');
      const { lore, tags } = draftValue(draft.payload);
      const loreWords = lore.split(/\s+/).filter(Boolean).length;
      if (loreWords < 40 || loreWords > 80 || tags.length < 3) throw new RequestError(422, 'The Lorekeeper page is incomplete.');

      const { ObjectId } = await import('mongodb');
      const parentId = text(body.parentId, 24);
      let parent: Record<string, any> | null = null;
      if (parentId) {
        if (!/^[a-f\d]{24}$/i.test(parentId)) throw new RequestError(400, 'That ancestry mark is malformed.');
        parent = await db.collection('spells').findOne({ _id: new ObjectId(parentId) }) as Record<string, any> | null;
        if (!parent) throw new RequestError(404, 'The spell you meant to remix has left the book.');
      }

      const collection = db.collection('spells');
      const baseSlug = slugify(name);
      let slug = baseSlug;
      for (let attempt = 0; attempt < 8; attempt++) {
        if (attempt) slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
        if (!(await collection.findOne({ slug }, { projection: { _id: 1 } }))) break;
      }
      const id = new ObjectId();
      const rootId = parent?.lineage?.rootId ?? id;
      const document: Record<string, unknown> = {
        _id: id,
        schemaVersion: 1,
        slug,
        name,
        element,
        incantation,
        incantationHistory: incantationHistory.map((value) => ({ text: value, at: createdAt })),
        lore,
        tags,
        settings: checked.value,
        genome: deriveGenome(checked.value, element),
        portrait,
        stats: { casts: 0, remixes: 0, bookmarks: 0, lastCastAt: null },
        lineage: { parentId: parent?._id ?? null, rootId, depth: parent ? Number(parent.lineage?.depth ?? 0) + 1 : 0 },
        creator: { benderId: bender._id, handle: bender.handle },
        createdAt,
        updatedAt: createdAt
      };
      // Lore drafts already require the OpenAI server secret. Make the
      // embedding atomic with bind readiness so every published page can be
      // discovered by meaning instead of creating a silent semantic gap.
      const vector = await embedding(spellSearchText({ name, incantation, lore, tags }));
      document.embedding = vector;
      document.embeddingModel = 'text-embedding-3-small';
      document.embeddingDimensions = 1024;

      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const consumed = await db.collection('craft_log').updateOne({ _id: draft._id, consumedAt: { $exists: false } }, { $set: { consumedAt: createdAt } }, { session });
          if (consumed.matchedCount !== 1) throw new RequestError(409, 'That page was already bound.');
          await collection.insertOne(document, { session });
          if (parent?._id) await collection.updateOne({ _id: parent._id }, { $inc: { 'stats.remixes': 1 }, $set: { updatedAt: createdAt } }, { session });
        });
      } finally {
        await session.endSession();
      }
      return document;
    });
    return json({ spell: spellForClient(spell as any) }, withSessionCookie({ status: 201 }, identity));
  } catch (error) {
    return message(error, 'The binding could not be completed.');
  }
}
