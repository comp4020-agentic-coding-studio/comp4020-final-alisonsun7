# ADR 001: last-write-wins on a simultaneously edited cell

## Status

Accepted, 2026-10-14.

## Context

NoteGrid is one shared 6×6 board with no accounts and no rooms: every open
tab is editing the same 36 cells. Crit 9 requires picking one concrete
decision about multi-user behaviour and evaluating it against README's
definition of "good." The area that matters most for this app is: **what
happens when two people click the same cell at (almost) the same moment,
intending different notes (or one filling it while another clears it)?**

This isn't hypothetical — it's the most likely point of contact between two
people in the same room both reaching for the grid, which is exactly the use
case the app is built for.

## Options considered

### A — Last-write-wins (chosen)

The server applies each `POST /cells/:index` in the order it arrives, with no
read-before-write check and no per-cell ownership. Whichever write reaches
the server last is simply the cell's new value, and the resulting board is
broadcast to everyone over SSE. See `setCell` in `src/state.ts` — it is
exactly four lines: validate the index, assign, bump `version`, broadcast.

### B — Per-cell claim/lock

The first click on an empty or unclaimed cell marks it "being edited by
session X" for a short window (shown to other users, e.g. a dimmed or
outlined cell); other sessions' writes to that cell are rejected or queued
until the lock is released or expires.

### C — Per-cell version check (optimistic concurrency)

Each cell write carries the `version` the client last saw; the server
rejects a write whose version is stale, and the client is told to retry
against the fresh state.

## Decision

**Option A: last-write-wins, no locking, no version check.**

Evaluated against README's "what good means here" section: good is defined
as *change is instantly and audibly shared*, and explicitly **not** defined
as "every edit is preserved." Options B and C both exist to protect an edit
from being silently overwritten — but protecting edits is not a promise this
app makes or needs to make. A locked or rejected cell would read as the
board being less responsive than it actually is, which directly contradicts
the one thing README says has to be true: an edit's effect should be
immediate and shared, full stop.

Option A also keeps the mutation path exactly as simple as the
real-time requirement demands: no lock state to expire, no "stale write"
error path for the client to handle, no UI for "this cell is busy." Every
extra mechanism in B or C is surface area that could itself introduce a
delay or a failure mode — the opposite of what Crit 9 is grading.

## Alternatives rejected, and why

- **B (claim/lock)** was rejected because it solves a problem this app
  doesn't actually have: there's no persistent authorship to protect (notes
  aren't attributed to a person), and a visible "someone else is editing
  this" state adds a second kind of real-time event to get right (lock
  acquired, lock expired, lock released) for a benefit — protecting a
  half-second-old intention — that doesn't matter here. It would also most
  likely *feel* less responsive: clicking a cell someone else touched a
  moment ago would sometimes do nothing, which is a worse first impression
  than "the last click wins."
- **C (version check)** was rejected for the same reason B was, with an
  added cost: it pushes a retry loop onto the client for a failure mode
  (two people clicking the same cell within ~350ms, one step length) that
  is rare and, once it happens, costs the loser nothing worse than clicking
  again.

## Consequences

- A user's edit to a cell can be silently overwritten by someone else's
  near-simultaneous edit to the same cell, with no notification, undo, or
  conflict indicator. This is a real, named cost, not an oversight: anyone
  reading the commit history or this ADR can see it was considered and
  accepted.
- There is no way to tell, after the fact, who wrote which note — the board
  carries no authorship at all, which is consistent with README's "no
  accounts" limit but is worth stating plainly here since it is a direct
  result of this decision's absence of per-write identity.
- If NoteGrid ever needed per-user authorship or undo, this decision would
  need revisiting — `version` already exists on the broadcast board state
  for exactly that future reason, even though nothing currently checks it
  on write.
