# Crit 9 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was realising that "real-time" and "the product idea" were
the same requirement, not two separate things to satisfy. I started NoteGrid
wanting a shared grid where switching instruments would change what someone
else was hearing — but until I actually sat down with the crit's definition
of real-time ("within about a second, without a reload"), I hadn't noticed
that the feature I wanted literally could not exist without a single global,
server-authoritative transport. A version of this app where everyone's
playback loops independently in their own browser is easier to build, but it
quietly breaks the one moment the whole idea is built around. Once I saw that
the architecture decision (one shared Play button and instrument, not
per-user copies) wasn't a technical nicety but the actual condition for the
product to be honest about what it does, the rest of the design — one
in-memory board, one versioned state broadcast over SSE, no database — fell
out of that single constraint instead of being a pile of separate choices.

## What did this work change about who I want to be as a software developer?

I used to think of "pick a conflict-resolution strategy" as a hedge against
being wrong — cover every case, lock what you can, don't let anything get
silently overwritten. Writing the ADR for what happens when two people click
the same cell at once changed that. The right answer here wasn't the most
careful one; it was the one that matched what the app actually promises.
Choosing last-write-wins, and writing down exactly why a lock would have made
the board *feel* worse even though it looks safer on paper, made me more
comfortable making a deliberate, defensible trade instead of reaching for the
safest-sounding option by default.
