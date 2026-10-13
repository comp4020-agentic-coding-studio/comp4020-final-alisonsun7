# NoteGrid

## One board, played together

NoteGrid is a single shared 6×6 grid that anyone who opens the page can edit.
Each of the 36 cells holds one of five notes or is empty, and reading the grid
left-to-right, top-to-bottom gives a 36-step melody. Pick a name, drop notes
into cells, and hit Play — the grid lights up step by step and plays back what
is there, for everyone who has the page open, at the same time.

There is no sign-up and no private board: a visitor is a collaborator the
moment the page loads. The intended use is a small group in the same room (or
a crit), building a tune together in real time and arguing over whether the
next note should be a `so` or a `fa`.

## What good means here

For NoteGrid, good means **change is instantly and audibly shared**. If one
person edits a cell, switches the instrument, or presses Play, that fact has
to reach everyone else's open tab fast enough that it still reads as *one*
shared instrument rather than several people each with their own copy. A
change that only shows up after a manual reload, or that drifts out of sync
with what another visitor hears, has failed at the one thing this app is for.

Good also means the mechanism driving that is honest, not decorative: the
grid should never show a step as "playing" that the audio hasn't actually
reached, and switching instruments should actually change the sound everyone
is currently hearing, not just the sound of future edits. A visible but inert
"Live" indicator would be worse than none.

Good does **not** mean every edit is preserved forever, or that two people
editing the same cell at once both get their way — a shared board with no
accounts and no locks accepts that the last person to click a cell is the one
whose note survives. See
[`docs/decisions/001-cell-conflict-resolution.md`](docs/decisions/001-cell-conflict-resolution.md)
for why that trade is the right one here, and what it costs.

## Why this shape

A shared sequencer is only interesting if "shared" is real: the point is
several people shaping one thing at once, not each visitor privately noodling
on their own copy of a grid. That argues for one global board rather than
private rooms, and for a single global transport (one Play button, one
instrument, one playhead) rather than everyone hearing their own independent
loop — otherwise an instrument switch would only ever affect the person who
pressed it, and the moment that makes this app worth building (*someone
changes the sound everyone else is hearing, right now*) would disappear.

Keeping the board global and in-memory also keeps the promise honest at this
app's actual scale: a handful of people around a shared screen don't need
accounts, persistence across a server restart, or conflict resolution more
careful than "the newest edit wins" — adding any of that now would be solving
a problem this app doesn't have yet, at the cost of the one thing it does need
to get right, which is speed.

## This first version

Open the page, choose a name, and the 6×6 grid appears alongside a palette of
five coloured notes and a Play/Stop control. Click a cell to fill it with the
currently selected note, or click a filled cell again to clear it. Switch
between piano, guitar and saxophone at any time — mid-playback, the sound
everyone hears changes within about a second. Press Play and the grid steps
through its 36 cells in a loop, each visitor's browser lighting up and sounding
the current step independently but in sync, driven by the server's shared
sense of when playback started.

## Promises and judgement

Checks can enforce that a cell written by one visitor reaches another open
session quickly and without a reload, that the served page actually contains
the grid and controls, and that `/readme/` renders this file in full. Whether
the result actually *feels* like playing one instrument together, rather than
watching a shared spreadsheet update, is a judgement call for a person
watching two tabs side by side — which is exactly what a crit is for.

## Deliberate limits

Nothing here is saved once every tab closes: the board lives in the server's
memory, not a database, and a redeploy or restart clears it. There are no
accounts, no undo, and no way to tell who placed a given note. The five notes
and three instruments are a fixed, small palette — this is a toy worth playing
with, not a composition tool.
