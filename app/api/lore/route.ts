import { validateSpellSettings } from '../../../src/config/spell-contract';
import { RequestError, json, message, readJson, runtime, stringList, text } from '../_lib/http';
import { structured } from '../_lib/openai';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['names', 'lore', 'tags'],
  properties: {
    names: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } },
    lore: { type: 'string' },
    tags: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'string' } }
  }
};

export async function POST(request: Request) {
  try {
    if (!runtime('OPENAI_API_KEY')) throw new RequestError(503, 'The Lorekeeper is not yet attuned.');
    const body = await readJson(request, 80_000);
    const incantation = text(body.incantation, 420);
    const element = text(body.element, 12);
    if (!incantation) throw new RequestError(400, 'Speak an incantation before asking for lore.');
    if (!['fire', 'water', 'earth', 'air'].includes(element)) throw new RequestError(400, 'Choose an element first.');
    const checked = validateSpellSettings(body.settings);
    if (!checked.ok) throw new RequestError(400, checked.issues[0]);

    const result = await structured<{ names: string[]; lore: string; tags: string[] }>(
      'You are the Lorekeeper of a modern elemental grimoire. Return exactly three distinctive, title-cased spell names, a 45–70 word piece of lore, and 3–5 lowercase evocative tags. Keep it original, clear, and grounded in the supplied element and incantation.',
      JSON.stringify({ incantation, element }),
      'spell_lore',
      schema
    );
    const names = result.names.map((name) => text(name, 52)).filter(Boolean).slice(0, 3);
    const tags = stringList(result.tags, 5, 24);
    const lore = text(result.lore, 520);
    if (names.length !== 3 || tags.length < 3 || !lore) throw new RequestError(422, 'The Lorekeeper returned an incomplete page.');
    return json({ names, lore, tags });
  } catch (error) {
    return message(error, 'Lorekeeper could not illuminate that spell.');
  }
}
