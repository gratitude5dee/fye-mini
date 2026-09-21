# update.md — The Living Grimoire

**Target repository:** `gratitude5dee/fye-mini` · branch `claude/epic-hypatia-eyicbk` · deployed at `avatar.wzrd.tech`
**Audience:** the engineer implementing this directly into the repository.
**Scope:** the intro animation, onboarding, the UI, and the game flow.

---

## 0. How to use this document

Read sections 1 through 4 before touching code. They are the diagnosis and the ground truth, and several
widely-believed things about this codebase turn out to be wrong.

Every factual claim about the repository carries a `file:line`. Claims I could not verify are marked
**UNVERIFIED** rather than smoothed over. Where the reference repositories are quoted, the quotes come from their
actual source, which is cloned and read, not from their READMEs — in two places the READMEs are misleading and
section 4 says how.

Sections 5 through 8 are the four tracks the brief asks for. Section 9 is the shared skeleton they all hang on,
and it must be built first. **Read section 11 before writing any targeting or hand-tracking code** — it lists
twenty-eight hazards that produce working-looking code which is subtly wrong. Section 14 is the phased plan; work
it in order.

| § | Section |
|---|---|
| 1–2 | Executive summary and the thesis |
| 3 | Ground truth about this repository |
| 4 | What the reference repositories actually do, including the portable targeting spec |
| 5 | Track A — the intro animation |
| 6 | Track B — onboarding |
| 7 | Track C — UI and design system |
| 8 | Track D — game flow |
| 9 | Shared architecture |
| 10 | Performance, accessibility, privacy, release |
| 11 | Implementation hazards |
| 12 | Test contract changes |
| 13 | Release blockers |
| 14 | Implementation phases |
| 15 | Out of scope |
| 16 | Appendix — the complete copy deck |

```sh
npm install          # node_modules is NOT in this checkout
npm run dev          # vinext dev on the Cloudflare vite plugin
npm run build        # required before tests: `npm test` runs the build first
npm test             # node --test over tests/*.test.mjs
```

---

## 1. Executive summary

The Living Grimoire is a genuinely good VFX engine wearing a product that gives nobody a reason to stay. A visitor
draws a stroke, a beautiful elemental effect travels it, a caster performs the motion, and then nothing happens and
nothing has changed. There is no goal, no target, no progression, no failure, and no second minute.

The opening makes that worse rather than better. A 2.58 MiB raster montage covers the live WebGL stage at
`z-index: 100` for 7.6 seconds, competing with the 5.66 MiB HDR and 2.27 MiB character rig for bandwidth, while the
real loading progress renders invisibly underneath it.

Four changes:

1. **The intro becomes the product starting.** Delete the montage. The opening is four real casts from the real
   ability system with the real caster, choreographed against the real load milestones, ending with the player's
   hand on the controls.
2. **Onboarding teaches by doing.** A ghost sigil the player traces, four lines of text in total, progressive
   disclosure of the dock, and a hand-tracking trust ladder that never asks for a camera before the player has
   already succeeded without one.
3. **The UI becomes one system.** One token set instead of the two that ship today, one HUD owner instead of the
   split that leaves half of `src/ui/HUD.js` inert, a dock with real slot grammar, and world-space targeting
   indicators ported from the reference repositories.
4. **The game becomes the drawn shape.** The Grimoire shows a sigil; you trace it; the truer your line, the more
   completely the element answers. Scoring is fidelity, not damage — a curve-to-curve comparison at release that
   needs no physics and no collision system, on a polyline the code already computes and throws away.

### Three things found on the way that should be fixed regardless

Verifying the claims in this document surfaced live defects that have nothing to do with the four tracks. They are
detailed in §11 with evidence.

- **The Cast button on the stage does nothing.** Its container is `pointer-events: none` and it is the one child
  that never opts back in. The primary call to action on `avatar.wzrd.tech` is not clickable.
- **For up to 920 ms after the loading screen fades, that same button reads "Waking"** and is disabled, because
  the reveal and the readiness event are driven by two unrelated timers.
- **A thumbs-up selects Stone**, because the fist test ignores a thumb value computed on the line above it.

None of the three is more than a few lines to fix.

---

## 2. The thesis

**Do not turn fye-mini into a third copy of the reference sandboxes.**

Both reference repositories are aim-and-click skillshot ranges. Their verb is *aim*, which is a decision about
**where**. fye-mini's verb is *draw*, which is a decision about **shape**. Shape is a far richer skill surface, it
is the only thing in this lineage nobody has built a game on, and it is already 90% implemented: `PathDrawer`
produces a 320-point arc-length-uniform polyline on every stroke and discards it after one use
(`src/input/PathDrawer.js:_rebuild`).

There is a sharper version of this. `LinearAbiltyCastingExtendedThreeJS` contains a directory called
`src/archive/` holding `FireAbility.js`, `WaterAbility.js`, `EarthAbility.js`, `WindAbility.js`, `PathDrawer.js`,
`PathTrail.js`, `AirScooter.js`, `WalkController.js` and `ProceduralGeometry.js` — **fye-mini's own code, retired
upstream as "the previous four-element bending sandbox"**. fye-mini is that archive, kept alive and given a
caster. Upstream moved to straight-line casts and threw the curves away. The curve is the asset.

So: take the reference repositories' **legibility** — the unified cast event, the two aim indicators, the hit
test, the contextual gesture guide, the cancel affordance, the slot grammar — and invent the loop ourselves.
Neither of them has one.

---

## 3. Ground truth

Verified by reading the tree at `2408e9c` on 2026-09-21. Do not re-derive these.

### Deployment reality
- `vite.config.js` registers `cloudflare({ config: { main: './worker/index.ts', compatibility_flags: ['nodejs_compat'] } })`.
  `worker/index.ts` re-exports `vinext/server/app-router-entry`. So the artifact is a **Cloudflare Worker running the
  vinext App Router**, not a pure static folder. `build/sites-vite-plugin.js` only copies `.openai/hosting.json` into
  `dist/.openai/` after the bundle closes. README's "static Sites-ready bundle" is a simplification.
- Consequence: server code is *technically* possible, but `tests/caster-first-contract.test.mjs` asserts
  `app/api/casts/route.ts` and `gateway/server.mjs` do NOT exist, and that `fetch(` appears in neither
  `app/GrimoireStage.tsx` nor `src/core/App.js`. Commit 93a438e deliberately deleted 12 API routes, a MongoDB
  bootstrap, a Docker gateway, and the Spellwright AI endpoint. Local-first is a product decision, not an accident.
  Do not reintroduce a server.

### The stage is DARK
`settings.environment.backgroundColor` and `fogColor` are both `#14181d`, `fogNear: 10`, `fogFar: 38`,
`ambientIntensity: 0.12`, `envIntensity: 0.3`. `Environment.loadEnvironment()` uses the HDR **only** as a PMREM probe
and an equirect source for fake water reflections — it explicitly does not replace the backdrop
(`src/world/Environment.js:146` "Load an equirectangular probe without replacing the stage backdrop").
Any UI contrast reasoning must assume a near-black stage with bright VFX, not a sunlit sky.

### Ability lifecycle (src/abilities/Ability.js)
- `AbilityPhase = { IDLE, TRAVEL, IMPACT, FADE, DONE }` is exported.
- `spawn(curve)` only calls `curve.getLength()`, `curve.getPointAt(t, out)` and `curve.getTangentAt(t, out)`.
  **Any THREE.Curve satisfies this.** `LineCurve3` works. A 2-point `CatmullRomCurve3` works.
  => line casts and far casts need NO change to the ability layer.
- Per frame while travelling the base updates `this.position`, `this.previousPosition`, `this.tangent`,
  `this.velocity`, `this.u` (0..1 arc-length progress), `this.age`, and a 64-point `trailPoints` window.
  => `ability.position` is the per-frame world point a hit test would sample. It already exists.
- `_beginImpact()` calls `this.ctx.onAbilityImpact?.(this)` — **it passes the ability instance**.
  `App._onAbilityImpact()` currently ignores the argument (`src/core/App.js:189`). Free hook for impact-radius damage.
- `pathHeight(u)` lets an element fly above the drawn ground path; `_tiltTangent` pitches the tangent to match.
- Subclass hooks: `createShaders`, `createParticles`, `onSpawn`, `onTravel(dt)`, `onImpact`, `onFade(dt,t)`, `onDestroy`.
- `impactDuration` 1.1s, `fadeDuration` 1.2s by default.
- Travel has a hard timeout: `age > config.lifetime * settings.global.lifetime * 4` forces impact.

### AbilityManager (src/abilities/AbilityManager.js)
- `MAX_CONCURRENT = 8`; oldest is retired when exceeded. Per-element `ObjectPool`.
- `cast(curve, element = this.selected)` returns the ability or null.
- `get focus()` returns the newest still-active ability; `App.frame()` feeds it to `rig.lookAt`.
- `warm()` constructs one of each before `renderer.compileAsync`.

### Camera (src/core/CameraRig.js)
- `OrbitControls` with LEFT button disabled (left is reserved for drawing), RIGHT = rotate, `enableZoom: false`.
  Wheel writes `settings.camera.distance` directly so the editor slider stays the single source of truth.
- `lookAt(point, weight)` raises `focusWeight`; `update(dt)` blends `controls.target` between the anchor and the
  focus by `clamp(focusWeight * camera.autoFrame, 0, 0.85)` then damps `focusWeight` toward 0.
- Distance is force-resolved every frame: `camera.position = target + dir * damp(distance -> settings.camera.distance)`.
  => An intro director cannot just set `camera.position`; it must drive `settings.camera.distance`,
  `controls.target` / `setAnchor`, and the polar angles, or temporarily take ownership of `rig.update`.
- Defaults: `distance 11.5`, `fov 46`, `targetHeight 1.35`, `minPolar 0.35`, `maxPolar 1.32`, `autoFrame 0.35`.

### Post pipeline (src/postprocessing/PostProcessing.js)
Order: `RenderPass` -> `DistortionShader` (half-res target) -> `UnrealBloomPass` -> `OutputPass` ->
`GradeShader` (`renderToScreen = true`).
`GradeShader` uniforms available for an intro: `uTime, uAberration, uVignette, uContrast, uSaturation,
uTemperature, uLift, uGain, uGrain, uFlashColor, uFlashStrength`. A depth prepass renders to a half-res
`RGBADepthPacking` target. Depth and distortion buffers are both half resolution.
`ScreenFlash.trigger(color, strength, decay)` is the only writer of `uFlashColor`/`uFlashStrength` and it
refuses a weaker flash than the current one (`if (scaled <= this.strength) return`).

### Ground decals (src/effects/GroundDecals.js)
`DecalType = { SCORCH: 0, RIPPLE: 1, CRACK: 2, SHOCKWAVE: 3, DUSTRING: 4, FOAM: 5 }`, each a pooled
`PlaneGeometry` + `ShaderMaterial` with `#if DECAL == n` branches, `uAge` normalised lifetime, `uColorA/uColorB`,
`uIntensity`, `uWidth`. => aim rings, target markers and hit rings should reuse this pool, not add meshes.

### Layers (src/core/Layers.js)
`WORLD: 0, VFX: 1, DISTORTION: 2, CONTACT: 3`. `setLayerRecursive(object, layer)` exists.
The camera enables `LAYER.VFX` explicitly; new world-space UI must pick a layer deliberately or it will be
invisible / will leak into the distortion pass.

### Input chain
`pointerdown` (only `event.target === canvas`, only `button === 0`) -> `InputManager.emit('draw:start', ndc)`
-> `App` sets caster gesture `gather` and calls `PathDrawer.begin` -> raycast onto `Plane(0,1,0)` at y=0
-> exponential smoothing (`settings.input.smoothing 0.35`) -> sample gate (`minPointDistance 0.22`, `maxPoints 220`)
-> `CatmullRomCurve3` (`curveTension 0.5`) -> arc-length resample into a preallocated 320-`Vector3` buffer at
`samplesPerUnit 3.0` -> `PathTrail.setPoints` -> on `end`, if `samples.length >= 3 && length >= minPathLength 1.6`,
`emit('cast', curve, resampled, count, length)` -> `App` sets `release`, calls `abilities.cast(curve)`,
dispatches `grimoire:cast-complete`.
**A stroke shorter than 1.6 world units is silently discarded with no feedback whatsoever.** `PathDrawer` emits
three events — `start`, `cast` and `cancel` — and `App` listens to **only `cast`** (`src/core/App.js:124`). So:
- `cancel` (too short, or fewer than three samples) produces nothing at all. No toast, no trail flourish, no sound.
- `start` is also unlistened, and it is the event that fires when the pointer *successfully* projects onto the
  ground. It is the natural, free hook for ghost-sigil feedback.
- Because `App` sets the caster's `gather` pose from `InputManager`'s `draw:start` (`:110-112`) rather than from
  `PathDrawer`'s `start`, **a pointer-down above the horizon makes the caster gather for a stroke that never
  begins** — `PathDrawer.begin()` returns early when the raycast misses the ground plane.

### HandInput (src/input/HandInput.js)
- MediaPipe `HandLandmarker`, `numHands: 1`, `runningMode: 'VIDEO'`, GPU delegate with CPU fallback.
  WASM from `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`, model from
  `storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`.
  **Note the version skew: package.json pins `^0.10.22-rc.20250304` but the WASM URL hardcodes `0.10.35`.**
- Pointer = index fingertip (landmark 8), mirrored (`1 - x`), inset by `INSET 0.15` on each edge then remapped to NDC.
- One-Euro filter: `minCutoff 1.2, beta 0.02, dCutoff 1.0`.
- Pinch: `distance(4,8) / distance(0,9)`; down at `< 0.32`, up at `> 0.48` (hysteresis). Maps to `draw:start`/`draw:end`.
- Poses (only evaluated while NOT drawing), 450ms hold: no fingers extended -> earth; thumb + all four -> wind;
  index+middle only -> water; index+pinky only -> fire.
- Dock dwell: `document.elementFromPoint` -> `closest('[data-element]')`, 400ms. **This couples the engine to DOM
  markup — any dock redesign must keep `data-element` on the hit target.**
- Watchdog: every 3s, if measured fps < 15 it calls `stop()` and reports `'fallback'`.
- Dropout grace 120ms before force-ending a stroke.
- Renders its own `.hand-mirror` div appended to `document.body` with video + landmark canvas + ring + label.
- `_setAccent` maps element -> colour and is driven by the `grimoire:selected` event.

### CasterPerformance (src/animation/CasterPerformance.js)
- Exactly five gestures: `idle, gather, aim, release, recovery` (a `Set` rejects anything else and falls back to idle).
- 12 Mixamo joints, additive quaternions over the captured rest pose. No animation clips.
- `release` auto-advances to `recovery` at t > 0.28s; `recovery` -> `idle` at t > 0.78s.
- `update(dt, isRiding)` returns early while riding.
- `tests/caster-first-contract.test.mjs` asserts each of the five names appears as a quoted literal.
  **Adding gestures is safe; renaming or removing one breaks the test.**
- **`setGesture(gesture, { element, intensity })` accepts an `intensity` that nothing ever passes.** All seven call
  sites in `src/core/App.js` (`:110`, `:114`, `:118`, `:127`, `:132`, `:191`, `:197`) pass only `{ element }`.
  `CasterPerformance` clamps it to `[0.35, 1.6]` and multiplies it into `strength`, which scales **every one of the
  eight arm and hand joints**. That is a finished, clamped, per-cast power channel for the caster's body language,
  wired end to end and never used. §8's trace fidelity should drive it: a true sigil makes the caster commit, a
  sloppy one makes them hesitate, with no new animation code at all.

### Dead / dormant code (verified by grep, not assumed)
- `src/ui/HUD.js` queries `.element-card`, `.mode-card`, `[data-stat="fps|particles|calls|abilities"]`, `.hud__help`,
  `[data-blurb]`, `.hud__elements`. React renders only `<div id="hud" className="hud" aria-live="polite" />` with no
  children. Therefore `setElement`, `setMode`, `toggleHelp` and the entire stats readout are **inert**; only
  `showToast` works, because `root.innerHTML` writes the toast node itself.
- **Two competing stylesheets ship at once, and one of them is load-bearing.** `app/globals.css:1` does
  `@import '../src/ui/styles.css'` — 437 lines of a "standalone UI shell" with its own token set (`--ui-bg`,
  `--ui-bg-solid`, `--ui-border`, `--ui-text`, `--ui-text-dim`, `--ui-accent`). Its `.element-card`,
  `.mode-card` and `.hud__elements` / `.hud__modes` / `.hud__stats` / `.hud__help` rules style markup React
  never renders, so those are dead. **But `.loader`, `.loader__inner`, `.loader__sigil`, `.loader__title`,
  `.loader__bar`, `.loader__status`, `.sigil`, `.sigil--fire|water|earth|air` and `.lil-gui` are live** — React
  renders every one of those classes, and `app/grimoire-stage.css` contains **zero** references to `loader` or
  `sigil`. **Deleting `src/ui/styles.css` would leave the loading screen and the editor completely unstyled.**
  Split it, do not delete it.
- `src/ui/glyphs.js` — **no importers anywhere.** Dead.
- `src/world/ContactShadows.js` — **no importers anywhere.** Dead, even though `src/core/Layers.js` documents a
  `CONTACT` layer for it and `settings.environment.contactShadow` (0.55) exists.
- **`src/animation/SittingPose.js` is live, not dormant — do not delete it.** `CharacterController:118`
  constructs it and `:119` takes the rig's `forwardAxis` from `this.sitting.forward`, so it is load-bearing even
  when nobody is riding. `WalkController:203` then calls `setPose('sitting', …)` for the ride itself. It is the
  ride pose and the forward-axis source, and 451 lines of it run on every boot.
- Reachable but unsurfaced: `src/ui/PresetManager.js` (used by `Editor`), `src/effects/AirScooter.js` (used by
  `WalkController`). `src/materials/DistortionMaterial.js` is live in fire, water and wind abilities.
- `public/intro/{fire,water,earth,wind}-fallback.svg` (4 KB each) are referenced nowhere.
- `App._handleAction` has cases only for `nextElement`, `prevElement`, `toggleEditor`, `clear`, `togglePause`.
  `InputManager` also emits `toggleHelp` (H), `togglePose` (T) and `toggleMode` (M), which fall through to
  `default: break`. **Three advertised keys do nothing.**

### Asset weight
| File | Size |
|---|---|
| `public/hdri/spruit_sunrise.hdr` | 5.66 MiB |
| `public/intro/elemental-montage.png` | 2.58 MiB |
| `public/og.png` | 2.50 MiB |
| `public/models/Standing Idle.fbx` | 2.27 MiB |
| `public/angtexture.png` | 12 KiB |
| `output/imagegen/elemental-montage-source.png` | 2.58 MiB (in-repo, not shipped) |
| **`public/` total** | **13.02 MiB** |
The HDR and the FBX block first paint (`App.load` awaits both). The montage PNG is fetched for the intro overlay.

### Test contract (tests/caster-first-contract.test.mjs) — every assertion, restated
1. `src/core/App.js` mentions `AssetLoader`, `CharacterController`, `WalkController`, `CasterPerformance`,
   `spruit_sunrise.hdr`, `this.character.update(dt)`, `this.walk?.update(dt)`.
2. `src/animation/CharacterController.js` mentions `Standing Idle.fbx`.
3. `src/animation/CasterPerformance.js` contains all five quoted gesture names and `setGesture(`.
4. `build/sites-vite-plugin.js` must NOT mention the FBX or the HDR.
5. `src/input/HandInput.js` contains `getUserMedia`, `delegate: 'GPU'`, `delegate: 'CPU'`, `_createMirror`,
   `HAND_CONNECTIONS`, `getTracks().forEach`, and the copy `Camera permission or hand tracking was unavailable`.
6. `app/GrimoireStage.tsx` contains `emit('grimoire:attune')`, `Mobile never requests your camera`,
   `Hold an open palm until the ring fills`, `Skip intro`, `local-preferences`, and `elemental-montage.png`;
   and must NOT contain `fetch(`.
7. `app/grimoire-stage.css` contains `prefers-reduced-motion`.
8. `package.json` must NOT contain `mongodb`; `app/layout.tsx` must NOT contain `next/headers` or `generateMetadata`.
9. `public/intro/elemental-montage.png` and `output/imagegen/elemental-montage-source.png` must both exist on disk.
10. `app/api/casts/route.ts` and `gateway/server.mjs` must NOT exist.
**Only #6's `elemental-montage.png` clause and #9 stand in the way of replacing the intro. Both are in our control.**

### The spell contract is mostly dead code
`src/config/spell-contract.js` is 205 lines. Grep across `src/`, `app/` and `tests/` shows only **three** of its
exports have a live consumer:
- `RANGES` — `src/ui/Editor.js:61` (`RANGES[\`${spellBlock}.${key}\`]`) and `src/core/App.js:168`.
- `SPELLWRIGHT_COLOR_PATHS` — `src/core/App.js:169`.
- `enginePath` — `src/core/App.js:171`.

`validateSpellSettings`, `snapshotSpellSettings`, `validateSpellwrightPatch`, `deriveGenome`,
`spellSettingsBsonSchema`, `SPELL_SETTING_BLOCKS`, `SPELL_ELEMENTS` and `SPELLWRIGHT_PATHS` have **zero live
callers** — they are residue from the MongoDB/API era deleted in commit 93a438e.

Consequences for this update:
- Adding a new leaf to `settings.fire/water/earth/wind` does **not** break any runtime validation. The only cost of
  omitting a `RANGES` entry is that `App._applyFlatPatch` will silently refuse to patch that path
  (`if (!range && !isColor) continue;`) and `Editor` will fall back to its own bounds.
- `EXACT_SPELL_RANGES` is keyed by **public** paths, so the wind block's entries are `air.speed`, `air.glow`, …
  while `settings.js` declares them under `wind:`. `enginePath()` bridges the two. Any new element key must be
  registered as `air.<key>`, never `wind.<key>`.
- `deriveGenome()` (pace / mass / chaos / radiance / menace) is fully written, correct, and unused. It is the
  cheapest interesting thing the Workshop could surface.

### Sharp edge: game tuning must not live in the element blocks
Element blocks are what a shared/preset "spell" writes (`HOUSE_SEED_SPELLS[].settingsPatch` targets
`fire.*`, `water.*`, `earth.*`, `air.*`, `global.*`). Putting cooldowns, scores or difficulty values there would let
a cosmetic preset rewrite game balance. Put presentation-affecting values (`range`, `minRange`) in the element
blocks with `RANGES` entries, and put every game-rule value in a **new top-level `settings.rite` block** that no
preset patch path can reach.

---

## 4. What the reference repositories actually do

Both repos are by the same author as fye-mini's upstream (`AvatarCastingAbilitiesThreeJS`) and share one house
architecture with fye-mini: `settings.js` as the single source of truth, an `Ability` base with
`createShaders / createParticles / onTravel / onImpact / onFade`, per-type pooling, `LightPool` parking lights at
zero intensity instead of add/remove, `renderer.compileAsync()` at boot, a depth prepass -> distortion -> bloom ->
tone map -> grade composer, and `Editor` + `PresetManager` + `glyphs.js` in `src/ui`. fye-mini already has all of it.
**Five files in `LinearAbilty...`'s `src/effects/` are byte-siblings of fye-mini's own** (`BurstSphere`, `CameraShake`,
`GroundDecals`, `LightPool`, `ScreenFlash`). We are not importing a foreign architecture; we are re-joining a fork.

### The single most important thing to take: one cast event for every cast shape

`src/input/AimController.js` (in both repos) is `class AimController extends EventEmitter`.

```js
constructor(camera) {
  super();
  this.camera = camera;
  this.raycaster = new Raycaster();
  this.raycaster.far = 500;          // identical to fye-mini's PathDrawer
  this.indicator = new AimIndicator();   // line cast: arrow
  this.zone = new ZoneIndicator();       // far cast: circle
  this.group = new Group();
  // origin, direction, distance, yaw, valid, reveal, armed
}
```

Public API: `setOrigin(position)`, `arm()`, `cancel()`, `toggle()`, `point(pointerNDC)`, `confirm() -> boolean`,
`update(dt)`, `setElement(element)`. Events: `'arm'`, `'cancel'`, and

```js
this.emit('cast', this.origin, this.direction, this.distance);
```

emitted only when `confirm()` succeeds on a valid aim. Distance is clamped to
`[Math.max(0.2, cfg.minRange), Math.max(0.4, cfg.range)]`. The zone shape is selected by `CastShape.ZONE`.

**Important correction, from the real source rather than the README.** In `LinearAbilty...`, `Ability.spawn` was
*rewritten* to take the triple directly:

```js
// linear/src/abilities/Ability.js:173
spawn(origin, direction, distance) {
  this.origin.set(origin.x, 0, origin.z);
  this.direction.copy(direction).setY(0).normalize();
  this.side.crossVectors(this.direction, _up).normalize();
  this.length = Math.max(0.1, distance);
  ...
}

/** A point on the cast line. `s` is 0..1 along it. */
pointAt(s, out) { return out.copy(this.origin).addScaledVector(this.direction, s * this.length); }
```

**They gave up curves entirely.** Every cast in that repo is a straight line. The README's "requiring no changes to
`Ability`, `AbilityManager`, or `App`" is about adding *zone* casting on top of *line* casting — not about adding
line casting to a curve-based engine.

**fye-mini is in the stronger position, and this is worth saying plainly.** It kept the general form:
`spawn(curve)` calls only `curve.getLength()`, `getPointAt(t, out)` and `getTangentAt(t, out)`
(`src/abilities/Ability.js:129-152`). A `THREE.LineCurve3` satisfies all three. So fye-mini can add line casts and
far casts **without touching `Ability`, `AbilityManager` or the four element files** — and it keeps drawn curves,
which the reference repo can no longer do. Add a curve adapter, not a second spawn path:

```js
/** Build the curve a line or zone cast flies along, from the shared cast triple. */
export function curveFromAim(origin, direction, distance) {
  return new LineCurve3(origin.clone(), origin.clone().addScaledVector(direction, distance));
}
```
A zone cast reads its centre as `curve.getPointAt(1)` and works outward, exactly as the reference does.

### The indicators, precisely

**`src/effects/AimIndicator.js` (line cast).** One ground quad; the entire arrow is a single signed distance field
in the fragment shader. Outline, chevrons, noise and the range-cap arc are all derived from that one distance.
**The shaft stays 0.42 m wide regardless of cast distance** — it does not scale with range, so a long cast does not
read as a fat cast.

**`src/effects/ZoneIndicator.js` (far cast).** Two parts: a footprint quad whose fragment shader remaps UV into
*metres from the target* so the boundary stays **0.34 m thick at any radius**, plus a reach ring built from the
ribbon strip bent into a circle. On arm it "snaps out past its radius and settles back", so it reads as an
intentional player action rather than a UI overlay appearing.

Both are ground-projected world-space shader quads. fye-mini already has the exact machinery: `GroundDecals.js`
pools `PlaneGeometry` + `ShaderMaterial` quads with `uAge/uIntensity/uWidth/uColorA/uColorB` and a `#if DECAL == n`
branch table, and `RibbonGeometry.build(points, {count, width, mode, widthProfile})` will bend a strip into a ring.

### Settings convention we are missing

The reference ability blocks carry `range`, `minRange`, `speed` and `cooldown` keyed by element id. fye-mini's
element blocks have `speed` and `lifetime` but **no `range`, `minRange` or `cooldown`**. Those three keys must be
added to `settings.fire/water/earth/wind`, to `EXACT_SPELL_RANGES`, and to the `SPELL_SETTING_BLOCKS` snapshot, or
`validateSpellSettings` will report them as "not a spell setting" and `App._applyFlatPatch` will silently drop them.

### The gesture guide — the best onboarding artifact in either repo

`src/ui/gestures.js` (HandCast). Not a static legend: a **contextual, live-highlighting guide keyed off tracker state.**

- `GESTURE_GLYPHS` maps glyph names to inline SVG. Eight glyphs: `wake` (open palm with timer ring), `aim` (palm
  flanked by chevrons), `cast` (fist with impact ticks), `hold` (fist in dashed ring), `next`/`prev` (pointing hand,
  mirrored), `drive` (palm with four-direction chevrons), `lower` (palm above a downward arrow).
- `gestureGuide(element, options)` returns `{ kind, rows }`, and **the rows change with the armed ability type** —
  line cast, zone cast, summon-idle and summon-deployed each get a different set.
- Each row is `{ icons: [glyphName], name: 'Close a fist', does: '<what it will do>', live: 'grab', hand?: 'other' }`.
- `live` is the tracker state that lights that row: **`wake | aim | grab | point | lost`**.
- `gestureTitle()` returns `{ label, key, accent }` from the ability metadata.

The README describes the felt behaviour: the panel shows "a tile per pose the tracker reads — open palm, moving
palm, fist, point, lowered hand", it "updates when changing ability slots" and it "lights the tile of the gesture
being read."

Two things fye-mini lacks and must copy:
1. **A `lost` state as a first-class row.** fye-mini's `HandInput` has a dropout path but no neutral/lowered pose and
   no way to tell the player "I can see you, you are simply not posing" versus "I cannot see you."
2. **Guide content that changes with what is armed.** A legend that always says the same four things is a manual.
   A panel that lights the row you are currently performing is a mirror, and a mirror teaches.

### Controls worth stealing outright

| Reference binding | fye-mini today |
|---|---|
| Right click / **Esc** cancels an armed cast | **No cancel exists at all.** A started stroke can only be completed or dropped below `minPathLength`, silently. |
| **M** toggles camera/hand mode | `M` emits `toggleMode`, which `App._handleAction` has no case for. Dead. |
| **P** pauses, editor stays live | Works. |
| **G** toggles the editor | Works. |
| **C** clears effects | Works. |
| **T** resets dummies | `T` emits `togglePose`, no case. Dead. |
| Q-Z / 1-9 arm ability slots | 1-4 select elements, Q/E cycle. No arming concept. |

### Hit detection: they solved it, and the solution ports directly

`linear/src/combat/` is 2,658 lines across `Dummy.js`, `DummyField.js` and `Ragdoll.js` — a real hit system with a
ragdoll solver that cuts bodies in half along a plane. `DummyField.applyHits(abilities)` is the part to copy, and
its own doc comment states the principle:

> "Nothing was added to any ability. `applyHits` reads the two things every cast already publishes — the line it is
> travelling down and how far along it the front has got (`Ability#origin`, `#position`, `#u`) — and turns them
> into a volume."

The rules, verbatim from the source:
- Called **after** the abilities are stepped, so the volume tested is the one that was just drawn.
- **Stateless.** "A body is either alive and inside the shape, or it is already down and `Dummy#kill` says no."
  Kills are idempotent, so re-testing ground the cast already covered is free.
- **Line cast**: `closestOnSegment(ability.origin, ability.position, target.position, out)`, then a **2D (x,z)
  squared-distance** test against `(hit.radius + bodyRadius)²`. The whole swept length is tested, not just the tip,
  "so a front that crosses three metres in one frame cannot step over a body".
- **Zone cast**: gated on `ability.u >= 1` — "the crown lands when the front reaches the point, not on the way" —
  then `pointAt(1)` and a disc test.
- An ability may set `handlesOwnHits` to opt out: "a cast that aims for itself is not a volume".
- Throw direction is the cast's own direction; a body exactly on the centre takes the cast's direction rather than
  a zero vector.

**Porting it to fye-mini's curved paths is a one-line change of which segment is tested.** In a straight-line world
`origin → position` *is* the frame's swept segment. In fye-mini's curved world the analogue is
`previousPosition → position`, both of which `Ability` already maintains every frame
(`src/abilities/Ability.js:182-190`). One segment per active ability against eight targets is **64 squared
distances per frame at `MAX_CONCURRENT`** — free, and with no allocation if the target positions live in one flat
array.

### But there is still no game

`applyHits` is hit detection, not a game. The source says so itself: **"One hit is a kill. This is a test range,
not a fight: `hit.impulse`, `lift` and `spin` are the whole of the damage model, and they are there to be dragged
around in the editor until a body flies the way the spell reads."** The dummies exist "to make an ability's *reach*
visible" — they are a measuring instrument for VFX tuning.

In the sibling repo the equivalent surface is `src/ui/TargetBoxes.js`, a heads-up display for a summoned drone's
detector: it projects a target cylinder to screen space and draws brackets with a range readout, a lock percentage
and states `detected | locking | firing | down`, with track numbers cycling `TGT-01`..`TGT-99`. It holds no health,
no score and no reset logic.

**Neither reference repo has a core loop, a session, progression, scoring, or a failure state.** They are
instrument panels for VFX, and superbly built ones. Take their *mechanisms* — the unified cast event, the two
indicators, `applyHits`, the contextual gesture guide, the cancel affordance, the slot grammar — and invent the
loop ourselves. The loop is the part nobody upstream has built.

### One more thing the clone reveals
`linear/src/archive/` contains `EarthAbility.js`, `FireAbility.js`, `WaterAbility.js`, `WindAbility.js`,
`PathDrawer.js`, `PathTrail.js`, `AirScooter.js`, `WalkController.js`, `ProceduralGeometry.js` and every element
material — **fye-mini's own code, retired upstream as "the previous four-element bending sandbox"**. fye-mini is
that archive, kept alive and given a caster. That is not a weakness: the drawn path is the thing upstream threw
away, and it is the only verb in this lineage nobody has built a game on.

---

### 4.1 The portable targeting spec

#### The contract to add to fye-mini's settings

```js
export const CastShape = Object.freeze({ LINE: 'line', ZONE: 'zone' });
export function castShapeOf(element) { return ELEMENT_META[element]?.cast ?? CastShape.LINE; }
export function zoneRadiusOf(element) {
  return castShapeOf(element) === CastShape.ZONE ? (settings[element]?.zoneRadius ?? 0) : 0;
}
```
Plus per-element `range`, `minRange` and (for zone shapes) `zoneRadius`, and `cast: CastShape.ZONE` on the
relevant `ELEMENT_META` entries. fye-mini's `ELEMENT_META` already exists in `src/config/settings.js:570`.

#### `settings.aim` — the line-cast arrow (verbatim values)
| Key | Value | Note |
|---|---|---|
| `shaftWidth` | 0.42 | **half-width in metres, constant at any cast distance** |
| `headLength` / `headWidth` | 2.6 / 1.35 | arrowhead |
| `round` | 0.12 | corner rounding of the whole silhouette |
| `startOffset` | 0.9 | gap between the caster and the arrow's tail |
| `edge` / `edgeGlow` / `softness` | 0.09 / 2.6 / 0.06 | outline thickness in metres, bloom, feather |
| `fill` / `fillFalloff` / `opacity` | 0.3 / 1.1 / 1.0 | interior wash |
| `stripes` / `stripeSharp` / `stripeDepth` | 0.55 / 0.62 / 0.55 | chevrons per metre, hardness, modulation |
| `scrollSpeed` | 2.4 | metres/second toward the tip |
| `pulse` / `pulseSpeed` | 0.28 / 2.2 | brightness breathing |
| `noise` / `noiseScale` / `noiseSpeed` | 0.45 / 1.6 / 0.35 | break-up eating into the fill |
| `crystals` / `crystalScale` | 0.55 / 2.4 | voronoi frost plates |
| `baseRing` / `baseRingWidth` | 0.62 / 0.06 | ring at the caster's feet, metres |
| `tipGlyph` / `tipGlyphSize` / `tipSpin` | 0.9 / 1.15 / 0.45 | rosette at the impact point |
| `rangeArc` | 0.55 | brightness of the max-range cap |
| **`reveal`** | **0.055 s** | sweep-out time when armed |
| `colorCore` / `colorEdge` / `colorInvalid` | `#ecfbff` / `#3fb4ff` / **`#ff6a5c`** | invalid = inside `minRange` |
| `height` | 0.035 | hover above the floor (fye-mini's `trail.height` is 0.07 — keep the arrow lower) |

The whole arrow is **one signed distance field in one ground quad**. Outline, chevrons, frost and the range-cap
arc are all derived from that single distance. Do not build it from meshes.

#### `settings.zone` — the far-cast circle (verbatim values)
| Key | Value | Note |
|---|---|---|
| **`boundary`** | **0.34** | thickness of the band that *is* the footprint edge, in metres at any radius |
| `boundaryGlow` | 1.8 | "held under 2: past this it clips to flat white and throws away the hue that says which ability you are holding" |
| `boundaryBias` / `liner` / `softness` | 0.35 / 0.05 / 0.05 | <0.5 grows the band inward |
| `fill` / `fillFalloff` | 0.22 / 1.5 | >1 keeps the middle clear and crowds the wash to the rim |
| `rings` / `ringWidth` / `ringSpeed` | 2.0 / 0.05 / 0.35 | contour rings, radii/second outward |
| `crawl` / `crawlScale` / `crawlSpeed` | 0.75 / 1.3 / 0.45 | interior filaments |
| `noise` / `noiseScale` | 0.4 / 1.2 | break-up |
| `ticks` / `tickLength` / `tickWidth` / `tickSpin` | 24 / 0.42 / 0.2 / 0.06 | marks around the boundary |
| `sweep` / `sweepSpeed` | 0.55 / 0.4 | radar sweep |
| `core` / `coreSize` | 0.85 / 0.4 | the mark at the exact target point |
| `crosshair` / `crosshairLength` | 0.5 / 1.1 | four arms out of the core |
| `pulse` / `pulseSpeed` | 0.22 / 2.0 | breathing |

Two meshes: a **footprint** quad whose fragment shader is a signed-distance ring evaluated in *metres from the
target*, and a **reach ring** — a ribbon strip bent into a circle at the caster's feet at `range`.
fye-mini's `RibbonGeometry.build()` makes the reach ring almost free.

#### `AimController` behaviours worth copying exactly
1. **`_resolve()` runs every frame, not only on pointer move** — "so orbiting the camera with the cast armed swings
   the indicator under a stationary cursor." fye-mini's `PathDrawer` only projects on move; the aim controller must not.
2. **`update(dt)` takes real seconds, never the scaled simulation delta**, so the indicator keeps animating while
   the sandbox is paused. In `App.frame()` the raw tick is `raw`; the scaled one is `dt`. Pass `raw`.
3. **Degenerate aim is held, not snapped.** Behind the caster or directly on top of them keeps the last good
   heading rather than jumping to north.
4. **Four events, not three**: `arm`, `cancel`, **`reject`** (fired by `confirm()` when the target is inside
   `minRange`) and `cast(origin, direction, distance)`. `reject` is what drives the red `colorInvalid` state and is
   the affordance fye-mini most obviously lacks — today an unusable input produces nothing at all.
5. **`get facing()`** returns the yaw the caster should turn to. fye-mini has `CharacterController.setFacing(yaw)`
   (`src/animation/CharacterController.js:235`), but casting never uses it: `App.load()` calls `setFacing(0)` once
   (`src/core/App.js:254`) and only `WalkController` drives it afterwards, during a ride
   (`src/animation/WalkController.js:358`). **The caster never turns to face what they are casting at.**
6. **Clamp with floors**: `MathUtils.clamp(raw, Math.max(0.2, c.minRange), Math.max(0.4, c.range))` — the floors
   stop a mis-tuned settings block from producing a zero-length cast.
7. **One reveal envelope for both shapes**, stepped by `dt / revealTime` and clamped, with only one indicator
   visible at a time; swapping slots mid-reveal hides the other outright rather than leaving it fading in place.

#### The hit test (`DummyField.applyHits`), adapted to curves
```js
/**
 * Resolve what the casts in flight are standing on.
 *
 * Called after the abilities have been stepped, so the volume tested is the one
 * that was just drawn. Stateless: a target is either untouched and inside the
 * shape, or already answered, and answering twice is a no-op.
 */
applyHits(abilities) {
  for (const ability of abilities) {
    if (!ability.isActive || ability.handlesOwnHits) continue;
    if (castShapeOf(ability.element) === CastShape.ZONE) {
      if (ability.u < 1) continue;            // the crown lands at the point, not on the way
      this._hitDisc(ability);
    } else {
      this._hitSweep(ability);                // previousPosition -> position, this frame's swept segment
    }
  }
}
```
The only change from the reference is `_hitLine`'s segment. In a straight-line engine `origin → position` *is* the
swept segment; in fye-mini's curved engine it is `previousPosition → position`, both maintained every frame
(`src/abilities/Ability.js:182-190`). Test in 2D (x, z) against `(radius + targetRadius)²`, exactly as the
reference does. **64 squared distances per frame at `MAX_CONCURRENT` = 8 against 8 targets.**

---

## 5. Track A — The intro animation

### 5.1 Diagnosis

#### What actually happens today, in order

| t | Event | Source |
|---|---|---|
| 0 ms | React mounts `GrimoireStage`. `introVisible` starts `true`, so the overlay paints **before** preferences are read. | `app/GrimoireStage.tsx` initial state |
| ~0 ms | `.intro` paints: `position: fixed; z-index: 100; inset: 0; background: #08090a`. | `app/grimoire-stage.css:24` |
| ~0 ms | The browser begins fetching `/intro/elemental-montage.png` — **2.58 MiB** — for `.intro__art`. | `INTRO_ART` |
| ~0 ms | A second effect dynamic-imports `../src/main.js`, which constructs `App` and calls `app.load()`. | `GrimoireStage.tsx` mount effect |
| ~0 ms | `App.load()` starts `Promise.all([character.load(), assets.loadHDR('/hdri/spruit_sunrise.hdr')])` — **2.27 MiB + 5.66 MiB**. | `src/core/App.js:243` |
| 0–850 ms | Four `.intro__panel::before` clip-path wipes run, staggered 120 ms. | `panel-reveal` |
| 400–880 ms | Four `figcaption` labels fade in. | `intro-label` |
| 0–∞ | `panel-drift` (7.2 s alternating scale/translate) and `panel-sheen` (3.4 s infinite) loop. | CSS |
| ~1 frame later | A third effect reads `localStorage` and calls `setIntroVisible(!preferences.introSeen)`. **A returning visitor sees one frame of the intro, then a hard cut.** | `readPreferences()` effect |
| 7600 ms | `setTimeout` fires `dismissIntro`. Reduced motion: 900 ms. | intro effect |

#### The five problems, ranked

1. **The intro hides the product while the product loads, and competes with it for bandwidth.**
   `#viewport` is `position: fixed; inset: 0` with no `z-index` (`app/grimoire-stage.css:3`); `.intro` sits at
   `z-index: 100` with an opaque `#08090a` background (`:24`). For up to 7.6 s the WebGL stage renders every frame,
   fully composited, and is never seen. Meanwhile the 2.58 MiB montage PNG is fetched in parallel with the 5.66 MiB HDR
   and the 2.27 MiB FBX — the intro makes the load it is covering for measurably slower.

2. **The timer and the load are unrelated.** `AssetLoader.onProgress` drives `LoadingScreen.setProgress` through real
   milestones (0.05 "Calling the caster", ramp to 0.53, 0.62 "Warming the elements", 0.85 "Setting the performance",
   1.0 "Ready"), and the `#loader` element renders all of it — invisibly. Note the exact mechanism, because it
   matters if you reorder anything: **`.loader` is also `z-index: 100`** (`src/ui/styles.css:48-51`), the same as
   `.intro`. They tie, and `.intro` wins only because React renders it *after* the surface `div`. The visitor
   watches a fixed 7600 ms countdown that can finish before the HDR does or long after.

3. **It is a picture of the game, not the game.** The stage can already cast fire, water, earth and wind along a
   scripted curve with a character performing gather → aim → release → recovery. The intro instead shows a raster
   montage of four static figures behind four empty `<figure>` elements whose only content is a CSS wipe.

4. **The reduced-motion path is a 900 ms blink.** Not an alternative — an absence. `prefers-reduced-motion` also
   nukes every animation globally via `animation-duration: .01ms !important`, so the montage simply appears and
   vanishes.

5. **The returning visitor gets a flash of intro then a cut**, because `introVisible` initialises to `true` and is
   corrected one effect later.

**The arithmetic is the argument.** The panel wipes finish at 850 ms, the labels at 880 ms, and nothing after that
is new information — `panel-drift` and `panel-sheen` simply loop. Roughly 2.75 s of content is stretched across
7600 ms, so **about 64 % of the intro's runtime is dead air** laid over a stage that is already rendering.

#### The loader handoff, and the 920 ms the Cast button spends lying

Worth knowing before you rewrite the opening, because the new sequence inherits this seam.

React renders the whole loader tree (`app/GrimoireStage.tsx`), and the engine then reaches in and mutates it by
id from outside React: `LoadingScreen`'s constructor caches `getElementById('loader')`, `'loader-fill'` and
`'loader-status'`, and `setProgress`, `fail` and `hide` write `style.width`, `textContent`, `style.color` and a
class directly (`src/ui/HUD.js`). All of that element's styling lives in the *other* stylesheet,
`src/ui/styles.css`, not in `app/grimoire-stage.css` (§7).

The boot order is three fire-and-forget hops: hydration paints the loader → a `useEffect` does
`void import('../src/main.js')` → `main.js` does `void boot()` → `new App(canvas)` constructs `LoadingScreen` →
`App.load()` walks the five progress stages.

Then the reveal and the readiness signal come apart:

1. `App.load()` calls `this.loading.hide()`, which sets progress to 1 and schedules a detached **220 ms
   `setTimeout`** before adding `.is-hidden`.
2. `.is-hidden` begins a **0.7 s opacity and visibility transition**.
3. Only *after* `load()` returns does `main.js` dispatch `grimoire:ready`, which is what sets `stageReady` in
   React.

So for up to **920 ms** the loader is visibly fading out over a live stage while React still believes the stage is
waking — and the Cast button, which is `disabled={!stageReady}`, reads **"Waking"** the whole time. The first
thing a new visitor sees after the loading screen is a greyed-out primary button. (It is also not clickable once
it enables — §11, hazard 21.)

The new sequence must drive both the visual reveal and `stageReady` from the same signal.

#### What it costs to fix
`public/intro/elemental-montage.png` (2.58 MiB) and `output/imagegen/elemental-montage-source.png` (2.58 MiB)
plus `public/og.png` (2.50 MiB) are 7.66 MiB of raster, 5.08 MiB of it inside a 13.02 MiB `public/`. Replacing the intro with a scripted sequence of
real casts removes 2.58 MiB from the critical path and deletes another 2.58 MiB from the repository. The only blockers are two
lines in `tests/caster-first-contract.test.mjs`: `assert.match(stage, /elemental-montage\.png/)` and the two
`access()` calls. Both are ours to change, and both should be replaced with assertions about the new sequence.

### 5.2 The design

#### Thesis
The intro should not be a thing the player skips before the product starts. It should **be** the product starting.
Every second of it is the real renderer, the real caster and the real abilities, and it ends with the player's hand
already on the controls. The loading bar becomes the ritual, not a thing hidden behind one.

#### The sequence, bound to real load milestones
`App.load()` already publishes honest progress. Bind each beat to a milestone rather than a clock, so the sequence
can never outrun the load or wait on an empty screen. `LoadingScreen.setProgress(ratio, message)` is called at
0.05, then `0.05 + ratio * 0.48` while assets stream, then 0.62, 0.85, 1.0 (`src/core/App.js:241-262`).

| Beat | Gate | Duration | What is on screen |
|---|---|---|---|
| **0 — Dark** | first paint | 0–400 ms | Black. One line of type fades up: *The Living Grimoire*. No canvas yet; nothing is loading that the player can see. |
| **1 — The ground** | HDR + FBX resolved (`progress >= 0.53`) | ~1200 ms | The real canvas fades in from black via `GradeShader.uLift`. Camera high and far (`distance 22`, `polar 0.45`). `DustMotes` already drifting. The caster is a silhouette. |
| **2 — Four answers** | `abilities.warm()` done (`progress >= 0.62`) | 4 × 900 ms | Four scripted casts from the **real** `AbilityManager` along four fixed curves. The **real** `CasterPerformance` runs gather → aim → release → recovery for each. The camera pushes in one step per element. |
| **3 — The wordmark** | `compileAsync` resolved (`progress >= 0.85`) | 900 ms | Title holds over the settled stage, then dissolves. Camera arrives at the play framing (`settings.camera.distance 11.5`, `targetHeight 1.35`). |
| **4 — Hand on the controls** | `progress === 1` | 600 ms | HUD elements stagger in. The first sigil (or, in the sandbox, the ghost stroke) burns into the ground. `IntroDirector` releases the camera. |

Total on a warm cache: ~7.4 s. **Cold**: beats block on their gates, and beat 1 holds a designed "breathing dark"
rather than stalling — the screen is never static and never lies about progress.

#### IntroDirector — owning the camera without fighting the rig
`CameraRig.update()` force-resolves distance every frame from `settings.camera.distance` and blends
`controls.target` toward `this.focus` by `focusWeight * settings.camera.autoFrame`
(`src/core/CameraRig.js:88-120`). An intro cannot set `camera.position` directly — it will be overwritten.

It can, cleanly, drive the same three inputs the rig already resolves:
1. `settings.camera.distance` (the rig damps toward it — that *is* the dolly)
2. `rig.setAnchor(x, 0, z)` (the orbit centre)
3. `rig.controls.minPolarAngle / maxPolarAngle` pinned together to force an exact elevation, plus
   `rig.controls.setAzimuthalAngle()` for the swing.

and it must temporarily zero `settings.camera.autoFrame` so the scripted framing is not dragged toward each
ability head, restoring it at handoff. That keeps `CameraRig` untouched and makes the director removable.

```js
/**
 * Scripts the opening: four real casts, one camera move, one handoff.
 *
 * The director never writes `camera.position`; `CameraRig` re-derives that every
 * frame from `settings.camera.distance` and the orbit target. Driving those two
 * instead means the intro and the player's own orbit use the same path through
 * the rig, so handing control back is a value change, not a mode change.
 */
export class IntroDirector { /* ... */ }
```

#### The four curves
Ground-plane `CatmullRomCurve3`s, each drawn *as a hand would draw it* — no straight lines, no symmetry.
Fire hooks, water sweeps wide, earth drives short and heavy, air spirals. Each cast is issued with
`abilities.cast(curve, element)` — the element argument already exists on `AbilityManager.cast`
(`src/abilities/AbilityManager.js:63`) and the current app never uses it.

#### The title composite
DOM over canvas, not canvas text. `mix-blend-mode: screen` on a `Fraunces` wordmark sitting above `#viewport`,
masked by a `clip-path` wipe that travels in the same direction as the air cast beneath it, so the type and the
VFX share one motion. It dissolves by animating the mask out, never by fading opacity on a blend-mode layer
(which greys against a dark stage).

#### Skip
A skip at any moment must not cut. `IntroDirector.skip()` collapses the remaining beats into a 420 ms tail:
camera damps to the play framing at 4× rate, the title mask completes, in-flight abilities are left to finish
(they are pooled and harmless), the HUD staggers in. The player lands in the same state as a full watch. Skip is
also the reduced-motion path's engine.

#### Reduced motion
Not a 900 ms blink. A designed 2.4 s alternative: no camera move at all (the rig sits at the play framing from the
first frame), no dolly, no sheen; the four elements are introduced as four **still** ground sigils lighting in
sequence at 400 ms intervals, and the wordmark cross-fades rather than wipes. Same information, no vestibular load.

#### Returning visitor
Not nothing, and not the full sequence. A 1.6 s **cold open**: the stage fades up already at the play framing, one
cast of the player's last-used element fires along a short curve, and the HUD arrives. It costs almost nothing, it
confirms the renderer is alive, and it re-establishes the world without taxing a returning player.

#### What happens to the old assets
- `public/intro/elemental-montage.png` (2.58 MiB) — **deleted**. It is 2.58 MiB on the critical path for a picture of a
  thing the renderer can do live.
- `output/imagegen/elemental-montage-source.png` (2.58 MiB) — **deleted** from the repository.
- `public/intro/{fire,water,earth,wind}-fallback.svg` — **deleted**; nothing references them.
- `tests/caster-first-contract.test.mjs`: replace `assert.match(stage, /elemental-montage\.png/)` and the two
  `access()` calls with assertions that `src/intro/IntroDirector.js` exists, that it references all four elements,
  and that `GrimoireStage.tsx` still renders a skip control and honours `prefers-reduced-motion`. The test's intent
  — "the opening is motion-safe, skippable and four-element" — is preserved exactly; only its evidence moves.
- `public/og.png` (2.50 MiB) — out of scope for this track, but flag it: a 2.50 MiB social card is 10× larger than it
  needs to be.

#### Audio: silence, deliberately
Specify no audio. Four reasons, stated so nobody relitigates: autoplay policies make a title sequence with sound
unreliable on first visit; a WebAudio synth good enough for fire/water/earth/air is a week of work for a
non-differentiating feature; the product's trust story is "nothing leaves this tab", and adding an audio surface
adds a permission-shaped thing to explain; and the reduced-motion audience overlaps with an audio-sensitive
audience. If audio is ever added it is one toggle, off by default, and it respects `prefers-reduced-motion`.

#### Acceptance
- With a cold cache and network throttled to Fast 3G, the screen is never static for more than 900 ms and the
  progress the player sees never exceeds the real asset progress.
- Skipping at any point during beats 0–4 lands in exactly the same state as watching to the end, verified by
  comparing `settings.camera.distance`, `rig.controls.target` and HUD visibility.
- With `prefers-reduced-motion: reduce`, the camera's world position is identical on frame 1 and frame 144.
- `public/intro/` is empty and `git ls-files public output | xargs du -ch` drops by ≥5.08 MiB.

#### Two implementation caveats (flagged, not hidden)
1. **`node_modules` is absent from this checkout.** Nothing in this document was verified against the installed
   three.js. `OrbitControls.setAzimuthalAngle()` exists in modern three and is the natural way to swing the intro
   camera, but it must be called **before** `controls.update()` runs inside `CameraRig.update()`, and
   `CameraRig.update()` is called late in `App.frame()` (after `shake.update` and `flash.update`). Verify the method
   exists in `three@0.185.1` and verify the call ordering before relying on it. The fallback needs no OrbitControls
   API at all: drive `settings.camera.minPolar`/`maxPolar` pinned to the same value — `CameraRig.update()` copies
   both into the controls every frame (`src/core/CameraRig.js:95-96`) — and let the rig resolve the rest.
2. **`npm test` runs `npm run build` first** (`package.json`), so every test run is a full vinext + Cloudflare build.
   Expect it to be slow and to need network access for the first `npm install`.

---

## 6. Track B — Onboarding

### Targets
First self-directed successful cast by **15 s** from first paint. First "I did that on purpose" by **45 s**.
Camera never requested before the player has succeeded without it.

### The first sixty seconds
| t | What the player does | What the product does |
|---|---|---|
| 0–7 s | Watches (or skips) | The intro's four casts show what an element looks like before any word explains it (§5) |
| 7 s | — | A ghost sigil burns into the ground: a single shallow arc, ~4 m long. One line of type: **"Trace it."** |
| 7–14 s | Traces | `PathTrail` follows the finger. The ghost brightens where the stroke is close and dims where it is not — the correction is spatial, not textual |
| ~14 s | Releases | Air answers along their line. The nearest Ward stone lights. **First success.** |
| 14–20 s | — | The element dock fades in with the four sigils, air already active. One line: **"Wind answered. There are three more."** |
| 20–35 s | Switches element, traces again | A second ghost, a hook this time, wanting stone. If they trace it with the wrong element it still casts — the stone simply stays dark |
| ~35 s | Releases correctly | Second stone lights. The dock's key hints appear: `1 2 3 4` |
| 35–45 s | Traces freely | No ghost. The Ward holds two lights. **"The Rite is open."** appears with a begin control |
| 45–60 s | Chooses | Either begins the Rite, or ignores it and keeps playing. Both are correct and neither is nagged |

Total instructional text across the whole flow: **four short lines.** If it grows past six, the design is wrong.

### The guided first cast
Reuse, do not rebuild: a second `PathTrail` instance with a dimmer material is the ghost renderer, and
`RibbonGeometry.build(points, { count, width, mode, widthProfile })` already accepts an arbitrary polyline.

- **Tolerance**: 0.75 m for the tutorial arc (generous; it tightens later — §8).
- **Live feedback**: per-sample proximity drives the ghost's per-vertex alpha. Drawing near it makes it glow;
  drifting makes it fade. No text, no counter, no "try again".
- **Retirement**: after **one** success. After **two** attempts that score below tolerance, the ghost completes
  itself in front of the player — the element fires along the ghost's own path — and then retires. Never trap the
  player behind a skill gate in the first thirty seconds.
- **`minPathLength` (1.6 world units) currently discards a short stroke in total silence** (`PathDrawer.end()`
  emits `cancel`, which has no listener). During onboarding a too-short stroke must say something: the ghost
  pulses once and the line reads **"Longer. Follow it to the end."**

### The hand-tracking trust ladder
Camera permission is the product's single biggest trust cliff. Never ask before the player has succeeded
**twice** with a pointer. The offer, when it comes, is one line in the dock — not a modal, not an interstitial:

> **Cast with your hands.** Your camera never leaves this tab.

Then, and only on a click:

1. **Explain before asking.** A panel, *before* the browser prompt: what is used (the position of one hand),
   what is not (no video is recorded, sent, or stored), and what happens if they decline (nothing; pointer
   casting is unchanged). A visible **Not now** that is as prominent as the accept.
2. **The prompt.** `HandInput.start()` → `getUserMedia`.
3. **Calibration as ritual, not setup.** The existing 450 ms pose hold with the ring fill
   (`HandInput._trackPose`, `.hand-mirror i` clip-path) becomes the attunement: hold an open palm until the ring
   closes. One success, then done.
4. **Teach pinch by doing.** A ghost sigil returns, once, for hands. The pinch threshold is already hysteretic
   (down 0.32 / up 0.48 of hand scale) so a held pinch is stable.
5. **Recovery is designed, not an error.** Tracking loss is a first-class state with its own copy, not a toast.

### The gesture guide, and the hand model underneath it

Both are read from the real source at `HandCastAbilityThreeJS` (`src/ui/gestures.js`, 266 lines;
`src/input/HandInput.js`, 733 lines — fye-mini's is 380). This is the most mature part of either reference repo
and the largest single upgrade available to fye-mini.

#### The hand model fye-mini is missing

| Behaviour | HandCast | fye-mini today |
|---|---|---|
| Hands tracked | **`numHands: 2`**, with MediaPipe `handednesses` resolved per hand and an `aimHand` option so a left-handed player can swap | `numHands: 1` |
| Engagement | **Boots disengaged.** An open palm held `WAKE_MS` = 600 ms engages it | None. Any hand in frame is immediately an input |
| Cast gesture | A continuous `grab` score with hysteresis, `GRAB_ENTER 0.7` / `GRAB_EXIT 0.4` | Binary pinch distance, `PINCH_DOWN 0.32` / `PINCH_UP 0.48` |
| Lost | `LOST_MS` = 500 ms, a real disengage with its own guide row | `DROPOUT_GRACE_MS` = 120 ms, only used to end a stroke |
| Repeat fire | `REFRACTORY_MS` = 400 ms after a cast | None — nothing stops one gesture firing twice |
| Slot stepping | Point sideways with the **off hand**; `POINT_RATIO 1.2` decides the axis; a held point repeats after `POINT_HOLD_MS` 700 ms then every `POINT_REPEAT_MS` 400 ms | Dwell the drawing hand over the dock for 400 ms, which interrupts drawing |
| Published state | `state.wake` is a 0..1 progress the UI reads directly | Nothing is published; `pose`, `poseStartedAt` and `isDrawing` stay private |

**The off-hand row is the important one.** `STEP_ROW` is declared
`row(['prev','next'], 'Point sideways', 'previous / next ability', 'point', 'other')` — that final `'other'`
means *the hand that is not casting*. Upstream already proved the two-handed split: one hand stays on the cast
while the other changes what is armed. That is precisely the payoff §8 asks hand tracking to justify, and it is
not speculative.

Take, in order of value: the engagement gate, the published `wake` progress, the lost state, the refractory
window, and then `numHands: 2` behind the quality ladder (§10).

#### The guide itself

Not a legend. A **contextual, live-highlighting panel** rebuilt whenever the armed slot changes.

```js
/**
 * @typedef {object} GestureRow
 * @property {string[]} icons  glyph names, left to right
 * @property {string}   name   the gesture
 * @property {string}   does   what it does to the ability in the slot
 * @property {'other'|null} hand  which hand, when it is not the casting one
 * @property {'wake'|'aim'|'grab'|'point'|'lost'} live
 */
const row = (icons, name, does, live, hand = null) => ({ icons, name, does, live, hand });
```

`live` names the tracker reading that lights the tile. The line-cast guide, verbatim:

```js
{
  kind: 'Line cast · aimed with an arrow',
  rows: [
    row(['wake'],  'Open palm',      'hold it to engage',        'wake'),
    row(['aim'],   'Move hand',      'swings the arrow',         'aim'),
    row(['cast'],  'Close a fist',   'casts along the arrow',    'grab'),
    row(['prev','next'], 'Point sideways', 'previous / next ability', 'point', 'other'),
    row(['lower'], 'Lower hand',     'cancels the cast',         'lost')
  ]
}
```

Note how short the `does` copy is — "swings the arrow", "drops it there", "cancels the cast". The source says why:
"the copy is short on purpose — a tile is a third of the panel wide, and the hand does most of the telling."

#### The glyphs, and why they are built the way they are

Inline SVG silhouettes that inherit `currentColor`, so a tile lights simply by changing its colour. Each hand is
drawn **through a mask that carves the seams out as transparency**. The source explains the reasoning, and it is
worth honouring rather than reinventing:

> "A one-colour hand loses everything inside its outline — the thumb lying across a fist, the fingers curled under
> a point — and without those it is a blob with bumps. So each hand carries a mask that cuts thin transparent
> lines where the fingers meet, and the panel behind shows through them. The cuts are transparency rather than a
> painted colour so the same hand sits on the plain tile and on the lit one without a halo."

#### fye-mini's rows

fye-mini's poses are elemental rather than slot-based, so the rows differ, but the shape does not.

| Glyph | Name | Does | `live` | Hand |
|---|---|---|---|---|
| open palm + ring | Open palm | hold it to engage | `wake` | casting |
| pinch | Touch thumb to finger | draws; open to release | `draw` | casting |
| two fingers | Two fingers | calls water | `water` | other |
| horns | Index and little finger | calls fire | `fire` | other |
| fist | Close your fist | calls stone | `earth` | other |
| open hand | Spread your hand | calls wind | `air` | other |
| palm lowered | Lower your hand | rests the tracker | `lost` | either |

To feed it, `HandInput` must publish what it already computes. Add one **throttled** event at ≤10 Hz — never per
frame — carrying `{ engaged, wake: 0..1, pose, hold: 0..1, pinch: 0..1, tracking: 'seeking'|'found'|'lost', delegate }`.

### Mobile is a first path, not a degraded one
`enableHands()` already refuses on `(pointer: coarse)` and says so. Touch keeps everything except the camera:
the ghost sigil, the Rite, the Ward, the dock, the Workshop. The attunement ritual's touch equivalent is a
**held touch on the ritual ground** for 450 ms — same duration, same ring, same feeling, no camera. The element
dock's dwell target keeps its `data-element` attribute, which `HandInput._trackDock` depends on.

### Every dead end gets an exit
| Dead end | Today | Copy to ship |
|---|---|---|
| Stroke shorter than 1.6 units | Silent discard | "Longer. Follow it to the end." |
| WebGL unavailable | `LoadingScreen.fail()` shows a raw error in red | "This browser cannot open the stage. Try a desktop browser with hardware acceleration on." |
| Camera denied | Toast: "Camera permission or hand tracking was unavailable. Pointer casting is ready." | "No camera, no problem. Keep casting with your hand on the pointer." — and the offer does not return this session |
| Tracker below 15 fps | Toast: "Tracking slowed, so pointer casting is ready." | "Tracking could not keep up, so the pointer has it. You can try hands again from the dock." |
| `localStorage` disabled | Silent `catch` | Nothing visible, but progress is explicitly marked as not saved in the Rite's close |
| MediaPipe CDN unreachable | Generic catch → 'fallback' | "The hand tracker could not be fetched. Pointer casting is ready." |

### Persistence: v3
`living-grimoire.local-preferences.v3` via `src/state/preferences.js` (§9). Migrates every `v2` key forward
(`introSeen`, `element`, `dials`) and adds `onboarding: { firstCast, firstSwitch, handsOffered, handsGranted }`
and `rite: { known: string[], best: Record<string, number> }`. **A findable reset**: a "Replay the attunement"
control at the foot of the Workshop, not buried in a keyboard chord.

---

## 7. Track C — UI and design system

### First, resolve the two-stylesheet problem
`app/globals.css:1` imports `src/ui/styles.css` — 437 lines defining `--ui-bg`, `--ui-bg-solid`, `--ui-border`,
`--ui-text`, `--ui-text-dim` and `--ui-accent`, while `app/grimoire-stage.css` hard-codes its own unrelated
values. Two token systems ship.

**Do not delete `src/ui/styles.css`.** It is half dead and half load-bearing, and the split is not where you would
guess. Its `.element-card`, `.mode-card`, `.hud__elements`, `.hud__modes`, `.hud__stats` and `.hud__help` rules
style markup React never renders. Its `.loader`, `.loader__inner`, `.loader__sigil`, `.loader__title`,
`.loader__bar`, `.loader__status`, `.sigil`, `.sigil--fire|water|earth|air` and `.lil-gui` rules are the **only**
styling those elements have — `app/grimoire-stage.css` contains zero references to `loader` or `sigil`, and React
renders all of them.

The migration is therefore: move the loader, sigil and `lil-gui` rules into `app/grimoire-stage.css` (rewritten
against the new tokens), delete the rest of the file along with the `@import`, and only then hoist the single
`:root` token block below. **Verify the loading screen still looks right before deleting anything** — it is the
first thing every visitor sees and the last thing anyone thinks to check.

### Tokens
Dark-only, stated deliberately: the stage is a near-black ritual ground (`environment.backgroundColor #14181d`,
fog to the same colour, `ambientIntensity 0.12`). A light theme would have to fight the renderer, and the renderer
wins. `color-scheme: dark` is already set in `app/globals.css`.

```css
:root {
  /* surface — sampled to sit above the #14181d stage without competing with VFX */
  --g-void: #08090a;  --g-stage: #14181d;  --g-scrim: rgb(8 9 10 / .62);
  --g-panel: rgb(12 16 22 / .82);  --g-line: rgb(246 241 232 / .14);
  --g-line-strong: rgb(246 241 232 / .34);
  /* ink */
  --g-ink: #f6f1e8;  --g-ink-dim: rgb(246 241 232 / .62);  --g-ink-faint: rgb(246 241 232 / .38);
  /* elements — these are the ONLY hues in the product */
  --g-fire: #ff6a3c;  --g-water: #3fb8c9;  --g-earth: #c6a372;  --g-air: #bfe8df;
  --accent: var(--g-air);            /* set per-element on .grimoire-stage */
  /* type */
  --g-display: 'Fraunces', Georgia, serif;  --g-sans: 'Inter', system-ui, sans-serif;
  --g-t-hero: clamp(45px, 9vw, 112px);  --g-t-title: clamp(24px, 4vw, 40px);
  --g-t-body: 14px;  --g-t-label: 10px;  --g-t-micro: 9px;
  --g-track-label: .2em;  --g-track-micro: .28em;
  /* space — 4px base */
  --g-1: 4px; --g-2: 8px; --g-3: 12px; --g-4: 16px; --g-5: 24px; --g-6: 32px; --g-7: 48px;
  /* radius, elevation */
  --g-r-sm: 8px; --g-r-md: 15px; --g-r-pill: 999px;
  --g-blur: blur(12px);  --g-shadow: 0 16px 40px rgb(0 0 0 / .72);
  /* motion */
  --g-fast: 120ms; --g-base: 240ms; --g-slow: 420ms; --g-beat: 900ms;
  --g-ease: cubic-bezier(.2,.8,.2,1);  --g-ease-out: cubic-bezier(.16,1,.3,1);
  /* layers — currently ad hoc (30 / 45 / 100). Name them. */
  --g-z-world: 0; --g-z-hud: 30; --g-z-mirror: 45; --g-z-sheet: 60; --g-z-intro: 100;
}
```
**Three sources of truth for four colours, and they disagree — including on the names.**

| Source | Earth | Air | Earth label | Air label |
|---|---|---|---|---|
| `app/GrimoireStage.tsx:14-15` | `#c6a372` | `#bfe8df` | **Stone** | **Wind** |
| `src/config/settings.js:573-574` (`ELEMENT_META`) | `#b98a4d` | `#c9f0ff` | **Earth** | **Air** |
| `src/input/HandInput.js:146` (`_setAccent`) | `#a08a63` | `#bfe8df` | — | — |

So the dock says "Stone" in one hue, the engine's metadata says "Earth" in another, and the hand mirror's ring
glows in a third. Collapse to **one exported constant both trees import**, and pick the names deliberately: the
public element id is already `air` while the engine key is `wind` (`enginePath()` bridges them), so the display
name is a third, independent decision. Make it once.

The per-element VFX colours (`fire.colorCore`, `water.colorInner`, `wind.lightColor`, …) are legitimately separate
and stay in the element blocks — they describe the effect, not the interface.

### HUD ownership: React owns all chrome; `HUD.js` shrinks to a toast
`src/ui/HUD.js` queries `.element-card`, `.mode-card`, `[data-stat]`, `.hud__help`, `[data-blurb]` and
`.hud__elements`. React renders `<div id="hud" />` with no children, so `setElement`, `setMode`, `toggleHelp` and
every stat are inert; only `showToast` works because `root.innerHTML` writes its own node.

Decide it once: **React owns everything a human clicks or reads.** `HUD.js` becomes ~40 lines with `showToast` and
nothing else, and `App.selectElement`'s `this.hud.setElement(element)` is replaced by the `grimoire:selected` event
it *already dispatches on the very next line*. The performance readout (fps / particles / draw calls / abilities)
moves into a debug overlay behind a key chord (§10), not the player-facing HUD.

### The dock, with slot grammar
Four buttons become four slots that carry: element sigil, name, bound key, active state, armed state, readiness,
and a dwell ring for hand input. **`data-element` must stay on the button itself** — `HandInput._trackDock` calls
`document.elementFromPoint(...).closest('[data-element]')` and a redesign that moves the attribute to a wrapper
silently breaks hand selection. The dwell ring is the same 400 ms `DOCK_DWELL_MS` fill as the pose ring, so the
two hand affordances share one visual language.

### Targeting indicators: world-space, not DOM
Two new pooled ground quads, following the reference repos' construction exactly (§4):
- **`AimIndicator`** — one SDF in a ground quad; shaft **0.42 m wide regardless of distance**; outline, chevrons
  and the range-cap arc all derived from the one distance field.
- **`ZoneIndicator`** — a footprint quad whose fragment shader remaps UV into *metres from target* so the boundary
  stays **0.34 m thick at any radius**, plus a reach ring from `RibbonGeometry` bent into a circle. On arm it snaps
  out past its radius and settles back.

Both belong on `LAYER.VFX` (the camera enables it explicitly; `LAYER.WORLD` would put them in the depth prepass and
the distortion pass). Colour comes from `--accent`'s engine twin, not from a fifth copy of the palette.

### The feedback stack
Today a cast produces one `aria-live` sentence. Replace with a layered response, each layer already built:
| Phase | World | Screen |
|---|---|---|
| gather | caster's `gather` pose; trail begins | dock slot brightens |
| aim | trail follows; ghost proximity glow | — |
| release | `ScreenFlash.trigger` at low strength; `CameraShake` scaled by fidelity | `navigator.vibrate?.(12)` on coarse pointers, behind a guard |
| impact | element decal (`SCORCH`/`RIPPLE`/`CRACK`/`DUSTRING`); Ward stone lights | the fidelity readout resolves |
| recovery | caster settles | `aria-live` sentence, **polite, and only on a scored trace** |

`aria-live="polite"` on `.stage-message` currently fires on **every** cast. In a game where casts come every few
seconds that is a screen reader talking constantly. Announce the *resolution*, not the release.

### Workshop
Keep it local-only and make it an instrument: surface `deriveGenome()` — pace / mass / chaos / radiance / menace —
as a five-axis readout. It is 20 lines of correct, finished, completely unused code
(`src/config/spell-contract.js`). Show all twelve `HOUSE_SEED_SPELLS`, not eight. Add the "Replay the attunement"
reset (§6).

### Accessibility, concretely
- Both side sheets are `role="dialog" aria-modal="true"` with **no focus trap, no Escape handler, no focus
  restoration, and no `inert` on the background**. This is provable by absence:
  ```sh
  grep -rnE "Escape|keydown|\.focus\(|inert|tabIndex" app --include="*.tsx" --include="*.ts"
  # zero hits
  ```
  So the product ships two dialogs that announce themselves as modal to assistive technology while blocking
  nothing, trapping nothing and restoring nothing — and **both can be open at once**, since `handsOpen` and
  `workshopOpen` are independent booleans. All four fixes are roughly thirty lines together.
- Every verb needs a key. Today `H`, `T` and `M` are emitted and have no handler in `App._handleAction`.
- Contrast: HUD ink over a dark stage is fine, but ink over a **bright VFX bloom** is not. Every floating label
  needs its own scrim, not a text-shadow.
- Motion: `CameraShake`, `ScreenFlash` and bloom are vestibular and photosensitive triggers. Under
  `prefers-reduced-motion` the reduction must be a real variant, not the current blanket
  `animation-duration: .01ms !important` (which also breaks the loader's progress fill).
- Photosensitivity: cap `ScreenFlash` to **three flashes per second** and cap peak `strength` under reduced motion.

### Responsive
One 680px breakpoint is not enough for a product whose primary input is a drag across the stage.
- **Phone (<680px)**: dock as a bottom bar inside the thumb arc; sheets full-width; `.hand-mirror` never shown;
  the ritual ground framed tighter (`settings.camera.distance` down) so a 4 m sigil fits a 360px-wide viewport.
  **Verify `minPathLength 1.6` and `minPointDistance 0.22` are still reachable at that framing** — they are world
  units and a tighter camera changes how much screen a world unit is.
- **Tablet (680–1024px)**: dock bottom-centre, sheets as right-hand panels at 380px.
- **Desktop (>1024px)**: as today, plus the gesture guide docked beside the mirror rather than inside a sheet.

### Voice
Current copy mixes registers: "The spell shifts in your hand" beside "Tracking slowed, so pointer casting is
ready." Pick one: **plain, warm, second person, present tense; the world speaks about the world, the machine speaks
about the machine, and the machine never uses ritual language for a technical failure.** Ship a before/after table
covering every string in the appendix.

---

## 8. Track D — Game flow

### The loop, in one sentence
**The Grimoire shows you a sigil; you draw it; the truer your line, the more completely the element answers.**

Expanded: a sigil appears burned faintly into the ritual ground. You trace it with pointer, touch or a pinched
hand. On release, `PathDrawer` hands the stroke to the element exactly as it does today — but now the stroke is also
scored against the sigil, and the Ward that rings the stage answers in proportion. A weak trace produces a weak
answer; a true trace lights the Ward and opens the next sigil. You do it again because your hand is getting better,
and you can feel it getting better.

### Why this and not the reference repos' loop
Neither reference repo has a loop (see §4 — `TargetBoxes.js` is a drone's HUD, not a game). Their verb is
*aim and click*, which is a decision about **where**. fye-mini's verb is *draw*, which is a decision about **shape**.
Shape is a far richer skill surface, it is the only thing in this lineage nobody has built a game on, and it is
already 90% implemented: `PathDrawer` produces a 320-point arc-length-uniform polyline every stroke
(`src/input/PathDrawer.js:_rebuild`) and throws it away after one use.

Scoring a drawn shape needs **no collision system, no physics, and no per-frame hit tests** — it is one
curve-to-curve comparison at release. That is the cheapest possible path from "sandbox" to "game" in this codebase.

### The verbs that ship
| Verb | Ships? | What it is for |
|---|---|---|
| **Trace** (draw a sigil) | **Yes — primary** | The whole game. Already built; needs scoring. |
| **Choose** (pick an element) | **Yes** | A real decision once sigils demand a specific element. |
| **Ride** (air scooter) | **Yes — as a reward beat** | 366 lines of finished, invisible work (`WalkController`). Make it the transition between rites, not a toggle. |
| **Line cast** (arrow, click) | **Yes — one sigil type** | The "strike" sigil: a straight line is a sigil too. Free via `LineCurve3`. |
| **Far cast** (ground ring) | **Later** | Earns its ring indicator only when a sigil needs a placed centre. |
| **Summon** | **No** | Needs an entity, an AI, and a control scheme. Out of scope; say so. |

### Before designing the ride, know what it already is

`WalkController` is more complete than it looks, and it has four specific gaps that explain why it reads as a
novelty rather than a verb.

Complete: `begin(curve)` rejects strokes under 0.5 m — looser than `PathDrawer`'s 1.6 m, so it never actually
rejects anything that reaches it. Phases are `LEAP` / `RIDE` / `DISMOUNT`. The leap is a parabola clamped to
0.45–1.15 s; the legs fold into `SittingPose` at 62 % of it; the ride runs at a constant 5 m/s with an `outCubic`
ramp over 0.45 s and roughly a 3 m brake; the character banks up to 26° into turns; the dismount carries 0.45 m
forward over 0.55 s. `AirScooter.update` already takes the live speed and scales its dust off it.

Gaps, all verified:
- **`cancel()` has zero callers.** A ride cannot be interrupted, by the player or by anything else.
- **`settings.walk.returnHome` defaults to `false`**, so the entire leap-home branch is dead code in the shipped
  configuration.
- **Mid-ride re-triggering is explicitly supported but unreachable**, because `App` clears `rideNextStroke` the
  moment a ride begins.
- **`this.speed` and `this.distance` are public per-frame telemetry** consumed only by the scooter's dust.

So the ride is a cutscene you trigger. Making it a verb means giving the player something to do during it — at
minimum, the ability to end it — and spending its telemetry on something the Rite can see.

### The unit of play: the Rite
A **Rite** is three to five sigils drawn in sequence, framed by a beginning and an end.
- **Opening** (~4 s): the stage dims, the Ward's stones go dark, the first sigil burns into the ground.
- **Body**: one sigil at a time. Each has an element it wants and a shape it wants. Draw it. The Ward answers.
- **Close** (~6 s): the caster rides the last sigil's path out on the scooter while the Ward holds its light.

First session: one Rite of three sigils, ~3 minutes with onboarding. Returning session: Rites of five, ~20 minutes
across several, each Rite seeded differently.

### The Ward, not dummies
A ring of **eight procedural standing stones** on the ritual ground at radius ~7 m, built from
`createTowerGeometry(seed)` and `createSlabGeometry(seed, sides)` which `src/assets/ProceduralGeometry.js` already
exports. `DecalSystem` already has `SHOCKWAVE`, `RIPPLE`, `CRACK` and `DUSTRING`. A stone is: a position, an
element affinity, and a `lit` float 0..1. No new asset, no physics, no collision.

**The stones must not take point lights.** `LightPool`'s `POOL_SIZE` is **6** (`src/effects/LightPool.js:5`), it is
shared by every ability, `acquire()` returns `null` when exhausted, and `MAX_CONCURRENT` already allows 8 abilities.
Eight stones would starve the casts. Light them with an **emissive material and let bloom do the work**:
`post.bloomThreshold` is 0.72 against a `#14181d` stage, so only emissive surfaces bloom — a lit stone costs one
uniform write and nothing else.

- A scored trace raises `lit` on the stones whose affinity matches the sigil's element, by the fidelity score.
- Fire scorches, water ripples, earth cracks, air raises a dust ring — the four decal types already in the enum.
- A stone at `lit >= 1` holds a standing light. A Rite is complete when the Ward is whole.
- **Failure is a stone staying dark.** The Rite still ends. Nothing is lost; the Ward is simply not whole, and the
  close is quieter. That is a beat, not a punishment, and it is the right failure for a product with no enemies.

### Scoring: fidelity, not damage
At release, compare the drawn stroke to the sigil's reference polyline.

**One correctness trap to avoid.** `PathDrawer` resamples to a count that depends on the stroke's length —
`wanted = clamp(round(length * settings.input.samplesPerUnit), 2, 320)` with `samplesPerUnit: 3.0`
(`src/input/PathDrawer.js:_rebuild`). A 4 m stroke yields 12 samples and a 20 m stroke yields 60, so **sample `i`
of the stroke does not correspond to sample `i` of the sigil**. The scorer must resample both to the same fixed
count first. Use `curve.getPointAt(i / (N - 1))`, which is arc-length parameterised in three.js, with `N = 64`
into two preallocated buffers — the same discipline `PathDrawer` already applies to its own 320-`Vector3` buffer.

```js
/**
 * Fidelity of a drawn stroke against a reference sigil.
 *
 * Both curves are resampled to SAMPLES points by arc length before comparison,
 * because `PathDrawer`'s own sample count scales with stroke length and two
 * strokes of different lengths would otherwise not line up index for index.
 *
 * The stroke is scored in both directions and the better result wins: drawing a
 * sigil backwards is a different hand, not a worse one.
 *
 * Allocates nothing — both buffers are module-level and reused, matching the
 * discipline in `PathDrawer`.
 *
 * @param {THREE.Curve} stroke    what the player drew
 * @param {THREE.Curve} sigil     what the Grimoire asked for
 * @param {number} tolerance      metres of deviation scored as zero fidelity
 * @returns {{ line: number, flow: number, closure: number }} each 0..1
 */
export function scoreTrace(stroke, sigil, tolerance) { /* ... */ }
```

Three published components, because a single opaque number teaches nothing:
- **Line** — mean deviation from the sigil. The core skill.
- **Flow** — variance of sample spacing. Rewards an even hand; already derivable because `minPointDistance`
  gates raw samples.
- **Closure** — distance between the stroke's end and the sigil's end. Rewards finishing the shape.

Wrong element: the trace still casts (never refuse the player's input) but the Ward does not answer. The lesson is
delivered by the world's silence, not by an error message.

**Spend the fidelity on the caster's body, not on a number.** `CasterPerformance.setGesture` already accepts an
`intensity` that nothing passes; it is clamped to `[0.35, 1.6]` and multiplied into all eight arm and hand joints
(§3). Pass the Line score into it:

```js
// src/core/App.js — in the pathDrawer 'cast' handler
const fidelity = rite.scoreTrace(curve, rite.currentSigil, rite.tolerance);
this.caster?.setGesture('release', {
  element: this.abilities.selected,
  // 0.35 is a hesitant, half-committed throw; 1.6 is a full one. The player
  // reads their own accuracy off the caster's posture before any number appears.
  intensity: 0.35 + fidelity.line * 1.25
});
```

That is the whole feedback system for free, in the most legible place possible: a true sigil makes the caster
commit, a sloppy one makes them hesitate. No new animation, no HUD element, no number. The numeric readout, if it
exists at all, is a confirmation of something the player already felt.

### What gets better: the hand
No experience bars. Progression is **the sigil deck**: new sigils unlock as earlier ones are drawn truly, and the
old ones stay in rotation. A returning player is not carrying a bigger number; they can draw a spiral cleanly at
speed, which they could not do on day one. The only persisted state is which sigils are known and the best Line
score for each — a few hundred bytes in `localStorage`, honestly labelled as living only in this browser.

### Difficulty, with numbers
| Rite | Sigils | Shape | Time per sigil | Element changes |
|---|---|---|---|---|
| 1 (tutorial) | 3 | single arc | none | 0 |
| 2 | 3 | arc, hook | none | 1 |
| 3 | 4 | hook, chevron, loop | 12 s | 2 |
| 4 | 5 | loop, spiral, double-back | 9 s | 3 |
| 5+ | 5 | seeded from the deck | 7 s | up to 4 |
Tolerance tightens from 0.55 m to 0.28 m across the same span.

### The honest hand-tracking payoff
**With a mouse you must stop drawing to change element. With a hand you do not.**

Today fye-mini forces the break in two ways at once: `numHands` is 1, and element selection is a 400 ms dwell of
the *drawing* hand over the dock (`HandInput._trackDock`). Both hands are the same hand, so changing element
always interrupts the stroke.

Raise `numHands` to 2 and split the roles: **the drawing hand pinches and traces; the off hand holds the element
pose.** A sigil that demands two elements in one unbroken stroke then becomes faster and more expressive with
hands than with a mouse — and is simply impossible with a mouse without breaking the stroke.

This is not speculation. `HandCastAbilityThreeJS` already ships the two-handed split: its guide declares
`row(['prev','next'], 'Point sideways', 'previous / next ability', 'point', 'other')`, where `'other'` is
explicitly "which hand, when it is not the casting one", and its `HandInput` resolves MediaPipe `handednesses`
per hand with an `aimHand` option so a left-handed player can swap them. The pattern is proven upstream; fye-mini
only has to point it at elements instead of slots.

The cost is real — a second hand roughly doubles inference — so it is gated behind the adaptive quality ladder
(§10) and is never required. With one hand, or with a pointer, or on a phone, the same sigil is drawn as two
strokes and scored as two. The two-handed version is the ceiling, not the floor.

### Three high-skill expressions
1. **The unbroken two-element sigil** — above. Hands only; the ceiling of the whole design.
2. **Drawing to the beat of the Ward.** Stones pulse at a fixed cadence; a release landing on the pulse adds a
   resonance bonus to `Closure`. Rhythm on top of shape, no new input.
3. **The long line.** Tolerance scales with sigil length, so a big, fast, confident stroke is worth more than a
   small careful one at equal fidelity. Rewards commitment, which is what casting should feel like.

### Session state machine
```
BOOT -> INTRO -> ATTUNE(onboarding, first session only) -> RITE_OPEN
RITE_OPEN -> SIGIL_PRESENT -> SIGIL_TRACE -> SIGIL_RESOLVE
SIGIL_RESOLVE -> SIGIL_PRESENT   (sigils remain)
SIGIL_RESOLVE -> RITE_CLOSE      (last sigil resolved)
RITE_CLOSE -> RITE_OPEN          (player continues)
RITE_CLOSE -> FREE               ("Set the Rite aside" -> today's sandbox, unchanged)
FREE -> RITE_OPEN                ("Begin a Rite")
any -> FREE                      (Escape; the sandbox is always one key away)
```
The sandbox is never removed. It becomes the state you can always return to, which also protects everything the
Workshop and the Editor already do.

---

## 9. Shared architecture

### The one structural decision: three curve sources, one cast door
Today `PathDrawer` is the only thing that can produce a cast, and it is wired straight into `App`
(`src/core/App.js:118-131`). Adopt the reference repos' shape: **every cast shape converges on one event carrying
`(origin, direction, distance)`**, and a single adapter turns that into the `THREE.Curve` that `Ability.spawn`
already accepts.

```
InputManager ──draw:*──> PathDrawer ────────────┐
                                                 ├── CastRouter.cast(curve, element, source)
InputManager ──point/confirm──> AimController ───┘        └──> AbilityManager.cast(curve, element)
HandInput ────draw:*/pose─────> (either, by mode)
```

Why this and not "replace PathDrawer with AimController": drawing is the product's primary verb (§8). The
`AimController` is added **beside** `PathDrawer`, not over it, and `CastRouter` is the only thing `App` talks to.
`Ability`, `AbilityManager` and the four element files are **not touched** — verified: `Ability.spawn(curve)` calls
only `getLength()`, `getPointAt()` and `getTangentAt()` (`src/abilities/Ability.js:129-152`), which `LineCurve3`
satisfies. This is the same conclusion the `LinearAbilty...` README reaches for its own codebase.

```js
/** Build the curve a line or zone cast flies along, from the shared cast triple. */
export function curveFromAim(origin, direction, distance) {
  return new LineCurve3(origin.clone(), origin.clone().addScaledVector(direction, distance));
}
```
A zone cast reads its centre as `curve.getPointAt(1)` and works outward — no third code path.

### Five hooks that already exist

Before writing anything new, use what is there. Each of these is verified.

1. **`App._castStagePreview()` (`src/core/App.js:186-194`) is the shipping proof** that a hand-authored
   `CatmullRomCurve3` casts with zero engine changes — it builds four `Vector3`s and calls `abilities.cast(path)`.
   Generalise it into one `castCurve(points, element)` that the intro director, the tutorial ghost, the line cast
   and the far cast all call. Do not write a second path.
2. **The impact callback already carries the ability and the app throws it away.** `src/core/App.js:70` passes
   `onAbilityImpact: () => this._onAbilityImpact()`, while `Ability._beginImpact()` calls
   `this.ctx.onAbilityImpact?.(this)`. Change it to `(ability) => this._onAbilityImpact(ability)` and widen the
   handler to read `ability.position`, `ability.element` and `ability.u`. One line, and it is the cheapest hook
   for scoring, hit resolution and a `grimoire:impact` event to the React island.
3. **The game-rules system has exactly one correct home in the frame loop**: `App.frame()`, between
   `this.abilities.update(dt)` (`:293`) and `this.particles.flush()` (`:297`). From there it can read
   `this.abilities.active` for swept `previousPosition → position` tests, emit through `this.decals` /
   `this.bursts` / `this.shake` / `this.flash`, and force an early detonation via `ability._beginImpact()` — all
   before particles are uploaded for the frame.
4. **`PathDrawer._project(pointer, out)` (`:49-52`) and its module-level `GROUND_PLANE` (`:6`) are side-effect
   free and already hold the live camera.** Promote to a public `projectPointer(pointer, out)`, or lift
   `GROUND_PLANE` into a shared module. It is the exact code an aim indicator, a far-cast target picker and a
   ghost-sigil reticle all need.
5. **`App.stageAnchor` is a free arena primitive** (§11, hazard 23). Writing it relocates the shadow frustum, the
   dust volume and the orbit centre together.

### Two unused hand channels, free

- `handScale` — `distance(landmark 0, landmark 9)` — is already computed every frame in `HandInput._process` and
  is a direct hand-to-camera-distance proxy. **Its derivative is a palm-push gesture for nothing.**
- The same pinch expression on landmarks `(4, 12)` instead of `(4, 8)` gives a **second, non-colliding pinch
  channel** — thumb to middle finger — without touching the existing thumb-to-index draw trigger.

### Where game state lives
Not in React (the engine reads it at 60 fps) and not scattered across modules (React must render it). One
authoritative store in `src/state/`, plain JS, with a `useSyncExternalStore`-compatible subscription so the React
island renders it without owning it.

```js
// src/state/riteStore.js
/**
 * The single owner of session state. Mutations are synchronous and cheap; the
 * engine reads `get()` inside the frame loop, React subscribes.
 *
 * Deliberately not a React context: the frame loop must not re-render anything
 * to read the current sigil.
 */
```
Exposes `subscribe(fn) -> unsubscribe`, `get()` returning a frozen snapshot, and named intents
(`beginRite`, `presentSigil`, `resolveTrace`, `closeRite`, `setFree`). No reducer framework, no dependency.

### The TypeScript / JavaScript boundary
`app/` is TypeScript, `src/` is JavaScript, and today they communicate through untyped `window.CustomEvent`
strings duplicated in both trees. Fix it with **one shared module both sides import**: `src/state/events.js` holding
the event-name constants, plus a sibling `src/state/events.d.ts` declaring the payload types. The React island
imports the constants (so a typo is a build error, not a silent no-op) and gets payload types for free; the engine
imports the same constants. No build change — vinext already resolves `../src/*` from `app/`
(`GrimoireStage.tsx` imports `../src/config/house-spells` today).

Keep `window` CustomEvents as the transport. They already work, they survive the RSC/client boundary, and replacing
them with a bus is churn that buys nothing at this event count. Constants + types remove the only real hazard.

### Game tuning goes in a new settings block
`HOUSE_SEED_SPELLS[].settingsPatch` and `App._applyFlatPatch` can write any path with a `RANGES` entry under
`global`, `trail`, `fire`, `water`, `earth`, `air`, `post`. Cooldowns, tolerances, scores and difficulty must not be
reachable from a cosmetic preset. Add a **`settings.rite` block** and give it no `RANGES` entries, so
`_applyFlatPatch` refuses it by its existing guard (`if (!range && !isColor) continue;` — `src/core/App.js:169`).
Presentation values that genuinely affect the cast's feel (`range`, `minRange`) go in the element blocks **with**
`RANGES` entries, registered under the public `air.*` spelling, never `wind.*` (`src/config/spell-ranges.js`).

### Hit testing, if §8's Ward needs it
The trace score is a curve-to-curve comparison at release and needs no per-frame test. The Ward's *reaction* does,
and it is cheap: `AbilityManager.update()` already iterates `this.active`, and every ability exposes a live
`this.position` (`src/abilities/Ability.js:180-190`). Sample squared distance from each active ability head to each
of eight stone positions — 8 × ≤8 = 64 squared distances per frame, with no allocation if the stone positions live
in one flat `Float32Array`. Impact-radius effects hook `ctx.onAbilityImpact(ability)`, which **already passes the
ability instance** and which `App._onAbilityImpact()` currently throws away (`src/core/App.js:189`).

### Persistence: one door
`src/state/preferences.js` owns the whole `localStorage` surface. Today `GrimoireStage.tsx` reads and writes
`living-grimoire.local-preferences.v2` inline with a bare `try/catch`. Move it, bump to `v3`, migrate `v2` forward
(`introSeen`, `element`, `dials` all survive), and handle the three real failure modes: disabled storage, a quota
error on write, and a corrupt/foreign value. Everything else in this update persists through that module only.

### Dead code this update should remove
- `src/config/spell-contract.js`: `validateSpellSettings`, `snapshotSpellSettings`, `validateSpellwrightPatch`,
  `spellSettingsBsonSchema`, `SPELL_SETTING_BLOCKS`, `SPELL_ELEMENTS`, `SPELLWRIGHT_PATHS` — **zero live callers**,
  residue from the deleted API era. Keep `RANGES`, `SPELLWRIGHT_COLOR_PATHS`, `enginePath`. Keep `deriveGenome` and
  actually use it (§7).
- `src/ui/glyphs.js` and `src/world/ContactShadows.js` — no importers anywhere.
- `src/ui/styles.css` — **partially**. Its `.element-card` / `.mode-card` / `.hud__*` rules are dead and its
  `--ui-*` token set conflicts with `app/grimoire-stage.css`, but its loader, sigil and `lil-gui` rules are the
  only styling the loading screen and the editor have. Split it as §7 describes; do not delete it wholesale.
- `public/intro/*` — all five files (§5).
- The three dead keybindings: either give `toggleHelp`, `togglePose` and `toggleMode` real cases in
  `App._handleAction` or stop emitting them from `InputManager`. Do not leave them advertised and inert.

---

## 10. Performance, accessibility, privacy, release

### Frame budget
Target 60 fps (16.7 ms) on a 2022 integrated-GPU laptop; 30 fps floor (33.3 ms) on a 2021 mid phone.
Existing costs, in rough order: the composer chain (`RenderPass` → distortion → `UnrealBloomPass` → `OutputPass`
→ `GradeShader`), the 4096² shadow map with `gl.shadowMap.needsUpdate = true` **every frame**
(`src/core/App.js:frame`), the particle engine, and MediaPipe inference when hands are live.

New features get hard budgets, and the cut order is published so nobody has to guess under pressure:

| Feature | Budget | First to go |
|---|---|---|
| `IntroDirector` | 0 ms steady state (it only writes settings and issues casts) | — |
| Aim + zone indicators | ≤0.6 ms (two pooled ground quads, one SDF each) | 5th |
| Ward: 8 stones | ≤0.8 ms (instanced, emissive-only — **no point lights**; `LightPool` is 6 and shared with casts) | 4th |
| Hit tests | ≤0.05 ms (64 squared distances, zero allocation) | never |
| Trace scoring | ≤0.3 ms, **once per release**, not per frame | never |
| Gesture guide | ≤0.1 ms (throttled to 10 Hz, DOM only) | 3rd |
| Two-handed tracking | +40–90 % of MediaPipe cost | **1st** |
| Ghost sigil | ≤0.4 ms (a second `PathTrail`) | 2nd |

**Free win available today**: `gl.shadowMap.needsUpdate = true` runs unconditionally every frame. The sun is static
and the character barely moves. Update it on change, or at 15 Hz, and the 4096² map stops re-rendering 60×/s.

### Adaptive quality ladder
Measured frame time over a rolling 90-frame window, never a user-agent sniff.

| Tier | Trigger | Changes |
|---|---|---|
| **high** | < 14 ms sustained | as authored |
| **balanced** | 14–24 ms | pixel ratio cap 1.5→1.25; bloom radius −30 %; `global.particleCount` ×0.7; shadow map 2048²; MediaPipe every 2nd frame |
| **conservative** | > 24 ms | pixel ratio 1.0; bloom off; particles ×0.4; shadows off; distortion pass off; MediaPipe every 3rd frame; two-handed tracking refused |

It announces itself **once**, quietly, in the Workshop ("Running in balanced mode for a steady frame rate"), never
as a toast and never repeatedly. It must also raise the existing `HandInput` 15 fps watchdog threshold when it
steps down, or the two systems fight: the ladder slows inference to save frames, the watchdog reads the lower
inference rate as failure and kills hand tracking entirely.

### MediaPipe
- Inference currently runs every `requestAnimationFrame` while active (`HandInput._loop`). Decouple to a cadence.
  **The One-Euro filter must be fed the real elapsed time, not a fixed step** — it already computes
  `delta = (now - this._filter.at) / 1000` clamped to `[1/240, 0.1]`, so it is correct under a variable rate as
  long as `now` stays `performance.now()`. Do not "fix" it to a constant.
- **Version skew, verified**: `package.json` pins `@mediapipe/tasks-vision@^0.10.22-rc.20250304`, but
  `HandInput._start` fetches WASM from `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`. The JS API and
  the WASM are from different builds. Pin them to the same version or self-host both.
- Self-hosting the WASM + the `hand_landmarker.task` model into `public/` removes two runtime third-party fetches.
  It **strengthens** the local-first claim rather than weakening it: today the tab tells Google's CDN that someone
  opened the hand tracker. Weigh that against `public/` already being 13 MiB, and do it as part of the asset diet
  that deletes 5.08 MiB of intro raster (§5).

### Accessibility position
State honestly what is and is not reachable. A real-time 3D drawing toy cannot be fully non-visual.
- **Reachable**: keyboard-complete verbs, focus management, Escape, focus restoration, contrast, reduced motion,
  a photosensitivity cap, and a calm mode.
- **Not reachable**: a screen-reader-equivalent experience of tracing a shape. Say so in the product, once, plainly,
  rather than implying parity.
- **Calm mode** — one switch that turns the product down without turning it off: no camera shake, no screen flash,
  bloom at 30 %, no auto-framing, no time pressure on sigils, `aria-live` limited to resolutions. It is not the
  same thing as `prefers-reduced-motion` and should be independently togglable.
- **Photosensitivity**: hard-cap `ScreenFlash` at three triggers per second and cap peak strength. Note that
  `ScreenFlash.trigger` already refuses a weaker flash than the current one, which helps but does not cap rate.

### Privacy as a stated property
The camera claim is the trust anchor. Make it verifiable, not asserted.
- A **persistent camera-state indicator** whenever a stream is live, outside the mirror, that survives the mirror
  being scrolled or hidden.
- The teardown guarantee is already real and good: `HandInput.stop()` bumps `_startAttempt` to invalidate a pending
  permission flow, cancels the rAF, closes the landmarker, calls `getTracks().forEach(t => t.stop())`, removes the
  mirror, and sweeps orphaned `.hand-mirror` nodes. Document it in-product in one sentence.
- A short in-product privacy note the player can actually reach, listing exactly what `localStorage` holds.
- **Extend the guard test.** `tests/caster-first-contract.test.mjs` already does
  `assert.doesNotMatch(stage, /fetch\(/)`. Widen it across `src/` and `app/` to also reject `XMLHttpRequest`,
  `WebSocket`, `RTCPeerConnection`, `navigator.sendBeacon`, `sendBeacon` and `EventSource`, with a documented
  allowlist for the two MediaPipe CDN URLs until they are self-hosted. That test is the privacy claim's only
  enforcement, and it is cheap.

### Release blocker: asset licensing
`README.md` states the upstream binaries retain their original licences and that redistribution rights are
unconfirmed. `public/models/Standing Idle.fbx` (2.27 MiB) and `public/hdri/spruit_sunrise.hdr` (5.66 MiB) are both
shipped. This is a **release blocker**, not a nit, and it is the owner's decision:

| Option | Cost | Note |
|---|---|---|
| Confirm rights upstream | hours | Cheapest if the answer is yes. Do this first. |
| Replace the HDR | ~1 hour | Polyhaven publishes CC0 HDRIs; `spruit_sunrise` itself originates there. Confirm and cite the licence. The stage uses it at `envIntensity 0.3` as a probe only, so almost any comparable outdoor HDRI substitutes. |
| Replace the FBX | ~1 day | Mixamo's own licence terms govern the rig. `CasterPerformance` maps 12 named joints and `tests` assert `Standing Idle.fbx` by name, so a swap touches `JOINTS`, `CharacterController` and one test line. |
| Procedural caster | ~1 week | `ProceduralGeometry.js` exists; a stylised jointed figure removes 2.27 MiB and the licence question together, and would suit the ritual tone. Highest cost, cleanest outcome. |

### Degradation paths
- **No WebGL2**: `LoadingScreen.fail()` currently prints a raw error message in red. Give it designed copy.
- **Context loss**: `webglcontextlost` is **not handled anywhere** — verify with a grep before asserting, then
  handle it. Today a context loss leaves a dead black canvas with a live HUD.
- **MediaPipe import failure / CDN unreachable**: already caught, but the copy is technical. See §6's table.
- **`localStorage` disabled**: already caught silently. Surface it once, at the Rite's close, as "progress is not
  being saved in this browser".
- **Very small viewport**: below ~320px the dock and the stage compete. Specify a floor and what happens under it.

### Quality loop without analytics
No telemetry is allowed and none should be added. Instead:
- A **local debug overlay** behind a key chord, carrying what the dead `[data-stat]` readout was meant to show plus
  the quality tier, the MediaPipe cadence and the last trace's three score components.
- A **written playtest script**: five tasks, and the five questions worth asking (when did you first feel powerful;
  what did you think the ghost line wanted; did you know why a stone stayed dark; did you ever feel stuck; would
  you open it again tomorrow).

---

## 11. Implementation hazards

Each of these will produce working-looking code that is subtly wrong. They are listed separately from the design
because they are the things an implementer discovers at the worst possible moment.

### Targeting and the frame loop

1. **`CastShape` has three members, not two: `LINE`, `ZONE`, `SUMMON`.** A summon arms and reveals through the
   same controller so the same gesture fires it, but it must draw **no** indicator
   (`visible = reveal > 0.001 && shape !== CastShape.SUMMON`) and must **bypass the `minRange` validity check** in
   `confirm()`. Anything that treats targeting as a two-way branch produces a summon that promises a target it does
   not have. Even though summons are out of scope (§15), model the enum with three members now so adding one later
   is not a refactor.
2. **Update order in `App.frame()` is load-bearing.** `hands.update(raw)` must run **before** `aim.update(raw)` or
   the indicator trails the hand by a frame. `applyHits()` must run **after** the abilities are stepped, or the
   volume tested is last frame's.
3. **Targeting and hand tracking run on the real delta; effects and gameplay run on the scaled one.** In
   `App.frame()` those are `raw` and `dt` respectively (`src/core/App.js:frame`). Pass `raw` to the aim controller
   or the indicator freezes the moment someone presses `P`.
4. **Indicator dimensions must be world metres remapped from `vUv`, never UV fractions.** That is the whole reason
   a 0.42 m shaft and a 0.34 m boundary stay physically constant across a 3 m and a 26 m cast. Do not implement
   the indicators as scaled sprites or textures.
5. **Only one indicator visible at a time**, and swapping slots mid-reveal hides the other **outright** rather than
   letting it fade in place.

### Hand tracking

6. **MediaPipe handedness is mirror-relative, and `HandInput` never mirrors it.** It mirrors x at
   `src/input/HandInput.js:203` and `:313` but leaves `handedness` alone. **Any Left/Right logic added for a
   two-handed scheme will be inverted relative to what the player sees** unless explicitly flipped. This is the
   single most likely bug in the two-handed work.
7. **`PathDrawer` is a singleton with one `samples` array** (`src/core/App.js:85`, `src/input/PathDrawer.js:28`).
   Two hands emitting into one `draw:*` channel **interleave into a single corrupt stroke**. Adding a second
   drawing hand requires a stroke identity on the draw events first.
8. **Do not give `HandInput` its own `EventEmitter`.** It re-emits into the shared `InputManager` instance
   precisely so that pointer and hand are indistinguishable downstream. New state belongs on the shared input
   object.
9. **The four anti-misfire guards are required together, not à la carte**: boot disengaged behind a ~600 ms
   open-palm wake gate; Schmitt-trigger every pose threshold; require ~4 consecutive agreeing frames before a pose
   emits; and open a ~400 ms refractory both after a cast and at the moment of engagement. Shipping two of the four
   produces a demo that fires on its own.
10. **The discrete confirm is refractory-gated; the continuous grab signal is not.** A held fist must report true
    for as long as it is shut, and false the instant the hand is lost.
11. **Element stepping by hand must emit a relative sign (+1/−1), never an absolute index.** An absolute slot
    desynchronises permanently the first time a selection is refused, with no way for the player to notice.
12. **Never derive finger extension from screen-space y.** fye-mini already does this correctly — `isExtended`
    compares two distances from the wrist and normalises by the wrist-to-middle-knuckle span
    (`src/input/HandInput.js:_trackPose`). Keep it that way.
13. **Retune the FPS watchdog before raising `numHands`.** The `<15 fps over 3 s` hard-stop
    (`src/input/HandInput.js:185-193`) will trip routinely with two hands on the CPU delegate and silently demote
    the player to pointer with no diagnostic.
14. **The cost of `numHands: 2` is in the singletons, not the model.** Inference is only about 1.5–1.9× — palm
    detection runs once and landmark regression runs per hand. The real work is that `this.pointer`,
    `this.filtered`, `this.isDrawing`, the One-Euro filter object `this._filter`, and every pose and dock timer
    are single-owner fields that must become per-hand collections. **MediaPipe supplies no persistent track ids**,
    so hand identity has to be maintained yourself by nearest-wrist matching between frames. `result.landmarks[0]`
    is hard-coded in two places, and `_drawMirror` and `_handleDropout` are both written for exactly one hand.
    Budget for the refactor, not for the inference.
15. **Two things fye-mini's `HandInput` does *better* than either reference — do not regress them while porting.**
    It tries `delegate: 'GPU'` and falls back to `delegate: 'CPU'` on failure, reporting which one succeeded in its
    status line; and it has the FPS watchdog. **Neither reference repository has either.** (One thing to change
    while you are in there: detection runs on `requestAnimationFrame` rather than
    `requestVideoFrameCallback`, so it can process the same camera frame twice or skip one entirely.)

### The engine's own rules

16. **Never copy a settings value into a per-cast record at spawn time.** The entire "editor stays live, even while
    paused" property depends on every system re-sampling `settings[...]` each frame. Records may hold unitless
    dice rolls and timestamps, nothing else.
17. **Any new per-cast state must be reset in `spawn()`** (`src/abilities/Ability.js:129`), which is the pooling
    reset point. Miss it and a pooled ability inherits the previous cast's charge, combo tier or target.
18. **The particle system is GPU-simulated and the CPU can never read a particle's position.** Position is
    computed in the vertex shader from spawn data. No per-particle hit detection, attraction or gameplay is
    possible without an entirely new CPU-side system. Design the Ward against ability heads, not particles.
19. **A hold-in-place charge produces a cancel, not a cast.** `PathDrawer.move()` rejects samples closer than
    `minPointDistance` (0.22) and `end()` cancels strokes under `minPathLength` (1.6) or with fewer than three
    samples. Define a charge as a pre-draw gather, or explicitly bypass the length guard for charged casts.
20. **Keep `PathDrawer` a pure draw-to-curve device.** Every mode decision belongs in `App._bindEvents` or the new
    router, not inside the drawer.

### Live bugs found while writing this, all verified

21. **The Cast button in the stage dock does nothing.** `app/grimoire-stage.css:14` sets
    `.stage-hud { pointer-events: none; }` and its children opt back in one at a time —
    `.element-selector { pointer-events: auto }` (`:15`) and `.ride-button { pointer-events: auto }` (`:22`).
    **No `.cast-button` rule in the file ever does**, and `app/GrimoireStage.tsx` renders it as a direct child of
    `<section className="stage-hud">`. The primary call to action on the stage is not clickable. The same class
    inside `.side-sheet` works, because that ancestor is not `pointer-events: none`, which is presumably why
    nobody noticed. Fix the class of bug rather than the instance:
    ```css
    .stage-hud { pointer-events: none; }
    .stage-hud > * { pointer-events: auto; }
    ```
22. **A thumbs-up selects Stone.** In `src/input/HandInput._trackPose`:
    ```js
    const four = [fingers.index, fingers.middle, fingers.ring, fingers.pinky];
    if (!four.some(Boolean)) next = 'earth';
    ```
    The fist test ignores the thumb, and `fingers.thumb` is computed on the line above. Four fingers curled with
    the thumb out is read as a fist. Tighten to `!four.some(Boolean) && !fingers.thumb`. That fixes the misread
    **and** frees thumbs-up and thumbs-down as two unused verbs.
23. **`App.stageAnchor` is allocated and never written.** `src/core/App.js:50` allocates it; `:288`, `:291` and
    `:304` read it, so it is permanently `(0, 0, 0)`. Writing it moves three things at once with no
    re-allocation: the sun's shadow frustum (`environment.setFocus`), the dust volume (`dust.update`) and the
    camera's orbit centre (`rig.setAnchor`). **That is a complete arena-relocation primitive, already wired end to
    end, pinned to the origin.** If the Rite ever moves the ritual ground — between rounds, for the intro, for a
    close — this is the one line.
24. **A raw engine key leaks to the UI at `app/GrimoireStage.tsx:244`.** Elements are internally
    `['fire','water','earth','wind']` and publicly `air` for wind; `App.js` translates by hand at `:141`, `:201`
    and `:222`. The React island does not, in that one place.
25. **The `DIALS` literals at `app/GrimoireStage.tsx:26-47` duplicate engine defaults into React.** That is
    already a desync bug, not a pattern to copy. `src/config/settings.js` is the single source of truth.
26. **`app/grimoire-stage.css` uses `backdrop-filter` without the `-webkit-` prefix**, so the panel blur is absent
    on older WebKit.
27. **The engine has authority to open React UI.** `app/GrimoireStage.tsx`'s `grimoire:input-status` listener
    calls `setHandsOpen(true)` when the state is `ready` or `tracking`. Remove it before adding any further
    engine-to-React signals, or the seam rots.

### Licensing

28. **Both reference repositories are MIT, Copyright (c) 2026 mohamedachrefelouafi.** Any transplanted file,
    shader or substantial code fragment must carry attribution. `THIRD_PARTY_NOTICES.md` already exists and is
    where it goes. Do this in the same commit as the transplant, not afterwards.

---

## 12. Test contract changes

`tests/caster-first-contract.test.mjs` is a source-text-matching contract test — no DOM, no browser, no headless
anything. It is cheap and deterministic and the new work should extend it in the same style rather than
introducing a browser test runner.

### 12.1 Assertions that must change, and why that is safe

| Assertion | Today | Change | Why it is safe |
|---|---|---|---|
| `assert.match(stage, /elemental-montage\.png/)` | pins the raster intro | Replace with assertions that `src/intro/IntroDirector.js` exists and names all four elements | The test's intent is "the opening is four-element". The evidence moves; the intent is preserved. |
| `await access('../public/intro/elemental-montage.png')` | pins the file | Delete | The file is deleted in the same commit. |
| `await access('../output/imagegen/elemental-montage-source.png')` | pins the in-repo source | Delete | Same. |
| `assert.match(stage, /Hold an open palm until the ring fills/)` | pins onboarding copy | Update to the new string | Section 15 rewrites it to "Hold an open palm until the ring closes." Change the copy and the assertion in one commit. |
| `assert.match(hand, /Camera permission or hand tracking was unavailable/)` | pins fallback copy | Update to the new string | Same. |
| `assert.match(stage, /Mobile never requests your camera/)` | pins the mobile promise | Update to the new string | Same. |

Everything else in the file stays exactly as it is. In particular, keep all five `CasterPerformance` gesture-name
assertions, the `Standing Idle.fbx` and `spruit_sunrise.hdr` assertions, the `sites-vite-plugin.js` negative
assertions, the `mongodb` negative assertion, and the two `assert.rejects(access(...))` calls that keep the
deleted API and gateway deleted.

### 12.2 New tests to add

**`tests/no-network.test.mjs`** — the privacy claim's only enforcement. Walk every file under `src/` and `app/`
and reject `fetch(`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection`, `EventSource` and `sendBeacon`, with a
documented allowlist for the two MediaPipe CDN URLs in `src/input/HandInput.js` until they are self-hosted. This
widens the existing single-file `assert.doesNotMatch(stage, /fetch\(/)` into a real guard.

**`tests/cast-contract.test.mjs`** — lock the targeting contract. Assert that `src/input/AimController.js` emits
`'cast'`, `'arm'`, `'cancel'` and `'reject'`; that `src/input/CastRouter.js` is the only module in `src/` that
calls `abilities.cast(`; and that **no file under `src/abilities/` changed its `spawn(` signature away from
`spawn(curve)`. That last one is the guard that keeps line casts from quietly rewriting the ability layer the way
the upstream repository did.

**`tests/rite-contract.test.mjs`** — assert that `src/state/events.js` exports a constant for every event name
used in `app/` and `src/`, so a typo is a build failure rather than a silent no-op; and that
`src/state/preferences.js` is the only module touching `localStorage`.

---

## 13. Release blockers

**The asset licensing gate is a release blocker, not a nit.** `README.md` states that the upstream binary assets
retain their original licences and that redistribution rights are unconfirmed, and both are shipped:
`public/models/Standing Idle.fbx` (2.27 MiB) and `public/hdri/spruit_sunrise.hdr` (5.66 MiB). The decision table is in
section 10. Resolve it or hold the release on it explicitly; do not ship on the assumption that it is fine.

**The MediaPipe version skew is a correctness bug.** `package.json` pins
`@mediapipe/tasks-vision@^0.10.22-rc.20250304` while `src/input/HandInput.js` fetches WASM from
`cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`. The JavaScript API and the WASM binary are from
different builds. Pin them together or self-host both.

---

## 14. Implementation phases

Each phase is PR-sized, independently shippable, and leaves the product working. Do not start a phase until the
one it depends on is merged.

```
P0 Foundations ──┬── P1 Intro ─────────────┐
                 ├── P2 Targeting ──┬─ P4 The Rite ── P5 Onboarding ── P6 Polish
                 └── P3 UI system ──┘
```

### P0 — Foundations (no visible change)
The boring PR that makes the other five cheap. Ship it first and alone.
- `src/state/events.js` + `events.d.ts`: the event-name constants and payload types both trees import.
- `src/state/preferences.js`: owns `localStorage`, migrates `v2` → `v3`, handles disabled storage and quota.
- `src/state/riteStore.js`: the session store with `subscribe` / `get` / intents. Not wired to anything yet.
- `settings.rite` block; `range` and `minRange` on the four element blocks with `EXACT_SPELL_RANGES` entries
  registered under the **public** `air.*` spelling.
- Delete: `src/ui/glyphs.js`, `src/world/ContactShadows.js`, and the seven dead exports in
  `src/config/spell-contract.js`. **Leave `src/ui/styles.css` alone in this phase** — it styles the loading
  screen (§7) and splitting it belongs with the token work in P3.
- Fix `gl.shadowMap.needsUpdate` to stop re-rendering a 4096² map 60×/s.
- Give `toggleHelp` / `togglePose` / `toggleMode` real cases, or stop emitting them.
- **Done when**: `npm test` passes, the product looks and behaves identically, and the bundle is smaller.

### P1 — The intro (depends on P0)
- `src/intro/IntroDirector.js` and its four scripted curves.
- React: replace the overlay with the title composite; skip, reduced-motion and cold-open paths.
- Delete `public/intro/*` (5 files, 2.58 MiB) and `output/imagegen/elemental-montage-source.png` (2.58 MiB).
- Migrate the two test assertions that pin the montage.
- **Done when**: the acceptance criteria in §5 pass, and `public/` drops by ≥2.58 MiB.

### P2 — Targeting (depends on P0; independent of P1)
- `src/input/AimController.js` emitting `cast(origin, direction, distance)`.
- `src/effects/AimIndicator.js` and `src/effects/ZoneIndicator.js` as pooled ground quads on `LAYER.VFX`.
- `src/input/CastRouter.js`: the one door into `AbilityManager.cast`, with `PathDrawer` beside it, not under it.
- A cancel affordance (Escape and right-click), which the product has never had.
- **Ability, AbilityManager and the four element files are not touched.** If a diff in `src/abilities/` appears in
  this PR, something has gone wrong.
- **Done when**: a line cast and a drawn cast produce visually identical fire from the same origin.

### P3 — UI system (depends on P0; independent of P1 and P2)
- The `:root` token block; one exported element-colour constant replacing the three that disagree today.
- `src/ui/HUD.js` reduced to a toast; React takes all chrome.
- The dock with slot grammar, keeping `data-element` on the button itself.
- Focus trap, Escape, focus restoration and background `inert` on both sheets.
- The phone / tablet / desktop layouts.
- **Done when**: keyboard-only completes every verb, and both dialogs pass a focus-management check.

### P4 — The Rite (depends on P2 and P3)
- `src/game/Ward.js` (8 emissive procedural stones, no point lights), `src/game/sigils.js` (the deck),
  `src/game/scoreTrace.js`, and the state machine wired to `riteStore`.
- The Rite's open and close beats, with the ride as the close.
- **Done when**: a player can complete a three-sigil Rite and a stone can honestly stay dark.

### P5 — Onboarding (depends on P4)
- The ghost sigil, the four instructional lines, progressive disclosure of the dock.
- The hand-tracking trust ladder and the gesture guide; `HandInput` publishes its throttled state event.
- Every dead-end exit from §6's table.
- **Done when**: a first-time player casts successfully within 15 seconds without reading more than four lines.

### P6 — Polish (depends on everything)
- The adaptive quality ladder and the MediaPipe cadence.
- Calm mode, the photosensitivity cap, the reduced-motion variants of every new animation.
- The privacy note, the camera-state indicator, and the widened network-guard test.
- The debug overlay and the playtest script.
- Self-host MediaPipe WASM + model, or pin the version skew.

## 15. Out of scope — stated so nobody drifts
- Any server, account, database, sharing, remixing or lineage. Commit 93a438e deleted all of it deliberately.
- Summons and drone control. They need an entity, an AI and a second control scheme.
- **The WebRTC phone camera.** This is worth stating with the evidence, because the reference repository makes it
  look shippable and it is not. Its signalling is `tools/vite-plugin-phone-camera.js`, a Vite plugin declared
  **`apply: 'serve'`** and registered in `configureServer` — it exists only in the dev server and is absent from
  any build. It is a three-route mailbox (`GET /info`, `GET /events` as Server-Sent Events, `POST /send`) whose
  rooms live in an **in-process `Map`**, which a Cloudflare Worker has no equivalent for. And both peers construct
  `new RTCPeerConnection({ iceServers: [] })` — host candidates only, no STUN, no TURN — which works because, in
  the author's words, "both devices are on one Wi-Fi". Over the public internet it simply does not connect.
  Shipping it would mean building a signalling service and a TURN relay, which is a server, which this product
  does not have and should not get.
- Audio. §5 argues the case; revisit only as one toggle, off by default.
- Multiplayer, leaderboards, or anything that would require the score to leave the browser.
- A light theme.

### Definition of done for the whole update
1. `npm run build && npm test` passes.
2. A first-time visitor casts successfully within 15 seconds and completes a Rite within 3 minutes.
3. Nothing in `src/` or `app/` calls `fetch`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection`, `sendBeacon` or
   `EventSource`, enforced by test, with the MediaPipe CDN URLs as the only documented exception.
4. Keyboard alone reaches every verb; both dialogs trap and restore focus.
5. `prefers-reduced-motion` has a designed alternative for every new animation, not a disabled one.
6. 60 fps on a mid laptop at the `high` tier; the ladder holds 30 fps on a mid phone.
7. `public/` is smaller than it is today.
8. The asset licensing gate is resolved, or the release is explicitly held on it.

---

## 16. Appendix — the complete copy deck

### Voice
Plain, warm, second person, present tense. **The world speaks about the world; the machine speaks about the
machine, and the machine never borrows ritual language to describe a technical failure.** No exclamation marks.
No "Oops". No "Awesome". Sentences under twelve words. The product is confident, not chatty.

### Every string in the product today, and what replaces it

#### The world speaking
| Where | Today | Ship |
|---|---|---|
| Wordmark eyebrow | Local elemental stage | Nothing. The wordmark carries it. |
| Wordmark | Living Grimoire | The Living Grimoire |
| Intro line 1 | Four forces. One hand. | Four forces answer one hand. |
| Intro line 2 | Become the motion. | *(cut — the sequence now shows it)* |
| Intro footnote | Camera frames and landmarks stay in this browser. | Nothing leaves this tab. |
| Patch applied | The spell shifts in your hand. | *(keep — correct register)* |
| Ride armed | Draw a path for the air ride. | Draw the path you want to ride. |
| Ride begun | The caster rides the current. | *(keep)* |
| Ride disarmed | Casting mode restored. | Back to casting. |
| Cast resolved | `${Label} released. The caster is recovering.` | *(replaced by the trace resolution — §8)* |

#### The loader (`App.load`, bound to real progress)
| Today | Ship |
|---|---|
| Preparing the caster… | *(keep)* |
| Calling the caster… | *(keep)* |
| Lighting the ritual ground… | *(keep)* |
| Warming the elements… | *(keep)* |
| Setting the performance… | *(keep)* |
These four are the best copy in the product. The problem was never the words — it was that nobody could see them
behind a `z-index: 100` overlay (§5).

#### The machine speaking
| Where | Today | Ship |
|---|---|---|
| Camera idle | Enable your camera only when you are ready. | Cast with your hands. Your camera never leaves this tab. |
| Requesting | Requesting camera permission… | Waiting for your browser's camera permission. |
| Ready | Hand tracking is ready (${delegate}). Video stays in this browser. | Hands are ready. Nothing is recorded. |
| Denied / failed | Camera permission or hand tracking was unavailable. Pointer casting is ready. | No camera, no problem. Keep casting with the pointer. |
| Unsupported | Camera input is not available here. Pointer casting is ready. | This browser cannot open a camera. The pointer works the same. |
| Too slow | Tracking slowed, so pointer casting is ready. | Tracking could not keep up, so the pointer has it. Try hands again from the dock. |
| Mobile | Touch casting is ready. Mobile never requests your camera. | Touch casting is ready. We never ask a phone for its camera. |
| Not booted | The stage is still waking. Try again in a moment. | The stage is still waking. One moment. |
| Seeking | Seeking your hand… | Looking for your hand |
| Found | Hand found | *(keep)* |
| Effects cleared | Effects cleared. | *(keep)* |
| Paused / resumed | Paused. / Resumed. | *(keep)* |

#### New strings this update introduces
| Where | Ship |
|---|---|
| Ghost sigil, first | Trace it. |
| Ghost sigil, too short | Longer. Follow it to the end. |
| First success | Wind answered. There are three more. |
| Ward complete | The Ward is whole. |
| Ward incomplete at close | Two stones stayed dark. The Rite still ends. |
| Rite available | The Rite is open. |
| Leave the Rite | Set the Rite aside |
| Hands offer | Cast with your hands. Your camera never leaves this tab. |
| Hands decline | Not now |
| Attunement | Hold an open palm until the ring closes. |
| Tracking lost | Lower your hand to rest. Raise it to go on. |
| Quality stepped down | Running in balanced mode for a steady frame rate. |
| Storage unavailable | Progress is not being saved in this browser. |
| WebGL unavailable | This browser cannot open the stage. Try a desktop browser with hardware acceleration on. |
| Context lost | The stage lost its graphics context. Reload to continue. |
| MediaPipe unreachable | The hand tracker could not be fetched. Pointer casting is ready. |
| Replay onboarding | Replay the attunement |

#### Strings the tests pin (do not change without changing the test)
`tests/caster-first-contract.test.mjs` asserts these exact substrings exist:
- `Camera permission or hand tracking was unavailable` — in `src/input/HandInput.js`
- `Mobile never requests your camera` — in `app/GrimoireStage.tsx`
- `Hold an open palm until the ring fills` — in `app/GrimoireStage.tsx`
- `Skip intro` — in `app/GrimoireStage.tsx`

The rewrite changes three of the four. **Update the assertions in the same commit as the copy**, and keep their
intent: a fallback message exists, mobile is camera-free, the attunement is taught, the intro is skippable.
