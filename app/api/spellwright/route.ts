import { RANGES, SPELLWRIGHT_COLOR_PATHS, SPELLWRIGHT_PATHS, validateSpellSettings, validateSpellwrightPatch } from '../../../src/config/spell-contract';
import { consumeRateLimit, deviceIdentity, ensureBender, withSessionCookie } from '../_lib/identity';
import { RequestError, json, message, readJson, runtime, text } from '../_lib/http';
import { atlasReady, withDb } from '../_lib/mongo';
import { structured } from '../_lib/openai';

const dialMeaning: Record<string, string> = {
  'global.speed': 'overall travel speed', 'global.glow': 'overall light', 'global.turbulence': 'shared irregularity', 'global.particleCount': 'particle density', 'global.particleSize': 'particle scale',
  'trail.width': 'drawn trail width', 'trail.glow': 'drawn trail light', 'trail.flowSpeed': 'trail flow',
  'fire.flameWidth': 'flame body width', 'fire.flameHeight': 'flame height', 'fire.flameTurbulence': 'flame turbulence', 'fire.streamLength': 'burning tail length', 'fire.emberRate': 'ember density', 'fire.explosionSize': 'impact scale', 'fire.colorCore': 'fire core colour', 'fire.colorMid': 'fire middle colour', 'fire.colorEdge': 'fire edge colour',
  'water.radius': 'water body width', 'water.crest': 'water crest height', 'water.waveAmplitude': 'wave amplitude', 'water.flowSpeed': 'water flow', 'water.foam': 'foam amount', 'water.splashSize': 'splash scale',
  'earth.crustWidth': 'paved crust width', 'earth.plateSize': 'stone plate size', 'earth.rockSize': 'boulder scale', 'earth.riseHeight': 'rock rise height', 'earth.towerHeight': 'tower height', 'earth.towerWidth': 'tower width',
  'air.ribbonWidth': 'air ribbon width', 'air.ribbonLength': 'air ribbon length', 'air.spiralRadius': 'spiral radius', 'air.vortexStrength': 'vortex force', 'air.turbulence': 'air turbulence', 'air.tornadoHeight': 'tornado height'
};

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'patch'],
  properties: {
    reply: { type: 'string' },
    patch: { type: 'object', additionalProperties: false, minProperties: 1, maxProperties: 4, properties: Object.fromEntries(SPELLWRIGHT_PATHS.map((path) => [path, SPELLWRIGHT_COLOR_PATHS.includes(path) ? { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } : { type: 'number' }])) }
  }
};

function atPath(value: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((cursor, key) => cursor && typeof cursor === 'object' ? (cursor as Record<string, unknown>)[key] : undefined, value);
}

function shortReply(value: unknown) {
  const reply = text(value, 180);
  if (reply.split(/\s+/).filter(Boolean).length > 12) throw new RequestError(422, 'Spellwright’s reply wandered too far. Try again.');
  return reply || 'The spell settles into a clearer shape.';
}

export async function POST(request: Request) {
  try {
    if (!runtime('OPENAI_API_KEY')) throw new RequestError(503, 'Spellwright is not yet attuned.');
    if (!atlasReady()) throw new RequestError(503, 'The Spellwright needs Atlas to keep a measured ledger.');
    const identity = await deviceIdentity(request);
    const body = await readJson(request, 80_000);
    const incantation = text(body.incantation, 420);
    const element = text(body.element, 12);
    if (!incantation) throw new RequestError(400, 'Speak an incantation before changing the spell.');
    if (!['fire', 'water', 'earth', 'air'].includes(element)) throw new RequestError(400, 'Choose an element first.');
    const checked = validateSpellSettings(body.settings);
    if (!checked.ok) throw new RequestError(400, checked.issues[0]);
    const relevantPaths = SPELLWRIGHT_PATHS.filter((path) => path.startsWith(`${element}.`) || path.startsWith('global.') || path.startsWith('trail.'));
    const current = Object.fromEntries(relevantPaths.map((path) => [path, atPath(checked.value, path)]));
    const allowedRanges = Object.fromEntries(relevantPaths.map((path) => [path, SPELLWRIGHT_COLOR_PATHS.includes(path) ? { type: 'hex-color', meaning: dialMeaning[path] ?? path } : { ...RANGES[path], meaning: dialMeaning[path] ?? path }]));
    const bender = await withDb(async (db) => {
      const resolved = await ensureBender(db, identity);
      await consumeRateLimit(db, resolved._id, 'spellwright', 30);
      return resolved;
    });
    const result = await structured<{ reply: string; patch: Record<string, unknown> }>(
      'You are Spellwright, a precise visual-effects artisan. Return only one to four allowed dial changes. Numeric paths need numbers in range; hex-color paths need a six-digit hex color. Preserve the current element, never invent a path, and write one practical in-world reply of at most twelve words. Favor a visible, stable result over maximal changes.',
      JSON.stringify({ incantation, element, current, allowedRanges }),
      'spellwright_patch',
      schema
    );
    const patch = validateSpellwrightPatch(result.patch, relevantPaths);
    if (!patch.ok) throw new RequestError(422, patch.issues[0]);
    const reply = shortReply(result.reply);
    await withDb(async (db) => {
      await db.collection('craft_log').insertOne({ kind: 'spellwright', benderId: bender._id, incantation, element, payload: { patch: patch.value, reply }, createdAt: new Date() });
    });
    return json({ reply, patch: patch.value }, withSessionCookie({}, identity));
  } catch (error) {
    return message(error, 'Spellwright could not shape that request.');
  }
}
