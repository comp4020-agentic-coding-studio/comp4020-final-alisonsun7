# Your harness

# NoteGrid agent rules

## Purpose and scope

NoteGrid is a single shared 6×6 step-sequencer grid: anyone who opens the
page can fill a cell with one of 5 notes (or clear it), and anyone can press
Play to start a shared, synchronised playback of all 36 cells in one 36-step
loop, in one of 3 instruments (piano/guitar/sax, pure Web Audio synthesis —
no samples). There are no rooms and no accounts: one global board for
everyone who has the page open.

## Current phase

**Active: Crit 9 (real-time + one documented multi-user decision).** The
grid, playback, instrument switching, and SSE-based real-time sync are now
built. The documented decision is last-write-wins on simultaneous cell edits
(`docs/decisions/001-cell-conflict-resolution.md`). Do not add accounts,
persistence across a restart, undo, per-cell locking, or per-user rooms —
README's "deliberate limits" says plainly none of that exists, and adding it
now would contradict a promise already made in the shipped README.

## Product invariants

- One global board, not per-room or per-user copies. The whole point of the
  product is several people editing and hearing the same thing.
- Play/Stop and the current instrument are global, shared state — not
  something each browser tracks independently. An instrument switch must be
  able to change what another open session is currently hearing.
- A client derives "which step is currently playing" from the server's
  `startedAtMs` plus a fixed step duration — the server does not tick a
  playback clock itself.
- Simultaneous cell edits resolve last-write-wins, by design (see the ADR).
  Do not add locking or version-conflict rejection without updating the ADR.
- `/readme/` renders README.md's actual headings, in order, in server HTML —
  keep `spec/invariants.test.ts` green.
- The board lives in server memory only. Do not add a database or claim
  persistence across a restart; README says explicitly that closing every
  tab clears the board.

## Engineering constraints

Plain `node:http`, no framework. Server-Sent Events for real-time push
(`GET /events`), a single in-memory `BoardState` object in `src/state.ts` as
the one source of truth, broadcast on every mutation. Keep the Fly app
identity, URL and single-machine/256MB constraint; this app needs no volume
mount since it keeps no persistent state.

Validate every mutation route's input server-side (cell index range, note
enum, instrument enum) — never trust client-shaped JSON directly into shared
state. Escape user-supplied text (nicknames) in rendered HTML.

Do not overwrite unrelated user work or the harness. Preserve shipped spec
assertions (`spec/invariants.test.ts`). Add product checks through
`spec/*.test.ts`; do not skip or weaken tests to make CI green. If a
build/test cannot be run (e.g. Docker unavailable locally), report it as
unverified rather than claiming it passed.

## Interface quality

Warm paper background, dark ink, five distinct note colours. Real labelled
form controls (fieldset/legend for instruments, a real button grid). Full
keyboard operability and visible focus. No fabricated "Live" claim — the
status line should reflect an actually open SSE connection, and
"Reconnecting…" should only show when the connection has actually dropped.

## Work and evidence

Work in verified vertical slices; commit real milestones, not one dump. Log
prompts, failures and corrections in `docs/evidence-log.md`. When a failure
reveals a violated promise, fix the rule/test as well as the code.

Deployment follows the installed course preflight/ship workflow. Keep
credentials outside git and logs. Before publishing, inspect history for
secrets and report blockers precisely.
