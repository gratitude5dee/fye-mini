import { DEFAULT_SETTINGS, settings } from './settings.js';

export const SPELL_ELEMENTS = ['fire', 'water', 'earth', 'air'];
// These are the renderer blocks that make a spell portable.  They deliberately
// exclude input, camera, environment, character, and walk settings: another
// person's spell should change the magic, not take over the visitor's device.
export const SPELL_SETTING_BLOCKS = ['global', 'trail', 'fire', 'water', 'earth', 'air', 'post'];

const PUBLIC_TO_ENGINE = { air: 'wind' };
const ENGINE_TO_PUBLIC = { wind: 'air' };
const NUMBER_HINTS = /(?:count|amount|rate|particles|ribbons|filament|jets|rocks|leaves|bands|samples|maxpoints)/i;
const LARGE_HINTS = /(?:height|length|radius|distance|width|size|speed|lifetime|intensity|duration|frequency|strength|spread|spacing|elevation|azimuth|fov)/i;

// These are the exact source ranges for the compact Spellwright/dial surface.
// The expert panel has many more controls; other snapshot leaves use the safe
// generic guard below until they are promoted into this public contract.
const EXACT_RANGES = {
  'global.speed': [0.1, 4, 0.01], 'global.glow': [0, 5, 0.01], 'global.turbulence': [0, 4, 0.01], 'global.particleCount': [0, 3, 0.01], 'global.particleSize': [0.1, 3, 0.01],
  'trail.width': [0.05, 3, 0.01], 'trail.glow': [0, 10, 0.01], 'trail.flowSpeed': [0, 6, 0.01],
  'fire.speed': [0.5, 40, 0.1], 'fire.flameWidth': [0.05, 3, 0.01], 'fire.flameHeight': [1, 6, 0.01], 'fire.flameTurbulence': [0, 6, 0.01], 'fire.glow': [0, 10, 0.01], 'fire.streamLength': [0.5, 20, 0.1], 'fire.emberRate': [0, 400, 1], 'fire.explosionSize': [0.2, 10, 0.05],
  'water.speed': [0.5, 40, 0.1], 'water.radius': [0.05, 3, 0.01], 'water.crest': [1, 4, 0.01], 'water.waveAmplitude': [0, 1.5, 0.01], 'water.flowSpeed': [0, 6, 0.01], 'water.foam': [0, 5, 0.01], 'water.glow': [0, 6, 0.01], 'water.splashSize': [0.2, 12, 0.05], 'water.chop': [0, 3, 0.01], 'water.splashIntensity': [0, 5, 0.01],
  'earth.speed': [0.5, 40, 0.1], 'earth.crustWidth': [0.5, 10, 0.05], 'earth.plateSize': [0.2, 3, 0.01], 'earth.rockSize': [0.1, 3, 0.01], 'earth.riseHeight': [0.1, 4, 0.01], 'earth.glow': [0, 4, 0.01], 'earth.towerHeight': [0.5, 20, 0.05], 'earth.towerWidth': [0.1, 5, 0.01], 'earth.rockRandomness': [0, 2, 0.01],
  'air.speed': [0.5, 40, 0.1], 'air.ribbonWidth': [0.05, 6, 0.01], 'air.ribbonLength': [1, 24, 0.1], 'air.spiralRadius': [0.05, 4, 0.01], 'air.vortexStrength': [0, 5, 0.01], 'air.turbulence': [0, 3, 0.01], 'air.glow': [0, 5, 0.01], 'air.tornadoHeight': [1, 20, 0.1]
};

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const publicKey = (key) => ENGINE_TO_PUBLIC[key] ?? key;
const engineKey = (key) => PUBLIC_TO_ENGINE[key] ?? key;

function rangeFor(path, value) {
  if (EXACT_RANGES[path]) {
    const [min, max, step] = EXACT_RANGES[path];
    return { min, max, step };
  }
  if (path.startsWith('global.')) return { min: 0, max: 4, step: 0.01 };
  if (NUMBER_HINTS.test(path)) return { min: 0, max: 5000, step: 1 };
  if (value >= 0 && value <= 1) return { min: 0, max: 1, step: 0.01 };
  if (LARGE_HINTS.test(path)) return { min: 0, max: Math.max(12, Math.ceil(value * 4)), step: 0.01 };
  return { min: Math.min(0, Math.floor(value * 4)), max: Math.max(10, Math.ceil(value * 4)), step: 0.01 };
}

function collectRanges(value, path = '', output = {}) {
  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? `${path}.${publicKey(key)}` : publicKey(key);
    if (typeof child === 'number') output[nextPath] = rangeFor(nextPath, child);
    else if (isRecord(child)) collectRanges(child, nextPath, output);
  }
  return output;
}

/**
 * The renderer defaults determine every legal leaf. RANGES is generated once
 * from that source of truth, then used by the client bridge, API routes, and
 * bootstrap tooling to clamp numbers consistently.
 */
export const RANGES = Object.freeze(collectRanges(Object.fromEntries(
  SPELL_SETTING_BLOCKS.map((block) => [engineKey(block), DEFAULT_SETTINGS[engineKey(block)]])
)));

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
        output[name] = Math.min(range.max, Math.max(range.min, candidate));
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
  'fire.speed', 'fire.flameWidth', 'fire.flameHeight', 'fire.flameTurbulence', 'fire.glow', 'fire.streamLength', 'fire.emberRate', 'fire.explosionSize',
  'water.speed', 'water.radius', 'water.crest', 'water.waveAmplitude', 'water.flowSpeed', 'water.foam', 'water.glow', 'water.splashSize',
  'earth.speed', 'earth.crustWidth', 'earth.plateSize', 'earth.rockSize', 'earth.riseHeight', 'earth.glow', 'earth.towerHeight', 'earth.towerWidth',
  'air.speed', 'air.ribbonWidth', 'air.ribbonLength', 'air.spiralRadius', 'air.vortexStrength', 'air.turbulence', 'air.glow', 'air.tornadoHeight'
];

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
