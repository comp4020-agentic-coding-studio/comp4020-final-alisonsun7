# Your harness

# SoundGarden agent rules

Read README.md (the definition of good) and
`docs/decisions/001-simultaneous-edits.md` before changing behaviour.
Explain progress to Wen in Chinese; the UI is English.

## What it is

One shared 6×6 grid. Columns are the six steps of a loop; every note in a
column sounds together. Five notes (C4 D4 E4 G4 A4, pentatonic) plus an eraser.
Three synthesised instruments (piano, guitar, saxophone). One garden for
everyone, no rooms.

## Product invariants

- **One shared garden.** Every person sees and edits the same 36 squares.
  Anyone may add, change or erase any note. Do not add rooms or per-note
  ownership.
- **Instrument is shared; playback is not.** Switching instrument changes it
  for everyone, and a listener's next beat uses the new instrument. Pressing
  Play starts only that browser's loop — never force playback on others.
- **Live edits are heard without restarting.** The scheduler reads the grid
  and instrument at the moment it schedules each beat.
- **Real-time means within about a second, no reload.** Every mutation is
  pushed to every open page as the full `GardenState`; a reconnect gets the
  full state, never just later events.
- **Last write wins, in server order.** Each mutation is one transaction that
  bumps `garden_state.version`; clients ignore snapshots older than one
  they've shown. Changing this means rewriting the ADR first.
- **Identity comes from the session, never the request body.** The browser
  holds only a random HttpOnly token; the DB stores its SHA-256 hash. Every
  mutating route resolves the user from that cookie and returns 401 without
  it. Two people may share a nickname.
- **Persistence.** Notes, instrument, users and activity live in SQLite at
  `/data/garden.db` on the Fly volume. Never delete or reseed it on startup.
- **Presence is honest.** "N people creating" counts distinct users with an
  open `/events` stream right now. Visitors watching the welcome page's
  `/preview` stream are never counted.
- **The welcome page shows the garden before you join.** It server-renders
  the current grid and crowd line (so it works without JS), then `/preview`
  keeps it live. `/preview` is the only stream without a session: read-only,
  silent, and it carries grid, instrument, online and version only — never
  nicknames or activity.
- **Every action is logged** as one `[time] INFO event key=value` line on
  stdout, including the user id and nickname, so `flyctl logs` explains what
  happened.

## Engineering constraints

Plain `node:http`, `node:sqlite`, SSE, TypeScript compiled with `tsc`; one
runtime dependency (`marked`, for `/readme/`). Validate every input on the
server (row/col integers 0–5, note and instrument from their enums, body size
capped). Escape nicknames in HTML; set them via `textContent` in the client.
The welcome page's book-turn animation is progressive: the join form must
still post without JS, and `prefers-reduced-motion` skips the turn.

Every file the browser loads must be listed in `STATIC` in `src/server.ts`.
A missing module makes the page 200 while rendering nothing — that exact bug
shipped once, and `spec/client.test.ts` exists to stop it recurring.

Keep the Fly app, single machine, 256 MB and `/data` volume as configured.

## Checks and evidence

Product checks go in `spec/*.test.ts` and run against the running app with
`pnpm check`. Keep `spec/invariants.test.ts` as shipped. Never weaken a test
to get green; if something can't be run (e.g. Docker locally), say it's
unverified.

A green spec is not proof the page works. Before saying a UI change is done,
load it in a real browser and confirm the grid renders and a second session
sees the change.

Commit verified milestones, not dumps. Log prompts, failures and corrections
in `docs/evidence-log.md`. When a failure shows a broken promise, fix the
test or rule as well as the code.

Deploy follows the course ship/preflight skills. Keep secrets out of git and
logs.
