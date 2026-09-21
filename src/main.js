import { App } from './core/App.js';
import { LoadingScreen } from './ui/HUD.js';
import { read as readPreferences } from './state/preferences.js';

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
    // A returning visitor gets the same opening, briskly. Read here rather
    // than inside the director so `src/` keeps one door onto storage.
    const returning = readPreferences().introSeen;
    const app = new App(canvas, { returning });
    // Handy for poking at the scene from the console. Assigned before the load
    // so it is reachable while assets are still streaming.
    window.app = app;
    // `grimoire:ready` is dispatched by `App.load()` the moment the stage is
    // playable, not here — see the comment at that dispatch.
    await app.load();
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
