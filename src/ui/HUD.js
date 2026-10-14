/**
 * What the engine still says for itself.
 *
 * This used to be a whole heads-up display: an element selector, mode cards, a
 * help panel and a live stats readout. None of it had markup — React renders
 * `<div id="hud" className="hud" />` with no children, so every one of those
 * `querySelector` calls returned null and `setElement`, `setMode`, `toggleHelp`
 * and the stats did nothing. The stats readout was worse than nothing: it
 * walked the particle pools two and a half times a second to fill elements that
 * were not there.
 *
 * The ownership line is now drawn once: **React owns everything a person clicks
 * or reads.** What is left here is the one thing that genuinely needs to come
 * from inside the frame loop — a transient line the engine writes directly,
 * without a render pass, at the moment something happens.
 */
export class HUD {
  constructor(root) {
    this.root = root;
    this._toastTimer = 0;
    // The engine owns this node outright, so it is written rather than queried.
    root.innerHTML = '<div class="hud__toast" data-toast></div>';
    this.toast = root.querySelector('[data-toast]');
  }

  /**
   * Say one thing, briefly.
   *
   * @param {string} message
   * @param {number} [duration] milliseconds
   */
  showToast(message, duration = 1400) {
    if (!this.toast) return;
    this.toast.textContent = message;
    this.toast.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('is-visible'), duration);
  }

  dispose() {
    clearTimeout(this._toastTimer);
  }
}

/**
 * The boot screen.
 *
 * React renders the markup and this mutates it by id from outside React, which
 * is a seam worth knowing about: the reveal and the interface's own idea of
 * readiness used to be driven by two unrelated timers, which left the primary
 * button reading "Waking" for most of a second over a live stage. `App.load()`
 * now announces readiness before calling `hide()`.
 */
export class LoadingScreen {
  constructor() {
    this.element = document.getElementById('loader');
    this.fill = document.getElementById('loader-fill');
    this.status = document.getElementById('loader-status');
  }

  setProgress(ratio, message) {
    if (this.fill) this.fill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
    if (message && this.status) this.status.textContent = message;
  }

  hide() {
    this.setProgress(1);
    setTimeout(() => this.element?.classList.add('is-hidden'), 220);
  }

  fail(message) {
    if (!this.status) return;
    this.status.textContent = message;
    this.status.style.color = '#ff7a6a';
  }
}
