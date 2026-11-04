# Implementation plan — Sound of a City, ANU Edition

Source of truth: `design/sound-of-a-city/` (Wen's development pack, v1.0,
2026-11-05). This plan says how it lands in this repo.

## Audit (2026-11-05)

- Branch `feat/sound-of-a-city`, cut from `origin/main` at `e664fc4`
  (SoundGarden, Crit 10). History, tags `crit-9`/`crit-10` and
  `reflections/crit-8/9/10.md` are kept. Local backups of earlier branches
  are tags `backup/20261104-0442/*` (local only).
- The GitHub repo is **public**, so a push to `main` runs CI and deploys over
  the live SoundGarden. Work stays on this branch until Wen approves a merge.
- Reused as-is: Node 24 `node:http` server, `node:sqlite` on the Fly volume
  `/data` (WAL), SSE push with full snapshot on (re)connect, HttpOnly session
  cookie whose SHA-256 hash is the only thing stored (`src/users.ts`), one-line
  stdout log (`src/log.ts`), `marked` for `/readme/`, Dockerfile shape,
  `fly.toml` (one 256 MB machine, one volume), CI workflow, spec harness
  (`spec/invariants.test.ts`, `spec/global-setup.ts`), evidence check.
- Replaced: the 6×6 grid (`src/garden.ts`, `src/types.ts`, grid client and
  its tests). The music-grid UI is not carried over (pack doc 06).
- Docker is not installed on this machine, so the CI image build can't be
  run locally; `pnpm check` runs against the app started with node.
- Playwright drives the installed Google Chrome (`channel: "chrome"`) for the
  two-browser e2e run and the photo-processing script.

## Technical choices

- **Realtime transport: SSE + POST, not WebSocket.** The pack allows the
  existing transport (doc 04 "优先在现有框架演进"). Semantics from doc 05 are
  kept: `session.snapshot` on every (re)connect, then `server.committed`
  events with a gap-free `serverSeq`; writes are POSTs carrying a client
  `operationId`; rejections carry a code. A client that sees a seq gap
  refetches the snapshot.
- **2.5D photo shots, not 3D** (START_HERE scope decision). Each shot is one
  processed photo with anchors annotated by hand in that photo's own
  coordinates. Links between shots are navigation, not a floor plan.
- **Sounds are synthesised in Web Audio** (original, no licence risk). No
  third-party audio, no uploads, no microphone (P2, off).
- **One live session per scene + mode.** Entering a scene joins its live
  session; a 3-minute memory is started by anyone, timed by the server, and
  sealed into a memory when it ends; the place then starts empty again.
- **Owner-only edits** (doc 03 P0 rule): you change or remove your own
  sounds; others add complementary ones. Checked on the server.
- **Photos**: Wen approved publishing processed derivatives of her photos.
  `scripts/build-scenes.mjs` blurs every passer-by and on-screen face,
  re-encodes to WebP (no EXIF) into `public/scenes/`. Originals stay
  gitignored under `design/sound-of-a-city/references/`.

## Files

| Area | Files |
|---|---|
| Catalog (shared) | `src/shared/catalog.ts` — scenes, modes, shots, anchors (normalised x/y + evidence), sounds |
| Protocol (shared) | `src/shared/protocol.ts`, `src/shared/state.ts` (pure reducer, used by client and tests) |
| Server | `src/server.ts`, `src/db.ts` (schema per doc 05), `src/sessions.ts` (live sessions, ops, timer, streams), `src/memories.ts`, `src/html.ts`, reused `users.ts`/`log.ts` |
| Client | `src/client/scene.ts`, `stage.ts`, `ops.ts`, `audio.ts`, `synth.ts`, `figures.ts`, `memory.ts`, `style.css` |
| Assets | `public/scenes/*.webp`, `public/assets-manifest.json`, `scripts/build-scenes.mjs` |
| Tests | `spec/pages.test.ts`, `spec/live.test.ts`, `spec/lifecycle.test.ts` (own app, 3 s clock), `spec/helpers.ts`; `e2e/two-browsers.mjs`, `e2e/look.mjs` |
| Docs | `CLAUDE.md` (harness), `docs/decisions/003-live-places-and-memories.md`, `IMPLEMENTATION_REPORT.md`; README/PROCESS left for Wen |

(The table was revised after the build to list the files that exist; the
first draft named test files that were later merged into these three.)

## Phases

- **P0** Marie Reay main shot (IMG_8100) → pick sound → place on an anchor →
  second browser sees it ≤1 s → audio after Enable Sound → server 180 s
  clock → sealed memory → new browser replays it → survives restart.
  Scene selection page; Chifley three modes as visibly different treatments.
- **P1** Marie Reay stairs / entry / tea-point shots and shot links; one
  figure per placed sound doing that sound's activity; LAB entry (evidence
  permitting); timeline replay on the memory page.
- **P2 (not in scope)** recording/upload, free 3D walking, weather system.

## Decisions confirmed with Wen (2026-11-05)

- Build on `origin/main`, keeping history.
- Publish her photos as backgrounds, compressed, with people blurred.
- IMG_8114's right-hand building is Marie Reay; IMG_8098 is taken through
  that door.
- Memories are public by default; the join form says nicknames appear on
  them.
- LAB ANU: she will photograph it; until then a labelled placeholder ships.
- Chifley morning and weekday are colour treatments of her one night photo
  (IMG_8114). The page says so.
