import { settings } from './settings.js';
import { EXACT_SPELL_RANGES } from './spell-ranges.js';

/**
 * What the renderer will let an outside value change, and by how much.
 *
 * This file used to also carry a validator, a BSON schema and a snapshot
 * builder for an API that no longer exists — commit 93a438e deleted the routes
 * and the database, and the seven exports that served them had no callers left.
 * They are gone; what remains is what `Editor` and `App._applyFlatPatch`
 * actually use, plus `deriveGenome`, which the Workshop surfaces.
 */

const PUBLIC_TO_ENGINE = { air: 'wind' };

/**
 * The exact bounds every patch is clamped to.
 *
 * Keyed by **public** paths, so the wind block appears as `air.*`. `enginePath`
 * bridges the two spellings on the way in.
 */
export const RANGES = EXACT_SPELL_RANGES;

/**
 * The colour surface a patch may write.
 *
 * Kept tiny on purpose: a natural-language request like "make it violet" has to
 * survive the same strict contract as a numerical dial.
 */
export const SPELLWRIGHT_COLOR_PATHS = ['fire.colorCore', 'fire.colorMid', 'fire.colorEdge'];

/** Translate a public settings path into the engine's own spelling. */
export function enginePath(path) {
  return path.replace(/^air\./, 'wind.');
}

const GENOME_PATHS = {
  fire: { mass: 'fire.flameWidth', chaos: 'fire.flameTurbulence', radiance: 'fire.glow', menace: 'fire.explosionSize' },
  water: { mass: 'water.radius', chaos: 'water.chop', radiance: 'water.glow', menace: 'water.splashIntensity' },
  earth: { mass: 'earth.crustWidth', chaos: 'earth.rockRandomness', radiance: 'earth.glow', menace: 'earth.towerHeight' },
  air: { mass: 'air.ribbonWidth', chaos: 'air.turbulence', radiance: 'air.glow', menace: 'air.vortexStrength' }
};

function walk(value, path) {
  return path.split('.').reduce((cursor, key) => (cursor && typeof cursor === 'object' ? cursor[key] : undefined), value);
}

/**
 * Read a public path out of a tree that may be spelled either way.
 *
 * `GENOME_PATHS` is written in public spelling, but the live `settings` object
 * calls the air block `wind`. Reading only the public path returned `undefined`
 * for every air dial, so the air genome silently came back as five 0.5s.
 */
function atPath(value, path) {
  const direct = walk(value, path);
  return direct === undefined ? walk(value, enginePath(path)) : direct;
}

/**
 * Reduce a settings block to five readable axes.
 *
 * Each axis is the normalised position of one or two dials inside their own
 * declared range, so the readout means the same thing for every element even
 * though the underlying dials do not share units.
 *
 * @param {object} source a settings tree, public or engine spelling
 * @param {string} element public element id
 * @returns {{pace:number, mass:number, chaos:number, radiance:number, menace:number}} each 0..1
 */
export function deriveGenome(source, element) {
  const paths = GENOME_PATHS[element] ?? GENOME_PATHS.fire;
  const scale = (path, value) => {
    const range = RANGES[path];
    const number = Number(value);
    return range && Number.isFinite(number) ? Math.max(0, Math.min(1, (number - range.min) / (range.max - range.min))) : 0.5;
  };
  const average = (...values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    pace: average(scale(`${element}.speed`, atPath(source, `${element}.speed`)), scale('global.speed', atPath(source, 'global.speed'))),
    mass: average(scale(paths.mass, atPath(source, paths.mass)), scale('global.particleSize', atPath(source, 'global.particleSize'))),
    chaos: average(scale(paths.chaos, atPath(source, paths.chaos)), scale('global.turbulence', atPath(source, 'global.turbulence'))),
    radiance: average(scale(paths.radiance, atPath(source, paths.radiance)), scale('global.glow', atPath(source, 'global.glow'))),
    menace: average(scale(paths.menace, atPath(source, paths.menace)), scale(`${element}.lifetime`, atPath(source, `${element}.lifetime`)))
  };
}

export { settings, PUBLIC_TO_ENGINE };
