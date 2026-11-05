# Your harness

# Sound of a City agent rules

The design pack in `design/sound-of-a-city/` (start with its `CLAUDE.md` and
`START_HERE.md`) was the starting point. The decisions in `docs/decisions/`
record where the build went from there: 004 to 007 the walkable place, the
CC0 assets, the forest and sea, seeing each other and talk; 010 took the old
sound out; 011 is Wen's new sound design; 012 keeps only the sunny day
(003, 008 and 009 are history).
Read them before changing behaviour. Explain progress to Wen in Chinese; the
UI, code, commits and repo docs are English. README.md, PROCESS.md,
reflections and the research note are Wen's to write: offer outlines and
checks, never draft them.

## What it is

Sound of a City. One imagined place you walk through in first person, From
the Forest to the Sea: a forest trail, a creek and footbridge, a boardwalk
with a café, fish and chip kiosk and beach huts, the beach and a pier. Built from CC0 assets, with drawn cat and dog figures for
the people in it, who see each other and can talk when they meet, and
leave sounds where they stand for everyone to hear (ADR 011).

The place (`seaside`, three.js, Sunny Day only: ADR 012) is the only one. Its
`PlaceKit` is in `client/seaside.ts` (the café's room in `client/cafe.ts`);
the toolkit in `client/world-build.ts`; the view in `client/world.ts`; the
sounds people leave in `client/soundscape.ts`, with the sounds on offer and
their rules in `shared/sounds.ts`.

## Product invariants

- **The standard (Wen):** suits people playing together; keeps what they do,
  so tomorrow shows today's changes; what others change, you see.
- **Sound is Wen's design (ADR 011).** Sounds are left where you stand and
  removed from beside them; only the room rules in ADR 011, no owners or
  quotas; no background bed; nothing fades. Don't add sounds, a bed or new
  rules on your own: Wen chooses every sound by ear. The tables from before
  ADR 010 stay untouched (`before-sound-removal` tag); `placed_sounds` rows
  are never deleted (removing sets `removed_at`).
- **Imagined places say so (ADR 005).** The place's page shows its `about`
  text: not a real place, and where its pieces come from.
- **Only CC0 or public-domain assets, all recorded.** Models, surfaces and
  skies come from Poly Haven via `scripts/fetch-assets.mjs` (MD5-checked);
  sounds from Wikimedia Commons via `scripts/fetch-sounds.mjs` (SHA-1
  checked, needs ffmpeg); each is in `public/assets-manifest.json`. Never
  add an asset that isn't CC0 or public domain, or whose site refuses
  scripted downloads; never get around such a refusal (so not YouTube).
- **Published images are processed derivatives only.** `public/scenes/`
  (Wen's photos, blurred, no metadata) is unused now but stays. The
  originals are gitignored and must never be committed: this repo is public.
- **One place, one room (ADR 007, 012).** Only Sunny Day; the room keeps
  its database name `morning` (`Scene.room`), so never change it. Retired
  modes redirect to the sunny day.
- **People see each other and talk when they meet (ADR 007).** Positions and
  words live in memory only; words go only to people within 12 m, appear
  over the speaker for 5 s or until replaced, and low in each listener's
  view for 8 s (the speaker may be out of sight), and are never stored or
  logged (the log has who spoke and how many characters).
- **Joining:** a name and a cat or a dog, from the arrival card (in place,
  `POST /join` answering JSON) or the explore page's form. Identity comes
  from the HttpOnly `soac_session` cookie (DB stores its SHA-256 hash),
  never the body.
- **Persistence.** `/data/sound-of-a-city.db` on the Fly volume. The old
  SoundGarden `garden.db` is left alone. Never delete or reseed on start.
- **Logged.** One `[time] INFO event key=value` line per action, with user
  id and nickname.

## Engineering constraints

Plain `node:http`, `node:sqlite`, SSE, TypeScript compiled with `tsc`; two
runtime dependencies: `marked` (for `/readme/`) and `three` (served from
`node_modules` at `/vendor/three.module.min.js`, loaders at
`/vendor/addons/`, both via the import map). Assets are served only from
`public/assets/{models,textures,skies,sounds}` by pattern. Validate what people
send on the server (positions finite and bounded, words cleaned and cut to
120, rate limits). Escape nicknames in HTML and in embedded JSON; set them
with `textContent` in the client.

Every file the browser loads must be in `STATIC` in `src/server.ts`;
`spec/pages.test.ts` follows every import from every page script.

Keep the Fly app, single machine, 256 MB and `/data` volume as configured.
Pushing to `main` deploys (the repo is public): don't merge or push to main
without Wen's go-ahead.

## Checks and evidence

- `pnpm check` runs `spec/` against the app at `APP_URL`.
- `pnpm build && pnpm e2e` runs `e2e/world-two-browsers.mjs` (Go to,
  walking, the footbridge, the kangaroo) and `e2e/meet-and-talk.mjs`
  (seeing each other, talk, joining from the arrival card) and
  `e2e/leave-a-sound.mjs` (leaving, hearing and removing sounds), each
  in two Chrome sessions on the GPU (`--use-angle=metal`): in software
  rendering the place runs at well under 1 fps.
- `SCENE=seaside SHOTS=forest,creek,forest-edge,boardwalk,beach,pier,counter node e2e/look-world.mjs <dir>`
  saves screenshots of those zones (`MODES=` for others).
- Keep `spec/invariants.test.ts` as shipped. Never weaken a test to get
  green. A new check should be seen to fail without its fix.

A green spec is not proof the page works: look at the screenshots before
calling UI work done. Commit verified milestones. Log prompts, failures and
corrections in `docs/evidence-log.md`. Report what wasn't run as not run
(Docker isn't installed locally). Keep secrets out of git and logs.
