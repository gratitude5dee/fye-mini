import { validateSpellSettings } from '../../../src/config/spell-contract';
import { consumeRateLimit, deviceIdentity, ensureBender, withSessionCookie } from '../_lib/identity';
import { RequestError, json, message, readJson, runtime, text } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';
import { structured } from '../_lib/openai';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['names', 'lore', 'tags', 'safe'],
  properties: {
    names: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
    lore: { type: 'string' },
    tags: { type: 'array', minItems: 3, maxItems: 6, items: { type: 'string' } },
    safe: { type: 'boolean' }
  }
};

const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const titleCase = (value: string) => /^[A-Z][A-Za-z'’-]*(?:[ -][A-Z][A-Za-z'’-]*){0,5}$/.test(value);
const tag = (value: string) => /^[a-z][a-z-]{1,23}$/.test(value);

export async function POST(request: Request) {
  try {
    if (!runtime('OPENAI_API_KEY')) throw new RequestError(503, 'The Lorekeeper is not yet attuned.');
    if (!atlasReady()) throw new RequestError(503, 'The Lorekeeper needs Atlas to seal a page.');
    const identity = await deviceIdentity(request);
    const body = await readJson(request, 80_000);
    const incantation = text(body.incantation, 420);
    const element = text(body.element, 12);
    if (!incantation) throw new RequestError(400, 'Speak an incantation before asking for lore.');
    if (!['fire', 'water', 'earth', 'air'].includes(element)) throw new RequestError(400, 'Choose an element first.');
    const checked = validateSpellSettings(body.settings);
    if (!checked.ok) throw new RequestError(400, checked.issues[0]);
    const bender = await withDb(async (db) => {
      const resolved = await ensureBender(db, identity);
      await consumeRateLimit(db, resolved._id, 'bind', 6);
      return resolved;
    });
    const result = await structured<{ names: string[]; lore: string; tags: string[]; safe: boolean }>(
      'You are the Lorekeeper of a modern elemental grimoire. Return exactly three distinctive title-cased spell names, 40–80 words of concrete sensory lore, and 3–6 lowercase evocative hyphenated-or-single-word tags. Set safe false for slurs, harassment, real-person naming, or material that should not be published. Avoid clichés such as “ancient power.”',
      JSON.stringify({ incantation, element }),
      'spell_lore',
      schema
    );
    const names = result.names.map((name) => text(name, 56)).filter(Boolean);
    const lore = text(result.lore, 600);
    const tags = [...new Set(result.tags.map((value) => text(value, 24).toLowerCase()).filter(Boolean))];
    if (!result.safe) throw new RequestError(422, 'The Lorekeeper will not bind that page. Try a gentler incantation.');
    if (names.length !== 3 || new Set(names.map((name) => name.toLowerCase())).size !== 3 || !names.every(titleCase)) throw new RequestError(422, 'The Lorekeeper returned unbindable names. Try again.');
    if (wordCount(lore) < 40 || wordCount(lore) > 80) throw new RequestError(422, 'The Lorekeeper’s page needs a little more or less telling. Try again.');
    if (tags.length < 3 || tags.length > 6 || !tags.every(tag)) throw new RequestError(422, 'The Lorekeeper returned unbindable tags. Try again.');
    const draftId = crypto.randomUUID();
    await withDb(async (db) => {
      await db.collection('craft_log').insertOne({ kind: 'lore_draft', benderId: bender._id, draftId, incantation, element, payload: { names, lore, tags, safe: true }, createdAt: new Date() });
    });
    return json({ draftId, names, lore, tags }, withSessionCookie({}, identity));
  } catch (error) {
    return message(error, 'Lorekeeper could not illuminate that spell.');
  }
}
