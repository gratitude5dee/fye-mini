import { DEFAULT_SETTINGS, settings } from './settings.js';
import { EXACT_SPELL_RANGES } from './spell-ranges.js';

export const SPELL_ELEMENTS = ['fire', 'water', 'earth', 'air'];
// These are the renderer blocks that make a spell portable.  They deliberately
// exclude input, camera, environment, character, and walk settings: another
// person's spell should change the magic, not take over the visitor's device.
export const SPELL_SETTING_BLOCKS = ['global', 'trail', 'fire', 'water', 'earth', 'air', 'post'];

const PUBLIC_TO_ENGINE = { air: 'wind' };
const ENGINE_TO_PUBLIC = { wind: 'air' };
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const publicKey = (key) => ENGINE_TO_PUBLIC[key] ?? key;
const engineKey = (key) => PUBLIC_TO_ENGINE[key] ?? key;

/**
 * A complete, exact manifest shared by the editor, API routes, and bootstrap
 * tooling. Missing bounds are treated as a programming error, never guessed.
 */
export const RANGES = EXACT_SPELL_RANGES;

function publicClone(value, path = '') {
  if (Array.isArray(value)) return value.map((entry) => publicClone(entry, path));
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [publicKey(key), publicClone(child, path ? `${path}.${key}` : key)]));
}

/** Return only the spell-safe renderer snapshot, with public `air` naming. */
export function snapshotSpellSettings(source = settings) {
  return Object.fromEntries(SPELL_SETTING_BLOCKS.map((block) => {
    const engineBlock = engineKey(block);
    return [block, publicClone(source[engineBlock])];
  }));
}

function normalizeNode(input, template, path, issues) {
  if (!isRecord(input)) {
    issues.push(`${path} must be an object`);
    return publicClone(template);
  }
  const allowed = new Set(Object.keys(template).map(publicKey));
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) issues.push(`${path}.${key} is not a spell setting`);
  }

  const output = {};
  for (const [engineName, defaultValue] of Object.entries(template)) {
    const name = publicKey(engineName);
    const nextPath = `${path}.${name}`;
    const candidate = input[name];
    if (candidate === undefined) {
      issues.push(`${nextPath} is required`);
      output[name] = publicClone(defaultValue);
      continue;
    }
    if (typeof defaultValue === 'number') {
      if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
        issues.push(`${nextPath} must be a finite number`);
        output[name] = defaultValue;
      } else {
        const range = RANGES[nextPath.replace(/^settings\./, '')];
        if (!range) {
          issues.push(`${nextPath} has no declared editor range`);
          output[name] = defaultValue;
        } else {
          output[name] = Math.min(range.max, Math.max(range.min, candidate));
        }
      }
    } else if (typeof defaultValue === 'string') {
      if (isHex(defaultValue) && !isHex(candidate)) issues.push(`${nextPath} must be a hex color`);
      else if (typeof candidate !== 'string' || candidate.length > 80) issues.push(`${nextPath} must be a short string`);
      output[name] = typeof candidate === 'string' ? candidate : defaultValue;
    } else if (typeof defaultValue === 'boolean') {
      if (typeof candidate !== 'boolean') issues.push(`${nextPath} must be true or false`);
      output[name] = typeof candidate === 'boolean' ? candidate : defaultValue;
    } else if (isRecord(defaultValue)) {
      output[name] = normalizeNode(candidate, defaultValue, nextPath, issues);
    }
  }
  return output;
}

/**
 * Rejects unknown keys and missing leaves. Finite numerical values are clamped
 * to RANGES before persistence so a malformed request cannot make the VFX
 * unstable when another bender loads its spell.
 */
export function validateSpellSettings(candidate) {
  const issues = [];
  if (!isRecord(candidate)) return { ok: false, issues: ['settings must be an object'], value: null };
  const allowed = new Set(SPELL_SETTING_BLOCKS);
  for (const key of Object.keys(candidate)) if (!allowed.has(key)) issues.push(`settings.${key} is not allowed`);
  const value = {};
  for (const block of SPELL_SETTING_BLOCKS) {
    const engineBlock = engineKey(block);
    if (candidate[block] === undefined) issues.push(`settings.${block} is required`);
    value[block] = normalizeNode(candidate[block], DEFAULT_SETTINGS[engineBlock], `settings.${block}`, issues);
  }
  return { ok: issues.length === 0, issues, value };
}

export const SPELLWRIGHT_PATHS = [
  'global.speed', 'global.glow', 'global.turbulence', 'global.particleCount', 'global.particleSize',
  'trail.width', 'trail.glow', 'trail.flowSpeed',
  'fire.speed', 'fire.flameWidth', 'fire.flameHeight', 'fire.flameTurbulence', 'fire.glow', 'fire.streamLength', 'fire.emberRate', 'fire.explosionSize', 'fire.colorCore', 'fire.colorMid', 'fire.colorEdge',
  'water.speed', 'water.radius', 'water.crest', 'water.waveAmplitude', 'water.flowSpeed', 'water.foam', 'water.glow', 'water.splashSize',
  'earth.speed', 'earth.crustWidth', 'earth.plateSize', 'earth.rockSize', 'earth.riseHeight', 'earth.glow', 'earth.towerHeight', 'earth.towerWidth',
  'air.speed', 'air.ribbonWidth', 'air.ribbonLength', 'air.spiralRadius', 'air.vortexStrength', 'air.turbulence', 'air.glow', 'air.tornadoHeight'
];

// A tiny, explicit colour surface lets a natural-language request such as
// “make it violet” survive the same strict patch contract as numerical dials.
export const SPELLWRIGHT_COLOR_PATHS = ['fire.colorCore', 'fire.colorMid', 'fire.colorEdge'];

/** Strictly whitelisted patch, also clamped to the same RANGES manifest. */
export function validateSpellwrightPatch(candidate, allowedPaths = SPELLWRIGHT_PATHS) {
  const patch = {};
  if (!isRecord(candidate)) return { ok: false, issues: ['patch must be an object'], value: patch };
  const issues = [];
  const writable = new Set(allowedPaths);
  if (Object.keys(candidate).length > 4) issues.push('Spellwright may adjust no more than four dials at once');
  for (const [path, rawValue] of Object.entries(candidate)) {
    if (!writable.has(path)) {
      issues.push(`${path} is not writable by Spellwright`);
      continue;
    }
    if (SPELLWRIGHT_COLOR_PATHS.includes(path)) {
      if (!isHex(rawValue)) {
        issues.push(`${path} must be a six-digit hex color`);
        continue;
      }
      patch[path] = rawValue.toLowerCase();
      continue;
    }
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      issues.push(`${path} must be a finite number`);
      continue;
    }
    const range = RANGES[path];
    patch[path] = Math.min(range.max, Math.max(range.min, rawValue));
  }
  if (Object.keys(patch).length === 0) issues.push('Spellwright must alter at least one dial');
  return { ok: issues.length === 0, issues, value: patch };
}

const GENOME_PATHS = {
  fire: { mass: 'fire.flameWidth', chaos: 'fire.flameTurbulence', radiance: 'fire.glow', menace: 'fire.explosionSize' },
  water: { mass: 'water.radius', chaos: 'water.chop', radiance: 'water.glow', menace: 'water.splashIntensity' },
  earth: { mass: 'earth.crustWidth', chaos: 'earth.rockRandomness', radiance: 'earth.glow', menace: 'earth.towerHeight' },
  air: { mass: 'air.ribbonWidth', chaos: 'air.turbulence', radiance: 'air.glow', menace: 'air.vortexStrength' }
};

function atPath(value, path) {
  return path.split('.').reduce((cursor, key) => cursor && typeof cursor === 'object' ? cursor[key] : undefined, value);
}

export function deriveGenome(settings, element) {
  const paths = GENOME_PATHS[element] ?? GENOME_PATHS.fire;
  const scale = (path, value) => {
    const range = RANGES[path];
    const number = Number(value);
    return range && Number.isFinite(number) ? Math.max(0, Math.min(1, (number - range.min) / (range.max - range.min))) : 0.5;
  };
  const average = (...values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    pace: average(scale(`${element}.speed`, atPath(settings, `${element}.speed`)), scale('global.speed', atPath(settings, 'global.speed'))),
    mass: average(scale(paths.mass, atPath(settings, paths.mass)), scale('global.particleSize', atPath(settings, 'global.particleSize'))),
    chaos: average(scale(paths.chaos, atPath(settings, paths.chaos)), scale('global.turbulence', atPath(settings, 'global.turbulence'))),
    radiance: average(scale(paths.radiance, atPath(settings, paths.radiance)), scale('global.glow', atPath(settings, 'global.glow'))),
    menace: average(scale(paths.menace, atPath(settings, paths.menace)), scale(`${element}.lifetime`, atPath(settings, `${element}.lifetime`)))
  };
}

function bsonSchemaFor(template, basePath = '') {
  const properties = {};
  const required = [];
  for (const [engineName, value] of Object.entries(template)) {
    const name = publicKey(engineName);
    required.push(name);
    const path = basePath ? `${basePath}.${name}` : name;
    if (typeof value === 'number') {
      const range = RANGES[path];
      properties[name] = { bsonType: ['double', 'int', 'long', 'decimal'], ...(range ? { minimum: range.min, maximum: range.max } : {}) };
    }
    else if (typeof value === 'boolean') properties[name] = { bsonType: 'bool' };
    else if (typeof value === 'string') properties[name] = isHex(value) ? { bsonType: 'string', pattern: '^#[0-9a-fA-F]{6}$' } : { bsonType: 'string', maxLength: 80 };
    else if (isRecord(value)) properties[name] = bsonSchemaFor(value, path);
  }
  return { bsonType: 'object', required, additionalProperties: false, properties };
}

/** The Atlas validator mirrors the public snapshot tree and rejects forged keys. */
export function spellSettingsBsonSchema() {
  return {
    bsonType: 'object',
    required: SPELL_SETTING_BLOCKS,
    additionalProperties: false,
    properties: Object.fromEntries(SPELL_SETTING_BLOCKS.map((block) => [block, bsonSchemaFor(DEFAULT_SETTINGS[engineKey(block)], block)]))
  };
}

export function enginePath(path) {
  return path.replace(/^air\./, 'wind.');
}
