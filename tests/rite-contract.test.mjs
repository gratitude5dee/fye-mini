import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { generateLayout, generateRite, dailySeed, tierFor } from '../src/game/layouts.js';
import { resolveStroke, outcomeStrength } from '../src/game/resolveStroke.js';
import { settings } from '../src/config/settings.js';
import * as store from '../src/state/riteStore.js';

const line = (from, to, n = 40) =>
  Array.from({ length: n }, (_, i) => ({
    x: from[0] + (to[0] - from[0]) * (i / (n - 1)),
    z: from[1] + (to[1] - from[1]) * (i / (n - 1))
  }));

const LAYOUT = {
  waystones: [{ x: 0, z: -4, radius: 1.15 }, { x: 0, z: 4, radius: 1.15 }],
  hazards: [{ x: 0, z: 0, radius: 1.25 }]
};

test('a layout is the same layout on every machine', () => {
  // The daily seed is only honest if the generator is deterministic. No
  // Math.random anywhere in the path, so the same date is the same Rite.
  const a = JSON.stringify(generateLayout('2026-09-21:0', 2));
  const b = JSON.stringify(generateLayout('2026-09-21:0', 2));
  assert.equal(a, b);
  assert.notEqual(a, JSON.stringify(generateLayout('2026-09-22:0', 2)));
  assert.equal(dailySeed(new Date('2026-09-21T23:59:00Z')), '2026-09-21');
});

test('every tier produces the problem it advertises', () => {
  for (let tier = 0; tier < 5; tier += 1) {
    const want = tierFor(tier);
    let waystones = 0;
    let hazards = 0;
    for (let seed = 0; seed < 120; seed += 1) {
      const layout = generateLayout(`t${tier}:${seed}`, tier);
      waystones += layout.waystones.length;
      hazards += layout.hazards.length;
      assert.equal(layout.elements.length, want.elements);
    }
    assert.ok(waystones >= 120 * want.waystones * 0.97, `tier ${tier} is short of waystones`);
    if (want.hazards > 0) {
      assert.ok(hazards >= 120 * want.hazards * 0.9, `tier ${tier} is short of hazards`);
    }
  }
});

test('a generated layout is always solvable: no hazard swallows a waystone', () => {
  for (let tier = 0; tier < 5; tier += 1) {
    for (let seed = 0; seed < 120; seed += 1) {
      const { waystones, hazards } = generateLayout(`s${tier}:${seed}`, tier);
      for (const hazard of hazards) {
        for (const stone of waystones) {
          const gap = Math.hypot(stone.x - hazard.x, stone.z - hazard.z);
          assert.ok(gap >= stone.radius + hazard.radius, 'a hazard sat on top of a waystone');
        }
      }
    }
  }
});

test('the line is judged on what it did, not on its shape', () => {
  const straight = line([0, -5], [0, 5]);
  const through = resolveStroke(straight, straight.length, LAYOUT);
  assert.deepEqual(through.reached, [true, true]);
  assert.equal(through.clipped, 0, 'a line down the middle must clip the hazard');
  assert.equal(through.solved, false);

  // A completely different shape that solves the same problem scores full.
  const detour = [...line([0, -5], [-3, 0], 20), ...line([-3, 0], [0, 5], 20)];
  const around = resolveStroke(detour, detour.length, LAYOUT);
  assert.equal(around.solved, true);
  assert.equal(outcomeStrength(around), 1);
});

test('fire crosses what earth cannot — the whole reason elements differ', () => {
  const straight = line([0, -5], [0, 5]);
  const flat = resolveStroke(straight, straight.length, LAYOUT, () => 0);
  const flying = resolveStroke(straight, straight.length, LAYOUT, () => settings.rite.hazardClearance + 0.1);
  assert.equal(flat.solved, false, 'a ground-hugging element must be stopped by the hazard');
  assert.equal(flying.solved, true, 'an element that flies must clear it');
});

test('a lift only clears the hazard where it actually rose', () => {
  const straight = line([0, -5], [0, 5]);
  // High at the start, back on the ground by the time it reaches the hazard.
  const early = resolveStroke(straight, straight.length, LAYOUT, (u) => (u < 0.2 ? 3 : 0));
  assert.equal(early.solved, false);
  // High across the middle, which is where the hazard is.
  const timed = resolveStroke(straight, straight.length, LAYOUT, (u) => (u > 0.3 && u < 0.7 ? 3 : 0));
  assert.equal(timed.solved, true);
});

test('forgiveness widens the ring without telling anyone', () => {
  const near = line([-2.4, -4], [-2.4, 4]);
  assert.equal(resolveStroke(near, near.length, LAYOUT).solved, false);
  assert.equal(resolveStroke(near, near.length, LAYOUT, () => 0, 2.5).solved, true);
});

test('a short or empty stroke resolves cleanly instead of throwing', () => {
  assert.equal(resolveStroke([], 0, LAYOUT).solved, false);
  assert.equal(resolveStroke(line([0, 0], [0, 1]), 1, LAYOUT).solved, false);
  assert.equal(outcomeStrength(undefined), 0);
});

test('the Rite refills attempts per line and always ends', () => {
  store.__resetForTests();
  store.beginRite('seed', 3, 3);
  store.presentLine(LAYOUT);
  assert.equal(store.resolveLine(true), 'advance');
  assert.equal(store.get().attemptsLeft, 3, 'the next line must get a full budget');
  assert.equal(store.resolveLine(false), 'retry');
  assert.equal(store.resolveLine(false), 'retry');
  assert.equal(store.resolveLine(false), 'advance', 'running out of attempts still advances');
  // The last line gets its own full budget, so it takes three more failures.
  assert.equal(store.resolveLine(false), 'retry');
  assert.equal(store.resolveLine(false), 'retry');
  assert.equal(store.resolveLine(false), 'advance');
  assert.equal(store.get().phase, 'close', 'a Rite always ends');
  assert.deepEqual(store.get().ward, [true, false, false], 'a stone may honestly stay dark');
  assert.equal(store.isWardWhole(), false);
});

test('game rules are out of reach of any cosmetic preset', async () => {
  const ranges = await readFile(new URL('../src/config/spell-ranges.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ranges, /'rite\./, 'settings.rite must have no declared range, or a patch could rewrite balance');
  const spells = await readFile(new URL('../src/config/house-spells.js', import.meta.url), 'utf8');
  assert.doesNotMatch(spells, /rite\./);
});

test('a hazard always fits between the waystones it divides', () => {
  const { rite } = settings;
  assert.ok(
    rite.featureSpacing > (rite.waystoneRadius + rite.hazardRadius) * 2,
    'waystones closer than this can never host a hazard, and every tier comes out short'
  );
});
