import { App } from './core/App.js';
import { LoadingScreen } from './ui/HUD.js';

/**
 * Entry point.
 *
 * Everything interesting lives in `core/App.js`; this file only wires the app
 * to the page and reports fatal boot errors somewhere the user can see them.
 */
const canvas = document.getElementById('viewport');

export async function boot() {
  if (window.app) return window.app;
  try {
    const app = new App(canvas);
    await app.load();

    // Handy for poking at the scene from the console.
    window.app = app;
    window.dispatchEvent(new CustomEvent('grimoire:ready', { detail: { app } }));
    return app;
  } catch (error) {
    console.error('[boot] failed to start', error);
    new LoadingScreen().fail(
      error?.message ? `Failed to start: ${error.message}` : 'Failed to start — see the console.'
    );
  }
}

void boot();

// A page unload is the one time the renderer must be torn down. Keeping this
// outside the React island prevents development hot-reloads from repeatedly
// disposing and rebuilding the WebGL context mid-session.
window.addEventListener('pagehide', () => window.app?.dispose?.(), { once: true });
