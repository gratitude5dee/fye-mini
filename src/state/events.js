/**
 * The complete vocabulary spoken across the React/engine seam.
 *
 * `app/` is TypeScript and `src/` is JavaScript, and until this module existed
 * both sides spelled these strings out by hand. A typo was a silent no-op:
 * the listener simply never fired. Importing the constant makes it a build
 * error on the TypeScript side and a resolvable symbol on the JavaScript side.
 *
 * The transport stays `window.dispatchEvent(new CustomEvent(...))`. It already
 * works, it already survives the RSC boundary, and replacing it with a bus at
 * this event count would be churn. The hazard was never the transport; it was
 * the loose strings.
 *
 * Payload types live beside this file in `events.d.ts`.
 */

/** React → engine. */
export const TO_ENGINE = Object.freeze({
  /** Choose an element. Public naming: `air`, never `wind`. */
  SELECT: 'grimoire:select',
  /** Patch renderer settings. Clamped by `App._applyFlatPatch` against RANGES. */
  PATCH: 'grimoire:patch',
  /** Ask for camera permission and start hand tracking. */
  ATTUNE: 'grimoire:attune',
  /** Tear hand tracking down and return to pointer input. */
  STOP_HANDS: 'grimoire:stop-hands',
  /** Cast along a built-in demonstration curve. */
  CAST: 'grimoire:cast',
  /** Arm the air-scooter ride for the next stroke. */
  RIDE: 'grimoire:ride',
  /** Begin a Rite, or set one aside. */
  RITE: 'grimoire:rite'
});

/** Engine → React. */
export const TO_UI = Object.freeze({
  /** The stage is playable. Dispatched by `App.load()` before the loader hides. */
  READY: 'grimoire:ready',
  /** Hand-input health, with a `state` the interface styles itself from. */
  INPUT_STATUS: 'grimoire:input-status',
  /** Whether the next stroke will be ridden rather than cast. */
  RIDE_STATUS: 'grimoire:ride-status',
  /** A cast left the caster's hand. */
  CAST_COMPLETE: 'grimoire:cast-complete',
  /** The engine's element changed, whatever asked for it. */
  SELECTED: 'grimoire:selected',
  /** A cast reached the end of its path. Carries the ability's own state. */
  IMPACT: 'grimoire:impact',
  /** Session state changed: the Rite opened, a line resolved, the Ward moved. */
  RITE_STATE: 'grimoire:rite-state'
});

/** Every name, for tests and for the debug overlay. */
export const EVENTS = Object.freeze({ ...TO_ENGINE, ...TO_UI });

/**
 * Dispatch a `CustomEvent` on `window`.
 *
 * @param {string} name one of the constants above
 * @param {unknown} [detail]
 */
export function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Subscribe to one of the events above.
 *
 * @param {string} name one of the constants above
 * @param {(detail: any) => void} handler receives `event.detail`, not the event
 * @returns {() => void} unsubscribe
 */
export function on(name, handler) {
  const listener = (event) => handler(event.detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
