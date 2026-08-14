import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { HOUSE_SEED_SPELLS, houseSpellForClient } from '../src/config/house-spells.js';
import { HOUSE_PORTRAIT_SLUGS, housePortraitSvg, housePortraitUrl } from '../src/config/house-portraits.js';

test('every House seed has a unique, deterministic generated portrait', () => {
  assert.deepEqual([...HOUSE_PORTRAIT_SLUGS].sort(), HOUSE_SEED_SPELLS.map(({ slug }) => slug).sort());
  const art = new Set();
  const urls = new Set();

  for (const seed of HOUSE_SEED_SPELLS) {
    const url = housePortraitUrl(seed.slug);
    const svg = housePortraitSvg(seed.slug);
    assert.match(url, new RegExp(`^/api/house-portraits/${seed.slug}\\.svg$`));
    assert.equal(svg, housePortraitSvg(seed.slug), `${seed.name} art is deterministic`);
    assert.match(svg, /viewBox="0 0 600 800"/);
    assert.match(svg, new RegExp(`<title[^>]*>${seed.name}`));
    assert.match(svg, /<(?:path|circle|ellipse)\b/);
    assert.doesNotMatch(svg, /<(?:script|image)\b|(?:href|xlink:href)=["'][^"']*https?:/i, `${seed.name} has no external or executable asset`);
    assert.equal(houseSpellForClient(seed).portrait.imageUrl, url, `${seed.name} client page uses its stored House URL`);
    art.add(svg);
    urls.add(url);
  }

  assert.equal(art.size, 12, 'each House page has distinct art');
  assert.equal(urls.size, 12, 'each House page has a stable URL');
  assert.equal(housePortraitUrl('not-a-house-spell'), null);
  assert.equal(housePortraitSvg('not-a-house-spell'), null);
  assert.equal(housePortraitUrl('toString'), null, 'prototype names are not portrait routes');
  assert.equal(housePortraitSvg('toString'), null, 'prototype names never render SVG');
});

test('the Atlas bootstrap persists House portrait URLs and repairs prior null placeholders', async () => {
  const bootstrap = await readFile(new URL('../scripts/mongo/bootstrap.mjs', import.meta.url), 'utf8');
  assert.match(bootstrap, /import \{ housePortraitUrl \} from '\.\.\/\.\.\/src\/config\/house-portraits\.js';/);
  assert.match(bootstrap, /const portrait = \{ imageUrl, palette: HOUSE_PALETTE\[element\] \};/);
  assert.match(bootstrap, /updates\.portrait = portrait;/);
  assert.doesNotMatch(bootstrap, /portrait: \{ imageUrl: null, palette: HOUSE_PALETTE\[element\] \}/);
});

test('the House portrait endpoint uses immutable SVG responses', async () => {
  const route = await readFile(new URL('../app/api/house-portraits/[slug]/route.ts', import.meta.url), 'utf8');
  assert.match(route, /housePortraitSvg/);
  assert.match(route, /image\/svg\+xml/);
  assert.match(route, /max-age=31536000, immutable/);
});
