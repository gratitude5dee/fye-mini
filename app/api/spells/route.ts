import { deriveGenome, SPELL_ELEMENTS, validateSpellSettings } from '../../../src/config/spell-contract';
import { deviceIdentity, ensureBender, withSessionCookie } from '../_lib/identity';
import { RequestError, json, message, readJson, runtime, text } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';
import { embedding } from '../_lib/openai';
import { paletteFor, slugify, spellForClient, spellSearchText } from '../_lib/spells';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FEED_SORTS = {
  trending: { 'stats.casts': -1, createdAt: -1 },
  newest: { createdAt: -1 },
  remixed: { 'stats.remixes': -1, createdAt: -1 }
} as const;

async function hybridSearch(query: string, element: string | undefined) {
  const filter = element ? { element } : {};
  return withDb(async (db) => {
    const spells = db.collection('spells');
    const searches: Array<Promise<unknown>> = [
      spells.aggregate([
        {
          $search: {
            index: 'spell_text',
            compound: {
              should: [{ text: { query, path: ['name', 'incantation', 'lore', 'tags'] } }],
              ...(element ? { filter: [{ equals: { path: 'element', value: element } }] } : {})
            }
          }
        },
        { $limit: 24 },
        // $set preserves the spell document. A projection containing just score
        // would make successful Atlas results unusable by the Grimoire.
        { $set: { _searchScore: { $meta: 'searchScore' } } }
      ]).toArray()
    ];
    if (runtime('OPENAI_API_KEY')) {
      searches.push((async () => {
        const vector = await embedding(query);
        return spells.aggregate([
          { $vectorSearch: { index: 'spell_vector', path: 'embedding', queryVector: vector, numCandidates: 120, limit: 24, ...(element ? { filter } : {}) } },
          { $set: { _vectorScore: { $meta: 'vectorSearchScore' } } }
        ]).toArray();
      })());
    }
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
    if (ranked.size) return [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, 24).map(({ document }) => spellForClient(document));

    const regex = new RegExp(escapeRegex(query), 'i');
    const fallback = await spells.find({ ...filter, $or: [{ name: regex }, { incantation: regex }, { lore: regex }, { tags: regex }] }).sort(FEED_SORTS.trending).limit(24).toArray();
    return fallback.map(spellForClient);
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
  if (imageUrl && !imageUrl.startsWith('/api/portraits?key=portraits%2F')) throw new RequestError(400, 'The portrait must come from the Grimoire’s sealed gallery.');
  return { imageUrl: imageUrl || null, palette: paletteFor(element) };
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
    const spells = await withDb(async (db) => db.collection('spells').find(element ? { element } : {}).sort(sort).limit(36).toArray());
    return json({ spells: spells.map(spellForClient), source: 'atlas' });
  } catch (error) {
    return message(error, 'The book cannot reach its distant shelves.');
  }
}

export async function POST(request: Request) {
  try {
    if (!atlasReady()) throw new RequestError(503, 'Atlas is not yet attuned for binding.');
    const identity = await deviceIdentity(request);
    const body = await readJson(request);
    const name = text(body.name, 56);
    const incantation = text(body.incantation, 420);
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
      if (!lore || tags.length < 3) throw new RequestError(422, 'The Lorekeeper page is incomplete.');

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
        incantationHistory: [{ text: incantation, at: createdAt }],
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
      if (runtime('OPENAI_API_KEY')) {
        try {
          const vector = await embedding(spellSearchText({ name, incantation, lore, tags }));
          document.embedding = vector;
          document.embeddingModel = 'text-embedding-3-small';
          document.embeddingDimensions = 1024;
        } catch (error) {
          console.warn('[Living Grimoire] spell saved without embedding', error);
        }
      }

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
