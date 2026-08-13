# The Living Grimoire

The Living Grimoire is a hand-cast, AI-crafted elemental spellbook. A visitor
draws a path (or uses a hand gesture), casts Fire, Water, Earth, or Air into a
Three.js stage, and can turn a tuned spell into a durable page in a shared
grimoire.

It is designed around five connected moments:

1. **CAST** — gesture or draw a path and release an elemental effect.
2. **CRAFT** — describe the change you want in natural language or use the
   Spellwright dials.
3. **BIND** — capture a portrait, generate lore, and save a spell page.
4. **DISCOVER** — search, filter, and load spells from the communal book.
5. **REMIX** — use a saved spell as the parent for a new variation.

The visual direction is deliberately dark and tactile: faded parchment,
charcoal black, chalk-white type, warm brass, and one elemental accent at a
time. The interactions are expressive, but the application remains usable
with a mouse, touch screen, and keyboard.

## What runs where

```text
Browser
  React shell + Three.js stage + local MediaPipe hand landmarks
       │
       ▼
Sites by ChatGPT / Cloudflare-compatible Worker (worker/index.ts)
  API routes, validation, anonymous signed identity, rate limits
       │                 │                         │
       ▼                 ▼                         ▼
MongoDB Atlas       OpenAI API                 R2 binding
spells, casts,      lore, patching,            portrait blobs
benders, craft_log  embeddings                 SPELL_PORTRAITS
```

The production entrypoint is the Worker in
[`worker/index.ts`](worker/index.ts), not a static Vite preview. The React app
and API routes are built with Vinext and are intended to be deployed through
**Sites by ChatGPT**. The checked-in Sites binding is in
[`.openai/hosting.json`](.openai/hosting.json); it names the portrait bucket
binding `SPELL_PORTRAITS`.

The 3D stage can still open without Atlas or OpenAI configured. Saving,
discovering live pages, analytics, identity, AI crafting, and portraits require
their respective server-side bindings.

## Local development

Requirements: Node.js 22+ and npm. For connected development, use a MongoDB
Atlas database and an OpenAI project key; the frontend never receives either
secret.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Use the local URL printed by Vinext. The development server runs the Worker
shape as well as the UI, so it is the right way to exercise the API routes.

Run the release checks with:

```bash
npm run build
npm test
```

`npm test` includes a production build before the contract tests. Use
`npm run start` only to serve a built Vinext application locally; the old
`vite preview` workflow is not the production runtime.

### Local environment

Copy the template exactly and fill only the values you need:

```dotenv
ATLAS_URI=mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority
ATLAS_DB=living_grimoire
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6
VITE_VOICE_ENABLED=true
BENDER_TOKEN_SECRET=
```

| Variable | Required for | Notes |
| --- | --- | --- |
| `ATLAS_URI` | spells, casts, benders, analytics, rate limits | A server-only Atlas URI with access to the `living_grimoire` database. |
| `ATLAS_DB` | Atlas features | Defaults to `living_grimoire` if omitted. |
| `OPENAI_API_KEY` | Spellwright, lore, semantic search, seed embeddings | Keep it server-only. |
| `OPENAI_MODEL` | AI text generation | Defaults to `gpt-5.6`. |
| `VITE_VOICE_ENABLED` | optional browser dictation | Public feature toggle; set to `false` to hide the beta microphone control. |
| `BENDER_TOKEN_SECRET` | anonymous signed bender identity | Use a unique, high-entropy value of at least 24 characters. |

`.env.local` is ignored by Git. Never commit a URI, API key, or signing secret.

## MongoDB Atlas: deliberate activation

The bootstrap script is intentionally **preview-first**. Its default command
does not connect, create a collection, create an index, call OpenAI, or write
seed data:

```bash
npm run mongo:bootstrap
```

Before running an apply command, inspect
[`scripts/mongo/bootstrap.mjs`](scripts/mongo/bootstrap.mjs) and
[`scripts/mongo/search-indexes.json`](scripts/mongo/search-indexes.json), then
confirm the target database and any Atlas Search cost implications.

On a new, approved database, the full connected initialization is:

```bash
npm run mongo:bootstrap -- --apply --with-embeddings --with-search
```

That operation does all of the following:

- creates or tightens strict validators for `spells`, `casts`, `benders`, and
  a normal, TTL-bounded `craft_log`;
- creates the B-tree, unique, and 90-day TTL indexes that support casting,
  feeds, lineage, and analytics;
- upserts the house binder and the twelve canonical seed spells;
- calls OpenAI once per seed spell for 1,024-dimensional embeddings when
  `--with-embeddings` is present;
- creates/waits for the `spell_text` Atlas Search index and the `spell_vector`
  Atlas Vector Search index when `--with-search` is present.

You can use `--apply` without the optional flags for a database that should not
have semantic search. Run `--with-embeddings` and `--with-search` only when
you have approved the associated OpenAI and Atlas usage. For a **fresh** seed
database, select the final combination of flags on its first apply: the seed
upsert deliberately preserves existing spells and does not retroactively
rewrite an already inserted seed with an embedding.

The script is idempotent for its seed slugs, but collection validation and
index changes are real production changes. Take a backup and use a least-
privilege Atlas database user before applying it to any non-disposable
environment.

### Seed pages

The initial book contains three house spells for each element:

| Fire | Water | Earth | Air |
| --- | --- | --- | --- |
| Cinderwake | Moon Whip | Terrace of the Patient King | Sparrow Gale |
| Sun-Petal | Harbor Bell | Gravel Psalm | Whistling Door |
| Vermilion Adder | Undertow | Basalt Procession | Sky Lathe |

Each seed starts with the full settings snapshot, a derived five-axis genome,
palette, lineage root, lore, tags, and zeroed counters. The `spells` collection
is the durable page model; `casts` is append-only telemetry with a 90-day TTL;
`benders` stores an anonymous signed device identity and bookmarks; and
`craft_log` supports rate-limiting and one-time lore drafts. `craft_log` is a
normal collection with a two-hour TTL: a lore draft is marked consumed inside
the same transaction as its spell, which MongoDB does not permit for capped
collections.

## Deploy with Sites by ChatGPT

This repository is already structured for a Sites project. Build and deploy it
as a **full-stack Worker application**, keeping the R2 binding name in
`.openai/hosting.json` as `SPELL_PORTRAITS`.

In the Sites project’s environment/secrets controls, add these values as
server-side secrets (not public client variables):

```text
ATLAS_URI
ATLAS_DB
OPENAI_API_KEY
OPENAI_MODEL
BENDER_TOKEN_SECRET
```

Set the same `ATLAS_DB` that was bootstrapped. Ensure that the R2 bucket bound
as `SPELL_PORTRAITS` exists and is available to the project before enabling
portrait binding. Start with a private deployment while validating the
experience; promote only after the runtime health check and the Atlas-backed
flows have been tested.

Recommended release checklist:

1. Run `npm test` from a clean checkout.
2. Confirm no `.env*` secrets are staged or pushed.
3. Verify the production secret values and the `SPELL_PORTRAITS` binding in
   Sites.
4. Deploy a new Sites version, then check `GET /api/health` from the deployed
   origin. It reports whether Atlas and OpenAI are configured/reachable without
   returning credentials.
5. Test a complete bind: identity cookie, optional portrait upload, lore draft,
   saved page, Discover search, and a cast event.

## Product interactions

### Casting and controls

- **Mouse or touch:** drag on the stage to draw a ground path; release to cast.
- **Hands (optional):** begin attunement, then pinch thumb to index to draw.
  Hold a fist for Earth, two fingers for Water, index + pinky for Fire, or an
  open hand for Air. Hover over an element dock button to select it.
- **Keyboard fallback:** `1–4` select elements, `Q/E` cycle, `G` opens the
  full dials, `C` clears effects, `P` pauses, `T` toggles the character pose,
  `M` toggles cast/walk mode, and `H` toggles help.

The Spellwright’s language patch is constrained to the same numeric ranges as
the visual dials. Binding saves a complete spell settings snapshot, so a page
can be replayed independently of later tuning.

### Camera privacy

Hand tracking is opt-in: the browser asks for camera permission only after a
visitor starts attunement. Camera frames and MediaPipe landmarks are processed
in the active browser tab; the application sends cast metadata, not webcam
video, to its API. If camera access, WebGL, or the tracker is unavailable, the
experience falls back to mouse/touch drawing.

The hand mirror is a local visual aid. Closing the stage or disposing the hand
input stops media tracks. Review the deployment’s own privacy policy and any
third-party CDN policies before making a public promise beyond this code’s
behavior.

### Accessibility and comfort

- Every primary route has a visible button-based alternative to gesture input.
- Interactive controls use labels and live status feedback; avoid relying only
  on color to identify an element.
- `prefers-reduced-motion` is respected in the interface styling.
- The hand ritual can be skipped immediately, preserving keyboard, mouse, and
  touch access.
- Keep the camera optional and describe it clearly before permission is
  requested.

## Project map

```text
app/                         React shell and server routes
  api/                       Atlas/OpenAI/R2-backed API handlers
  GrimoireStage.tsx          Product UI: stage, Spellwright, Discover, Almanac
src/                         Three.js scene, effects, interaction, contracts
  config/spell-contract.js   Settings snapshots, validation ranges, genome
worker/index.ts              Cloudflare/Sites Worker entrypoint
scripts/mongo/               Explicit Atlas bootstrap and search definitions
.openai/hosting.json         Sites project and R2 binding declaration
tests/                       Contract tests
```

## Operational notes

- `GET /api/health` is a safe readiness probe; it exposes statuses, never
  credentials.
- The API validates client payloads, uses a signed HTTP-only anonymous identity
  cookie, caps request bodies, and rate-limits AI/craft operations through
  `craft_log`.
- Atlas queries have practical text/semantic fallbacks. The quality of semantic
  discovery depends on running the approved embedding and Search setup.
- Do not enable Atlas Stream Processing merely for the Almanac: the current
  90-day aggregations are intentionally served from indexed cast events.

For MongoDB MCP operational considerations, see the
[MongoDB MCP Server tools considerations](https://dochub.mongodb.org/core/mongodb-mcp-server-tools-considerations).
