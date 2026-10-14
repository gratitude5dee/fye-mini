import test from 'node:test';
import assert from 'node:assert/strict';

import { splitByElement } from '../src/game/splitByElement.js';
import { settings } from '../src/config/settings.js';

/** A stroke sampled every `step` metres, so arc length is index * step. */
const evenly = (step) => (i) => i * step;

/** Compact a run list for readable assertions. */
const shape = (runs) => runs.map((r) => `${r.element}:${r.from}-${r.to}`).join(' ');

/** Every sample belongs to exactly one run, in order, with no gap. */
function assertCovers(runs, count) {
  assert.equal(runs[0].from, 0, 'the first run starts at the first sample');
  assert.equal(runs[runs.length - 1].to, count, 'the last run reaches the end');
  for (let i = 1; i < runs.length; i++) {
    assert.equal(runs[i].from, runs[i - 1].to, `run ${i} must begin where run ${i - 1} ended`);
  }
}

test('a stroke drawn with one element is one run, and costs no bookkeeping', () => {
  const channel = new Uint8Array(40);      // all zeroes: one element throughout
  const runs = splitByElement(channel, 40, evenly(0.25));
  assert.equal(runs.length, 1);
  assert.equal(runs[0].element, 0);
  assertCovers(runs, 40);
  assert.ok(Math.abs(runs[0].length - 39 * 0.25) < 1e-9);
});

test('an element change splits the line where the hand changed it', () => {
  // 0.25m per sample; 20 samples of fire then 20 of earth is 4.75m each, well
  // over minPathLength, so neither run folds.
  const channel = Uint8Array.from({ length: 40 }, (_, i) => (i < 20 ? 1 : 3));
  const runs = splitByElement(channel, 40, evenly(0.25));
  assert.equal(shape(runs), '1:0-20 3:20-40');
  assertCovers(runs, 40);
});

test('a flicker is folded into a neighbour, never dropped', () => {
  // Four frames of a mis-read pose in the middle of a long earth stroke. That
  // is 0.75m, under the 1.6m floor.
  const channel = Uint8Array.from({ length: 40 }, (_, i) => (i >= 18 && i < 22 ? 1 : 3));
  assert.ok(3 * 0.25 < settings.input.minPathLength, 'the flicker must be under the floor to be the case under test');

  const runs = splitByElement(channel, 40, evenly(0.25));
  assert.equal(runs.length, 1, 'the flicker is gone');
  assert.equal(runs[0].element, 3, 'and the element the player held is what flies');
  assertCovers(runs, 40);
  // The whole line still flies. A player who watched their stroke being drawn
  // has already been promised that all of it goes.
  assert.ok(Math.abs(runs[0].length - 39 * 0.25) < 1e-9);
});

test('a short run folds into its longer neighbour, not simply the earlier one', () => {
  // 1.25m of fire between 6.0m of water and 7.0m of earth. Both neighbours are
  // real runs; the fire must join the earth, because that is the one the player
  // more plainly committed to.
  const channel = new Uint8Array(60);
  for (let i = 0; i < 25; i++) channel[i] = 2;
  for (let i = 25; i < 31; i++) channel[i] = 1;
  for (let i = 31; i < 60; i++) channel[i] = 3;

  const runs = splitByElement(channel, 60, evenly(0.25));
  assert.equal(shape(runs), '2:0-25 3:25-60');
  assertCovers(runs, 60);
});

test('folding the shortest run first can legitimately rescue the next-shortest', () => {
  // 0.75m water, then 1.25m fire, then 7.25m earth. Both of the first two are
  // under the floor on their own, but the water folds into the fire first — and
  // 2.25m of contiguous not-earth clears the floor, so it stays.
  //
  // Recorded rather than asserted-around, because it is the behaviour of
  // "resolve the smallest artefact first" and the alternative — deciding that
  // two adjacent brief poses are collectively noise — would need to know what
  // the player meant, which nothing here does.
  const channel = new Uint8Array(40);
  for (let i = 0; i < 4; i++) channel[i] = 2;
  for (let i = 4; i < 10; i++) channel[i] = 1;
  for (let i = 10; i < 40; i++) channel[i] = 3;

  const runs = splitByElement(channel, 40, evenly(0.25));
  assert.equal(shape(runs), '1:0-10 3:10-40');
  assertCovers(runs, 40);
  assert.ok(runs[0].length >= settings.input.minPathLength, 'and what survives is a real run');
});

test('two real runs either side of a flicker both survive it', () => {
  const channel = new Uint8Array(60);
  for (let i = 0; i < 25; i++) channel[i] = 1;         // 6.0m fire
  for (let i = 25; i < 29; i++) channel[i] = 2;        // 0.75m water — a flicker
  for (let i = 29; i < 60; i++) channel[i] = 3;        // 7.5m earth

  const runs = splitByElement(channel, 60, evenly(0.25));
  assert.equal(runs.length, 2, 'the flicker folds, the two real runs stay');
  assert.deepEqual(runs.map((r) => r.element), [1, 3]);
  assertCovers(runs, 60);
});

test('a stroke that is entirely too short still casts, as one run', () => {
  // Three samples over 0.5m. Nothing here clears minPathLength, and folding
  // must not eat the last run: whether a 0.5m stroke casts at all is the cast
  // router's decision, made once, not this function's to pre-empt.
  const channel = Uint8Array.from([1, 2, 3]);
  const runs = splitByElement(channel, 3, evenly(0.25));
  assert.equal(runs.length, 1);
  assertCovers(runs, 3);
});

test('an empty or single-sample stroke resolves without throwing', () => {
  assert.deepEqual(splitByElement(new Uint8Array(0), 0, evenly(0.25)), []);
  const one = splitByElement(Uint8Array.from([2]), 1, evenly(0.25));
  assert.equal(one.length, 1);
  assert.equal(one[0].element, 2);
  assert.equal(one[0].to, 1);
});

test('uneven sampling is judged by arc length, not by sample count', () => {
  // Ten samples packed into 0.3m (a slow careful approach) then two samples
  // spanning 9m (a flick). By count the first run looks dominant; by length it
  // is the one under the floor.
  const lengths = [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.3, 4.5, 9.3];
  const channel = Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3]);
  const runs = splitByElement(channel, 12, (i) => lengths[i]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].element, 3, 'the 9m flick wins over the 0.3m approach');
  assertCovers(runs, 12);
});
