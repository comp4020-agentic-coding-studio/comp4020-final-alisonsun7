# ADR 001: Simultaneous edits to one square — server order, last write wins

## Status

Accepted, 2026-10-14. Replaces the first version of this record, written for
the NoteGrid build, which kept state in memory and broadcast a version number
that nothing actually checked.

## Context

SoundGarden is one shared 6×6 grid with no rooms and no owners: everyone on
the page can add, change or erase any note. Crit 9 asks for one decision about
how the app behaves when several people use it at once, judged against the
README's own definition of good.

The question that matters most here is **what happens when two people change
the same square at nearly the same moment** — Alice taps a red C into row 2,
step 3 while Bob, a few milliseconds later, taps a blue A into the same square
(or erases it). This isn't an edge case. Two people sitting side by side,
building one loop, reach for the same spot all the time, and the crit's pod
will do it on purpose.

There are two parts to get right: *which* write survives, and whether every
screen agrees on it afterwards.

## Options considered

**A. Server order, last write wins (chosen).** The server applies writes one
at a time, in the order they arrive. Each write runs in a single SQLite
transaction that also increments a garden-wide `version` and records who made
it. The server then pushes the full garden, stamped with that version, to
every open page. A page ignores any snapshot older than one it has already
shown, so a late, out-of-order message can't roll it back.

**B. Claim the square first.** The first tap on a square locks it to that
person for a moment, and other people's taps on it are refused (or greyed out)
until the lock expires.

**C. Reject stale writes.** Each tap carries the version the browser last saw,
and the server refuses a tap whose version is out of date, asking the browser
to retry against the current grid.

**D. Owners only.** A note can only be changed or erased by the person who
placed it.

## Decision

Option A.

Measured against README's three principles:

- **"Anyone can make music."** A, B and C all accept the first tap without
  ceremony, but B and C make the *second* tap sometimes do nothing, or fail
  with an error. That's a confusing first impression for a stranger who has
  never seen the app before. Under A, a tap always works.
- **"Music belongs to everyone."** D directly contradicts this — it turns the
  shared grid into 36 small private plots. B and C don't contradict it, but
  they spend their complexity protecting the half-second-old intention of
  whoever got there first. Nothing in the README promises that, and in a
  six-beat loop anyone can simply tap the square again.
- **"Every contribution leaves a trace."** A loses the overwritten note from
  the grid, but not from the record. Both writes are in `activity_logs` and in
  the server log, so "who put that there, and who replaced it" is still
  answerable.

A is also the only option where the crit's real-time promise has no extra
moving parts. There is no lock to expire, no retry loop, and no "square busy"
state to keep in sync.

## What it costs

- **An edit can be silently overwritten.** If Bob's write lands after
  Alice's, Alice's note is replaced and she gets no warning. She will see it
  change on her own screen within a second, and the activity list will say
  Bob did it, but there's no undo. This is the main trade, and it's
  deliberate.
- **"Last" means last to arrive at the server, not last to be tapped.**
  Someone on a slow connection can tap first and still win. Nobody can see
  this difference from the outside, but it is a real gap between what "last
  write" sounds like and what it means.
- **The losing write still costs something.** The overwritten note briefly
  appears on its author's screen (the browser shows a tap immediately), then
  changes to the winner within a second. That flicker is the visible cost of
  showing taps instantly rather than waiting for the server.

## How it's checked

`spec/realtime.test.ts` sends two writes to the same square at the same time
from two separate sessions. It then asserts that a third, fresh session sees
one of the two values, and that both writers' open pages converge on that same
value and version within a second.

## When to revisit

If SoundGarden ever offers undo, private gardens or per-person ownership, B
or D starts paying for itself and this record should be replaced, not quietly
worked around.
