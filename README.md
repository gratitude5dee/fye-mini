# Living Grimoire

Living Grimoire is a local-first elemental casting stage with a game in it. The ritual ground poses a problem —
waystones to reach, hazards to avoid — and you solve it with one drawn line. Your line is your own: four players
solve the same layout four different ways, and every one of them is right.

Nothing in the runtime sends camera frames, hand landmarks, drawn lines, settings or progress to a server. There
is no server.

## Run it

```sh
npm install
npm run dev
```

## The loop

Press **Begin a Rite**. A layout lights on the ground and a faint line runs from the caster to the first
waystone — that is the entire tutorial, and it never appears again after your first solve.

Draw a line that reaches every waystone without clipping a hazard. The Ward answers in proportion: a stone lights
for each line you solve, and a stone may honestly stay dark. You get three attempts per line, the accept rings
quietly widen each time you miss, and a Rite always ends.

**The elements are tools, not skins.** Fire is the only one that crosses a hazard on its own; water rides a swell
just off the ground, and stone and wind hug it. So a hazard fire clears by nature is one the others cannot —
unless you raise your hand (see below).

Layouts are generated from a seed, so the daily Rite is the same for everyone who opens it, with no account and
no server.

## Casting with your hands

Desktop only, and never offered before you have already cast without it. Press **Hand mode** and grant the camera;
the mirror and the landmark overlay are drawn in this tab and nothing is recorded or sent.

The tracker boots disengaged. Hold an open palm until the ring fills to wake it, pinch thumb to finger to draw,
and lower your hand to rest.

**The reason hands exist here is height.** A pointer is raycast onto the ground plane, so every point of a mouse
stroke is flat by construction — there is no third axis to read. A hand has one. Raise your hand mid-stroke and
the line leaves the ground, which lets you take an element over a hazard that only fire clears by nature. Finger
spread widens the cast. Both degrade to their defaults with a pointer, so nothing is gated behind a camera: the
hand raises the ceiling, never the floor.

If the camera is refused, unavailable, or the tracker cannot keep pace, casting falls back to the pointer and the
game is unchanged. Mobile is touch-first and never asks for a camera.

## Controls

- **Draw** with mouse, touch, or a pinched hand.
- **1–4** choose an element, **Q/E** cycle. Choosing works mid-stroke.
- **Cast** fires a demonstration along a fixed path.
- **Ride a path** sends the caster along your next stroke on the air scooter instead of casting it.
- **G** editor · **P** pause · **C** clear · **H** help · **T** seat the caster · **M** arm the ride.
- **Escape** closes any panel.

Open **Workshop** for local presets and per-element dials. Browser storage holds only your element, your dials,
how far onboarding got, and which layouts you have solved. If the browser is not keeping site data, the Workshop
says so.

## Tests

```sh
npm test
```

Source-text contract tests, no browser required. Beyond the usual, they assert that nothing under `src/` or `app/`
can reach the network, that only two designated modules touch storage, that game rules stay out of reach of any
cosmetic preset, that every generated layout is solvable, and that the hand's lift is summed everywhere it has to
be.

## Local assets and attribution gate

The code foundation comes from [AvatarCastingAbilitiesThreeJS](https://github.com/achrefelouafi/AvatarCastingAbilitiesThreeJS),
whose source is MIT licensed. Ideas for targeting, hit resolution and the hand-tracking state machine were read
from its two siblings, [LinearAbiltyCastingExtendedThreeJS](https://github.com/achrefelouafi/LinearAbiltyCastingExtendedThreeJS)
and [HandCastAbilityThreeJS](https://github.com/achrefelouafi/HandCastAbilityThreeJS), both MIT,
Copyright (c) 2026 mohamedachrefelouafi. See `THIRD_PARTY_NOTICES.md`.

This repository includes upstream `Standing Idle.fbx` and `spruit_sunrise.hdr` under `public/`. **Their
redistribution rights are unconfirmed, and that is a release blocker** — confirm them or substitute
independently licensed originals before publishing. See section 13 of `update.md`.

## Deployment

`npm run build` produces a Cloudflare Worker bundle with Sites metadata. There is no database, gateway,
object store or AI secret to configure, because there is nothing to configure.

## update.md

`update.md` is the specification this product was built to, including what was tried and rejected, the verified
facts about the codebase it rests on, and thirty-one implementation hazards. It records which phases are built
and which are not.
