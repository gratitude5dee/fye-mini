import { settings } from '../config/settings.js';

/**
 * The Rite's content, generated rather than enumerated.
 *
 * A layout is a problem in space: waystones the line must reach and hazards it
 * must not clip. Six hand-drawn shapes would be a twenty-minute product, so a
 * layout is a seed instead — count, polar placement, hazard shape, and which
 * elements are offered — and the same few primitives become hundreds of
 * problems that feel authored.
 *
 * Everything here is deterministic. `Math.random` is never called, so the same
 * seed is the same Rite on every machine, which is what lets a daily seed work
 * with no server and no account.
 */

/** FNV-1a. Small, stable, and enough to spread adjacent date strings apart. */
function hashSeed(seed) {
  let h = 0x811c9dc5;
  const text = String(seed);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — deterministic, fast, and good enough to place stones. */
function rng(state) {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ELEMENTS = ['fire', 'water', 'earth', 'air'];
const TAU = Math.PI * 2;

/**
 * The difficulty curve, by problem rather than by clock.
 *
 * An earlier design escalated with a per-line timer, which collided with the
 * calm mode that removes time pressure and left those players at a content
 * ceiling. Escalating the shape is the axis this game is actually about.
 */
const CURVE = [
  { waystones: 2, hazards: 0, elements: 1, spread: 0.55, behind: false },
  { waystones: 3, hazards: 1, elements: 2, spread: 0.75, behind: false },
  { waystones: 3, hazards: 2, elements: 2, spread: 1.00, behind: true },
  { waystones: 4, hazards: 2, elements: 3, spread: 1.15, behind: true },
  { waystones: 4, hazards: 3, elements: 4, spread: 1.30, behind: true }
];

/** @returns {typeof CURVE[number]} the tier for a zero-based Rite index. */
export function tierFor(riteIndex) {
  return CURVE[Math.min(Math.max(0, riteIndex | 0), CURVE.length - 1)];
}

/**
 * Place a point that is not on top of anything already placed.
 *
 * Gives up rather than looping forever, because a crowded tier should produce
 * a tighter layout, not a hang.
 */
function placeClear(next, taken, radius, spread, allowBehind, spacing) {
  for (let attempt = 0; attempt < 64; attempt++) {
    // Biased to the front of the caster unless the tier says otherwise: a
    // waystone behind you is a real escalation and should not arrive by luck.
    //
    // The front arc is a fraction of 270°, not of 180°. At 180° the narrow
    // early tiers could not fit two stones at the spacing a hazard needs, and
    // layouts came out one stone short of what the tier asked for.
    const arc = allowBehind ? TAU : Math.PI * 1.5 * spread;
    const angle = allowBehind ? next() * arc : -Math.PI / 2 + (next() - 0.5) * arc;
    const distance = radius * (0.45 + next() * 0.55);
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const clear = taken.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 >= spacing * spacing);
    if (clear) return { x, z };
  }
  return null;
}

/**
 * Build one problem.
 *
 * @param {string} seed        anything stable — a date, a Rite id plus an index
 * @param {number} riteIndex   zero-based, selects the difficulty tier
 * @returns {{seed: string, waystones: Array<{x:number,z:number,radius:number}>,
 *            hazards: Array<{x:number,z:number,radius:number}>,
 *            elements: string[], tier: number}}
 */
export function generateLayout(seed, riteIndex = 0) {
  const cfg = settings.rite;
  const tier = tierFor(riteIndex);
  const next = rng(hashSeed(seed));

  const taken = [];
  const waystones = [];
  for (let i = 0; i < tier.waystones; i++) {
    const spot = placeClear(next, taken, cfg.fieldRadius, tier.spread, tier.behind, cfg.featureSpacing);
    if (!spot) break;
    taken.push(spot);
    waystones.push({ ...spot, radius: cfg.waystoneRadius });
  }

  const hazards = [];
  if (tier.hazards > 0 && waystones.length >= 2) {
    const radius = cfg.hazardRadius;
    // Widest pairs first. A hazard only changes the line when there is room
    // between the two stones for it to sit without swallowing either, so pairs
    // that cannot host one are skipped rather than squeezed.
    const maxRadius = radius * 1.15;
    const minSpan = (cfg.waystoneRadius + maxRadius) * 2;
    const pairs = [];
    for (let i = 0; i < waystones.length; i++) {
      for (let j = i + 1; j < waystones.length; j++) {
        const span = Math.hypot(waystones[i].x - waystones[j].x, waystones[i].z - waystones[j].z);
        if (span >= minSpan) pairs.push({ a: waystones[i], b: waystones[j], span });
      }
    }
    pairs.sort((p, q) => q.span - p.span);

    for (const { a, b, span } of pairs) {
      if (hazards.length >= tier.hazards) break;
      // Keep the centre far enough along the segment that both stones stay clear.
      const margin = (cfg.waystoneRadius + maxRadius) / span;
      const t = margin + next() * Math.max(0, 1 - margin * 2);
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      // Jitter first, then test. Testing the base radius and pushing a larger
      // one let a hazard end up overlapping a waystone it had just cleared.
      const actual = radius * (0.85 + next() * 0.3);
      const swallows = waystones.some((w) => (w.x - x) ** 2 + (w.z - z) ** 2 < (w.radius + actual) ** 2);
      const overlaps = hazards.some((h) => (h.x - x) ** 2 + (h.z - z) ** 2 < (h.radius + actual) ** 2);
      if (swallows || overlaps) continue;
      taken.push({ x, z });
      hazards.push({ x, z, radius: actual });
    }
  }

  // Offer elements in a stable rotation rather than a fresh shuffle, so a
  // player learns the deck instead of re-learning it every Rite.
  const offset = Math.floor(next() * ELEMENTS.length);
  const elements = Array.from({ length: tier.elements }, (_, i) => ELEMENTS[(offset + i) % ELEMENTS.length]);

  return { seed: String(seed), waystones, hazards, elements, tier: riteIndex };
}

/** The Rite everyone who opens the product today is given. No server, no account. */
export function dailySeed(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The layouts of one Rite, in order. */
export function generateRite(seed, lines = settings.rite.lines, startTier = 0) {
  return Array.from({ length: lines }, (_, i) => generateLayout(`${seed}:${i}`, startTier + i));
}
