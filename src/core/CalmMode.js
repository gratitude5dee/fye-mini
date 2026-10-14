import { SettingsLease } from '../config/settingsLease.js';

/**
 * One switch that turns the product down without turning it off.
 *
 * Deliberately **not** the same thing as `prefers-reduced-motion`, and
 * independently togglable. Reduced motion is an operating-system statement
 * about animation; this is a statement about *this stage* — that the shake, the
 * flash and the drifting camera are more than the player wants right now, while
 * the casting itself is exactly what they came for. A player with no motion
 * preference set may want this, and a player with one set may not.
 *
 * Everything it changes is a value the stage already reads every frame, so it
 * takes effect immediately and mid-cast, and it gives every key back when it is
 * switched off — unless the player has since moved that dial themselves, which
 * the lease checks.
 */
export class CalmMode {
  constructor() {
    this.enabled = false;
    // Disjoint from the quality ladder's keys and the opening's, by
    // construction. See `_apply` for the one place that took care.
    this._lease = new SettingsLease();
  }

  set(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) this._apply();
    else this._lease.releaseAll();
  }

  _apply() {
    const lease = this._lease;
    // No shake, no flash, no drift toward whatever is casting.
    lease.write('global', 'cameraShake', 0);
    lease.write('post', 'flashStrength', 0);
    lease.write('camera', 'autoFrame', 0);
    // Bloom down rather than off: the stage stays legible as a lit place and
    // the emissive-only Ward stones still read as lit.
    //
    // Through `global.glow`, which is the emissive multiplier *fed into* bloom,
    // rather than through `post.bloomStrength` — the quality ladder takes that
    // one at its conservative tier, and two leases holding one key do not
    // compose: whichever released second would put back a value the other had
    // chosen. Turning down what reaches the bloom pass gets the same picture
    // and leaves each borrower a set of keys it alone owns.
    lease.write('global', 'glow', lease.original('global', 'glow') * 0.3);
  }
}
