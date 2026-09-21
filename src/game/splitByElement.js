import { settings } from '../config/settings.js';

/**
 * Split a stroke at its element changes.
 *
 * The element is a per-sample channel, not a property of the cast, so one drawn
 * line can be fire to the gate and earth over the rubble. The off hand holds a
 * pose while the drawing hand keeps tracing; the keyboard reaches the same
 * thing by holding a digit mid-drag. Hands are not uniquely capable here — they
 * are uninterrupted.
 *
 * Runs shorter than `minPathLength` are **folded into a neighbour, never
 * dropped**. A hand flickering between two poses for four frames must not
 * silently lose a third of the line, and a player who sees their stroke drawn
 * has already been promised that all of it will fly.
 *
 * Pure, and indexes rather than slices: the caller's buffers are recycled and
 * this must not hold a reference to them past its own return.
 *
 * @param {Uint8Array|number[]} channel per-sample element id, parallel to the polyline
 * @param {number} count live entries
 * @param {(index: number) => number} lengthAt cumulative arc length at a sample
 * @returns {Array<{ element: number, from: number, to: number, length: number }>}
 *   half-open runs `[from, to)`, in order, covering every sample exactly once
 */
export function splitByElement(channel, count, lengthAt) {
  if (count <= 0) return [];
  const total = lengthAt(count - 1) - lengthAt(0);
  // One run is the overwhelmingly common case — every pointer stroke, and every
  // hand stroke where the off hand held still. Answer it without allocating a
  // working list first.
  let changes = 0;
  for (let i = 1; i < count; i++) if (channel[i] !== channel[i - 1]) changes++;
  if (changes === 0) return [{ element: channel[0], from: 0, to: count, length: total }];

  const runs = [];
  let start = 0;
  for (let i = 1; i <= count; i++) {
    if (i < count && channel[i] === channel[start]) continue;
    runs.push({ element: channel[start], from: start, to: i, length: lengthAt(i - 1) - lengthAt(start) });
    start = i;
  }

  return foldShortRuns(runs, count, lengthAt);
}

/**
 * Fold runs under `minPathLength` into a neighbour.
 *
 * Shortest first, so a flicker between two poses collapses into whichever side
 * the player actually committed to rather than into whichever came first. The
 * neighbour chosen is the longer of the two, because that is the one the player
 * was more plainly asking for; at an end of the stroke there is only one
 * neighbour and no choice to make.
 *
 * Terminates because every fold removes exactly one run, and the single
 * remaining run is returned whatever its length — a stroke shorter than
 * `minPathLength` in total is the cast router's business, not this function's.
 */
function foldShortRuns(runs, count, lengthAt) {
  const floor = settings.input.minPathLength;
  coalesce(runs, lengthAt);
  while (runs.length > 1) {
    let worst = -1;
    for (let i = 0; i < runs.length; i++) {
      if (runs[i].length >= floor) continue;
      if (worst === -1 || runs[i].length < runs[worst].length) worst = i;
    }
    if (worst === -1) break;

    const before = runs[worst - 1];
    const after = runs[worst + 1];
    const into = !before ? worst + 1
      : !after ? worst - 1
      : (before.length >= after.length ? worst - 1 : worst + 1);

    runs[into].from = Math.min(runs[into].from, runs[worst].from);
    runs[into].to = Math.max(runs[into].to, runs[worst].to);
    runs[into].length = lengthAt(runs[into].to - 1) - lengthAt(runs[into].from);
    runs.splice(worst, 1);
    // A fold can leave two neighbours holding the same element — earth, the
    // flicker that just became earth, earth — and three runs of one element is
    // three casts of one element, which is not what the player drew.
    coalesce(runs, lengthAt);
  }
  // Half-open and contiguous: the last run always reaches the end, whatever the
  // folding did to the boundaries.
  runs[runs.length - 1].to = count;
  return runs;
}

/** Merge neighbouring runs that hold the same element, in place. */
function coalesce(runs, lengthAt) {
  for (let i = runs.length - 1; i > 0; i--) {
    if (runs[i].element !== runs[i - 1].element) continue;
    runs[i - 1].to = runs[i].to;
    runs[i - 1].length = lengthAt(runs[i - 1].to - 1) - lengthAt(runs[i - 1].from);
    runs.splice(i, 1);
  }
}
