# Your harness

# Sound of a City agent rules

The design pack in `design/sound-of-a-city/` (start with its `CLAUDE.md` and
`START_HERE.md`) defines the product. `docs/decisions/003-live-places-and-memories.md`
records where this build follows it and where it departs. Read both before
changing behaviour. Explain progress to Wen in Chinese; the UI, code, commits
and repo docs are English. README.md, PROCESS.md, reflections and the research
note are Wen's to write: offer outlines and checks, never draft them.

## What it is

Sound of a City — ANU Edition. Real places on campus, shown as Wen's own
photos with drawn cat and dog figures standing in them. People add everyday
sounds at fixed spots in a scene; everyone in the same place hears them. A
3-minute memory, timed by the server, is saved with everyone's names, can be
replayed, and appears in a public archive.

Places: Marie Reay ground floor (six photo views, everyday), the Chifley
bridge (one photo, three modes), and LAB ANU (a labelled placeholder until Wen
supplies photos).

## Product invariants

- **Scenes are evidence, not invention.** Every shot is one of Wen's photos;
  every anchor's x/y was read off that photo. Moving between shots only
  changes which photo is shown: never imply a floor plan, distance, or a room
  the photos don't show. A mode that isn't a real photo of that time of day
  says so on the page (`Mode.note`). A placeholder says so on the stage.
- **Published images are processed derivatives only.** `scripts/build-scenes.mjs`
  blurs every person (and screens showing people), strips metadata, and
  writes `public/scenes/`. The originals are gitignored and must never be
  committed: this repo is public. Never use web or social-media images in
  the app; facts from them go in the About page as text with a link.
- **One live session per place** (scene + mode). Sounds can be placed before
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
- **People change only their own sounds.** Owner checks and `baseRevision`
  stale checks are on the server. Identity comes from the HttpOnly
  `soac_session` cookie (DB stores its SHA-256 hash), never the body.
- **Never claim a save that didn't happen.** A failed seal shows "failed",
  keeps every sound, and can be retried. Offline, the page says changes
  aren't being saved and sends nothing.
- **Sound starts only after "Enable sound".** All sounds are synthesised in
  the browser (no samples, no recordings). Hidden tabs suspend audio.
- **Persistence.** `/data/sound-of-a-city.db` on the Fly volume. The old
  SoundGarden `garden.db` is left alone. Never delete or reseed on start;
  `recover()` resumes or seals clocks that were running.
- **Logged.** One `[time] INFO event key=value` line per action, with user
  id and nickname.

## Engineering constraints

Plain `node:http`, `node:sqlite`, SSE, TypeScript compiled with `tsc`; one
runtime dependency (`marked`, for `/readme/`). Validate every op on the
server (ids, enums, anchors via `checkPlace`, gain 0..1, limits 12 per place
and 4 per person, 40 ops per 10 s). Escape nicknames in HTML and in embedded
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
- `node e2e/look.mjs <dir>` saves screenshots for a person to look at.
- Keep `spec/invariants.test.ts` as shipped. Never weaken a test to get
  green. A new check should be seen to fail without its fix.

A green spec is not proof the page works: look at the screenshots before
calling UI work done. Commit verified milestones. Log prompts, failures and
corrections in `docs/evidence-log.md`. Report what wasn't run as not run
(Docker isn't installed locally). Keep secrets out of git and logs.
