import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the loading sigil is drawn outside the grade that blacks the stage', async () => {
  const [cloud, app] = await Promise.all([
    source('../src/intro/SigilCloud.js'), source('../src/core/App.js')
  ]);

  // The thing making the stage black during the opening *is* the grade:
  // `post.gain` is 0, and anything rendered before that pass is multiplied to
  // nothing along with everything else. The cloud has its own scene and is
  // drawn straight to the frame buffer after the composer.
  assert.match(cloud, /this\.scene = new Scene\(\);/);
  assert.match(app, /this\.post\.render\(\);[\s\S]{0,320}this\.sigil\.render\(this\.renderer\.gl, this\.camera\);/);
  assert.doesNotMatch(app, /scene\.add\([^)]*sigil/);

  // And therefore no depth test: the frame buffer's depth is whatever the last
  // fullscreen quad left there, and testing against it hid the cloud entirely.
  assert.match(cloud, /depthTest: false/);
  // `autoClear` off, or it wipes the stage it is supposed to sit in front of.
  assert.match(cloud, /gl\.autoClear = false;[\s\S]{0,120}gl\.render\(this\.scene, camera\)/);
  assert.match(cloud, /gl\.autoClear = wasAutoClear/);

  // The bloom pass never sees it, so the glow is in the point.
  assert.match(cloud, /float halo = smoothstep/);
});

test('every sigil is the same size and stands on the ground, whatever its glyph', async () => {
  const cloud = await source('../src/intro/SigilCloud.js');

  // The four sigils fill wildly different fractions of their em box — the air
  // mark is a sliver of it. Scaling by the canvas made one a third the size of
  // another and left it floating halfway up, wherever its ink happened to sit.
  assert.match(cloud, /const scale = height \/ Math\.max\(inkW, inkH\);/);
  assert.match(cloud, /const y = \(maxY - fy\) \* scale \+ lift;/);

  // Continuous sampling, not pixel centres: rounding to the raster put every
  // mote onto a lattice, and a cloud on a visible grid is a halftone print.
  assert.match(cloud, /const x = \(fx - midX\) \* scale;/);
  assert.doesNotMatch(cloud, /const x = \(px - midX\)/);

  // Constant density rather than constant count, or a thin glyph packs its
  // motes until additive blending sums them to white and it loses its colour.
  assert.match(cloud, /Math\.round\(raster\.ink \* DENSITY\)/);
  assert.match(cloud, /geometry\.setDrawRange\(0, placed\)/);
});

test('the scatter is a displacement, not an explosion', async () => {
  const cloud = await source('../src/intro/SigilCloud.js');
  // Each mote wanders within its own neighbourhood. That is what makes the
  // re-assembly read as something resolving rather than something sucked in,
  // and it is the thing to preserve if this is ever retuned.
  assert.match(cloud, /this\.scatter\[i\] = x \+ \(next\(\) - 0\.5\)/);
  assert.match(cloud, /this\.scatter\[i \+ 1\] = y \+ \(next\(\) - 0\.5\)/);
  // Staggered, or the convergence is a dissolve transition.
  assert.match(cloud, /float delay = aSeed \* [\d.]+;/);
});

test('a font with no glyph refuses rather than assembling a box', async () => {
  const [cloud, app] = await Promise.all([
    source('../src/intro/SigilCloud.js'), source('../src/core/App.js')
  ]);
  assert.match(cloud, /if \(ink <= RASTER \* 2\) return null;/);
  // And the caller treats that as "no sigil", not as "sigil at zero size".
  assert.match(app, /if \(!this\.sigil\.setGlyph\(meta\.glyph\)\) \{[\s\S]{0,260}this\.sigil\.set\(0, 0\);/);
});

test('the opening holds the chrome back, but never because it failed to start', async () => {
  const [stage, css] = await Promise.all([
    source('../app/GrimoireStage.tsx'), source('../app/grimoire-stage.css')
  ]);

  // Starts false and is only ever raised by hearing from the director, so a
  // page whose renderer never loads shows its interface rather than a black
  // rectangle.
  assert.match(stage, /const \[openingHolds, setOpeningHolds\] = useState\(false\);/);
  assert.match(stage, /setOpeningHolds\(!detail\.finished\);/);
  assert.match(stage, /openingHolds \? 'is-opening' : ''/);
  assert.match(css, /\.grimoire-stage\.is-opening :is\([^)]*\.stage-hud[^)]*\)/);
  // The skip button is exempt: it is the way out of the thing doing the holding.
  assert.doesNotMatch(css, /\.grimoire-stage\.is-opening :is\([^)]*intro__skip/);
});

test('the load reports to the sigil as well as to the words', async () => {
  const [app, director] = await Promise.all([
    source('../src/core/App.js'), source('../src/intro/IntroDirector.js')
  ]);
  // The progress bar is not a bar beside the picture; it is the picture.
  assert.match(app, /this\.loading\.setProgress\(ratio, message\);\s*\n\s*this\.intro\.onProgress\(ratio\);/);
  assert.match(director, /onProgress\(ratio\) \{/);
  assert.match(director, /this\.ctx\.sigil\?\.set\(/);
  // And it lets go however the opening ends, including a skip out of `dark`.
  const finish = director.slice(director.indexOf('  _finish() {'));
  assert.match(finish.slice(0, 400), /this\.ctx\.sigil\?\.set\(0, 0\);/);
});

test('the element the stage opens on is not announced as a choice', async () => {
  const app = await source('../src/core/App.js');
  // It used to put a toast over the opening saying the stage had chosen the
  // element it always starts on.
  assert.match(app, /selectElement\(element, \{ announce = true \} = \{\}\) \{/);
  // `[\s\S]` rather than `[^)]`: the argument itself contains parentheses.
  assert.match(app, /this\.selectElement\([\s\S]{0,90}\{ announce: false \}\)/);
});
