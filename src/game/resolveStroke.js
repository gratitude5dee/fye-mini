import { settings } from '../config/settings.js';

/**
 * Decide whether a drawn line solved the problem in front of it.
 *
 * Deliberately **not** a shape comparison. The player's line is never graded
 * against a reference, because a graded copy turns every failure into "your
 * handwriting is bad" and nobody replays a copy. It is asked one question:
 * did it do the job. Four players solve the same layout four different ways,
 * and every one of them is right.
 *
 * That also makes it cheap. There is no resampling of two curves, no
 * bidirectional comparison, and no tolerance in metres that the player could
 * game by scrolling the camera: waystone rings are drawn on the ground at the
 * size they are tested at, so what you see is what is measured.
 *
 * Runs once, at release, on the polyline `PathDrawer` already built.
 */

const _closest = { x: 0, z: 0 };

/**
 * Nearest point on segment AB to P, in the ground plane.
 *
 * Height is ignored here on purpose: reaching a waystone is a question about
 * where the line went, and clearing a hazard is a separate question about how
 * high it was. Mixing them would make a high pass over a stone stop counting.
 */
function closestOnSegment(ax, az, bx, bz, px, pz, out) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-9) {
    out.x = ax; out.z = az;
    return;
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.x = ax + dx * t;
  out.z = az + dz * t;
}

/**
 * @typedef {object} StrokeOutcome
 * @property {boolean[]} reached  one entry per waystone, in layout order
 * @property {number} clipped     index of the first hazard clipped, or -1
 * @property {boolean} solved     every waystone reached and no hazard clipped
 */

/**
 * @param {Array<{x:number,y?:number,z:number}>} points the drawn polyline
 * @param {number} count how many entries of `points` are live — the buffer is
 *   preallocated and recycled, so its length is not its content
 * @param {{waystones: Array<{x:number,z:number,radius:number}>,
 *          hazards: Array<{x:number,z:number,radius:number}>}} layout
 * @param {(u: number) => number} [liftAt] height of the cast above the drawn
 *   line at normalised progress `u`. Defaults to flat. This is where an
 *   element's own `pathHeight` goes — fire flies, so fire clears hazards that
 *   earth cannot — and later where the hand's lift is added on top.
 * @param {number} [forgiveness] multiplies every waystone radius. Onboarding
 *   widens it silently on a retry; the player is never told they were helped.
 * @returns {StrokeOutcome}
 */
export function resolveStroke(points, count, layout, liftAt = () => 0, forgiveness = 1) {
  const waystones = layout?.waystones ?? [];
  const hazards = layout?.hazards ?? [];
  const reached = new Array(waystones.length).fill(false);
  let clipped = -1;

  if (count < 2) return { reached, clipped, solved: false };

  const clearance = settings.rite.hazardClearance;
  const span = count - 1;

  for (let i = 0; i < span; i++) {
    const a = points[i];
    const b = points[i + 1];

    for (let w = 0; w < waystones.length; w++) {
      if (reached[w]) continue;
      const stone = waystones[w];
      closestOnSegment(a.x, a.z, b.x, b.z, stone.x, stone.z, _closest);
      const dx = stone.x - _closest.x;
      const dz = stone.z - _closest.z;
      const radius = stone.radius * forgiveness;
      if (dx * dx + dz * dz <= radius * radius) reached[w] = true;
    }

    if (clipped !== -1) continue;
    // A hazard is only clipped if the cast was actually low over it. The lift
    // is sampled at this segment's own progress, so a line that rises for the
    // crossing and comes back down clears it exactly where it rose.
    const lift = liftAt(i / span);
    if (lift >= clearance) continue;
    for (let h = 0; h < hazards.length; h++) {
      const hazard = hazards[h];
      closestOnSegment(a.x, a.z, b.x, b.z, hazard.x, hazard.z, _closest);
      const dx = hazard.x - _closest.x;
      const dz = hazard.z - _closest.z;
      if (dx * dx + dz * dz <= hazard.radius * hazard.radius) {
        clipped = h;
        break;
      }
    }
  }

  return { reached, clipped, solved: clipped === -1 && reached.every(Boolean) };
}

/** How much of the problem the line got, 0..1. Drives the caster's commitment. */
export function outcomeStrength(outcome) {
  if (!outcome?.reached?.length) return 0;
  const hit = outcome.reached.filter(Boolean).length / outcome.reached.length;
  return outcome.clipped === -1 ? hit : hit * 0.4;
}
