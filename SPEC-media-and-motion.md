# SPEC — Generated media for UX/UI + mesh/motion/rigging upgrades

**Repo:** `gratitude5dee/fye-mini` · prod branch `claude/epic-hypatia-eyicbk` · `avatar.wzrd.tech`
**Status:** review + plan only. No implementation yet.
**Proven precedent:** the intro film (`output/fal/intro/h3-max-turbo-approved-source.mp4`) and the four world-card images (`output/imagegen/world-priors/*.png`) are already AI-generated and shipped. This spec extends a pipeline that already works.

**Model choices (user-pinned):**
- **All video:** `fal-ai/minimax/h3-max-turbo` — fal's post-trained MiniMax H3, t2v + i2v. `$0.015/s @480p, $0.024/s @768p, $0.048/s @1080p`; duration 5–15s; `image_url` first frame + optional `end_image_url` last frame; native audio. A 6s @768p loop ≈ **$0.144**.
- **All images:** `openai/gpt-image-2.5/sunburst` — precision variant of GPT Image 2.5 (`text-to-image` + `edit`, up to 3840px). ~$0.04–0.05 per still at 1080p/high.

---

## 0. Ground rules (existing contracts — do not break)

- **Runtime never calls fal.ai** — all generated media is a static asset in `public/`; the no-egress contract test (`tests/*`) must keep passing. Generation happens in `scripts/`, output lands in `output/fal/<surface>/`, and only reviewed picks get copied to `public/`.
- **Asset rights** — every shipped generated asset gets a row in `THIRD_PARTY_NOTICES.md` (same pattern as `caster-motion.glb`).
- **`prefers-reduced-motion` + calm mode parity** — every video surface needs a static-poster fallback; calm mode never plays video.
- **One rig, one job** — every `meshy/rigging/multi-animation` call creates a NEW auto-rig with a different armature convention. All clips in a pack must come from a single response. `scripts/motion-pack.mjs` already throws when conventions differ (hips >0.5m); keep that guard.

---

## PART A — UX/UI improvements via fal image/video generation

### A1. World-card motion previews — highest value, cheapest
World cards (`app/GrimoireStage.tsx` `.world-card`) show static priors. Give each ready world a 6s ambient loop that plays muted on hover/focus.

- **Model:** `fal-ai/minimax/h3-max-turbo/image-to-video` — feed the existing prior JPG, prompt a slow ambient (water falling on Jade Citadel, lava drift on Ember Basin, mist on Sky Sanctuary). ~$0.14/6s @768p.
- **Ritual Stage** has no prior image (`imagePath: null`). Generate a still first (`openai/gpt-image-2.5/sunburst/text-to-image`, ~$0.05), then i2v it — it also fills the empty canvas tile.
- **Schema:** D1 `worlds` gets `preview_url`; `worker/worlds.ts` emits it in `/api/worlds`; card `<video muted loop playsinline poster={thumbnailUrl}>` with `preload="none"`. Ritual + fallback use a local `public/media/previews/ritual-stage.mp4` constant.
- **Hosts:** remote previews must live on a host in `ALLOWED_ASSET_HOSTS` (`worker/worlds.ts`) — same rule as splat URLs. Verify host list at impl time; the local fallback ships in `public/`.
- **Cost:** ~4 clips + 1 still + 1 clip ≈ **$1.50**.

### A2. Emerald Bay teaser while it's "Preparing"
`emerald-bay` is calibrating. Its prior image → one i2v clip shown as an "arriving soon" teaser on the disabled card (with a subtle "Preparing" treatment). When the splat ships, the same clip becomes its normal A1 preview — zero throwaway work. +$0.14, folded into A1.

### A3. Per-element intro variants (phase 2)
Current film is element-agnostic. Long-term: 4 films, selected by `preferences.element` in the intro effect. Expensive and low-ROI vs A1/A4 — keep as phase 2; cheap alternative is a generated **end-card** (one still per element) that the intro lands on.

### A4. Rite-completion cinematic payoff
The Rite (`Begin a Rite` → ward stones → completion) ends with a text toast. Add a 6s generated vignette overlay on ward completion — 4 variants, one per element (i2v from a generated ward-sigil still, or t2v). `prefers-reduced-motion`/calm → static generated still + existing toast. Auto-dismiss ~5s, closable.
- **Cost:** 4 stills + 4 clips ≈ **$0.80** (Sunburst stills + `h3-max-turbo` i2v).

### A5. HUD/UI art (static image gen)
- Element sigils for the dock chips (Fire/Water/Stone/Wind are currently typographic glyphs) — `openai/gpt-image-2.5/sunburst/text-to-image` (and `sunburst/edit` for variants of a base mark), restrained icon style matching the token system.
- Workshop preset emblems for `HOUSE_SEED_SPELLS` buttons.
- `og.png` / loading plate refresh.
- **Cost:** ~10 stills ≈ **$0.50**.

### A6. Pipeline (all of the above)
`scripts/fal-media-fetch.mjs` — same submit → GET-poll → download shape as `fal-motion-fetch.mjs`. A `media-manifest.mjs` in `scripts/` maps each surface → prompt → model → output path → destination in `public/media/<surface>/`. Deterministic file names so re-runs diff cleanly. `FAL_KEY` env only. Extend the no-egress contract test to assert no `fal.run`/`fal.ai`/`queue.fal` strings in `app/` + `src/` shipped code (scripts/ is exempt).

---

## PART B — Mesh integration / motion / rigging

Current: `Standing Idle.fbx` → `caster-mesh.glb` → Meshy auto-rig → 11 clips (`idle, walk, run, sprint, jump, runjump, fall, cast, sit_enter, sit, sit_exit`) → `MotionDirector` picks from locomotion state; `CasterPerformance` + `SittingPose` procedural layers on top.

### B1. Make `walk` reachable — locomotion speed ramp (bug-class)
`LocomotionController` reports only 0 / 4.2 / 7.1, so the shipped `walk` clip is dead. Add an acceleration ramp: `speed` eases 0→target over ~0.25s and decays on release. Clip bands in `MotionDirector._pick`: `speed < 2.8 → walk`, `< 5.5 → run`, else `sprint`. Side benefit: movement stops feeling binary. Touch-pad sprint semantics unchanged.

### B2. Wire the `sit_*` clips
`sit_enter`/`sit`/`sit_exit` ship unused — sitting is fully procedural (`SittingPose`). In `togglePose`/seat path: when clips exist, play `sit_enter` (LoopOnce, clamp) → `sit` loop; on exit `sit_exit` once → idle. Procedural fallback stays for the FBX path.

### B3. New clip batch — ONE multi-animation job, these action ids
Request in a single job against `caster-mesh.glb` (same b3 recipe):
- **landing recovery** (`land`) — jump ends at `jumpPhase: 'landing'` today with no clip; the grounded→idle transition pops. Oneshot, ~0.4s.
- **celebrate/emote** (rite payoff pairs with A4 — victory/celebration action from the Meshy library).
- **idle variation** (subtle sway/look — optional, nice for long idle).
- Re-request the **full existing set** in the same job (don't mix batches — the convention guard will reject it anyway). Repack `caster-motion.glb` wholesale.

### B4. Upper-body cast layer — cast while moving
`cast` is full-body: gathering while running snaps the character to a standstill. Split the clip into bone groups at pack time (`motion-pack.mjs` already parses tracks): tracks whose bone is `mixamorigSpine2`, neck, head, or any arm → `cast_upper`; legs+hips → `cast_lower`. `MotionDirector` plays `cast_upper` as a second action over whatever locomotion clip is active (additive layer, weight ramped by `CasterPerformance.intensity`). FBX path keeps full-body procedural gather.

### B5. Mesh upgrade path (exploratory, phase 3)
- The FBX avatar is a placeholder (`Standing Idle.fbx` provenance caveat already in notices). fal Meshy `image-to-3d`/`text-to-3d` + `retopology` can produce an original rigged-ready character designed for FYE — also resolves the license question.
- Same one-job rule: new mesh → new rig → must re-fetch the whole clip set against it.
- Wardrobe/color variants can hang off the Workshop sheet later.

### B6. Acceptance checks (motion)
- Clips are in-place: hips XZ translation stays near zero through any clip (add to `motion-contract.test.mjs` — catches root-motion packs before ship).
- Every locomotion transition reachable in the Playwright probe: idle→walk→run→sprint→runjump→land→idle, and gather while sprinting shows upper-body layer (B4).
- `joints` count ≥18 on prod after deploy.

---

## Rollout & cost

| Phase | Contents | Est. fal cost |
|---|---|---|
| **P0** | Media pipeline (A6) + world previews (A1) + ritual still + emerald teaser (A2) | ~$1 |
| **P1** | One Meshy job: land + celebrate + idle-var + full re-pack (B3) + walk ramp (B1) + sit wiring (B2) | ~$3 |
| **P2** | Upper-body cast layer (B4) + rite vignette (A4) | ~$1 |
| **P3** | Per-element intros/end-cards (A3) + HUD art (A5) + mesh regen exploration (B5) | ~$2 + eval time |

**Total media spend: < $10.** All phases independent except B4 which layers on B3's pack.

## Risks / watch-items
- `ALLOWED_ASSET_HOSTS` for remote preview URLs — verify before schema work (A1).
- Preview payload budget: keep each loop ≤ ~1.5 MB (768p/6s Hailuo output usually fits; re-encode w/ ffmpeg if not), `preload="none"` + poster always.
- License rows per batch in `THIRD_PARTY_NOTICES.md` (same caveat as existing entries).
- Deploy stays manual (`npm run deploy:prod`); bundle size unchanged at runtime until previews stream.
