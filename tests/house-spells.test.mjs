import test from 'node:test';
import assert from 'node:assert/strict';

import { HOUSE_SEED_SPELLS, houseSpellForClient, houseSpellSettings } from '../src/config/house-spells.js';
import { validateSpellSettings } from '../src/config/spell-contract.js';

test('the 12 House pages are valid, distinct, and shared by offline and Atlas flows', () => {
  assert.equal(HOUSE_SEED_SPELLS.length, 12);
  const byElement = new Map();

  for (const seed of HOUSE_SEED_SPELLS) {
    const words = seed.lore.trim().split(/\s+/).length;
    assert.ok(words >= 40 && words <= 80, `${seed.name} lore has ${words} words`);
    assert.equal(validateSpellSettings(houseSpellSettings(seed.settingsPatch)).ok, true, `${seed.name} settings validate`);

    const page = houseSpellForClient(seed);
    const pages = byElement.get(seed.element) ?? [];
    pages.push(JSON.stringify({ settings: page.settings, genome: page.genome }));
    byElement.set(seed.element, pages);
  }

  for (const [element, pages] of byElement) {
    assert.equal(pages.length, 3, `${element} has three House pages`);
    assert.equal(new Set(pages).size, 3, `${element} House pages have distinct visual snapshots`);
  }
});
