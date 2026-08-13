
/**
 * Heads-up display: element selector, controls, live stats and toasts.
 *
 * Plain DOM — no framework. The switches are the only interactive parts; they
 * mirror the keyboard shortcuts and report back through `onSelect`.
 */
export class HUD {
  constructor(root) {
    this.root = root;
    this.onSelect = null;
    this.onMode = null;
    this._toastTimer = 0;
    this._statsAccumulator = 0;
    this._frames = 0;
    this._fps = 0;

    root.innerHTML = `<div class="hud__toast" data-toast></div>`;

    this.cards = new Map();
    for (const card of root.querySelectorAll('.element-card')) {
      this.cards.set(card.dataset.element, card);
      card.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.onSelect?.(card.dataset.element);
      });
    }

    this.modeCards = new Map();
    for (const card of root.querySelectorAll('.mode-card')) {
      this.modeCards.set(card.dataset.mode, card);
      card.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        this.onMode?.(card.dataset.mode);
      });
    }

    this.stats = {
      fps: root.querySelector('[data-stat="fps"]'),
      particles: root.querySelector('[data-stat="particles"]'),
      calls: root.querySelector('[data-stat="calls"]'),
      abilities: root.querySelector('[data-stat="abilities"]')
    };
    this.help = root.querySelector('.hud__help');
    this.toast = root.querySelector('[data-toast]');
    this.blurb = root.querySelector('[data-blurb]');
    this.elements = root.querySelector('.hud__elements');
  }

  setElement(element) {
    for (const [key, card] of this.cards) {
      card.classList.toggle('is-active', key === element);
    }
    if (element) this.showToast(`${element === 'wind' ? 'Gale' : element[0].toUpperCase() + element.slice(1)} selected`);
  }

  /** Legacy mode-card support for the standalone foundation entrypoint. */
  setMode(mode) {
    for (const [key, card] of this.modeCards) card.classList.toggle('is-active', key === mode);
  }

  toggleHelp() {
    this.help?.classList.toggle('is-hidden');
  }

  showToast(message, duration = 1400) {
    this.toast.textContent = message;
    this.toast.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('is-visible'), duration);
  }

  /**
   * @param {number} dt
   * @param {() => {particles:number, calls:number, abilities:number}} collect
   *   Called only when the readout actually refreshes, so gathering the numbers
   *   (which means walking the particle pools) stays off the hot path.
   */
  update(dt, collect) {
    this._frames++;
    this._statsAccumulator += dt;
    if (this._statsAccumulator < 0.4) return;

    this._fps = Math.round(this._frames / this._statsAccumulator);
    this._frames = 0;
    this._statsAccumulator = 0;

    const info = collect();
    if (!this.stats.fps) return;
    this.stats.fps.textContent = this._fps;
    this.stats.particles.textContent = info.particles;
    this.stats.calls.textContent = info.calls;
    this.stats.abilities.textContent = info.abilities;
  }
}

/** Boot screen helper. */
export class LoadingScreen {
  constructor() {
    this.element = document.getElementById('loader');
    this.fill = document.getElementById('loader-fill');
    this.status = document.getElementById('loader-status');
  }

  setProgress(ratio, message) {
    this.fill.style.width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
    if (message) this.status.textContent = message;
  }

  hide() {
    this.setProgress(1);
    setTimeout(() => this.element.classList.add('is-hidden'), 220);
  }

  fail(message) {
    this.status.textContent = message;
    this.status.style.color = '#ff7a6a';
  }
}
