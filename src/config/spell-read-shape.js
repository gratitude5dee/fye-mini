/**
 * Read-time compatibility for public spell documents.
 *
 * Writes are validated as schemaVersion 1 in Atlas. This adapter deliberately
 * does not write while reading: it makes a small, bounded v0 population
 * renderable during a rolling deployment, while refusing unknown future
 * versions rather than guessing at their meaning.
 */
import { deriveGenome, validateSpellSettings } from './spell-contract.js';

export const CURRENT_SPELL_SCHEMA_VERSION = 1;

const ELEMENTS = new Set(['fire', 'water', 'earth', 'air']);
const PALETTES = {
  fire: ['#ff6a3c', '#ffbf58', '#5b170f'],
  water: ['#3fb8c9', '#c8f3fb', '#164b70'],
  earth: ['#a08a63', '#d5b78c', '#35291e'],
  air: ['#bfe8df', '#f3fffd', '#41666a']
};

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const string = (value, maximum) => typeof value === 'string' && value.length <= maximum ? value : '';
const nonNegativeNumber = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

function safeLineage(value, id) {
  const lineage = isRecord(value) ? value : {};
  const depth = Number.isInteger(lineage.depth) && lineage.depth >= 0 && lineage.depth <= 64 ? lineage.depth : 0;
  return {
    parentId: lineage.parentId ?? null,
    rootId: lineage.rootId ?? id,
    depth
  };
}

function safePortrait(value, element) {
  const portrait = isRecord(value) ? value : {};
  const palette = Array.isArray(portrait.palette) && portrait.palette.length >= 3 && portrait.palette.length <= 4
    && portrait.palette.every((entry) => typeof entry === 'string' && /^#[0-9a-f]{6}$/i.test(entry))
    ? portrait.palette
    : PALETTES[element];
  return {
    imageUrl: typeof portrait.imageUrl === 'string' && portrait.imageUrl.length <= 512 ? portrait.imageUrl : null,
    palette
  };
}

function safeStats(value) {
  const stats = isRecord(value) ? value : {};
  return {
    casts: nonNegativeNumber(stats.casts),
    remixes: nonNegativeNumber(stats.remixes),
    bookmarks: nonNegativeNumber(stats.bookmarks),
    lastCastAt: stats.lastCastAt instanceof Date ? stats.lastCastAt : null
  };
}

function safeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => ({ text: string(entry.text, 420), at: entry.at instanceof Date ? entry.at : null }))
    .filter((entry) => entry.text && entry.at)
    .slice(-20);
}

function safeCreator(value) {
  const creator = isRecord(value) ? value : {};
  const handle = string(creator.handle, 56);
  return handle ? { ...creator, handle } : { handle: 'Unknown Binder' };
}

function safeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 24))].slice(0, 6);
}

function normalizeElement(value) {
  return value === 'wind' ? 'air' : value;
}

function migrateV0(document, element) {
  const rawSettings = isRecord(document.settings) ? document.settings : {};
  const { wind, ...withoutWind } = rawSettings;
  const settings = {
    ...withoutWind,
    ...(withoutWind.air ? {} : isRecord(wind) ? { air: wind } : {})
  };
  // Do not spread a legacy document here. The v0 collection was not covered
  // by the current `additionalProperties: false` validator, so an explicit
  // allow-list prevents an old private field from becoming public by accident.
  const checkedSettings = validateSpellSettings(settings);
  const normalizedSettings = checkedSettings.value;
  return {
    _id: document._id,
    schemaVersion: CURRENT_SPELL_SCHEMA_VERSION,
    slug: document.slug,
    name: document.name,
    element,
    incantation: document.incantation,
    incantationHistory: safeHistory(document.incantationHistory),
    lore: string(document.lore, 600),
    tags: safeTags(document.tags),
    settings: normalizedSettings,
    genome: deriveGenome(normalizedSettings, element),
    portrait: safePortrait(document.portrait, element),
    stats: safeStats(document.stats),
    lineage: safeLineage(document.lineage, document._id),
    creator: safeCreator(document.creator),
    createdAt: document.createdAt instanceof Date ? document.createdAt : null,
    updatedAt: document.updatedAt instanceof Date ? document.updatedAt : null
  };
}

/**
 * Returns a document that is safe to serialize to a public client, or a
 * stable reason the route can turn into a 409. It intentionally leaves valid
 * v1 documents structurally intact so their renderer settings remain exact.
 */
export function normalizeSpellForRead(document) {
  if (!isRecord(document)) return { ok: false, issue: 'The spell page is malformed.' };
  const rawVersion = document.schemaVersion;
  const version = rawVersion === undefined || rawVersion === null ? 0 : rawVersion;
  if (!Number.isInteger(version) || version < 0) return { ok: false, issue: 'The spell page has an invalid schema version.' };
  if (version > CURRENT_SPELL_SCHEMA_VERSION) return { ok: false, issue: 'This spell was written by a newer Grimoire.' };

  const element = normalizeElement(document.element);
  if (!ELEMENTS.has(element)) return { ok: false, issue: 'The spell page has an unknown element.' };
  if (!string(document.slug, 64) || !string(document.name, 56) || !string(document.incantation, 420)) {
    return { ok: false, issue: 'The spell page is missing its public seal.' };
  }

  if (version === CURRENT_SPELL_SCHEMA_VERSION) {
    return { ok: true, value: element === document.element ? document : { ...document, element } };
  }
  return { ok: true, value: migrateV0(document, element), migratedFrom: version };
}
