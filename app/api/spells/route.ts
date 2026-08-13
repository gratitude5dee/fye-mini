import { validateSpellSettings, deriveGenome, SPELL_ELEMENTS } from '../../../src/config/spell-contract';
import { RequestError, json, message, readJson, runtime, stringList, text } from '../_lib/http';
import { embedding } from '../_lib/openai';
import { atlasReady, withDb } from '../_lib/mongo';
import { paletteFor, slugify, spellForClient, spellSearchText } from '../_lib/spells';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function hybridSearch(query: string, element: string | undefined) {
  const filter = element ? { element } : {};
  return withDb(async (db) => {
    const spells = db.collection('spells');
    const tasks: Array<Promise<unknown>> = [];
    if (runtime('OPENAI_API_KEY')) {
      tasks.push((async () => {
        const vector = await embedding(query);
        return spells.aggregate([
          { $vectorSearch: { index: 'spell_vector', path: 'embedding', queryVector: vector, numCandidates: 120, limit: 24, ...(element ? { filter } : {}) } },
          { $project: { score: { $meta: 'vectorSearchScore' } } }
        ]).toArray();
      })());
    }
    tasks.push(spells.aggregate([
      { $search: { index: 'spell_text', compound: { should: [
        { text: { query, path: ['name', 'incantation', 'lore', 'tags'] } }
      ], ...(element ? { filter: [{ equals: { path: 'element', value: element } }] } : {}) } } },
      { $limit: 24 },
      { $project: { score: { $meta: 'searchScore' } } }
    ]).toArray());
    const settled = await Promise.allSettled(tasks);
    const ranked = new Map<string, { document: Record<string, unknown>; score: number }>();
    for (const result of settled) {
      if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue;
      result.value.forEach((document, index) => {
        const item = document as Record<string, unknown>;
        const id = String(item._id);
        const existing = ranked.get(id) ?? { document: item, score: 0 };
        existing.score += 1 / (60 + index + 1); // reciprocal rank fusion
        ranked.set(id, existing);
      });
    }
    if (ranked.size) return [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, 24).map(({ document }) => spellForClient(document));
    const regex = new RegExp(escapeRegex(query), 'i');
    const fallback = await spells.find({ ...filter, $or: [{ name: regex }, { incantation: regex }, { lore: regex }, { tags: regex }] }).sort({ 'stats.casts': -1, createdAt: -1 }).limit(24).toArray();
    return fallback.map(spellForClient);
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = text(url.searchParams.get('q'), 160);
    const rawElement = text(url.searchParams.get('element'), 12);
    const element = SPELL_ELEMENTS.includes(rawElement) ? rawElement : undefined;
    if (!atlasReady()) return json({ spells: [], source: 'stage' });
    if (query) return json({ spells: await hybridSearch(query, element), source: 'hybrid' });
    const spells = await withDb(async (db) => db.collection('spells').find(element ? { element } : {}).sort({ 'stats.casts': -1, createdAt: -1 }).limit(36).toArray());
    return json({ spells: spells.map(spellForClient), source: 'atlas' });
  } catch (error) {
    return message(error, 'The book cannot reach its distant shelves.');
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const name = text(body.name, 56);
    const incantation = text(body.incantation, 420);
    const lore = text(body.lore, 520);
    const element = text(body.element, 12);
    const tags = stringList(body.tags, 5, 24);
    if (!name || !incantation || !lore) throw new RequestError(400, 'A name, incantation, and lore are needed to bind a spell.');
    if (!SPELL_ELEMENTS.includes(element)) throw new RequestError(400, 'A bound spell must belong to one element.');
    if (tags.length < 3) throw new RequestError(400, 'Give the spell at least three clear tags.');
    const checked = validateSpellSettings(body.settings);
    if (!checked.ok) throw new RequestError(400, checked.issues[0]);
    if (!atlasReady()) throw new RequestError(503, 'Atlas is not yet attuned for binding.');

    const createdAt = new Date();
    const baseSlug = slugify(name);
    const benderId = text(body.benderId, 80) || undefined;
    const base = {
      schemaVersion: 1,
      name,
      element,
      incantation,
      lore,
      tags,
      settings: checked.value,
      genome: deriveGenome(checked.value, element),
      portrait: { imageUrl: null, palette: paletteFor(element) },
      stats: { casts: 0, remixes: 0 },
      lineage: { parentId: null, rootId: baseSlug, depth: 0 },
      creator: benderId ? { benderId } : { anonymous: true },
      createdAt,
      updatedAt: createdAt
    };
    let vector: number[] | undefined;
    if (runtime('OPENAI_API_KEY')) {
      try { vector = await embedding(spellSearchText(base)); } catch (error) { console.warn('[Living Grimoire] spell saved without embedding', error); }
    }
    const spell = await withDb(async (db) => {
      const collection = db.collection('spells');
      let slug = baseSlug;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt) slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
        if (!(await collection.findOne({ slug }, { projection: { _id: 1 } }))) break;
      }
      const result = await collection.insertOne({ ...base, slug, ...(vector ? { embedding: vector, embeddingModel: 'text-embedding-3-small', embeddingDimensions: 1024 } : {}) });
      return { _id: result.insertedId, ...base, slug };
    });
    return json({ spell: spellForClient(spell) }, { status: 201 });
  } catch (error) {
    return message(error, 'The binding could not be completed.');
  }
}
