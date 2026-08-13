import { DEFAULT_SETTINGS, settings } from './settings.js';

export const SPELL_ELEMENTS = ['fire', 'water', 'earth', 'air'];
export const SPELL_SETTING_BLOCKS = ['global', 'trail', 'fire', 'water', 'earth', 'air'];

const PUBLIC_TO_ENGINE = { air: 'wind' };
const ENGINE_TO_PUBLIC = { wind: 'air' };
const NUMBER_HINTS = /(?:count|amount|rate|particles|ribbons|filament|jets|rocks|leaves|bands|samples|maxpoints)/i;
const LARGE_HINTS = /(?:height|length|radius|distance|width|size|speed|lifetime|intensity|duration|frequency|strength|spread|spacing|elevation|azimuth|fov)/i;

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const publicKey = (key) => ENGINE_TO_PUBLIC[key] ?? key;
const engineKey = (key) => PUBLIC_TO_ENGINE[key] ?? key;

function rangeFor(path, value) {
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
  'trail.width', 'trail.glow', 'fire.speed', 'fire.flameWidth', 'fire.turbulence',
  'water.speed', 'water.waveHeight', 'water.splashSize', 'earth.speed', 'earth.rockSize',
  'earth.towerHeight', 'air.speed', 'air.ribbonWidth', 'air.turbulence'
];

/** Strictly whitelisted patch, also clamped to the same RANGES manifest. */
export function validateSpellwrightPatch(candidate) {
  const patch = {};
  if (!isRecord(candidate)) return { ok: false, issues: ['patch must be an object'], value: patch };
  const issues = [];
  for (const [path, rawValue] of Object.entries(candidate)) {
    if (!SPELLWRIGHT_PATHS.includes(path)) {
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

export function deriveGenome(settings, element) {
  const local = settings[element] ?? {};
  const scale = (path, value) => {
    const range = RANGES[path];
    return range ? Math.max(0, Math.min(1, (Number(value) - range.min) / (range.max - range.min))) : 0.5;
  };
  const average = (...values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    pace: average(scale(`${element}.speed`, local.speed), scale('global.speed', settings.global.speed)),
    mass: average(scale(`${element}.width`, local.flameWidth ?? local.waveWidth ?? local.crustWidth ?? local.ribbonWidth), scale('global.particleSize', settings.global.particleSize)),
    chaos: average(scale(`${element}.turbulence`, local.turbulence), scale('global.turbulence', settings.global.turbulence)),
    radiance: average(scale(`${element}.glow`, local.glow ?? settings.global.glow), scale('global.glow', settings.global.glow)),
    menace: average(scale(`${element}.lifetime`, local.lifetime), scale(`${element}.speed`, local.speed))
  };
}

export function enginePath(path) {
  return path.replace(/^air\./, 'wind.');
}
