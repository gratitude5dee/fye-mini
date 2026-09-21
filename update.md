# update.md — FYE

**Target repository:** `gratitude5dee/fye-mini` · branch `claude/epic-hypatia-eyicbk` · deployed at `avatar.wzrd.tech`
**Audience:** the engineer implementing this directly into the repository.
**Scope:** the intro animation, onboarding, the UI, and the game flow.

---

## Build status

Implemented on this branch, verified by `npm test` (82 contract tests) and by driving the real app in a browser:

| Phase | State |
|---|---|
| **P0 Foundations** | **Built.** Event contract, preferences with the v2 migration, the session store, the `rite` settings block, the dead-code removal, and all three live bugs. |
| **P1 Intro** | **Built.** `IntroDirector` fades the renderer's own grade and drives the rig's settings, gated on readiness. The 2.58 MiB montage is deleted. A `sigil` beat was added after the reference video: the element's mark, rasterised and sampled into a mote cloud that converges on the load's own progress and scatters as the stage arrives. The stage chrome is held back until the opening ends. |
| **P4 The Rite** | **Built.** Generated layouts, the stroke resolver, the Ward, and the session wired into the frame loop. |
| **P5 Onboarding** | **Partly built.** The ghost line ships and retires after one solve. P7d now supplies the trust ladder and contextual guide; the remaining onboarding work stays outside this release. |
| **P7a Tracker** | **Built.** All four anti-misfire guards, the lost state, the ratio-based extension, and the throttled state channel. |
| **P7b Continuous axes** | **Built.** Lift and spread, end to end. Measured: earth flat peaks at 0.00 m and 2.40 m with a raised hand. Hazard clearance is judged against a declared per-element `flightFloor` rather than the live `pathHeight`, because water's altitude reads the clock and the same line could otherwise solve or fail depending on when it was cast. Only fire clears unaided. |
| **P3 UI system** | **Built.** One `:root` token block, one stylesheet, `src/ui/HUD.js` down to a toast and a loading screen, the dock with slot grammar (sigil, name, bound key, active, offered, dwell ring), and three real layouts at 679/680–1024/above. React now also listens for `SELECTED`, which it never did — keys 1–4, Q/E and every hand gesture changed the engine's element while the dock went on showing the old one. |
| **P6 Polish** | **Built**, less the debug overlay. Adaptive quality ladder on measured median frame time with hysteresis, calm mode as a preference independent of `prefers-reduced-motion`, MediaPipe cadence with the watchdog lowered in proportion, and `SettingsLease` so the ladder, calm mode and the opening can borrow the same settings tree the editor writes to without reverting a dial the player moved. The photosensitivity cap shipped in P0 and is now rate-limited without ever dimming a live flash. |
| P7c Two hands | Not built. Needs the handedness mirror fix (§11, hazard 6) and stroke identity (hazard 7) first. The quality ladder already refuses it on the conservative tier, which is where §10 put it. |
| P7d Guide and trust ladder | **Built.** The dock offers hands only after two pointer successes, the pre-permission sheet has an equal-weight Not now path, and the selected slot drives a live, lost-aware gesture guide. |

**The prototype gate in §14 was never run.** Nobody has watched five people play this. Everything below is still
the plan; the table above is what exists.

---

## 0. How to use this document

Read sections 1 through 4 before touching code. They are the diagnosis and the ground truth, and several
widely-believed things about this codebase turn out to be wrong.

Every factual claim about the repository carries a `file:line`. Claims I could not verify are marked
**UNVERIFIED** rather than smoothed over. Where the reference repositories are quoted, the quotes come from their
actual source, which is cloned and read, not from their READMEs — in two places the READMEs are misleading and
section 4 says how.

**This document was reviewed before you got it, and §5, §8, §14 and parts of §6 and §7 were rewritten as a
result.** Where a first draft was wrong, the section says so and says why, so the same idea does not come back.
The reviewer's closing call is worth passing on: **§3, §4, §9, §11 and §12 are engineering reference that will
outlive whatever happens to the game design, and should be lifted into an `ARCHITECTURE.md` regardless.** They
have nothing to do with the loop and should not die with it.

Sections 5 through 8 are the four tracks the brief asks for. Section 9 is the shared skeleton they all hang on,
and it must be built first. **Read section 11 before writing any targeting or hand-tracking code** — it lists
thirty-one hazards that produce working-looking code which is subtly wrong. Section 14 is the phased plan; work
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
| 13 | Release checks |
| 14 | Implementation phases |
| 15 | Out of scope |
| 16 | Appendix — the complete copy deck |

```sh
npm install          # already present in this checkout (153 packages)
npm run dev          # vinext dev on the Cloudflare vite plugin
npm run build        # required before tests: `npm test` runs the build first
npm test             # node --test over tests/*.test.mjs
```

---

## 1. Executive summary

FYE is a genuinely good VFX engine wearing a product that gives nobody a reason to stay. A visitor
draws a stroke, a beautiful elemental effect travels it, a caster performs the motion, and then nothing happens and
nothing has changed. There is no goal, no target, no progression, no failure, and no second minute.

The opening makes that worse rather than better. A 2.58 MiB raster montage covers the live WebGL stage at
`z-index: 100` for 7.6 seconds, competing with the 5.66 MiB HDR and 2.27 MiB character rig for bandwidth, while the
real loading progress renders invisibly underneath it.

Five changes:

1. **The intro becomes the product starting.** Delete the montage. The stage fades up under one line of type and
   the first problem burns into the ground at about two seconds. The player's own first line is the introduction,
   so there is one code path instead of four and nothing to skip.
2. **Onboarding teaches by doing, wordlessly.** One lit waystone, one ghost line running to it, and after the
   first success the ghost never returns. Zero lines of instructional text. Hand tracking is offered only after
   the player has already succeeded without a camera, and never on a phone.
3. **Hand tracking earns its place on an axis a mouse does not have.** `PathDrawer` raycasts onto the ground
   plane, so every point of a mouse stroke is at `y = 0` by construction. A hand adds lift, width and a free off
   hand — so a skilled player can take *earth* over a hazard that only fire crosses by nature. Everything still
   works with a pointer; the hand raises the ceiling, never the floor.
4. **The UI becomes one system.** One token set instead of the two that ship today, one HUD owner instead of the
   split that leaves half of `src/ui/HUD.js` inert, and a real dock. The aim-and-circle indicators from the
   reference repositories are documented in §4.1 and **not built** — §8's loop does not need them.
5. **The game becomes the drawn shape — a problem to solve, not a shape to copy.** Waystones light on the ground
   with a hazard between them: *take fire through all three without crossing the water*. You draw one line, and
   the line is yours. The test is points against a curve at release — no physics, no collision, no reference
   shape, on a polyline the code already computes and throws away. It is cheaper than grading a copy would be,
   and it is the only version that makes the four elements matter, because fire already flies over hazards that
   earth cannot cross.

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
resamples every stroke into a preallocated 320-`Vector3` buffer, filling
`clamp(round(length × settings.input.samplesPerUnit), 2, 320)` arc-length-uniform points at `samplesPerUnit: 3.0`,
then discards them after one use (`src/input/PathDrawer.js:_rebuild`). **320 is the buffer's capacity, not the
output count** — a 4 m stroke yields about twelve points, which §8 depends on.

There is a sharper version of this. `LinearAbiltyCastingExtendedThreeJS` contains a directory called
`src/archive/` holding `Ability.js`, `FireAbility.js`, `WaterAbility.js`, `EarthAbility.js`, `WindAbility.js`,
`PathDrawer.js`, `PathTrail.js`, `AirScooter.js`, `WalkController.js`, `ProceduralGeometry.js`,
`config/legacySettings.js` and six materials — **fye-mini's own code, retired upstream**. **Both** reference
repositories carry that directory; the sibling's `README.md:737` calls it "the previous incarnation of this
project: a four-element bending sandbox". fye-mini is that archive, kept alive and given a
caster. Upstream moved to straight-line casts and threw the curves away. The curve is the asset.

So: take from the reference repositories the things that survive contact with a different verb — the hit test,
the cancel affordance, the settings discipline, and the engineering hazards in §11 — and **invent the loop
ourselves**. Neither of them has one, and §14 cuts their targeting work entirely, because that is the gravity
pulling this design back toward what they already built.

One more thing this thesis has to survive, stated here so it is not buried: **a drawn line is only a richer
surface if the player invents it.** §8's first draft failed that test by showing a shape and grading the copy,
and was rewritten. If a future version reintroduces a reference shape to match, the thesis is dead and this is
a VFX sandbox again.

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
  `app/GrimoireStage.tsx` nor `src/core/App.js`. Commit 93a438e deliberately deleted 10 API routes and 6 shared
  helpers, a MongoDB bootstrap, a Docker gateway, and the Spellwright AI endpoint. Local-first is a product decision, not an accident.
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
  `App._onAbilityImpact()` currently ignores the argument (`src/core/App.js:196`). Free hook for impact-radius damage.
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
  wired end to end and never used. §8's solve quality should drive it: a clean solve makes the caster commit, a
  scrape makes them hesitate, with no new animation code at all.

### Dead / dormant code (verified by grep, not assumed)
- `src/ui/HUD.js` queries `.element-card`, `.mode-card`, `[data-stat="fps|particles|calls|abilities"]`, `.hud__help`,
  `[data-blurb]`, `.hud__elements`. React renders only `<div id="hud" className="hud" aria-live="polite" />` with no
  children. So `setMode` and `toggleHelp` are genuinely **inert**, and the stats readout is *visually* inert —
  but two things still work and a careless cut breaks both:
  - **`setElement` is NOT inert.** Its `this.cards` loop is a no-op over an empty `Map`, but its last line calls
    `this.showToast(...)`, so every element change — including the `selectElement('wind')` in the `App`
    constructor — currently shows "Gale selected" / "Fire selected". Cut `HUD.js` to `showToast` only and that
    toast silently disappears unless React re-emits it.
  - **The stats readout still costs.** `HUD.update` calls `collect()` — which walks `particles.countLive()` —
    **before** the `if (!this.stats.fps) return;` bailout, so that work is paid about 2.5 times a second for
    nothing.
- **Two competing stylesheets ship at once, and one of them is load-bearing.** `app/globals.css:1` does
  `@import '../src/ui/styles.css'` — 437 lines of a "standalone UI shell" with its own token set (`--ui-bg`,
  `--ui-bg-solid`, `--ui-border`, `--ui-text`, `--ui-text-dim`, `--ui-accent`). Its `.element-card`,
  `.mode-card` and `.hud__elements` / `.hud__modes` / `.hud__stats` / `.hud__help` rules style markup React
  never renders, so those are dead. **But `.loader`, `.loader__inner`, `.loader__sigil`, `.loader__title`,
  `.loader__bar`, `.loader__status`, `.sigil`, `.sigil--fire|water|earth|air` and `.lil-gui` are live** — React
  renders every one of those classes, and `app/grimoire-stage.css` contains **zero** references to `loader` or
  `sigil`. **Deleting `src/ui/styles.css` would leave the loading screen, the toast and the editor completely
  unstyled.** Split it, do not delete it. The live set is larger than the loader:
  `.hud`, **`.hud__toast` and `.hud__toast.is-visible`** (which `showToast` writes and which supply its opacity,
  pill, position and transition), the `:root` `--ui-*` block those consume, the global `* { box-sizing }` and
  `html, body` reset, a **second `#viewport` rule** competing with `app/grimoire-stage.css:3`, the `.loader*`
  and `.sigil*` families, and `.lil-gui`. Dead: `.element-card*`, `.mode-card*`, `.hud__elements`,
  `.hud__modes*`, `.hud__stats`, `.hud__help`, `.hud__panel`, `.hud__title`.
- `src/ui/glyphs.js` — **no importers anywhere.** Dead.
- `src/world/ContactShadows.js` — **no importers anywhere.** Dead, even though `src/core/Layers.js` documents a
  `CONTACT` layer for it and `settings.environment.contactShadow` (0.55) exists.
- **`src/animation/SittingPose.js` is live, not dormant — do not delete it.** `CharacterController:118`
  constructs it and `:119` takes the rig's `forwardAxis` from `this.sitting.forward`, so it is load-bearing even
  when nobody is riding. `WalkController:203` then calls `setPose('sitting', …)` for the ride itself. It is the
  ride pose and the forward-axis source, and 451 lines of it run on every boot.
- Reachable but unsurfaced: `src/ui/PresetManager.js` (used by `Editor`), `src/effects/AirScooter.js` (used by
  `WalkController`). `src/materials/DistortionMaterial.js` is live in fire, water and wind abilities.
- `public/intro/{fire,water,earth,wind}-fallback.svg` (850–1008 bytes each; `du` rounds them to 4 KiB blocks) are
  referenced nowhere.
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
| `public/angtexture.png` | 10.98 KiB |
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
**Three files in the reference `src/effects/` are byte-identical to fye-mini's own** — `CameraShake.js`,
`LightPool.js` and `ScreenFlash.js`, verified with `cmp`. `BurstSphere.js` and `GroundDecals.js` are **not**:
the reference's are 326 and 411 lines against fye-mini's 275 and 265. That second gap matters, because the
indicator work below leans on `GroundDecals` — fye-mini's copy is about 64 % the size, and while its `DecalType`
enum, its `uAge` / `uIntensity` / `uWidth` / `uColorA` / `uColorB` uniforms and its `#if DECAL == n` branches all
check out, **do not assume parity**. We are not importing a foreign architecture; we are re-joining a fork, but
the fork has moved.

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
`update(dt)`, `setElement(element)`. **Four** events — `'arm'`, `'cancel'`, `'reject'` (fired by `confirm()` when
the target is inside `minRange`) and

```js
this.emit('cast', this.origin, this.direction, this.distance);
```

emitted only when `confirm()` succeeds on a valid aim. Distance is clamped to
`[Math.max(0.2, cfg.minRange), Math.max(0.4, cfg.range)]`. The zone shape is selected by `CastShape.ZONE`.

**Important correction, from the real source rather than the README.** In `LinearAbilty...`, `Ability.spawn` was
*rewritten* to take the triple directly:

```js
// LinearAbilty…/src/abilities/Ability.js — the byte-identical copy is at
// HandCastAbilityThreeJS/src/abilities/Ability.js:184
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
(`src/abilities/Ability.js:136-159`; `getPointAt` is reached indirectly,
via `_samplePath` at `:148` → `:221`). A `THREE.LineCurve3` satisfies all three. So fye-mini can add line casts and
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
in the fragment shader. (The brief called it a "swinging" arrow. It does not swing — it snaps to the heading and
only the body eases.) Outline, chevrons, noise and the range-cap arc are all derived from that one distance.
**`shaftWidth: 0.42` is a *half*-width**, so the shaft is 0.84 m across — and it stays that way regardless of
cast distance, so a long cast does not read as a fat cast. Same for `headWidth: 1.35`, which is the half-width at
the base of the head.

**`src/effects/ZoneIndicator.js` (far cast).** Two parts: a footprint quad whose fragment shader remaps UV into
*metres from the target* so the boundary stays **0.34 m thick at any radius**, plus a reach ring built from the
ribbon strip bent into a circle. On arm it "snaps out past its radius and settles back", so it reads as an
intentional player action rather than a UI overlay appearing.

Both are ground-projected world-space shader quads. fye-mini already has the exact machinery: `GroundDecals.js`
pools `PlaneGeometry` + `ShaderMaterial` quads with `uAge/uIntensity/uWidth/uColorA/uColorB` and a `#if DECAL == n`
branch table, and `RibbonGeometry.build(points, {count, width, mode, widthProfile})` will bend a strip into a ring.

### Settings convention we are missing

The reference ability blocks carry `range`, `minRange`, `speed` and `cooldown` keyed by element id. fye-mini's
element blocks have `speed` and `lifetime` but **no `range`, `minRange` or `cooldown`**. Add those to
`settings.fire/water/earth/wind` **and to `EXACT_SPELL_RANGES` under the public `air.*` spelling**, or
`App._applyFlatPatch` silently drops them.

Nothing else is needed. An earlier draft also said to update `SPELL_SETTING_BLOCKS`, or `validateSpellSettings`
would reject the keys; both clauses were wrong. `SPELL_SETTING_BLOCKS` is a flat list of *block names* that
already contains `'fire'`, and `validateSpellSettings` has **zero live callers** (§3).

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

`linear/src/combat/` is 2,658 lines (the equivalent in the sibling repo is 2,720) across `Dummy.js`, `DummyField.js` and `Ragdoll.js` — a real hit system with a
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

#**A note on attribution.** Both reference repositories carry `src/archive/` and `src/combat/`, with slightly
different contents — the combat directory is 2,658 lines in one and 2,720 in the other, the difference being
`Dummy.js`. The quotes in this section were read from the clone of `LinearAbiltyCastingExtendedThreeJS`; every
one of them also appears in `HandCastAbilityThreeJS`. If you clone either to check, you will find them. One
inline attribution to correct: the "Nothing was added to any ability" passage is the **class-level** comment on
`DummyField`, not `applyHits`'s own.

Also worth knowing, since §4 opens by calling these four-element sandboxes: that is only true of their archives.
The live `src/abilities/` in the sibling repo holds **nine**.

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
| `reveal` / **`snap`** | 0.07 / **1.18** | `snap` is what makes the circle "snap out past its radius and settle back" |
| `reach` / `reachWidth` / `reachDashes` | 0.7 / 0.05 / 64 | the reach ring at `range` |
| `reachDashGap` / `reachSpin` / `reachLead` / `reachSegments` | 0.42 / 0.03 / 0.9 / 192 | its dashes and rotation |
| `height` | 0.035 | hover above the floor |

The reach-ring group and `snap` were missing from an earlier draft of this table, and `snap` is precisely the key
that implements the settling behaviour the prose describes.

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
| ~0 ms | The **second** effect dynamic-imports `../src/main.js`, which constructs `App` and calls `app.load()`. | `GrimoireStage.tsx` mount effect |
| ~0 ms | `App.load()` starts `Promise.all([character.load(), assets.loadHDR('/hdri/spruit_sunrise.hdr')])` — **2.27 MiB + 5.66 MiB**. | `src/core/App.js:243` |
| 0–850 ms | Four `.intro__panel::before` clip-path wipes run, staggered 120 ms. | `panel-reveal` |
| 400–880 ms | Four `figcaption` labels fade in. | `intro-label` |
| 0–∞ | `panel-drift` (7.2 s alternating scale/translate) and `panel-sheen` (3.4 s infinite) loop. | CSS |
| same commit, **before** the import | The **first** effect reads `localStorage` and calls `setIntroVisible(!preferences.introSeen)`. React runs effects in declaration order, so this is not "a frame later" — but `useState(true)` has already painted, so **a returning visitor still sees one frame of intro, then a hard cut.** | `readPreferences()` effect |
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

4. **The reduced-motion path is a 900 ms blink.** Not an alternative — an absence. The
   `prefers-reduced-motion` block is **scoped to `.grimoire-stage` descendants**, not global, and it does not
   break the loader: `#loader-fill`'s motion is a `transition: width 0.25s ease` that the rule merely makes
   instant, while `LoadingScreen.setProgress` writes `style.width` directly, so the bar still tracks progress —
   it just stops gliding.

5. **The returning visitor gets a flash of intro then a cut**, because `introVisible` initialises to `true` and is
   corrected one effect later.

**The arithmetic is the argument, and it is worse than an earlier draft claimed.** `panel-reveal` runs 850 ms
with `animation-delay: calc(var(--panel-index) * 120ms)` across four panels, so the last wipe finishes at
360 + 850 = **1210 ms**. `intro-label` runs 400 ms from `400ms + index * 120ms`, so the last label lands at
**1160 ms**. After that nothing is new: `panel-drift` and `panel-sheen` simply loop. So about **1.2 s of content
is stretched across 7600 ms — roughly 84 % dead air**, laid over a stage that is already rendering.

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

#### The first draft's sequence, bound to real load milestones
`App.load()` already publishes honest progress. Bind each beat to a milestone rather than a clock, so the sequence
can never outrun the load or wait on an empty screen. `LoadingScreen.setProgress(ratio, message)` is called at
0.05, then `0.05 + ratio * 0.48` while assets stream, then 0.62, 0.85, 1.0 (`src/core/App.js:237-262`).

| Beat | Gate | Duration | What is on screen |
|---|---|---|---|
| **0 — Dark** | first paint | 0–400 ms | Black. One line of type fades up: *FYE*. No canvas yet; nothing is loading that the player can see. |
| **1 — The ground** | HDR + FBX resolved (`progress >= 0.53`) | ~1200 ms | The real canvas fades in from black via `GradeShader.uLift`. Camera high and far (`distance 22`, `polar 0.45`). `DustMotes` already drifting. The caster is a silhouette. |
| **2 — Four answers** | `abilities.warm()` done (`progress >= 0.62`) | 4 × 900 ms | Four scripted casts from the **real** `AbilityManager` along four fixed curves. The **real** `CasterPerformance` runs gather → aim → release → recovery for each. The camera pushes in one step per element. |
| **3 — The wordmark** | `compileAsync` resolved (`progress >= 0.85`) | 900 ms | Title holds over the settled stage, then dissolves. Camera arrives at the play framing (`settings.camera.distance 11.5`, `targetHeight 1.35`). |
| **4 — Hand on the controls** | `progress === 1` | 600 ms | HUD elements stagger in. The first sigil (or, in the sandbox, the ghost stroke) burns into the ground. `IntroDirector` releases the camera. |

Total on a warm cache: ~7.4 s. **Cold**: beats block on their gates, and beat 1 holds a designed "breathing dark"
rather than stalling — the screen is never static and never lies about progress.

#### Reviewed down to one path, and here is why

The sequence above was reviewed and two objections stuck.

**First, on a warm cache it becomes the thing it replaces.** Section 5.1's headline criticism of the current
intro is that its timer and its load are unrelated. Binding beats to load milestones fixes that on a cold visit —
but on every visit after the first, all five gates pass within a few hundred milliseconds and the sequence
degrades into a hardcoded 7.4-second timer with nothing left to wait for. That is the old sin with better art
direction, on precisely the loads where the player is least patient.

**Second, its own acceptance criterion says it is optional.** "Skipping at any point lands in exactly the same
state as watching to the end" means the sequence carries no information the player needs. And it is four separate
choreographies — full, skip, reduced-motion and cold-open — each with its own camera handoff, its own test and
its own regression, for the least replayed seven seconds in the product.

**So: keep beats 0 and 1, then stop.**

| Beat | Gate | Duration | What is on screen |
|---|---|---|---|
| **0 — Dark** | first paint | 0–400 ms | Black. One line of type fades up: *FYE*. |
| **1 — The ground** | `progress >= 0.53` (HDR and rig resolved) | ~1000 ms | The real canvas fades up from black through `GradeShader.uLift`. Dust already drifting. The caster is a silhouette. |
| **2 — The problem** | `progress === 1` | 400 ms | The first layout burns into the ground. The HUD staggers in. The camera is already at the play framing. |

**Do not demonstrate four elements.** Let the player's own first line be the introduction, and let the other three
elements be introduced by being *needed* (§8) rather than performed at them.

This buys: **one code path instead of four** — cold, warm, returning and reduced-motion all become "fade up,
present the problem", differing only in the fade duration; an honest gate, because you genuinely cannot draw
before the stage exists; and a player whose first memory of the product is something they did at about two
seconds rather than something they watched until eight. A player who casts at two seconds is a different player.

`IntroDirector` survives as a class, but it owns roughly ninety lines and one camera move, not five beats and a
skip protocol.

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

#### The four curves (retained only if the four-cast sequence is revived)
Ground-plane `CatmullRomCurve3`s, each drawn *as a hand would draw it* — no straight lines, no symmetry.
Fire hooks, water sweeps wide, earth drives short and heavy, air spirals. Each cast is issued with
`abilities.cast(curve, element)` — the element argument already exists on `AbilityManager.cast`
(`src/abilities/AbilityManager.js:67`) and the current app never uses it.

#### The title composite
DOM over canvas, not canvas text. `mix-blend-mode: screen` on a `Fraunces` wordmark sitting above `#viewport`,
masked by a `clip-path` wipe that travels in the same direction as the air cast beneath it, so the type and the
VFX share one motion. It dissolves by animating the mask out, never by fading opacity on a blend-mode layer
(which greys against a dark stage).

#### Skip, reduced motion and the returning visitor: one path, three durations

The first draft specified four separate choreographies with four camera handoffs and four regressions. The
single-path sequence collapses them into one code path that differs only in how long the fade takes.

| Case | Beat 0 | Beat 1 | Beat 2 |
|---|---|---|---|
| First visit, cold cache | 400 ms | holds on the gate, breathing rather than static | 400 ms |
| First visit, warm cache | 400 ms | 1000 ms | 400 ms |
| Returning visitor | 0 ms | 600 ms | 400 ms |
| `prefers-reduced-motion` | 400 ms, cross-fade | 600 ms, **no camera move at all** | 400 ms |

**Skip** is a click that sets the remaining beat durations to their floor. It is not a separate path, so it cannot
land the player in a different state — which is what the first draft's "skipping lands in exactly the same state"
criterion was really asking for, and it gets it by construction rather than by testing.

**Reduced motion is a designed variant, not a disabled one.** The rig sits at the play framing from the first
frame, there is no dolly and no drift, and the wordmark cross-fades rather than wiping. Same information, no
vestibular load. Note that the current `prefers-reduced-motion` block
(`app/grimoire-stage.css:53`) is scoped to `.grimoire-stage` descendants and removes the loader fill's 0.25 s
ease rather than breaking it; it needs replacing with designed variants rather than extending.

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

- With a cold cache and the network throttled to Fast 3G, the screen is never static for more than 900 ms and the
  progress the player sees never exceeds the real asset progress.
- **The player can draw their first line within three seconds of first paint on a warm cache.**
- Skipping at any point lands in the same state as watching to the end — guaranteed by construction, since skip
  only shortens durations on one path.
- With `prefers-reduced-motion: reduce`, the camera's world position is identical on frame 1 and frame 144.
- `public/intro/` is empty and `git ls-files public output | xargs du -ch` drops by at least 5.08 MiB.
- There is exactly one intro code path. A grep for beat handling finds one sequence, not four.

#### Two implementation caveats (flagged, not hidden)
1. **`node_modules` is absent from this checkout.** Nothing in this document was verified against the installed
   three.js. `OrbitControls.setAzimuthalAngle()` exists in modern three and is the natural way to swing the intro
   camera, but it must be called **before** `controls.update()` runs inside `CameraRig.update()`, and
   `CameraRig.update()` is called late in `App.frame()` (after `shake.update` and `flash.update`). Verify the method
   exists in `three@0.185.1` and verify the call ordering before relying on it. The fallback needs no OrbitControls
   API at all: drive `settings.camera.minPolar`/`maxPolar` pinned to the same value — `CameraRig.update()` copies
   both into the controls every frame (`src/core/CameraRig.js:96-97`) — and let the rig resolve the rest.
2. **`npm test` runs `npm run build` first** (`package.json`), so every test run is a full vinext + Cloudflare build.
   Expect it to be slow and to need network access for the first `npm install`.

---

## 6. Track B — Onboarding

### Targets
First self-directed successful cast by **15 s** from first paint. First "I did that on purpose" by **45 s**.
Camera never requested before the player has succeeded without it.

### The first sixty seconds

Rewritten alongside §8. The old version taught tracing; this one teaches the verb and then gets out of the way.

| t | What the player does | What the product does |
|---|---|---|
| 0–2 s | Watches | The stage fades up. One line of type: *FYE* (§5) |
| ~2 s | — | One waystone lights on the ground, a few metres from the caster. A **ghost line** curves from the caster to it |
| 2–8 s | Draws | `PathTrail` follows the finger. The ghost brightens where the stroke runs near it and dims where it does not — the correction is spatial, not textual |
| ~8 s | Releases | The element travels their line. The waystone lights. **First success, inside ten seconds.** |
| 8–12 s | — | The ghost does not return. A **second** waystone lights, further out and off to one side. No text |
| 12–20 s | Draws again, unguided | Their own line. Second stone. This is the first line that is entirely theirs |
| 20–30 s | — | A third problem, now with a hazard between the caster and the stone, and the dock fades in with the element that can cross it already active |
| 30–45 s | Chooses an element and draws | The first real decision |
| 45–60 s | — | The Rite opens, or they keep playing. Both are correct, neither is nagged |

**Counted honestly, the first draft broke its own rule.** It claimed "four short lines" and then shipped seven
before the Rite opened, on top of §16's 31 new or rewritten strings, the gesture guide's rows, the pre-permission
panel, the privacy note and the accessibility statement.

**The ghost is the whole tutorial, and the total instructional text is zero lines.** A lit stone on an empty dark
stage with a glowing line running to it needs no caption. Every word after that competes with something the
player is now actively doing, and loses. If the ghost does not teach on its own, the ghost is wrong and more text
will not save it.

### The ghost line

The single best mechanism in the first draft, and it survives the rewrite intact — **but its job changed**. It no
longer shows a shape to copy. It shows, once, that *a line can be drawn from here to there*, and then it never
appears again. The player's second line is already their own.

Reuse, do not rebuild: a second `PathTrail` instance with a dimmer material is the ghost renderer, and
`RibbonGeometry.build(points, { count, width, mode, widthProfile })` already accepts an arbitrary polyline.

- **Live feedback**: per-sample proximity drives the ghost's per-vertex alpha. Drawing near it makes it glow;
  drifting makes it fade. No text, no counter, no "try again".
- **Retirement**: after **one** success, permanently. **Do not auto-complete it on failure** — the first draft
  had the ghost finish itself in front of the player, which is the game taking the pen out of your hand in the
  first thirty seconds. Instead **widen the waystone's radius silently** on each retry until they succeed. The
  player never learns they were helped, which is the only kind of help that does not sting.
- **`minPathLength` (1.6 world units) currently discards a short stroke in total silence** (`PathDrawer.end()`
  emits `cancel`, which has no listener — §3). This is the cheapest real fix in the document and it is about five
  lines. During onboarding a too-short stroke makes the ghost pulse once. Still no words.

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
4. **Teach pinch by doing.** The ghost line returns, once, for hands. The pinch threshold is already hysteretic
   (down 0.32 / up 0.48 of hand scale) so a held pinch is stable.
5. **Teach lift by needing it, not by explaining it.** The first hand layout puts a hazard where the ghost line
   has to rise. Nothing says "raise your palm" — the ghost itself rises, and the player's hand follows it,
   because a hand following a line in space is what a hand does. This is the whole reason hands exist in this
   product (§8), and it costs one authored layout.
6. **Recovery is designed, not an error.** Tracking loss is a first-class state with its own copy, not a toast.

### The gesture guide, and the hand model underneath it

Both are read from the real source at `HandCastAbilityThreeJS` (`src/ui/gestures.js`, 266 lines;
`src/input/HandInput.js`, 733 lines — fye-mini's is 357). This is the most mature part of either reference repo
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
| palm rising | Raise your hand | lifts the line off the ground | `lift` | casting |
| fingers spreading | Spread your fingers | widens the cast | `width` | casting |
| two fingers | Two fingers | calls water | `water` | other |
| horns | Index and little finger | calls fire | `fire` | other |
| fist | Close your fist | calls stone | `earth` | other |
| open hand | Spread your hand | calls wind | `air` | other |
| palm lowered | Lower your hand | rests the tracker | `lost` | either |

To feed it, `HandInput` must publish what it already computes. Add one **throttled** event at ≤10 Hz — never per
frame — carrying
`{ engaged, wake: 0..1, pose, hold: 0..1, pinch: 0..1, lift: 0..1, spread: 0..1, tracking: 'seeking'|'found'|'lost', delegate }`.

`lift` and `spread` are the two continuous axes §8 is built on, so they are **not** optional extras on this
event — the guide's live highlighting is the only place a player finds out their hand height is doing anything
before they see it in the cast.

### Mobile is a first path, not a degraded one
`enableHands()` already refuses on `(pointer: coarse)` and says so. Touch keeps everything except the camera:
the ghost line, the Rite, the Ward, the dock, the Workshop. The attunement ritual's touch equivalent is a
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
guess.

| Live — must be migrated | Dead — safe to delete |
|---|---|
| `.loader`, `.loader__inner`, `.loader__sigil`, `.loader__title`, `.loader__bar`, `.loader__status` | `.element-card`, `.element-card__glyph/__key/__label` |
| `.sigil`, `.sigil--fire\|water\|earth\|air` | `.mode-card`, `.mode-card__glyph` |
| **`.hud`, `.hud__toast`, `.hud__toast.is-visible`** | `.hud__elements`, `.hud__modes`, `.hud__modes-key` |
| `.lil-gui` | `.hud__stats`, `.hud__help`, `.hud__panel`, `.hud__title` |
| `:root` `--ui-*` (consumed by `.hud__toast`) | |
| `* { box-sizing }` and the `html, body` reset | |
| `#viewport` — a **second** rule competing with `app/grimoire-stage.css:3` | |

`app/grimoire-stage.css` contains **zero** `loader`, `sigil` or `hud__` rules, so everything in the left column is
the only styling those elements have, and React renders all of them.

The migration is therefore: move the left column into `app/grimoire-stage.css` (rewritten against the new tokens),
delete the right column along with the `@import`, and only then hoist the `:root` token block below. **Verify the
loading screen and a toast still look right before deleting anything** — they are the first thing every visitor
sees and the last thing anyone thinks to check.

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
  /* layers — currently ad hoc (20 / 30 / 45 / 100). Name them.
     Note `.hud` is z-index 20 in src/ui/styles.css, BELOW the 30 of .stage-header /
     .stage-message / .stage-hud. Mapping it to --g-z-hud: 30 would silently raise it. */
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

### Targeting indicators — **deferred, not cut from the record**
§14 cuts the targeting phase: §8's loop needs no arrow and no circle, and building them is the largest avoidable
cost in the plan. The construction is kept here and in §4.1 so a later version does not have to rediscover it.

<details>
<summary>The indicator design, for whoever needs it later</summary>

Two pooled ground quads, following the reference repos' construction exactly (§4):
- **`AimIndicator`** — one SDF in a ground quad; shaft **0.42 m *half*-width, constant at any distance** (so 0.84 m across); outline, chevrons
  and the range-cap arc all derived from the one distance field.
- **`ZoneIndicator`** — a footprint quad whose fragment shader remaps UV into *metres from target* so the boundary
  stays **0.34 m thick at any radius**, plus a reach ring from `RibbonGeometry` bent into a circle. On arm it snaps
  out past its radius and settles back.

Both belong on `LAYER.VFX` (the camera enables it explicitly; `LAYER.WORLD` would put them in the depth prepass and
the distortion pass). Colour comes from `--accent`'s engine twin, not from a fifth copy of the palette.

</details>

**What §8's loop actually needs on the ground** is much smaller and should be built instead: a **waystone ring**
and a **hazard region**, both pooled `GroundDecals` entries. The decal system already has `SHOCKWAVE` for the
ring and `RIPPLE` or `DUSTRING` for the hazard, and both already take `uColorA` / `uColorB` / `uWidth` / `uAge`.
The same "metres remapped from `vUv`, never UV fractions" rule applies (§11, hazard 4) so a ring's thickness does
not change with its radius.

### The feedback stack
Today a cast produces one `aria-live` sentence. Replace with a layered response, each layer already built:
| Phase | World | Screen |
|---|---|---|
| gather | caster's `gather` pose; trail begins | dock slot brightens |
| aim | trail follows; ghost proximity glow | — |
| release | `ScreenFlash.trigger` at low strength; `CameraShake` at the element's own strength | `navigator.vibrate?.(12)` on coarse pointers, behind a guard |
| impact | element decal (`SCORCH`/`RIPPLE`/`CRACK`/`DUSTRING`); Ward stone lights | the fidelity readout resolves |
| recovery | caster settles | `aria-live` sentence, **polite, and only on a resolved line** |

**Do not scale `CameraShake` by how well the player did.** The first draft did, and it is the most tonally wrong
idea in it: the world's physical violence becomes a function of your handwriting grade, so the universe is
running a mixer on your penmanship. A weak line produces a **different** answer, not a quieter one — fire gutters
and dies short, water spills, earth cracks the wrong ground. Same intensity, wrong outcome. That is a world
responding; the other is a scoreboard with a subwoofer.

`aria-live="polite"` on `.stage-message` currently fires on **every** cast. In a game where casts come every few
seconds that is a screen reader talking constantly. Announce the *resolution*, not the release.

### Workshop
Keep it local-only and make it an instrument: surface `deriveGenome()` — pace / mass / chaos / radiance / menace —
as a five-axis readout. It is 20 lines of correct, finished, completely unused code
(`src/config/spell-contract.js`). Show all twelve `HOUSE_SEED_SPELLS`, not eight. Add the "Replay the attunement"
reset (§6).

### Accessibility, concretely
- **Three** elements carry `role="dialog" aria-modal="true"` — the intro overlay as well as both side sheets —
  and none has **a focus trap, an Escape handler, focus restoration, or `inert` on the background**. The intro is
  the first thing every new visitor meets, so it is the one that matters most and the one an earlier draft
  omitted. This is provable by absence:
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
- **Phone (<680px)**: dock as a bottom bar inside the thumb arc; sheets full-width; `.hand-mirror` never shown.
  ~~The ritual ground framed tighter (`settings.camera.distance` down) so a 4 m sigil fits a 360px-wide
  viewport.~~ **This instruction is backwards and was not implemented.** The camera is a perspective camera with
  a *vertical* fov, so a portrait viewport already sees less world across than a landscape one, and moving the
  camera *closer* sees less still. Fitting the same play area on a phone would need the camera pushed past
  `maxDistance`, at which point the caster is a speck. The honest reading is the one hazard 22 already states:
  a phone gets a smaller play area, and anything the game measures in world units must be expressed as a
  fraction of what is visible rather than as an absolute — see the measurements in §17.
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

> **This section was rewritten after review.** The first draft proposed a tracing test: the Grimoire shows a
> sigil, you copy it, and the copy is graded. A reviewer pointed out that this is the one variant of drawn-gesture
> casting that is known to fail — a graded reproduction turns every failure into "the computer says your
> handwriting is bad" — and that the draft's own pitch for replay value, "you do it again because your hand is
> getting better", is the argument for a calligraphy trainer rather than a game. They were right. What follows is
> the replacement. §8.9 records what was cut and why, so nobody re-proposes it.

### The loop, in one sentence

**The ritual ground poses a problem in space; you solve it with one drawn line; the line is yours.**

Expanded: waystones light on the ground and a hazard lies between them. *Take fire through all three without
crossing the water.* You draw one stroke. `PathDrawer` hands it to the element exactly as it does today, and the
stroke is then tested against the constraints — not against a reference shape. Four players solve the same layout
four different ways. You do it again because the next layout is a different problem, not because your handwriting
was marked down.

### Why a constraint, not a copy

There are three ways to build drawn casting and only one of them holds up.

| Model | Example | Why it works, or does not |
|---|---|---|
| **Recall** | the game names a spell, you draw it from memory | Works. The deck lives in the player's head, so skill compounds. |
| **Authorship** | your stroke *is* the answer — slash the rock, draw the bridge | Works. There is no reference, so there is nothing to fail against. |
| **Reproduction** | the game shows a shape and grades your copy | Fails. Every miss reads as "your handwriting is bad", and nobody replays a copy. |

This design is **authorship**. The constraint states the problem; the line is the player's answer.

It also finally delivers §2's thesis. Drawing is a richer verb than aiming *because the shape carries intent* — and
a shape you invent carries intent in a way a shape you copy cannot.

### It is cheaper than the version it replaces

No resampling of two curves, no bidirectional comparison, no tolerance in metres. At release you already hold the
polyline. The whole test is points against a curve:

```js
/**
 * Resolve one drawn stroke against a layout.
 *
 * Deliberately not a shape comparison: the player's line is not being graded
 * against a reference, it is being asked whether it solved the problem. That
 * keeps authorship with the player and keeps failure legible — you can see
 * that you clipped the water.
 *
 * Allocation-free; both scratch vectors are module-level.
 *
 * @param {THREE.Curve} stroke     what the player drew
 * @param {Layout} layout          waystones, hazards, and the element it wants
 * @param {string} element         the element actually cast
 * @returns {{ reached: boolean[], clipped: boolean, solved: boolean }}
 */
export function resolveStroke(stroke, layout, element) { /* ... */ }
```

For each waystone, the minimum squared distance from the polyline to the stone, tested against a radius the player
can **see** as a ring on the ground. For each hazard, whether any sample falls inside it. That is it.

### The elements become tools, not keys

This is what a constraint layout buys that a graded copy cannot: the four elements already differ in ways that
change what a line can *do*, and none of those differences mattered under the old design.

- **`pathHeight(u)` already exists** on the `Ability` base (`src/abilities/Ability.js`) and lifts an element above
  the drawn ground path. Fire flies. So **fire can cross a water hazard and earth cannot** — a legible, diegetic
  rule that falls out of code already written.
- Travel speeds already differ: fire 11.5, water 7.5, earth 6.0, wind 14.0 m/s. A layout with a closing gate is a
  wind problem.
- `MAX_CONCURRENT` is 8 and there is no cooldown anywhere in the codebase, so a layout that needs two lines is
  a real option.

The element is now a decision with a cost and a property, not a lock with a displayed key.

### The Ward: one stone per sigil, not one per element

**The first draft's Ward was mathematically broken and the review caught it.** Eight stones, four elements, two
stones per element; the tutorial Rite had zero element changes, so at most **two of eight stones could ever
light**. The first three Rites were all unwinnable by construction, and the draft had written gentle copy to
soften a failure the player could not avoid. That is worse than a hard loss: it teaches the player that their
input does not matter.

The fix is to stop conflating the stage geometry with the scoreboard. **The Ward that lights has one stone per
sigil in the current Rite** — a three-sigil Rite lights a three-stone Ward. It is a progress bar made of rock: it
reads at a glance, it fills completely on a clean run, and a dark stone is unambiguously one specific line you
fluffed.

Keep the eight-stone ring as stage dressing if it looks good, which it will. Build it from
`createTowerGeometry(seed)` and `createSlabGeometry(seed, sides)`, which `src/assets/ProceduralGeometry.js`
already exports.

**The stones must not take point lights.** `LightPool`'s `POOL_SIZE` is 6 (`src/effects/LightPool.js:5`), it is
shared with every cast, `acquire()` returns `null` when exhausted, and `MAX_CONCURRENT` already allows 8
abilities. Light them with an emissive material and let bloom do the work: `post.bloomThreshold` is 0.72 against a
`#14181d` stage, so a lit stone costs one uniform write.

### Failure is legible, not quiet

The first draft said failure was "a stone staying dark" and that "the lesson is delivered by the world's silence".
Silence is not a lesson; it is ambiguity. A player facing a dark stone cannot tell wrong element from bad line
from a bug.

**A dark stone carries the line you actually drew**, burned faintly into its face beside the problem it posed, and
it stays there for the rest of the Rite. One pooled decal quad — `GroundDecals` already pools `PlaneGeometry` plus
`ShaderMaterial` with `uColorA` / `uColorB` / `uWidth`. The Ward becomes a gallery of your near-misses, the
correction is spatial rather than textual, and "quiet" becomes "legible" without a word of error copy.

And **never let a cast produce nothing.** A wrong element is refused *in character*: the stone flinches, the
element lands and drains away in the wrong colour. A rejection you can see is dignified. An absence you have to
infer is a bug you cannot report.

### Spend the outcome on the caster's body

`CasterPerformance.setGesture` already accepts an `intensity` that nothing passes; it is clamped to `[0.35, 1.6]`
and multiplied into all eight arm and hand joints (§3). Pass the solve quality into it:

```js
// src/core/App.js — in the pathDrawer 'cast' handler
const outcome = rite.resolveStroke(curve, rite.layout, this.abilities.selected);
this.caster?.setGesture('release', {
  element: this.abilities.selected,
  // 0.35 is a hesitant, half-committed throw; 1.6 is a full one. The player
  // reads the answer off the caster's posture before anything else resolves.
  intensity: 0.35 + (outcome.reached.filter(Boolean).length / outcome.reached.length) * 1.25
});
```

A clean solve makes the caster commit; a scrape makes them hesitate. No new animation, no HUD element, no number.

**One catch.** `CasterPerformance` auto-advances `release → recovery` at `t > 0.28` and `recovery → idle` at
`t > 0.78`, and both calls pass **no options** — and `:52` is
`MathUtils.clamp(Number(options.intensity) || 1, .35, 1.6)`, so `undefined` resets intensity to **1** after
0.28 s. Either accept that the reading lands on the 0.28 s release beat only, or have the auto-advance carry
`this.intensity` forward. Note also that `Number(0) || 1 === 1`, so a literal zero is silently promoted; clamp
from a sentinel rather than from falsiness if zero ever needs to mean something.

### The moment of delight, given its proper weight

The reviewer's sharpest observation: the first draft spent roughly forty rows of verbatim tuning constants on two
aiming reticles and **one clause** on the only moment where the game gives the player something rather than
measuring them. That ratio was the design.

**The close is the point of the whole Rite.** When the last stone lights: the camera drops toward the ground,
`settings.camera.autoFrame` goes to 1.0, and the caster rides **your own drawn line** out through the Ward on the
air scooter while all its stones pass overhead. You already own 366 lines of finished `WalkController` and an
`AirScooter` that almost nobody has seen.

That is the thing a player will describe to someone else. It gets as many words in the implementation as the
arrowhead did, and it is not cut under scope pressure — if the budget only covers the loop and the close, ship
those two.

### Difficulty, by shape rather than by clock

The first draft escalated with a per-sigil timer (12 s → 9 s → 7 s) while §10 shipped a calm mode with "no time
pressure on sigils", so calm-mode players hit a content ceiling at Rite 2 and nothing replaced the pressure.
**Escalate the problem, not the clock** — it is the axis this design is supposedly about.

| Rite | Lines | Waystones | Hazards | Elements offered |
|---|---|---|---|---|
| 1 (first run) | 3 | 2, both in front | none | 1 |
| 2 | 3 | 3 | 1 | 2 |
| 3 | 4 | 3, one behind the caster | 2 | 2 |
| 4 | 5 | 4 | 2, one crossable only by fire | 3 |
| 5+ | 5 | generated | generated | 4 |

**Attempts per line: three, best kept, and the stone shows which attempt it was.** The first draft never stated
this, which is the most important rule in any scored game — and without it the optimal strategy is to spam fast
sloppy lines, since there is no cooldown anywhere in this codebase.

### Content: generate, do not enumerate

The first draft's entire content library was six hand-named shapes. Six shapes behind a mastery gate is a
twenty-minute product.

A layout is a seed: waystone count, their positions in polar coordinates about the stage anchor, hazard shapes
and placement, and which elements are offered. That is a generator, and the same six primitives become hundreds of
authored-feeling problems.

Two cheap, server-free returns:

1. **The daily seed.** `hash(YYYY-MM-DD)` picks today's Rite; everyone who opens it gets the same one. One hash
   function, no account, no telemetry, fully compatible with §15. "Your best on today's Rite" is a meaningfully
   different sentence from "your best ever".
2. **Race your own best line.** You already store polylines and already own a second `PathTrail`. Draw over your
   own best solve and watch yourself beat it. That is "my hand is better" made visible rather than asserted, and
   it is the best local progression artifact available to a product that cannot have leaderboards.

Persisted state stays small and honest: which layouts have been solved, and the best line for each, in
`localStorage` via `src/state/preferences.js` (§9).

### Hand tracking: what actually earns it

**First, the correction that has to stand.** An earlier draft justified hands like this: *"with a mouse you must
stop drawing to change element… a two-element sigil in one unbroken stroke is simply impossible with a mouse."*
Both halves are false, and the code says so:

1. **A mouse can already change element mid-stroke.** `src/core/App.js:121` binds
   `this.input.on('element', (index) => this.selectElement(ELEMENTS[index]))`, and `InputManager._onKeyDown`
   emits `element` on `Digit1`–`Digit4` with **no check on `isDrawing`**. Hold the left button, drag, press `2`,
   keep dragging.
2. **A multi-element stroke is not representable by any device**, because the element is read once, at release:
   `this.abilities.cast(curve)` uses `this.abilities.selected` at that moment (`src/core/App.js:133`,
   `src/abilities/AbilityManager.js:67`).

That justification is dead. Here is the one that survives the code, and it is stronger.

#### A cursor is a point. A hand is a pose.

`PathDrawer` raycasts the pointer onto `Plane(0, 1, 0)` at `y = 0`. **Every point of a mouse stroke is on the
ground, by construction.** A mouse has exactly two axes and no way to express anything else about a moment in the
stroke.

A hand, through landmarks MediaPipe is already computing every frame, has at least three more: how far it is
from the camera, how it is rolled, and how open it is. In a loop that is explicitly about getting an element
**past obstacles** (§8), those are not decoration. They are the mechanic.

#### The three axes, and why each one matters in this loop

**1. Lift — the one that carries the design.**

`Ability.pathHeight(u)` is a per-element altitude function (`src/abilities/Ability.js:214`). Fire overrides it and
flies; water overrides it and swells; **earth and wind return 0 and hug the ground.** That is exactly why §8 can
say "fire crosses the water hazard and earth cannot" — it falls out of code already written.

Now give the stroke its own additive lift, driven by hand height or wrist roll:

```js
// src/abilities/Ability.js — the only change the lift needs
_samplePath(u, out) {
  const t = saturate(u);
  this.curve.getPointAt(t, out);
  // The element's own altitude still describes its character — fire lobs, water
  // swells — and the cast's lift rides on top of it. Composing rather than
  // replacing means a lifted earth cast is still unmistakably earth.
  const height = this.pathHeight(t) + this.lift(t);
  if (height !== 0) out.y += height;
  return out;
}

/** Per-cast additive altitude, 0 unless the stroke carried a height channel. */
lift(_u) { return 0; }
```

`_tiltTangent` must sum the same two terms, or a lifted element points the wrong way as it climbs.

**What that buys.** A hazard the fire can fly over is a hazard a skilled hand can take *earth* over, by raising
the palm at the right point in the stroke. The element's natural advantage becomes a floor, not a ceiling. A
novice picks the element that suits the layout; an expert takes the element they *want* through a layout that did
not invite it. That is a real skill ceiling, it is legible the first time someone sees it happen, and **a mouse
cannot express it at all** — not because of a missing keybinding, but because the ground plane has no third axis.

**2. Width — the tactical trade.**

Finger spread (the spread of landmarks 8, 12, 16, 20 normalised by `handScale`) scales the cast's radius per
sample. Wide covers two waystones at once; narrow threads a gap a wide cast would clip. `Ability` re-samples
`settings` every frame by design (§11, hazard 16), so a per-sample width scalar reaches the existing shaders
without a new uniform path — `FireAbility` already multiplies `c.flameWidth * widthScale` at `:238`.

**3. Element, mid-stroke — and make it actually representable.**

The off hand holds the element pose while the drawing hand keeps tracing. This is proven upstream: HandCast's
guide declares `row(['prev','next'], 'Point sideways', 'previous / next ability', 'point', 'other')`, where
`'other'` is explicitly "which hand, when it is not the casting one", and its `HandInput` resolves MediaPipe
`handednesses` per hand with an `aimHand` option so a left-handed player can swap them.

But per the correction above, **this is worthless until the router can split a stroke.** Specify that too:

```js
/**
 * Split a stroke at its element changes and cast each run.
 *
 * The element is a per-sample channel, not a property of the cast, so a single
 * drawn line can be fire to the gate and earth over the rubble. Runs shorter
 * than `settings.input.minPathLength` are folded into their neighbour rather
 * than dropped — a hand that flickers between poses should not silently lose a
 * third of the line.
 *
 * @returns {Array<{curve: THREE.Curve, element: string}>}
 */
export function splitByElement(samples, count) { /* ... */ }
```

Once that exists, the keyboard can do it too, by holding a digit mid-drag. **That is the right outcome and it
should be said plainly: hands are not uniquely capable here, they are uninterrupted.** The honest claim is
axes 1 and 2, which a mouse genuinely cannot reach, plus a third where hands are simply better.

#### What this costs, stated up front

This is the most expensive thing in the document and it should not be pretended otherwise.

| Work | Why |
|---|---|
| `PathDrawer` carries per-sample channels, not just positions | Today `samples` is `Vector3[]` on `y = 0`. It needs a parallel preallocated `Float32Array` of lift, width and element id, written on every accepted sample and resampled alongside the curve. |
| `Ability.lift(u)` plus the `_tiltTangent` sum | Small, and the composition above keeps each element's identity intact. |
| `splitByElement` in the cast router | Needed for axis 3 at all, and it is where the "fold short runs" rule lives. |
| The mature `HandInput` (§6) | Wake gate, grab hysteresis, lost state, refractory, published state, two hands with handedness. |
| The handedness mirror fix | §11, hazard 6 — this is the single most likely bug in the two-handed work. |
| Stroke identity on the draw events | §11, hazard 7 — without it two hands interleave into one corrupt stroke. |

**And it degrades honestly.** With one hand, axes 1 and 2 still work and the element is chosen from the dock.
With a pointer or on a phone, `lift` and `width` return their defaults, every element behaves exactly as it does
today, and the layouts that *require* a lift are the ones fire was always meant to solve. Nothing is gated behind
a camera. The hand raises the ceiling; it never raises the floor.

### Session state machine

```
BOOT -> INTRO -> RITE_OPEN
RITE_OPEN -> LINE_PRESENT -> LINE_DRAW -> LINE_RESOLVE
LINE_RESOLVE -> LINE_PRESENT   (attempts remain, or lines remain)
LINE_RESOLVE -> RITE_CLOSE     (last line resolved)
RITE_CLOSE -> RITE_OPEN        (player continues)
RITE_CLOSE -> FREE             ("Set the Rite aside" -> today's sandbox, unchanged)
FREE -> RITE_OPEN              ("Begin a Rite")
any -> FREE                    (Escape; the sandbox is always one key away)
```

The sandbox is never removed. It becomes the state you can always return to, which also protects everything the
Workshop and the Editor already do.

### 8.9 What was cut from the first draft, and why

Recorded so nobody re-proposes it.

| Cut | Reason |
|---|---|
| **Tracing a shown sigil, graded for fidelity** | Reproduction-grading. Converts failure into "your handwriting is bad", and nobody replays a copy. |
| **The three-component score (Line / Flow / Closure)** | See §11, hazards 21–23. Flow is identically zero on the resampled buffer and measures the player's *hardware* on the raw one; metric tolerances are anisotropic on an oblique camera and gameable with the scroll wheel. |
| **"Tolerance tightens from 0.55 m to 0.28 m"** | A world-metre tolerance is worth 6.7× more screen at the front of the stage than the back, and the player controls the zoom. |
| **The eight-stone element-affinity Ward** | Made the first three Rites unwinnable by construction. |
| **"Drawing to the beat of the Ward"** | A rhythm mechanic in a product that argues four paragraphs for having no audio (§5) and lists audio as out of scope (§15). |
| **"Flow rewards an even hand" beside "the long line rewards commitment"** | The same motion scored in opposite directions: a fast committed stroke accelerates, and acceleration *is* spacing variance. |
| **The per-sigil timer** | Contradicted §10's calm mode, which removes time pressure and then had no replacement escalation. |
| **The two-element-stroke hand payoff** | Refuted by `src/core/App.js:121` and `:133`. Hands are still in scope — §8 replaces the justification with lift and width, which a ground-plane raycast genuinely cannot express, and specifies the router change that makes a multi-element stroke representable at all. |

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

**As of §14 the `AimController` branch is deferred**, so the router ships with one source. It is specified this way
regardless, because the shape is what keeps a second source from ever becoming a second `abilities.cast` call
site — and because the `cast-contract` test in §12.2 enforces exactly that.

Drawing is and stays the product's primary verb (§8). Any `AimController` is added **beside** `PathDrawer`, never
over it, and `CastRouter` is the only thing `App` talks to.
`Ability`, `AbilityManager` and the four element files are **not touched** — verified: `Ability.spawn(curve)` calls
only `getLength()`, `getPointAt()` and `getTangentAt()`
(`src/abilities/Ability.js:136-159`; `getPointAt` is reached indirectly via `_samplePath` at `:148` → `:221`),
which `LineCurve3`
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
5. **`App.stageAnchor` is a free arena primitive** (§11, hazard 26). Writing it relocates the shadow frustum, the
   dust volume and the orbit centre together.

### What the hand axes need from the engine

Three bounded changes, all specified in §8 and listed here so the module map is complete.

1. **`PathDrawer` carries per-sample channels.** Today `samples` is `Vector3[]` pinned to `y = 0` and `resampled`
   is a preallocated 320-`Vector3` buffer. Add two parallel preallocated `Float32Array(320)` buffers for lift and
   width, plus a `Uint8Array(320)` for element id, written on every accepted sample and resampled by the same
   `i / (wanted - 1)` walk that builds the curve. No allocation per stroke, matching the existing discipline.
2. **`Ability.lift(u)`**, additive over `pathHeight(u)`, summed in both `_samplePath` and `_tiltTangent`. Default
   returns 0, so every existing element is bit-identical until a stroke carries a lift channel.
3. **`splitByElement(samples, count)`** in the cast router, folding runs shorter than
   `settings.input.minPathLength` into their neighbour rather than dropping them.

**The ordering matters.** Build 1 and 2 together (P7b) and leave 3 for P7c — a lift channel is useful with one
hand and no router change, but an element channel is useless without the split.

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
`_applyFlatPatch` refuses it by its existing guard (`if (!range && !isColor) continue;` — `src/core/App.js:170`).
Presentation values that genuinely affect the cast's feel (`range`, `minRange`) go in the element blocks **with**
`RANGES` entries, registered under the public `air.*` spelling, never `wind.*` (`src/config/spell-ranges.js`).

### Two resolutions, at two different moments

§8 resolves a line in two independent passes, and conflating them is the easiest way to get this wrong.

**1. Did the line solve the problem? — once, at release, on the drawn polyline.**
`resolveStroke(stroke, layout, element)` tests each waystone's minimum squared distance to the polyline and each
hazard for any sample inside it. No physics, no per-frame work, no reference curve. This is what decides whether
a Ward stone lights.

**2. What did the element physically touch? — per frame, on the ability head.**
Only needed for the *reaction*: scorch marks, a stone flinching, a hazard reacting as the element passes through
it. `AbilityManager.update()` already iterates `this.active`, and every ability maintains `this.position` and
`this.previousPosition` every frame (`src/abilities/Ability.js:182-190`). Test the frame's swept segment
`previousPosition → position` against each responder in 2D (x, z) against `(radius + responderRadius)²`, exactly
as the reference's `DummyField._hitLine` does (§4). At `MAX_CONCURRENT` = 8 against a handful of responders that
is a few dozen squared distances per frame, with no allocation if the responder positions live in one flat
`Float32Array`.

Run pass 2 **after** the abilities are stepped, so the volume tested is the one that was just drawn (§11,
hazard 2). Impact-radius effects hook `ctx.onAbilityImpact(ability)`, which **already passes the ability
instance** and which `App._onAbilityImpact()` currently throws away (`src/core/App.js:196`).

Crucially, **pass 2 must never change the outcome of pass 1.** The player's line is judged on what they drew, not
on where the VFX happened to fly — otherwise fire's `pathHeight` lift would silently change whether a waystone
counted, and the rule "fire crosses water, earth does not" would become a physics simulation rather than a stated
property of the element.

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
- `src/ui/styles.css` — **partially**, and the split is not where you would guess. Its `.element-card`,
  `.mode-card`, `.hud__elements/__modes/__stats/__help/__panel/__title` rules are dead, but its `.loader*`,
  `.sigil*`, **`.hud` and `.hud__toast`**, `.lil-gui`, `--ui-*` and global-reset rules are live. Split it exactly
  as §7's table describes; do not delete it wholesale.
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
| Two-handed tracking (P7c) | +40–90 % of MediaPipe cost | **1st** |
| Continuous lift and width (P7b) | ≤0.2 ms — two extra channels resampled with the curve | **never** — it is the reason hands ship |
| Ghost sigil | ≤0.4 ms (a second `PathTrail`) | 2nd |

**Free win available today**: `gl.shadowMap.needsUpdate = true` runs unconditionally every frame. The sun is static
and the character barely moves. Update it on change, or at 15 Hz, and the 4096² map stops re-rendering 60×/s.

### Adaptive quality ladder
Measured frame time over a rolling 90-frame window, never a user-agent sniff.

| Tier | Trigger | Changes |
|---|---|---|
| **high** | < 14 ms sustained | as authored |
| **balanced** | 14–24 ms | pixel ratio cap 1.75→1.25; bloom radius −30 %; `global.particleCount` ×0.7; shadow map 2048²; MediaPipe every 2nd frame |
| **conservative** | > 24 ms | pixel ratio 1.0; bloom off; particles ×0.4; shadows off; distortion pass off; MediaPipe every 3rd frame; **two-handed tracking refused, single-hand lift and width kept** |

It announces itself **once**, quietly, in the Workshop ("Running in balanced mode for a steady frame rate"), never
as a toast and never repeatedly. It must also **lower** the existing `HandInput` watchdog threshold in
proportion to the cadence divisor when it steps down, or suspend the watchdog while the ladder is stepping.
`src/input/HandInput.js:189` is `if (fps < 15) { … this.stop(); }` and that `fps` counts **inference passes**, so
dropping to every second or third frame makes the measured rate fall. Raising the threshold would make the
watchdog kill tracking *sooner*, which is the opposite of the intent. (An earlier draft said "raise". It was
wrong.)

### MediaPipe
- Inference currently runs every `requestAnimationFrame` while active (`HandInput._loop`). Decouple to a cadence.
  **The One-Euro filter must be fed the real elapsed time, not a fixed step** — it already computes
  `delta = (now - this._filter.at) / 1000` clamped to `[1/240, 0.1]`, so it is correct under a variable rate as
  long as `now` stays `performance.now()`. Do not "fix" it to a constant.
- **There is no version skew — an earlier draft of this document claimed one and was wrong.** `package.json`
  ranges `@mediapipe/tasks-vision@^0.10.22-rc.20250304`, but `package-lock.json` resolves it to exactly
  **0.10.35**, which is the version `HandInput._start` hardcodes in its WASM URL. The JavaScript and the WASM are
  from the same build. What remains is a **fragility, not a bug**: the URL is hardcoded rather than derived from
  the installed version, so an `npm update` can silently separate them. Derive it, or self-host both.
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
  **two** fetch guards — `assert.doesNotMatch(stage, /fetch\(/)` and
`assert.doesNotMatch(app, /fetch\(/)`, covering `app/GrimoireStage.tsx` and `src/core/App.js`. Widen both across
all of `src/` and `app/` to also reject `XMLHttpRequest`,
  `WebSocket`, `RTCPeerConnection`, `navigator.sendBeacon`, `sendBeacon` and `EventSource`, with a documented
  allowlist for the two MediaPipe CDN URLs until they are self-hosted. That test is the privacy claim's only
  enforcement, and it is cheap.

### Asset-rights record
The project owner confirmed redistribution rights for the bundled assets for FYE on 2026-09-21.
`public/models/Standing Idle.fbx` (2.27 MiB) and `public/hdri/spruit_sunrise.hdr` (5.66 MiB) remain shipped with
their provenance and notices. This resolves the asset-rights release check for these exact files; any replacement
must receive the same review before it is bundled.

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
  the quality tier and the last line's resolution — which waystones it reached and whether it clipped a hazard.
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
2. **Hand input and the render loop are two independent `requestAnimationFrame` chains with no ordering
    guarantee.** `App.frame()` never calls anything hand-related; `HandInput` drives its own loop
    (`src/input/HandInput.js:169-196`). Anything in `App.frame()` that reads a landmark reads whatever the
    *other* loop last wrote, so a one-frame lag is not something you can order your way out of. Either fold
    `HandInput._loop` into `App.frame()` or state the lag and accept it. The reference repos run both from one
    loop, which is where their "hands before aim" ordering comes from; **it does not transfer to fye-mini as
    written.** Within `App.frame()` one ordering genuinely is load-bearing: `applyHits()` must run **after** the
    abilities are stepped, or the volume tested is last frame's.
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
12. **Never derive finger extension from screen-space y — and fye-mini's own test is only half right.**
    `src/input/HandInput.js:243` is
    `const isExtended = (tip, pip) => distance(landmarks[tip], landmarks[0]) > distance(landmarks[pip], landmarks[0])`.
    It correctly avoids screen-space y, but it does **not** normalise: it is a bare comparison of two wrist
    distances with no margin, so it flips on noise near the threshold. `handScale`
    (`distance(landmarks[0], landmarks[9])`) is computed on `:214` but is used only for `pinchRatio` on `:215`
    and never reaches `_trackPose`. Adopt the reference's ratio form —
    `dist(tip, wrist) > dist(pip, wrist) * EXTEND_RATIO` with `EXTEND_RATIO = 1.15`. An earlier draft said
    fye-mini already did this correctly; it does not.
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
17. **Any new per-cast state must be reset in `spawn()`** (`src/abilities/Ability.js:136`), which is the pooling
    reset point. Miss it and a pooled ability inherits the previous cast's charge, combo tier or target.
18. **The particle system is GPU-simulated and the CPU can never read a particle's position.** Position is
    computed in the vertex shader from spawn data. No per-particle hit detection, attraction or gameplay is
    possible without an entirely new CPU-side system. Design the Ward against ability heads, not particles.
19. **A hold-in-place charge produces a cancel, not a cast.** `PathDrawer.move()` rejects samples closer than
    `minPointDistance` (0.22) and `end()` cancels strokes under `minPathLength` (1.6) or with fewer than three
    samples. Define a charge as a pre-draw gather, or explicitly bypass the length guard for charged casts.
20. **Keep `PathDrawer` a pure draw-to-curve device.** Every mode decision belongs in `App._bindEvents` or the new
    router, not inside the drawer.

### Anything that scores a drawn line

These three are why §8 no longer scores fidelity in metres. They apply to any future scoring too.

21. **`PathDrawer` smooths per pointer *event*, not per frame, and is not delta-corrected.**
    `move()` runs `this._smoothed.lerp(this._hit, clamp(1 - settings.input.smoothing, 0.05, 1))` from inside the
    `pointermove` handler. A 1000 Hz gaming mouse converges on the true cursor almost instantly; a 60 Hz trackpad
    lags and rounds every corner, **from identical hand motion**. Any sub-metre tolerance is smaller than that
    difference. Fix it before anything is scored: make the coefficient time-based, `1 - Math.exp(-k * dt)`, with
    `dt` the real elapsed time since the last accepted sample. Two lines.
22. **A world-metre tolerance is anisotropic on this camera, and the player controls the zoom.** The default rig
    sits at `(-6.5, 6.0, 9.5)` looking at `(0, 1.35, 0)` — about 22° of elevation — so ground deviation *in
    depth* is foreshortened by roughly `sin(ε)` while deviation *across* the view is not. The same tolerance is
    worth several times more screen at the front of the stage than at the back, and more sideways than in depth.
    On top of that, `CameraRig` lets the wheel drive `settings.camera.distance` anywhere from 3.5 m to 30 m and
    right-drag the polar angle. **Difficulty would be bound to the scroll wheel**, and §7's plan to frame phones
    tighter would make phones easier than desktop, which is backwards. Any scoring must be **scale- and
    position-normalised** (subtract the centroid, divide by RMS radius) before it is compared to anything.
23. **"Variance of sample spacing" measures the hardware, or nothing at all.** On `PathDrawer.resampled` it is
    **identically zero** — `_rebuild` resamples arc-length-uniform via `getPointAt(i / (wanted - 1))`, so spacing
    is `length / (wanted - 1)` by construction. On the raw `samples` array it measures the interval between
    accepted pointer events, which is polling rate times hand speed, gated at `minPointDistance 0.22`. Neither is
    a property of the player.

**If a future version does need shape comparison**, use the solved approach rather than point-to-point distance:
resample both to N = 64, normalise out scale and position as above, then compare **turning-angle profiles**
(cumulative signed curvature against normalised arc length). That is the `$1 Recognizer` / Protractor family, it
is roughly thirty allocation-free lines, and it is what every gesture recogniser uses because it distinguishes
"same shape, shaky hand" from "wrong shape". Keep the first draft's instinct of testing both directions and
taking the better: drawing a shape backwards is a different hand, not a worse one.

### Live bugs found while writing this, all verified

24. **The Cast button in the stage dock does nothing.** `app/grimoire-stage.css:14` sets
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
25. **A thumbs-up selects Stone.** In `src/input/HandInput._trackPose`:
    ```js
    const four = [fingers.index, fingers.middle, fingers.ring, fingers.pinky];
    if (!four.some(Boolean)) next = 'earth';
    ```
    The fist test ignores the thumb, and `fingers.thumb` is computed on the line above. Four fingers curled with
    the thumb out is read as a fist. Tighten to `!four.some(Boolean) && !fingers.thumb`. That fixes the misread
    **and** frees thumbs-up and thumbs-down as two unused verbs.
26. **`App.stageAnchor` is allocated and never written.** `src/core/App.js:50` allocates it; `:288`, `:291` and
    `:304` read it, so it is permanently `(0, 0, 0)`. Writing it moves three things at once with no
    re-allocation: the sun's shadow frustum (`environment.setFocus`), the dust volume (`dust.update`) and the
    camera's orbit centre (`rig.setAnchor`). **That is a complete arena-relocation primitive, already wired end to
    end, pinned to the origin.** If the Rite ever moves the ritual ground — between rounds, for the intro, for a
    close — this is the one line.
27. **`app/GrimoireStage.tsx:244` shows a raw lowercase element id as display text.** It renders
    `<small>{preset.element}</small>`, and every entry in `src/config/house-spells.js` already uses the public
    ids `fire` / `water` / `earth` / `air` — never `wind`. So this is **not** a key-translation bug, which an
    earlier draft called it; it is unlabelled data shown as copy. Fix it with the element's display name from the
    single colour-and-label constant (§7), not with `publicKey()` — which is a module-local `const` in
    `spell-contract.js` and is not exported anyway.
28. **The `DIALS` literals at `app/GrimoireStage.tsx:26-47` duplicate engine defaults into React.** That is
    already a desync bug, not a pattern to copy. `src/config/settings.js` is the single source of truth.
29. **`app/grimoire-stage.css` uses `backdrop-filter` without the `-webkit-` prefix**, so the panel blur is absent
    on older WebKit.
30. **The engine has authority to open React UI.** `app/GrimoireStage.tsx`'s `grimoire:input-status` listener
    calls `setHandsOpen(true)` when the state is `ready` or `tracking`. Remove it before adding any further
    engine-to-React signals, or the seam rots.

### Licensing

31. **Both reference repositories are MIT, Copyright (c) 2026 mohamedachrefelouafi.** Any transplanted file,
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
| `assert.match(stage, /Hold an open palm until the ring fills/)` | pins onboarding copy | Update to the new string | Section 16 rewrites it to "Hold an open palm until the ring closes." Change the copy and the assertion in one commit. |
| `assert.match(hand, /Camera permission or hand tracking was unavailable/)` | pins fallback copy | Update to the new string | Same. |
| `assert.match(stage, /Mobile never requests your camera/)` | pins the mobile promise | Update to the new string | Same. |

Everything else in the file stays exactly as it is. In particular, keep all five `CasterPerformance` gesture-name
assertions, the `Standing Idle.fbx` and `spruit_sunrise.hdr` assertions, the `sites-vite-plugin.js` negative
assertions, the `mongodb` negative assertion, and the two `assert.rejects(access(...))` calls that keep the
deleted API and gateway deleted.

### 12.2 New tests to add

**`tests/no-network.test.mjs`** — the privacy claim's only enforcement. Walk every file under `src/` and `app/`
and reject `fetch(`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection`, `EventSource` and `sendBeacon`, with a
documented allowlist for the two MediaPipe CDN URLs in `src/input/HandInput.js` until they are self-hosted. This widens the existing **two-file** guard into a real one.

**`tests/cast-contract.test.mjs`** — lock the targeting contract. Assert that `src/input/AimController.js` emits
`'cast'`, `'arm'`, `'cancel'` and `'reject'`; that the **only** modules in `src/` calling
`abilities.cast(` are `src/input/CastRouter.js` and `src/intro/IntroDirector.js` — the intro ships in P1, before
any router exists, and `App._castStagePreview` already calls it today; and that **no file under `src/abilities/` changed its `spawn(` signature away from
`spawn(curve)`. That last one is the guard that keeps line casts from quietly rewriting the ability layer the way
the upstream repository did.

**`tests/hand-contract.test.mjs`** — lock the parts of §8's hand design that are easy to regress silently.
Assert that `src/abilities/Ability.js` defines `lift(` and that **both** `_samplePath` and `_tiltTangent`
reference it (a lift summed in one and not the other points a climbing element the wrong way); that
`src/input/HandInput.js` mirrors handedness wherever it mirrors `x` (§11, hazard 6); and that the draw events
carry a stroke identity once `numHands` is not `1` (§11, hazard 7).

**`tests/rite-contract.test.mjs`** — assert that `src/state/events.js` exports a constant for every event name
used in `app/` and `src/`, so a typo is a build failure rather than a silent no-op; and that
`src/state/preferences.js` is the only module touching `localStorage`.

---

## 13. Release checks

**Asset rights confirmed.** The project owner confirmed distribution rights for the bundled
`public/models/Standing Idle.fbx` (2.27 MiB) and `public/hdri/spruit_sunrise.hdr` (5.66 MiB) on 2026-09-21. This is
not a release blocker for FYE; preserve the notices and review any replacement before it is bundled.

**There is no MediaPipe version blocker.** An earlier draft listed one; `package-lock.json` resolves
`@mediapipe/tasks-vision` to **0.10.35**, exactly the version the WASM URL hardcodes. See §10 for the real,
much smaller issue: the URL is hardcoded rather than derived, which an `npm update` can break.

---

## 14. Implementation phases

Each phase is PR-sized, independently shippable, and leaves the product working. Do not start a phase until the
one it depends on is merged.

### Before any of this: one week, one ugly branch, five people

The plan below was reviewed and costed at roughly **eleven to thirteen weeks** for one engineer, with the written
playtest script sitting in the **last** phase. That is the wrong end of the calendar to find out whether a second
person will draw a second line.

So there is a gate before P0, and it is not a phase:

**Week 1 — the prototype. One branch, thrown away afterwards.**
- One generated layout: two waystones and one hazard, drawn as ground decals.
- `resolveStroke` (§8) and nothing else. No Ward, no Rite, no deck, no scoring components.
- One responder: the waystone lights, or it does not.
- Give `pathDrawer.on('cancel')` a listener. Today a stroke under `minPathLength 1.6` vanishes in total silence
  (§3). This is the cheapest real fix in the document and it is about five lines.
- Three layouts in a row, then "again?".
- No intro, no dock redesign, no hands, no tokens, no copy but the problem itself.
- **Put five people in front of it.** Did anyone draw a second line unprompted? That is the gate.

If it passes, P0 is genuinely good work that makes everything after it cheap. If it does not, nothing below
matters and you have spent a week instead of a quarter.

Two things ship on day one regardless, because they are defects rather than features: deleting
`public/intro/elemental-montage.png` and the overlay is a twenty-minute diff worth 2.58 MiB, and the three live
bugs in §11 are a few lines each.

### Honest costs

No phase below was estimated in the first draft, which was the tell. For one engineer:

| Phase | Realistic |
|---|---|
| P0 foundations | 4–5 days |
| P1 intro (now one path, §5) | 2–3 days |
| P2 targeting | **cut — see below** |
| P3 UI system, reduced | 3–4 days |
| P4 the Rite | 9–12 days |
| P5 onboarding, reduced | 3–4 days |
| P6 polish, reduced | 2–3 days |
| **P7 hands** | **10–14 days** |
| Licensing blocker (§13) | 0–5 days |

### What was cut after review, and why

- **All of P2 targeting.** The verb is *draw* (§2). §4.1's hundred-odd lines of aim and zone shader constants
  exist because the reference repositories' gravity pulls the design back toward what they already built, and §8
  no longer needs an arrow at all. Keep `curveFromAim` as three lines if a straight line is ever wanted. **This is
  the largest single saving in the document and it costs the product nothing.** §4.1 stays as reference for
  whoever wants it later.
- **Nothing from the hand track.** §8 gives hands a verb a mouse cannot reach, so they ship — but as **P7, after
  the loop is proven**, not woven through the earlier phases. The pointer path must be complete and good on its
  own first, because that is what every phone and every declined camera falls back to.
- **Most of P3.** Keep exactly two things: one exported element-colour constant (the three-way disagreement in §7
  is a real bug, about an hour) and the focus trap, Escape and focus restoration on both dialogs (about thirty
  lines, non-negotiable). Both move into P0.
- **Most of P6.** Keep the `ScreenFlash` three-per-second photosensitivity cap — that is a safety issue, roughly
  ten lines, and it belongs in P0 rather than at the end.

```
PROTOTYPE GATE (1 week, five people)
        │
        ▼
P0 Foundations ──┬── P1 Intro ──┐
                 └──────────────┴─ P4 The Rite ──┬── P5 Onboarding ── P6 Polish
                                                 └── P7 Hands (a → b → c → d)
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
- **The three live bugs (§11, hazards 24, 25 and the loader race in §5).** All are a few lines and none of them
  should wait behind a design track:
  - `.stage-hud > * { pointer-events: auto }`, so the Cast button is clickable.
  - `&& !fingers.thumb` on the fist test, so a thumbs-up stops selecting Stone.
  - Drive the loader's reveal and React's `stageReady` from one signal, so the Cast button stops reading
    "Waking" for up to 920 ms over a live stage.
- Also cheap and here: the unlabelled element id shown as copy at `app/GrimoireStage.tsx:244`, the missing
  `-webkit-backdrop-filter`, and removing the engine's ability to open a React dialog (§11, hazards 27, 29, 30).
- **Done when**: `npm test` passes and the product looks and behaves identically **except that the Cast button now
  works**. Do **not** expect a smaller bundle: `glyphs.js` and `ContactShadows.js` have no importers and the seven
  dead exports are unused exports of a module that is imported, so Rollup already drops all of them. The source
  tree gets smaller; the bundle does not. The real bundle win is the 2.58 MiB montage, and it lands in P1.

### P1 — The intro (depends on P0)
- `src/intro/IntroDirector.js` and its four scripted curves.
- React: replace the overlay with the title composite; skip, reduced-motion and cold-open paths.
- Delete `public/intro/*` (5 files, 2.58 MiB) and `output/imagegen/elemental-montage-source.png` (2.58 MiB).
- Migrate the two test assertions that pin the montage.
- **Done when**: the acceptance criteria in §5 pass, and `public/` drops by ≥2.58 MiB.

### P2 — Targeting — **cut**
Kept here only so nobody re-adds it by accident. §4.1 remains as reference material if a later version wants a
straight-line or ground-circle cast; nothing in §8 needs one.

<details>
<summary>The original P2, for reference</summary>


- `src/input/AimController.js` emitting `cast(origin, direction, distance)`.
- `src/effects/AimIndicator.js` and `src/effects/ZoneIndicator.js` as pooled ground quads on `LAYER.VFX`.
- `src/input/CastRouter.js`: the one door into `AbilityManager.cast`, with `PathDrawer` beside it, not under it.
- A cancel affordance (Escape and right-click), which the product has never had.
- **Ability, AbilityManager and the four element files are not touched.** If a diff in `src/abilities/` appears in
  this PR, something has gone wrong.
- **Done when**: a line cast and a drawn cast produce visually identical fire from the same origin.

</details>

### P3 — UI system, reduced (depends on P0)
Only what the loop needs. The token block, the dock redesign and the three breakpoints wait until after the
prototype gate says there is a product to dress.


- The `:root` token block; one exported element-colour constant replacing the three that disagree today.
- `src/ui/HUD.js` reduced to a toast; React takes all chrome.
- The dock with slot grammar, keeping `data-element` on the button itself.
- Focus trap, Escape, focus restoration and background `inert` on both sheets.
- The phone / tablet / desktop layouts.
- **Done when**: keyboard-only completes every verb, and both dialogs pass a focus-management check.

### P4 — The Rite (depends on P0 and P3)
- `src/game/layouts.js` (the generator: waystones, hazards, offered elements, from a seed),
  `src/game/resolveStroke.js`, `src/game/Ward.js` (one emissive stone per line in the Rite, no point lights), and
  the state machine wired to `riteStore`.
- The Rite's open and close beats. **The close is the deliverable, not a trailing bullet** (§8): the camera drops,
  `autoFrame` goes to 1.0, and the caster rides the player's own last line out through the Ward.
- The dark stone carrying the line the player actually drew, as a pooled decal.
- **Done when**: a player can complete a three-line Rite, a stone can honestly stay dark **and show why**, and the
  close plays.

### P5 — Onboarding, reduced (depends on P4)
- The ghost line and **one** instructional line. Silent loosening on retry, never auto-completion (§6).
- Progressive disclosure of the dock.
- Every dead-end exit from §6's table.
- **Deferred to P7, not cut**: the trust ladder, the gesture guide and the `HandInput` state event.
- **Done when**: a first-time player solves their first layout within 15 seconds having read two words.

### P6 — Polish, reduced (depends on everything)
- The adaptive quality ladder and the reduced-motion variants of every new animation.
- Calm mode.
- The widened network-guard test (§12.2).
- The debug overlay, which is where the score components belong (§13 tone).
- Pin the MediaPipe version skew (§13). Self-hosting can wait.
- **Moved into P0 because they are safety or correctness, not polish**: the `ScreenFlash` three-per-second cap,
  the focus management on both dialogs, and the three live bugs.
- **Deferred to P7**: the MediaPipe cadence work and the camera-state indicator, which belong with the hand work.


### P7 — Hands (depends on P4; independent of P5 and P6)

The most expensive phase, shipped last on purpose. The pointer path must already be complete, because it is what
every phone and every declined camera falls back to.

**P7a — the mature tracker (4–5 days).** Rewrite `HandInput` to the model in §6: boot disengaged behind a 600 ms
open-palm wake gate; a continuous `grab` score with 0.7 / 0.4 hysteresis; a real 500 ms lost state; a 400 ms
refractory after a cast and at engagement; four consecutive agreeing frames before any pose emits; and the
ratio-based finger-extension test from §11, hazard 12. Keep the two things fye-mini already does better than
either reference — the GPU-to-CPU delegate fallback and the frame-rate watchdog (§11, hazard 15) — and move
detection to `requestVideoFrameCallback`. Publish one throttled state event at ≤10 Hz.
**Done when**: the tracker cannot fire on its own across a five-minute idle with a hand in frame.

**P7b — the continuous axes (3–4 days).** `PathDrawer` carries per-sample lift and width channels;
`Ability.lift(u)` plus the `_tiltTangent` sum; the hand drives both. **This is the phase that justifies the
others** — if a lifted earth cast does not read instantly as "I took it over the water", stop here and keep P7a
for its own sake.
**Done when**: a player clears a fire-only hazard with earth, on camera, and it is obvious to someone watching.

**P7c — two hands and mid-stroke elements (3–5 days).** `numHands: 2` with handedness resolved and **mirrored**
(§11, hazard 6), stroke identity on the draw events (§11, hazard 7), `splitByElement` in the cast router, and the
watchdog retuned (§11, hazard 13). Behind the quality ladder; refused on the conservative tier.
**Done when**: one unbroken line casts fire then earth, and the same thing works from the keyboard by holding a
digit mid-drag.

**P7d — the trust ladder and the guide (2–3 days).** §6's permission flow, the contextual gesture guide with its
`live` highlighting and its `lost` row, the camera-state indicator, and the MediaPipe cadence work from §10.
**Done when**: a first-time player grants the camera, attunes and casts with a hand without reading a manual —
and a player who declines never sees the offer again that session.

**Cut from P7 regardless**: the WebRTC phone camera (§15).

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
8. The bundled assets retain their recorded provenance and approved distribution rights.

---

## 16. Appendix — the complete copy deck

### Voice
Plain, warm, second person, present tense. **The world speaks about the world; the machine speaks about the
machine, and the machine never borrows ritual language to describe a technical failure.** No exclamation marks.
No "Oops". No "Awesome". Sentences under twelve words. The product is confident, not chatty.

### Decide the fiction before writing another line

Review found three mythologies running at once, which is why the copy keeps sliding registers.

1. **"Grimoire" and "sigil"** are medieval European ceremonial magic.
2. **"Rite", "the Ward", "standing stones"** are neolithic and neopagan.
3. **The engine underneath is Avatar-derived elemental bending** — `src/config/settings.js:571` literally reads
   `hint: 'Firebending'`.

**Pick one and purge the other two from the copy deck.** The recommendation is the Grimoire: the product is named
after it, and a book of pages is a better container for a deck of problems than a stone circle is. If the Grimoire
wins, "the Ward" needs a new name and the bending hints come out of `ELEMENT_META`.

Then, downstream of that decision:

- **"Stone / Wind" versus "Earth / Air" is a tone bug, not only a data bug.** §7 catches three sources disagreeing
  on the hex values and the labels. Nobody flagged that "Stone" and "Wind" are concrete nouns from a physical
  world while "Earth" and "Air" are classical-element abstractions — they imply different fictions. Decide the
  fiction, then write the constant.
- **The score never reaches the player as a number.** "Fidelity", "tolerance", "best score" belong in §10's debug
  overlay. The Ward *is* the readout. If a word must be shown it is the world's: the line was *true*, *close*, or
  *astray*.
- **The first instruction should be no instruction.** The first draft opened with *"Trace it."* — a machine
  imperative, and the first thing the world would say after a sequence designed to establish a world that does
  not speak. §6 now ships zero words there; the lit stone and the ghost line are the instruction. If a line is
  ever needed, it is the book's own register, not a command: *"The Grimoire opens to a single arc."*
- **"The spell shifts in your hand." currently fires on a dial drag.** `App._onGrimoirePatch` toasts it when the
  Workshop patches settings. That is the machine borrowing ritual language to narrate a debug action, which is
  the exact inverse of the voice rule above. Keep the line; move it to a world event. The Workshop gets no voice.
- **"Cast with your hands. Your camera never leaves this tab."** welds a ritual imperative to a browser-security
  disclaimer in one breath. The offer belongs to the world; the guarantee belongs to the panel behind it.
- **"Workshop", "genome", "pace / mass / chaos / radiance / menace"**: "chaos", "radiance" and "menace" belong in
  a grimoire; "pace" and "mass" belong in a physics engine. Rename two words and the readout becomes an artifact
  instead of a dashboard.

Three lines already get it right and should not be touched: *"Two stones stayed dark. The Rite still ends."*,
*"No camera, no problem."* and *"Not now"*.

### Every string in the product today, and what replaces it

#### The world speaking
| Where | Today | Ship |
|---|---|---|
| Wordmark eyebrow | Local elemental stage | Nothing. The wordmark carries it. |
| Wordmark | FYE | FYE |
| Intro line 1 | Four forces. One hand. | Four forces answer one hand. |
| Intro line 2 | Become the motion. | *(cut — the sequence now shows it)* |
| Intro footnote | Camera frames and landmarks stay in this browser. | Nothing leaves this tab. |
| Patch applied | The spell shifts in your hand. | *(keep — correct register)* |
| Ride armed | Draw a path for the air ride. | Draw the path you want to ride. |
| Ride begun | The caster rides the current. | *(keep)* |
| Ride disarmed | Casting mode restored. | Back to casting. |
| Cast resolved | `${Label} released. The caster is recovering.` | *(replaced by the line's resolution — §8)* |

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
| Ghost line, first | *(no words — the lit stone and the ghost are the instruction)* |
| Line too short | *(no words — the ghost pulses once)* |
| First success | *(no words — the stone lights)* |
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

---

## 17. Verification log

So a reader knows how much to trust each claim, and what to re-check first.

### Verified by reading this repository
Every `file:line` in sections 3, 5, 7, 9 and 11 was read directly at `2408e9c`. Specifically confirmed by running
the check rather than by inference:

| Claim | How it was confirmed |
|---|---|
| `src/ui/glyphs.js` and `src/world/ContactShadows.js` have no importers | `grep -rn` across `src/` and `app/` |
| Seven `spell-contract.js` exports have no live callers | `grep -rn` per export name, excluding the defining file |
| `H`, `T`, `M` emit actions with no handler | read `App._handleAction`'s full switch |
| `PathDrawer`'s `start` and `cancel` have no listeners | `grep -rn "on('cancel'\|on('start'"` returns nothing |
| The Cast button is not clickable | read every `.cast-button` rule; none sets `pointer-events` |
| A thumbs-up selects Stone | read the `four` array and the `earth` branch |
| `App.stageAnchor` is never written | `grep -n stageAnchor src/core/App.js` — one allocation, three reads |
| `setGesture`'s `intensity` is never passed | `grep -rn "setGesture(" src` — seven call sites, all `{ element }` |
| No accessibility primitives exist | `grep -rnE "Escape\|keydown\|\.focus\(\|inert\|tabIndex" app/` returns nothing |
| `src/ui/styles.css` styles the loader | `grep -c "loader\|sigil" app/grimoire-stage.css` returns `0` |
| `SittingPose` is live | read `CharacterController:118-119` and `WalkController:203` |
| Asset sizes | `stat -c %s` on each file |
| Colour and label divergence | read all three definitions side by side |

### Verified by reading the reference repositories
Both were cloned and read, not summarised from their READMEs. `AimController.js`, `settings.aim`, `settings.zone`,
`DummyField.applyHits` and `gestures.js` are quoted from source. **Two README claims turned out to be
misleading**, and section 4 says which.

### Not verified, and why
- **~~Anything about three.js itself.~~** Superseded. `node_modules` **is** installed (153 packages,
  `three@0.185.1`), and checking it caught a real error: `OrbitControls` has `getAzimuthalAngle()` and **no
  setter**, so §5's original camera path would have thrown. `LineCurve3` was also checked and does override
  `getPointAt` and `getTangentAt` analytically while inheriting `getLength`, so the central claim in §4 holds.
- **Runtime behaviour.** Nothing here was observed in a browser. The frame budgets in section 10 are estimates
  from reading the render path, not measurements. Measure before cutting anything.
- **The deployed site.** `avatar.wzrd.tech` was not reachable from the environment this was written in, so every
  statement about what a visitor sees is derived from the source at `2408e9c`. If the deployment is behind that
  commit, check the three live defects there first.

### What a second, adversarial pass found
Every claim in this document was then re-checked against the tree by a reviewer instructed to assume it was
wrong. They found **six claims that would have caused a regression or wasted work** — `HUD.setElement` is not
inert, `src/ui/styles.css` also owns the toast, the MediaPipe version skew does not exist,
`OrbitControls.setAzimuthalAngle` does not exist, two intro gates fired before the thing they gated, and the
watchdog advice was inverted — plus **seven drifted `file:line` citations** and **a dozen numeric or attribution
errors**. All are corrected above, and each correction says what the earlier draft claimed so the same mistake is
not reintroduced.

That is the honest state of this document: heavily verified, and it still had that many errors in it. Treat the
remaining citations with the same suspicion.

### Re-check these first
Line numbers drift. Before relying on a citation, confirm it. The claims most worth re-confirming because the most
depends on them: `Ability.spawn`'s use of only `getLength` / `getPointAt` / `getTangentAt`; the `onAbilityImpact`
callback discarding its argument; and `CameraRig.update` re-deriving the camera position every frame.
