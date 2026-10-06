import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

/**
 * The privacy claim's only enforcement.
 *
 * Camera and landmark privacy are the product's trust anchor. An assertion is
 * the only thing standing between that sentence and someone adding a network
 * call in good faith. The original test guarded two files; this guards the tree.
 */

const ROOTS = ['../src', '../app'];
const CODE = new Set(['.js', '.mjs', '.ts', '.tsx']);
const PROJECT_ROOT = new URL('..', import.meta.url).pathname;
const projectPath = (path) => relative(PROJECT_ROOT, path).replaceAll('\\', '/');

/**
 * The three runtime fetch locations that are allowed, and why.
 *
 * MediaPipe's WASM and its hand-landmark model are pulled from a CDN at the
 * moment the visitor opts into hand tracking. They are a documented exception
 * rather than an oversight, and self-hosting them would remove even this.
 */
const ALLOWED = [
 { file: 'src/input/HandInput.js', pattern: /cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision/ },
  { file: 'src/input/HandInput.js', pattern: /storage\.googleapis\.com\/mediapipe-models/ },
  // Public, read-only catalog metadata. It never accepts player input, sends
  // camera data, or starts a World Labs job.
  { file: 'app/GrimoireStage.tsx', pattern: /fetch\('\/api\/worlds'\)/ }
];

/** Anything here would put a byte on the network. */
const FORBIDDEN = [
  { name: 'fetch(', pattern: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { name: 'WebSocket', pattern: /\bnew\s+WebSocket\b/ },
  { name: 'RTCPeerConnection', pattern: /\bRTCPeerConnection\b/ },
  { name: 'EventSource', pattern: /\bnew\s+EventSource\b/ },
  { name: 'sendBeacon', pattern: /\bsendBeacon\s*\(/ },
  { name: 'importScripts', pattern: /\bimportScripts\s*\(/ }
];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (CODE.has(extname(entry.name))) yield path;
  }
}

test('only documented client network calls can leave src/ or app/', async () => {
  const offenders = [];
  for (const root of ROOTS) {
    const base = new URL(root, import.meta.url).pathname;
    for await (const path of walk(base)) {
      const relative = projectPath(path);
      const source = await readFile(path, 'utf8');
      for (const { name, pattern } of FORBIDDEN) {
        if (!pattern.test(source)) continue;
        const excused = ALLOWED.some((rule) => rule.file === relative && rule.pattern.test(source));
        if (excused && name === 'fetch(') continue;
        offenders.push(`${relative}: ${name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `network API used outside the documented MediaPipe exception:\n${offenders.join('\n')}`);
});

test('the MediaPipe CDN exceptions are still present and documented', async () => {
  const hand = await readFile(new URL('../src/input/HandInput.js', import.meta.url), 'utf8');
  for (const { pattern } of ALLOWED.filter((rule) => rule.file === 'src/input/HandInput.js')) assert.match(hand, pattern);
});

/**
 * Storage is allowed in exactly two places, for different reasons.
 *
 * `preferences.js` owns everything the player is promised will be remembered.
 * `PresetManager` backs the lil-gui editor behind the G key — a developer tool
 * with its own named snapshots, not player state. Anything else writing to
 * storage is ad-hoc, and ad-hoc is what this test exists to stop.
 */
const STORAGE_OWNERS = new Set(['src/state/preferences.js', 'src/ui/PresetManager.js']);

test('only the two designated modules touch storage', async () => {
  const offenders = [];
  for (const root of ROOTS) {
    const base = new URL(root, import.meta.url).pathname;
    for await (const path of walk(base)) {
      const relative = projectPath(path);
      if (STORAGE_OWNERS.has(relative)) continue;
      const source = await readFile(path, 'utf8');
      if (/\blocalStorage\b|\bsessionStorage\b/.test(source)) offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, [], `storage touched outside src/state/preferences.js:\n${offenders.join('\n')}`);
});
