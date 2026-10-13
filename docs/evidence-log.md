# Evidence log — Crit 9 (NoteGrid)

Concise record of what was prompted, what the agent produced, what failed,
and what was corrected. Commit hashes link to the actual commits once this
work lands (see PROCESS.md for the final list).

## Direction

1. **Starting point**: the repo had just been reset to the bare course
   template (the previous idea, DayDraw, removed) in the turn before this
   work. Wen's prompt for Crit 9 was a rough product sketch: a 6×6 grid, 5
   coloured note blocks, remove-a-cell, a nickname, a Play button, 3
   switchable instruments (guitar/piano/sax), and the specific behaviour
   that "另一个用户正在演奏的音乐会迅速在一秒钟之内产生变化" when someone
   switches instrument mid-playback — i.e., Wen's own idea already *was* a
   real-time multi-user requirement before the Crit 9 brief was even
   checked.
2. Before designing anything, the agent fetched the live Crit 9 spec
   (`crits/09-all-at-once`) rather than assuming what "real-time" meant, and
   quoted its exact definition ("within about a second, without a reload")
   and its four example multi-user-decision areas back to Wen.
3. Five clarifying questions were asked and answered before any code was
   written, because each one changes the architecture materially:
   - 36 cells as one 36-step loop (not 6 parallel tracks) — chosen for
     simplicity and because it matches Wen's "连续的音乐" (continuous
     melody) phrasing more literally than 6 simultaneous chords would.
   - One single global shared board, no room codes — simplest fit for "多
     个用户" filling one grid together.
   - Pure Web Audio oscillator synthesis, no soundfont fetch — zero new
     runtime dependency, zero network risk inside a 256 MB Fly machine.
   - Global, server-authoritative playback (not each browser looping
     independently) — this is the one decision the whole "instrument
     switch changes what's playing for someone else" behaviour depends on;
     independent per-browser loops would make that behaviour impossible to
     build honestly.
   - One global instrument, not per-user — consistent with the single
     global transport above.
   - Last-write-wins for simultaneous cell edits — chosen as the Crit 9
     ADR topic; see `docs/decisions/001-cell-conflict-resolution.md`.
4. A plan (server+state design, file list, verification steps) was written
   and approved by Wen before any file was created, including the decision
   to keep state in-process memory (not SQLite) since Crit 9 grades
   real-time propagation, not restart persistence, and this app's "good" in
   README explicitly limits itself to that scope.

## Grounding

- The exact Crit 9 spec lines were fetched from the course API
  (`/api/crits/09-all-at-once.json`) rather than recalled from general
  knowledge of the course, and are quoted verbatim in PROCESS.md and this
  file.
- `spec/README.md`'s existing contract (`/` returns 200, `/readme/` renders
  README's headings in order) was re-read before writing `src/html.ts`, so
  the README-rendering approach was built to that actual check, not a
  guess.
- The repo's own prior engineering choices (plain `node:http`, SSE with a
  versioned broadcast state, no framework) were reused from the history of
  the previous DayDraw idea's M1 slice — not because that code still
  exists (it was deleted in the reset), but because the pattern itself (a
  single in-memory `version`-stamped state object broadcast over SSE) is a
  good, previously-proven fit for "push a new truth to every open tab
  within budget," and reusing a known-good shape here was a deliberate
  choice to avoid re-deriving it from scratch.

## Correction

- The nickname form initially used no explicit `method`/`action`, which
  would submit as a `GET` to the current page instead of `POST /nickname`
  — caught before it reached a browser, by re-reading the rendered form
  markup against the server's actual route table, and fixed in
  `src/html.ts` by adding `method="post" action="/nickname"` directly.
- Docker was not available in this working environment, so the Dockerfile
  build (which mirrors CI's exact `docker build` + `docker run --tmpfs
  /data` check) could not be verified locally before pushing. This is
  named here rather than silently assumed to work: the first real Docker
  build-and-run of this app happens in CI on push, and must be watched
  before relying on the deployed app for the crit.
- `pnpm check` (typecheck + the full spec suite, including the new
  real-time SSE tests) was run and passed locally against the actual
  compiled `dist/server.js` — not against `ts-node` or a dev-only path —
  so what was checked is what `pnpm build && pnpm start` actually runs.
