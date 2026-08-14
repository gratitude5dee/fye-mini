import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the stage loads its intended type and keeps modal interaction accessible', async () => {
  const [layout, stage, css] = await Promise.all([
    readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/GrimoireStage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/grimoire-stage.css', import.meta.url), 'utf8')
  ]);

  assert.match(layout, /family=Fraunces/);
  assert.match(layout, /family=Inter/);
  assert.match(layout, /display=swap/);
  assert.match(stage, /surface\.setAttribute\('inert', ''\)/);
  assert.match(stage, /keyEvent\.key === 'Escape'/);
  assert.match(stage, /role="dialog"/);
  assert.match(stage, /aria-modal="true"/);
  assert.match(stage, /<ul className="spell-list">/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.modal-scrim/);
});
