# Living Grimoire

Living Grimoire is a local-first elemental casting stage. A visitor draws with a pointer or uses on-device MediaPipe hand tracking; a visible 3D caster performs each gather, aim, release, and recovery. Nothing in the runtime sends camera frames, hand landmarks, cast history, settings, or prompts to a server.

## Run it

```sh
npm install
npm run dev
```

Use the **Hand mode** button on desktop to grant camera access directly from the browser. The mirror and landmark overlay are rendered in the same tab. If the permission, GPU delegate, or tracker is unavailable, the app falls back to pointer input. Mobile stays touch-first and never asks for camera access.

## Controls

- Draw with a mouse, touch, or a pinch-and-draw gesture to cast.
- Choose an element with the compact stage dock or a held hand pose.
- Use **Cast** for an instant demonstration of the currently selected element.
- Use **Ride a path**, then draw, to send the caster along the path on the air scooter.
- Open **Workshop** for deterministic local presets and three concise per-element dials. Browser preferences only store onboarding, selected element, and dial values.

## Local assets and attribution gate

The code foundation comes from [AvatarCastingAbilitiesThreeJS](https://github.com/achrefelouafi/AvatarCastingAbilitiesThreeJS), whose source code is MIT licensed. This repository includes its upstream `Standing Idle.fbx` and `spruit_sunrise.hdr` under `public/` for local development. The upstream README says those binary assets retain their original licenses; confirm their public redistribution rights before publishing a production bundle. Substitute independently licensed originals if that confirmation is unavailable.

The four opening panels in `public/intro/` are original SVG fallbacks. The image-generation source slot is `output/imagegen/`; approved original, text-free generated panels can replace these fallbacks when image API billing is available. Do not use franchise characters, logos, symbols, or in-image text.

## Deployment

`npm run build` creates a static Sites-ready bundle. There are no runtime database, gateway, object-store, or AI secrets to configure. Set the deployed site public in its hosting dashboard after confirming the binary asset licensing gate above.
