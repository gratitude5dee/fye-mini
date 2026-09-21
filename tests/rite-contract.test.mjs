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

test('whether a line clears a hazard cannot depend on the clock', async () => {
  // Water's pathHeight includes a swell driven by frame.uTime. Judging against
  // the live altitude meant the same line solved or failed depending on when it
  // was cast, which is the clock deciding rather than the player.
  const rite = await readFile(new URL('../src/game/Rite.js', import.meta.url), 'utf8');
  const start = rite.indexOf('  judge(points, count, ability) {');
  const end = rite.indexOf('  _settle(outcome) {');
  assert.ok(start > 0 && end > start, 'both method definitions must be found');
  const judge = rite.slice(start, end);
  assert.match(judge, /flightFloor/, 'the element term must be the declared floor');
  // A call, not a mention: the code's own comment explains why the live
  // altitude is wrong here, and that explanation must not trip this.
  assert.doesNotMatch(judge, /pathHeight\s*\(/, 'the live, time-varying altitude must not decide solvability');
  assert.match(judge, /ability\.lift\(u\)/, "the player's own lift stays live");
});

test('exactly one element crosses a hazard unaided, and a raised hand crosses with any', () => {
  const { flightFloor, hazardClearance } = settings.rite;
  const unaided = Object.entries(flightFloor).filter(([, h]) => h >= hazardClearance).map(([e]) => e);
  assert.deepEqual(unaided, ['fire'], 'fire flies; the rest are the reason the lift axis exists');

  const LIFT = 2.4; // what a fully raised hand supplies
  for (const [element, floor] of Object.entries(flightFloor)) {
    assert.ok(floor + LIFT >= hazardClearance, `${element} must be able to cross with a raised hand`);
  }
});

test('every layout the seed can produce fits on the screen it is drawn on', () => {
  // `fov` is vertical, so how much ground is visible *across* the screen is
  // proportional to the aspect ratio. Measured against the real rig at the
  // authored distance: a 1280x720 laptop sees 22.8 m, a 390x844 phone 5.93 m.
  // Generated layouts span up to 12.1 m, so on a phone most of them did not fit
  // and the player would have had to orbit mid-Rite to find a waystone.
  //
  // The camera now holds `minGroundSpan` by pushing back on a narrow viewport.
  // This pins the other side of that contract: the generator must never produce
  // a layout wider than what the camera guarantees to show.
  let widest = 0;
  let worstSeed = null;
  for (let day = 0; day < 120; day++) {
    const seed = dailySeed(new Date(2026, 0, 1 + day));
    for (const layout of generateRite(seed, settings.rite.lines, 0)) {
      // The caster stands at the origin and is part of every line, so the span
      // the player has to see includes it.
      const xs = [0, ...layout.waystones.map((w) => w.x + w.radius), ...layout.waystones.map((w) => w.x - w.radius),
        ...layout.hazards.map((h) => h.x + h.radius), ...layout.hazards.map((h) => h.x - h.radius)];
      const span = Math.max(...xs) - Math.min(...xs);
      if (span > widest) { widest = span; worstSeed = seed; }
    }
  }
  // The rig can reach `maxDistance`, and the span it can show there is
  // proportional to it. The narrowest viewport the product supports is a
  // portrait phone, measured at 5.93m of ground at the authored distance of
  // 11.5 — so the widest it can ever show is that ratio times the ceiling.
  const PHONE_SPAN_AT_AUTHORED = 5.93;
  const reachable = PHONE_SPAN_AT_AUTHORED * (settings.camera.maxDistance / settings.camera.distance);
  assert.ok(
    widest + settings.camera.groundSpanMargin <= reachable,
    `the widest layout in 120 days spans ${widest.toFixed(2)}m (seed ${worstSeed}), and with the ` +
    `${settings.camera.groundSpanMargin}m margin a portrait phone can only ever reach ` +
    `${reachable.toFixed(2)}m at maxDistance ${settings.camera.maxDistance}`
  );
});

test('the Rite asks for the line in front of the player, not the worst line there is', async () => {
  const { readFile } = await import('node:fs/promises');
  const [rite, rig] = await Promise.all([
    readFile(new URL('../src/game/Rite.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/core/CameraRig.js', import.meta.url), 'utf8')
  ]);

  // Framing every viewport for the widest layout the generator can produce
  // would leave a phone pushed back far enough that the caster is fifty pixels
  // tall — in free play, where there is nothing wide to look at.
  assert.match(rite, /this\.ctx\.frameGround\?\.\(Rite\.extentOf\(layout\)\)/);
  assert.match(rite, /this\.ctx\.frameGround\?\.\(0\)/, 'and hands the framing back when set aside');
  assert.match(rig, /requireGroundSpan\(metres\) \{/);
  // The extent must include the rings, not just the centres: a waystone framed
  // to its centre is half off the screen.
  assert.match(rite, /feature\.x - feature\.radius/);
  assert.match(rite, /feature\.x \+ feature\.radius/);
});
