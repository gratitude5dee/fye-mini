import { settings } from './settings.js';

/**
 * Borrow settings, and give them back without stepping on the player.
 *
 * Three things write to the live settings tree on their own schedule — the
 * opening, the quality ladder, and calm mode — while the editor, the presets
 * and the Workshop dials write to the same tree at the player's. A borrower
 * that simply restores the value it captured will silently revert a dial the
 * player moved while it held the key.
 *
 * A lease records what it wrote. On release it puts the original back only if
 * the live value is still the one the lease left there; if anything else has
 * since written to that key, the lease lets go without touching it. That is the
 * whole contract, and it is the difference between "handed the stage back" and
 * "overwrote two minutes of somebody's tuning".
 *
 * Leases do not stack. Two of them holding one key is a bug in the caller, not
 * a case to model: each borrower owns a disjoint set, documented at its site.
 */
export class SettingsLease {
  constructor() {
    /** `group.key` → the value this lease wrote. */
    this._wrote = new Map();
    /** `group.key` → the value that was there before this lease first wrote. */
    this._original = new Map();
  }

  /** @returns {boolean} whether this lease currently holds `group.key`. */
  holds(group, key) {
    return this._wrote.has(`${group}.${key}`);
  }

  /** The value that was there before this lease first took the key. */
  original(group, key) {
    const id = `${group}.${key}`;
    return this._original.has(id) ? this._original.get(id) : settings[group][key];
  }

  /** Take a key (if not already held) and write `value` to it. */
  write(group, key, value) {
    const id = `${group}.${key}`;
    if (!this._original.has(id)) this._original.set(id, settings[group][key]);
    settings[group][key] = value;
    this._wrote.set(id, value);
  }

  /** Give one key back, unless something else has written to it since. */
  release(group, key) {
    const id = `${group}.${key}`;
    if (!this._wrote.has(id)) return false;
    const undisturbed = settings[group][key] === this._wrote.get(id);
    if (undisturbed) settings[group][key] = this._original.get(id);
    this._wrote.delete(id);
    this._original.delete(id);
    return undisturbed;
  }

  /** Give everything back. */
  releaseAll() {
    for (const id of [...this._wrote.keys()]) {
      const [group, key] = id.split('.');
      this.release(group, key);
    }
  }
}
