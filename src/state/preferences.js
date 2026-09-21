/**
 * The only module that touches `localStorage`.
 *
 * Everything the product remembers lives here: which element was last held,
 * which dials were moved, how far onboarding got, and which layouts have been
 * solved. Nothing here ever leaves the browser, and the product says so.
 *
 * Storage is treated as genuinely optional rather than probably-present. A
 * private window, blocked site data, or a full quota must leave casting
 * completely unaffected — so every read returns defaults on failure and every
 * write reports whether it landed, so the interface can tell the player once
 * that progress is not being kept.
 */

const KEY = 'living-grimoire.local-preferences.v3';
const LEGACY_KEY = 'living-grimoire.local-preferences.v2';

const ELEMENTS = ['fire', 'water', 'earth', 'air'];

/** The shape every read resolves to. Frozen so a caller cannot mutate the default. */
const DEFAULTS = Object.freeze({
  version: 3,
  /** The opening has been seen at least once. */
  introSeen: false,
  /** Public element id — `air`, never the engine's `wind`. */
  element: 'air',
  /** Flat `block.key` → number, already clamped by the engine on apply. */
  dials: {},
  /**
   * Calm mode: no shake, no flash, no auto-framing, the glow well down.
   *
   * Independent of `prefers-reduced-motion` on purpose. That is the operating
   * system's statement about animation; this is the player's about this stage.
   */
  calm: false,
  onboarding: Object.freeze({
    firstSolve: false,
    firstElementChange: false,
    handsOffered: false,
    handsGranted: false,
    handsDeclined: false
  }),
  rite: Object.freeze({
    /** Layout seeds the player has solved. */
    solved: [],
    /** Seed → best line, as a flat [x,z,...] array. */
    best: {}
  })
});

let available = null;
let warned = false;

/** Probe once. A throwing accessor is as unavailable as a missing one. */
function storage() {
  if (available !== null) return available;
  try {
    const probe = '__grimoire_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    available = window.localStorage;
  } catch {
    available = false;
  }
  return available;
}

/** True when nothing the player does will be remembered. */
export function isPersistent() {
  return Boolean(storage());
}

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value, fallback) => (typeof value === typeof fallback ? value : fallback);

/**
 * Coerce an arbitrary parsed blob into the v3 shape.
 *
 * Deliberately total: anything unrecognised is replaced rather than rejected,
 * because a corrupt or foreign value must not be able to stop the stage from
 * opening.
 */
function normalise(raw) {
  if (!isRecord(raw)) return structuredClone(DEFAULTS);
  const onboarding = isRecord(raw.onboarding) ? raw.onboarding : {};
  const rite = isRecord(raw.rite) ? raw.rite : {};
  return {
    version: 3,
    introSeen: clean(raw.introSeen, DEFAULTS.introSeen),
    element: ELEMENTS.includes(raw.element) ? raw.element : DEFAULTS.element,
    // Absent from every blob written before calm mode existed, which `clean`
    // resolves to `false` — so no version bump and no migration.
    calm: clean(raw.calm, DEFAULTS.calm),
    dials: isRecord(raw.dials)
      ? Object.fromEntries(Object.entries(raw.dials).filter(([, v]) => Number.isFinite(v)))
      : {},
    onboarding: {
      firstSolve: clean(onboarding.firstSolve, false),
      firstElementChange: clean(onboarding.firstElementChange, false),
      handsOffered: clean(onboarding.handsOffered, false),
      handsGranted: clean(onboarding.handsGranted, false),
      handsDeclined: clean(onboarding.handsDeclined, false)
    },
    rite: {
      solved: Array.isArray(rite.solved) ? rite.solved.filter((s) => typeof s === 'string').slice(0, 512) : [],
      best: isRecord(rite.best) ? rite.best : {}
    }
  };
}

/**
 * Bring a v2 blob forward.
 *
 * v2 held exactly `introSeen`, `element` and `dials`, and every one of them
 * survives with its meaning intact — so the migration is a widening, and a
 * returning visitor keeps their stage exactly as they left it.
 */
function migrate(store) {
  try {
    const legacy = store.getItem(LEGACY_KEY);
    if (!legacy) return null;
    const parsed = normalise(JSON.parse(legacy));
    store.setItem(KEY, JSON.stringify(parsed));
    store.removeItem(LEGACY_KEY);
    return parsed;
  } catch {
    return null;
  }
}

/** @returns {typeof DEFAULTS} a fresh, mutable copy — never the frozen default. */
export function read() {
  const store = storage();
  if (!store) return structuredClone(DEFAULTS);
  try {
    const raw = store.getItem(KEY);
    if (raw) return normalise(JSON.parse(raw));
    return migrate(store) ?? structuredClone(DEFAULTS);
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/**
 * Merge `patch` over the stored value.
 *
 * @param {Record<string, unknown>} patch shallow at the top level; `onboarding`
 *   and `rite` are merged one level deeper so a caller can set a single flag.
 * @returns {boolean} whether the write landed
 */
export function write(patch) {
  const store = storage();
  if (!store) return false;
  const current = read();
  const next = {
    ...current,
    ...patch,
    onboarding: { ...current.onboarding, ...(patch.onboarding ?? {}) },
    rite: { ...current.rite, ...(patch.rite ?? {}) }
  };
  try {
    store.setItem(KEY, JSON.stringify(next));
    return true;
  } catch (error) {
    // A quota failure is worth saying once, and only once. It must never throw
    // into a cast.
    if (!warned) {
      warned = true;
      console.warn('[preferences] progress is not being saved in this browser', error);
    }
    return false;
  }
}

/** Forget everything, so the player can replay the attunement. */
export function reset() {
  const store = storage();
  if (!store) return false;
  try {
    store.removeItem(KEY);
    store.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

export { DEFAULTS, KEY, LEGACY_KEY };
