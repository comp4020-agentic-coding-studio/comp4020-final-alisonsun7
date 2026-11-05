# Your harness

# Sound of a City agent rules

The design pack in `design/sound-of-a-city/` (start with its `CLAUDE.md` and
`START_HERE.md`) defines the product. `docs/decisions/003-live-places-and-memories.md`,
`004-walkable-drawn-world.md`, `005-imagined-places-from-cc0-assets.md`,
`006-forest-to-sea.md`, `007-living-place-presence-and-talk.md` and
`008-one-sound-per-place.md`, `009-footsteps-as-you-walk.md` record where this build follows it and where it
departs (005 drops the ANU theme). Read both before
changing behaviour. Explain progress to Wen in Chinese; the UI, code, commits
and repo docs are English. README.md, PROCESS.md, reflections and the research
note are Wen's to write: offer outlines and checks, never draft them.

## What it is

Sound of a City. One imagined place you walk through in first person, From
the Forest to the Sea: a forest trail, a creek, a boardwalk with a café,
kiosk and beach huts, the beach and a pier. Built from CC0 assets, with
drawn cat and dog figures in it. People add everyday
sounds at fixed spots in a scene; everyone in the same place hears them. A
3-minute memory, timed by the server, is saved with everyone's names, can be
replayed, and appears in a public archive.

Walkable places (`view: "world"`, three.js, three modes each) are the only
ones listed; each has a `PlaceKit` (`client/places.ts`; the café in
`client/cafe.ts`, `client/seaside.ts`). The café's own street, the ANU
campus and the older photo scenes are `retired`:
unlisted, but their pages and memories still work.

## Product invariants

- **Imagined places say so (ADR 005).** Every listed place has `about` text
  on its page saying it isn't a real place and where its pieces come from.
- **Only CC0 assets, all recorded.** Models, surfaces and skies come from
  Poly Haven via `scripts/fetch-assets.mjs` (MD5-checked) and each is in
  `public/assets-manifest.json`. Never add an asset that isn't CC0 or whose
  site refuses scripted downloads; never get around such a refusal.
- **(Retired campus) drawn from Wen's photos, not surveyed (ADR 004).** The world's layout
  follows Wen's sketch; what's in it follows the photos. Keep what Wen
  stated (the door on your right facing the library; the tea point faces the
  bins; sink left of the microwaves). Don't add rooms or things no photo or
  sketch shows; draw unknowns closed (the hall). The page always says sizes
  and distances are estimates, and shows the real photo of each zone. In the
  retired photo scenes, anchors were read off the photo and a graded mode
  says so (`Mode.note`).
- **Published images are processed derivatives only.** `scripts/build-scenes.mjs`
  blurs every person (and screens showing people), strips metadata, and
  writes `public/scenes/`. The originals are gitignored and must never be
  committed: this repo is public. Never use web or social-media images in
  the app; facts from them go in the About page as text with a link.
- **The standard (Wen):** suits people playing together; keeps what they do,
  so tomorrow shows today's changes; what others change, you see.
- **A living place keeps its sounds (ADR 007).** The seaside has one session
  for every time of day, never sealed, no 3-minute memories.
- **Each place plays one sound, chosen by whoever is there (ADR 008).**
  Choosing another switches it; anyone joined may choose, switch, set the
  volume of, or turn off any place's sound; no per-person limit. Cats and
  dogs in a living place are only people who are here. The place's card is
  the one way to change a sound; the tray only shows where sounds can go.
- **Footsteps belong to walking (ADR 009).** A per-person switch, not a
  place's sound: your steps (0.55, centred) and others' (0.3, positioned,
  fading, none beyond 20 m) on the ground underfoot. Never sent anywhere.
- **People see each other and talk when they meet (ADR 007).** Positions and
  words live in memory only; words go only to people within 12 m, appear
  over the speaker for 5 s or until replaced, and are never stored or
  logged (the log has who spoke and how many characters).
- **(Retired scenes) one live session per place** (scene + mode). Sounds can be placed before
  the clock starts; "Start a 3-minute memory" starts the server clock; at
  3:00, or when the starter saves early, it's sealed into a memory and the
  place opens a new, empty session.
- **The server owns time and order.** The countdown comes from `startedAt`
  and `serverNow`, never a client timer. Every accepted change is one
  transaction that bumps the session revision and writes a `session_events`
  row with that number as `server_seq`. No gaps.
- **Realtime is SSE plus JSON ops.** A stream sends a full snapshot on every
  (re)connect, then `committed` events. A client that sees a sequence gap
  refetches the snapshot; it never guesses. Ops carry a client
  `operationId`, deduplicated by `UNIQUE(session_id, operation_id)`.
- **People change only their own sounds** (except volume in a living place). Owner checks and `baseRevision`
  stale checks are on the server. Identity comes from the HttpOnly
  `soac_session` cookie (DB stores its SHA-256 hash), never the body.
- **Never claim a save that didn't happen.** A failed seal shows "failed",
  keeps every sound, and can be retried. Offline, the page says changes
  aren't being saved and sends nothing.
- **Sound starts only after "Enable sound"** (or "Enter with sound" on
  arriving; a card's Listen preview plays one sound to you alone and never
  turns the place on). All sounds are synthesised in
  the browser (no samples, no recordings). Hidden tabs suspend audio. In the
  world, each sound is positioned at its spot and heard from the camera.
- **Persistence.** `/data/sound-of-a-city.db` on the Fly volume. The old
  SoundGarden `garden.db` is left alone. Never delete or reseed on start;
  `recover()` resumes or seals clocks that were running.
- **Logged.** One `[time] INFO event key=value` line per action, with user
  id and nickname.

## Engineering constraints

Plain `node:http`, `node:sqlite`, SSE, TypeScript compiled with `tsc`; two
runtime dependencies: `marked` (for `/readme/`) and `three` (served from
`node_modules` at `/vendor/three.module.min.js`, loaders at
`/vendor/addons/`, both via the import map). Assets are served only from
`public/assets/{models,textures,skies}` by pattern. Validate every op on the
server (ids, enums, anchors via `checkPlace`, gain 0..1, limits per place
from `maxSoundsIn` (12, or 24 in the world) and 4 per person, 40 ops per
10 s). Escape nicknames in HTML and in embedded
JSON; set them with `textContent` in the client.

Every file the browser loads must be in `STATIC` in `src/server.ts`;
`spec/pages.test.ts` follows every import from every page script.

Keep the Fly app, single machine, 256 MB and `/data` volume as configured.
Pushing to `main` deploys (the repo is public): don't merge or push to main
without Wen's go-ahead.

## Checks and evidence

- `pnpm check` runs `spec/` against the app at `APP_URL`.
  `spec/lifecycle.test.ts` builds and starts its own copy (3-second clock,
  temp DB, test hooks) for sealing, failed saves and restarts.
- `pnpm build && pnpm e2e` drives two Chrome sessions through the UI.
- `node e2e/look.mjs <dir>` saves screenshots for a person to look at;
  `SCENE=seaside SHOTS=forest,creek,forest-edge,boardwalk,beach,pier,counter node e2e/look-world.mjs <dir>`
  does every mode and those zones of a walkable place.
- `node e2e/world-two-browsers.mjs` drives the seaside in two Chrome sessions;
  `node e2e/meet-and-talk.mjs` checks seeing each other, talking, kept
  sounds and shared volume. Both remove the sounds they add.
  The world e2e scripts use the GPU (`--use-angle=metal`): in software
  rendering the café runs at well under 1 fps.
- Keep `spec/invariants.test.ts` as shipped. Never weaken a test to get
  green. A new check should be seen to fail without its fix.

A green spec is not proof the page works: look at the screenshots before
calling UI work done. Commit verified milestones. Log prompts, failures and
corrections in `docs/evidence-log.md`. Report what wasn't run as not run
(Docker isn't installed locally). Keep secrets out of git and logs.
