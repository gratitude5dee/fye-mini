import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { CatmullRomCurve3, Vector3 } from 'three';

const text = (path) => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * Slice a method body out of a source file.
 *
 * Anchored on the full signature at a known indentation and closed at the
 * matching brace at that same indentation, because matching on a bare call
 * finds the *call sites* instead of the definition — which is how two earlier
 * assertions in this suite passed while testing nothing at all.
 */
function method(source, signature, indent = '  ') {
  const open = source.indexOf(`\n${indent}${signature} {`);
  assert.notEqual(open, -1, `no definition of ${signature} at indent ${indent.length}`);
  const close = source.indexOf(`\n${indent}}`, open + 1);
  assert.notEqual(close, -1, `${signature} is never closed at indent ${indent.length}`);
  return source.slice(open, close);
}

/* ------------------------------------------------------------------------ */

test('the hand’s rise lands where the hand actually rose', async () => {
  const drawer = await text('../src/input/PathDrawer.js');

  // `getPointAt` walks the curve by arc length. The lift channel is indexed by
  // sample, and `minPointDistance` is a floor rather than a spacing guarantee,
  // so a slow approach and a fast flick put wildly different arc lengths
  // between consecutive entries. Reading the lift at the raw `t` attributed
  // the rise to whichever part of the stroke was drawn slowly.
  assert.match(drawer, /resampledLift\[i\]\s*=\s*this\._sampleLiftAt\(curve\.getUtoTmapping\(t\)\)/);
  assert.doesNotMatch(drawer, /resampledLift\[i\]\s*=\s*this\._sampleLiftAt\(t\)/);

  // And the mapping itself, against a stroke shaped like the one this breaks
  // on: a careful approach with the hand down, then a flick with it up.
  const samples = [];
  const lift = [];
  for (let i = 0; i < 9; i++) { samples.push(new Vector3(i * 0.25, 0, 0)); lift.push(0); }
  samples.push(new Vector3(10, 0, 0));
  lift.push(3);

  const curve = new CatmullRomCurve3(samples.map((p) => p.clone()), false, 'catmullrom', 0.5);
  curve.arcLengthDivisions = Math.max(64, samples.length * 8);
  const last = samples.length - 1;
  const read = (at) => {
    const clamped = Math.min(last, Math.max(0, at));
    const i = Math.floor(clamped);
    const a = lift[i] ?? 0;
    return a + ((lift[Math.min(last, i + 1)] ?? a) - a) * (clamped - i);
  };

  const mid = curve.getPointAt(0.5, new Vector3());
  // The arc-length midpoint is deep inside the flick, where the hand was up.
  assert.ok(mid.x > 4, `midpoint should be past the slow approach, was ${mid.x}`);
  assert.equal(read(0.5 * last), 0, 'the shipped mapping read no lift here');
  assert.ok(read(curve.getUtoTmapping(0.5) * last) > 0.9, 'the fixed mapping finds the raised hand');
});

test('a line gets one verdict, and a Rite starts with none pending', async () => {
  const rite = await text('../src/game/Rite.js');
  const judge = method(rite, 'judge(points, count, ability)');

  // `judging` admits 'draw', which is the phase the first cast puts us in. A
  // second cast inside the 1.6s beat used to replace the outcome and reset the
  // timer, so casting faster than once per beat never resolved the line at all
  // and a burst of any length cost exactly one attempt.
  assert.match(judge, /if \(this\._pending\) return outcomeStrength\(this\._pending\)/);

  // An outcome left over from a previous Rite would settle against line 0 of
  // the new one and light a stone nobody earned.
  assert.match(method(rite, 'begin(seed = dailySeed(new Date()), riteIndex = 0)'), /this\._pending = null/);
});

test('the wordless tutorial cannot outlive the Rite that laid it', async () => {
  const [ghost, rite] = await Promise.all([
    text('../src/game/GhostLine.js'), text('../src/game/Rite.js')
  ]);

  // The burn-away is advanced by `PathTrail.update`, which only runs while
  // `GhostLine.update` keeps calling it. Stopping at `visible` froze a fully
  // opaque ribbon on the ground for the rest of the session.
  assert.match(method(ghost, 'update(dt)'), /if \(!this\.visible && !this\._retiring\) return/);
  assert.match(method(ghost, 'retire()'), /this\._retiring = true/);

  // `_settle` calls `retire()` and then `_present()`, which calls `hide()`. A
  // hard hide there cut the burn dead on the frame it started.
  assert.match(method(ghost, 'hide()'), /if \(this\._retiring\) \{ this\.visible = false; return; \}/);

  // `Rite.update` stops the moment the phase is free, so anything still showing
  // when the Rite is set aside shows for the rest of the session.
  assert.match(method(rite, 'setAside()'), /this\.ghost\.cut\(\)/);

  // A disposed mesh left in the graph throws on the next render.
  assert.match(method(ghost, 'dispose()'), /this\.trail\.mesh\.parent\?\.remove\(this\.trail\.mesh\)/);
});

test('a pooled ability carries nothing at all into its next cast', async () => {
  const destroy = method(await text('../src/abilities/Ability.js'), 'destroy()');

  // A height profile left behind lifts whatever reuses the instance.
  assert.match(destroy, /this\._lift = null/);
  // `lightBoost` is set at impact and only decays in `_updateLight`, so an
  // instance evicted mid-impact went back to the pool still carrying its flare.
  assert.match(destroy, /this\.lightBoost = 0/);
});

test('the flash rate limiter thins flashes without ever dimming one', async () => {
  const trigger = method(await text('../src/effects/ScreenFlash.js'), 'trigger(color, strength, decay = 0.0004)');

  // The guard at the top proves `scaled` beats the live flash; a quarter of it
  // need not, and admitting it anyway snapped the screen down mid-decay.
  assert.match(trigger, /const admitted = Math\.min\(1, overBudget \? scaled \* 0\.25 : scaled\)/);
  assert.match(trigger, /if \(admitted <= this\.strength\) return;[\s\S]*this\.color\.copy\(color\)/);
});

test('the hazard is judged across each segment, not at its leading corner', async () => {
  const resolve = await text('../src/game/resolveStroke.js');

  // A segment covers [i/span, (i+1)/span]. Judging all of it by its start
  // never reads `liftAt(1)` at all and puts each edge of the raised window
  // half a segment out — which is exactly where the player is aiming.
  assert.match(resolve, /const lift = liftAt\(\(i \+ 0\.5\) \/ span\)/);
  assert.doesNotMatch(resolve, /const lift = liftAt\(i \/ span\)/);
});

test('stopping the tracker tells the interface it stopped', async () => {
  const stop = method(await text('../src/input/HandInput.js'), 'stop()');

  // The panel mirrors what the tracker can see. Without a final word it keeps
  // asserting an engaged hand at the last height it had.
  assert.match(stop, /this\.onState\?\.\(\{[\s\S]*engaged: false/);
  // `_publish` would swallow this under its own throttle.
  assert.match(stop, /this\._publishedAt = 0/);
  // These pointed into the mirror the lines above just removed.
  assert.match(stop, /this\._label = null/);
  assert.match(stop, /this\._ring = null/);
});

test('only one dialog is ever open, whichever way it was opened', async () => {
  const stage = await text('../app/GrimoireStage.tsx');

  // Every button closes the others. `H` did not, so it could stack two
  // `aria-modal` dialogs whose inert walks fought over the same siblings.
  assert.match(
    stage,
    /const helpListener = \(\) => \{[\s\S]*setHandsOpen\(false\);[\s\S]*setWorkshopOpen\(false\);[\s\S]*setHelpOpen/
  );
});

test('the dock keeps the one attribute hand selection depends on', async () => {
  const [stage, hand, css] = await Promise.all([
    text('../app/GrimoireStage.tsx'), text('../src/input/HandInput.js'),
    text('../app/grimoire-stage.css')
  ]);

  // `_trackDock` finds a slot with `closest('[data-element]')`. Moving the
  // attribute to a wrapper breaks hand selection in silence.
  assert.match(stage, /data-element=\{entry\.id\}/);
  assert.match(hand, /closest\?\.\('\[data-element\]'\)/);

  // The Workshop's preset tiles carry `data-element` too, and a hand resting
  // over one used to take that element without applying the preset under it.
  assert.match(stage, /data-dock/);
  assert.match(hand, /closest\?\.\('\[data-dock\]'\)/);

  // The dwell has to be visible before it fires, or the interface looks like
  // it is choosing an element on its own.
  assert.match(hand, /dock: this\.dockElement/);
  assert.match(hand, /dockHold:/);
  assert.match(css, /\.dock__slot\.is-dwelling u \{[^}]*opacity: 1/);
});

test('three layouts, because the stage a drag crosses is the difficulty', async () => {
  const css = await text('../app/grimoire-stage.css');

  assert.match(css, /@media \(max-width: 679px\)/);
  assert.match(css, /@media \(min-width: 680px\) and \(max-width: 1024px\)/);
  // A phone never gets the camera, so it must never get the mirror either.
  assert.match(css, /@media \(max-width: 679px\) \{[\s\S]*\.hand-mirror \{ display: none; \}/);
  // Nothing may straddle the boundary: 680px must belong to exactly one layout.
  assert.doesNotMatch(css, /@media \(max-width: 680px\)/);
});
