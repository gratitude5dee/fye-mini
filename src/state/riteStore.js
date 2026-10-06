import { read, write } from './preferences.js';

/**
 * The single owner of session state.
 *
 * Not React context: the frame loop reads the current layout at 60fps and must
 * not re-render anything to do it. Not scattered across modules either, since
 * the interface has to render the same values. So: a plain object with a
 * synchronous mutator set, a frozen snapshot for readers, and a subscription
 * shaped for `useSyncExternalStore`.
 *
 * `get()` returns the *same* object identity until something actually changes,
 * which is what `useSyncExternalStore` needs to avoid an infinite render loop.
 */

/** @typedef {'free'|'open'|'present'|'draw'|'resolve'|'close'} RitePhase */

const listeners = new Set();

let state = Object.freeze({
  /** @type {RitePhase} */
  phase: 'free',
  /** Seed of the Rite in progress, or null in free play. */
  seed: null,
  /** Index of the line being drawn, 0-based. */
  lineIndex: 0,
  /** How many lines this Rite asks for. */
  lineCount: 0,
  /** Attempts remaining on the current line. */
  attemptsLeft: 0,
  /** The Rite's per-line attempt allowance, reset into `attemptsLeft` per line. */
  attempts: 3,
  /** One entry per line: true once its waystone is lit. */
  ward: Object.freeze([]),
  /** The layout the current line must solve, or null. */
  layout: null,
  /** Whether progress is being kept. Mirrors `preferences.isPersistent()`. */
  persistent: true
});

function commit(patch) {
  const next = Object.freeze({ ...state, ...patch });
  // Identity is the contract with useSyncExternalStore. Only publish a new
  // object when a field actually moved.
  let changed = false;
  for (const key of Object.keys(patch)) {
    if (state[key] !== next[key]) { changed = true; break; }
  }
  if (!changed) return;
  state = next;
  for (const listener of listeners) listener();
}

/** @returns {Readonly<typeof state>} stable until something changes */
export function get() {
  return state;
}

/**
 * @param {() => void} listener called after every committed change
 * @returns {() => void} unsubscribe
 */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* ------------------------------------------------------------------ */
/* Intents — the only way state moves                                  */
/* ------------------------------------------------------------------ */

/** Open a Rite of `lineCount` lines under `seed`. */
export function beginRite(seed, lineCount, attempts = 3) {
  commit({
    phase: 'open',
    seed,
    lineIndex: 0,
    lineCount,
    attempts,
    attemptsLeft: attempts,
    ward: Object.freeze(new Array(lineCount).fill(false)),
    layout: null
  });
}

/**
 * Put a layout in front of the player.
 *
 * Attempts default to the Rite's own allowance rather than a literal, so a
 * caller cannot accidentally hand one line a different budget from the rest.
 */
export function presentLine(layout, attempts = state.attempts) {
  commit({ phase: 'present', layout, attemptsLeft: attempts });
}

/** The player has started drawing. */
export function beginDraw() {
  if (state.phase === 'present') commit({ phase: 'draw' });
}

/**
 * Record the outcome of one line.
 *
 * Solving lights the ward stone and advances. Failing spends an attempt and
 * leaves the same layout up; running out advances with the stone dark, because
 * a Rite always ends.
 *
 * @param {boolean} solved
 * @returns {'advance'|'retry'} what the caller should do next
 */
export function resolveLine(solved) {
  const ward = state.ward.slice();
  if (solved) ward[state.lineIndex] = true;
  const attemptsLeft = solved ? 0 : state.attemptsLeft - 1;
  const advance = solved || attemptsLeft <= 0;

  if (!advance) {
    commit({ phase: 'present', ward: Object.freeze(ward), attemptsLeft });
    return 'retry';
  }

  const lineIndex = state.lineIndex + 1;
  if (lineIndex >= state.lineCount) {
    const seed = state.seed;
    commit({ phase: 'close', ward: Object.freeze(ward), attemptsLeft: 0, layout: null });
    if (seed && ward.some(Boolean)) rememberSolved(seed);
    return 'advance';
  }
  // Refill from the Rite's allowance here rather than leaving it to the next
  // `presentLine`, so the store is correct no matter what order a caller uses.
  commit({
    phase: 'resolve',
    ward: Object.freeze(ward),
    lineIndex,
    attemptsLeft: state.attempts,
    layout: null
  });
  return 'advance';
}

/** Leave the Rite. Free play is always one key away. */
export function setFree() {
  commit({
    phase: 'free', seed: null, lineIndex: 0, lineCount: 0,
    attempts: 3, attemptsLeft: 0, ward: Object.freeze([]), layout: null
  });
}

/** Note whether the browser is keeping anything. */
export function setPersistent(persistent) {
  commit({ persistent });
}

/** True once every line in the Rite lit its stone. */
export function isWardWhole() {
  return state.ward.length > 0 && state.ward.every(Boolean);
}

function rememberSolved(seed) {
  const prefs = read();
  if (prefs.rite.solved.includes(seed)) return;
  write({ rite: { ...prefs.rite, solved: [...prefs.rite.solved, seed].slice(-512) } });
}

/** Test seam. Never called by the product. */
export function __resetForTests() {
  listeners.clear();
  setFree();
}
