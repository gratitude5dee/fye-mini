import { type Document } from 'mongodb';
import { normalizeSpellForRead } from '../../../src/config/spell-read-shape.js';

export function slugify(value: string) {
  const stem = value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 52);
  return stem || 'untitled-spell';
}

export function spellForClient(document: Document) {
  const value = document as Document & Record<string, any>;
  const { _id, creator, lineage, stats, portrait, genome } = value;
  const count = (value: unknown) => {
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object' && 'toString' in value) return Number(String(value));
    return Number(value ?? 0);
  };
  // Keep this a positive allow-list. Search metadata, embeddings, internal
  // creator IDs, history, and future private fields must never cross the API
  // boundary simply because a legacy document contains them.
  return {
    _id: _id?.toString(),
    slug: value.slug,
    name: value.name,
    element: value.element,
    incantation: value.incantation,
    lore: value.lore,
    tags: value.tags,
    settings: value.settings,
    genome: genome ? { pace: genome.pace, mass: genome.mass, chaos: genome.chaos, radiance: genome.radiance, menace: genome.menace } : undefined,
    portrait: portrait ? { imageUrl: portrait.imageUrl ?? null, palette: portrait.palette } : undefined,
    lineage: lineage ? { parentId: lineage.parentId?.toString?.() ?? lineage.parentId ?? null, rootId: lineage.rootId?.toString?.() ?? lineage.rootId, depth: lineage.depth } : undefined,
    stats: stats ? { casts: count(stats.casts), remixes: count(stats.remixes), bookmarks: count(stats.bookmarks), lastCastAt: stats.lastCastAt ?? null } : undefined,
    creator: creator?.handle ? { handle: creator.handle } : undefined
  };
}

/**
 * Normalize a legacy spell before serializing it, then apply the public
 * allow-list above. A route can skip malformed/future documents instead of
 * leaking fields or sending an incompatible renderer snapshot to a browser.
 */
export function readableSpellForClient(document: Document) {
  const normalized = normalizeSpellForRead(document as Record<string, unknown>);
  return normalized.ok ? spellForClient(normalized.value as Document) : null;
}

export function spellSearchText(spell: { name: string; incantation: string; lore: string; tags: string[] }) {
  return [spell.name, spell.incantation, spell.lore, ...spell.tags].join('\n');
}

export function paletteFor(element: string) {
  return {
    fire: ['#ff6a3c', '#ffbf58', '#5b170f'],
    water: ['#3fb8c9', '#c8f3fb', '#164b70'],
    earth: ['#a08a63', '#d5b78c', '#35291e'],
    air: ['#bfe8df', '#f3fffd', '#41666a']
  }[element] ?? ['#efe7d8', '#bcb0a0', '#1d1a16'];
}
