import { RANGES, SPELLWRIGHT_PATHS, validateSpellSettings, validateSpellwrightPatch } from '../../../src/config/spell-contract';
import { RequestError, json, message, readJson, runtime, text } from '../_lib/http';
import { structured } from '../_lib/openai';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'patch'],
  properties: {
    reply: { type: 'string' },
    patch: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(SPELLWRIGHT_PATHS.map((path) => [path, { type: 'number' }]))
    }
  }
};

function atPath(value: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((cursor, key) => cursor && typeof cursor === 'object' ? (cursor as Record<string, unknown>)[key] : undefined, value);
}

export async function POST(request: Request) {
  try {
    if (!runtime('OPENAI_API_KEY')) throw new RequestError(503, 'Spellwright is not yet attuned.');
    const body = await readJson(request, 80_000);
    const incantation = text(body.incantation, 420);
    const element = text(body.element, 12);
    if (!incantation) throw new RequestError(400, 'Speak an incantation before changing the spell.');
    if (!['fire', 'water', 'earth', 'air'].includes(element)) throw new RequestError(400, 'Choose an element first.');
    const checked = validateSpellSettings(body.settings);
    if (!checked.ok) throw new RequestError(400, checked.issues[0]);

    const relevantPaths = SPELLWRIGHT_PATHS.filter((path) => path.startsWith(`${element}.`) || path.startsWith('global.') || path.startsWith('trail.'));
    const current = Object.fromEntries(relevantPaths.map((path) => [path, atPath(checked.value, path)]));
    const allowedRanges = Object.fromEntries(relevantPaths.map((path) => [path, RANGES[path]]));
    const result = await structured<{ reply: string; patch: Record<string, unknown> }>(
      'You are Spellwright, a precise visual-effects artisan. Make one to four measured numeric dial changes only. Preserve the current element and never invent paths. Reply in one evocative, practical sentence. Choose settings that visibly honor the incantation without making the effect unstable.',
      JSON.stringify({ incantation, element, current, allowedRanges }),
      'spellwright_patch',
      schema
    );
    const patch = validateSpellwrightPatch(result.patch);
    if (!patch.ok) throw new RequestError(422, patch.issues[0]);
    return json({ reply: text(result.reply, 220) || 'The spell settles into a clearer shape.', patch: patch.value });
  } catch (error) {
    return message(error, 'Spellwright could not shape that request.');
  }
}
