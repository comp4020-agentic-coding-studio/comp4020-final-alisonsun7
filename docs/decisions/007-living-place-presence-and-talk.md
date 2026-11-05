# ADR 007: A living place: kept sounds, people you can see, and talk

## Status

Accepted, 2026-11-05. For living places (`Scene.living`, the seaside),
replaces two decisions of ADR 003: sealing a session into a memory (which
emptied the place), and "people change only their own sounds". The retired
photo scenes keep ADR 003 unchanged, so their memories and checks stand.

## Context

Wen set the standard the app is judged by: it should suit people playing
together; it should keep what they do, so that opening it the next day
shows the day before's changes; and what others change, you see.

Against that, the app fell short in three ways. The 3-minute memory sealed
the place and emptied it, so the next day's visitor could find nothing.
Each time of day was a separate room, so sounds added at "morning" were
invisible at "dusk". And other people were only names in a corner. Wen asked
to see where others are, to be able to talk when you meet someone (what you
say shown until you say something new, or for 5 seconds), and to drop the
3-minute recording.

## Decisions

### 1. The place keeps its sounds; nothing is recorded

A living place has one session that never seals. `session.start` and
`session.finish` are refused (`no_memories`) and the page offers neither.
Sounds stay in the database until the person who added them removes them.

To keep it from filling up for good: a spot holds at most 3 sounds
(`spot_full`); the place 72 (3 for each of its 24 spots); a person keeps 4,
and adding a fifth removes their own oldest in the same transaction (two
committed events, `sound.remove` then `sound.add`), so you can always add.
Nothing is ever removed for age.

### 2. One world at every time of day

`placeMode` maps every mode of a living place to its first, so the
morning, sunny and dusk pages share one session, one stream and one set
of sounds. The time of day is how you choose to see it.

### 3. Anyone can turn any sound up or down

The volume is shared: changing it changes it for everyone, is saved, and
reaches every page through the same committed events as before. Only the
person who added a sound may move or remove it. A late slider against a
newer revision is refused as `stale` and reloads, as before. Others get a
notice: "Bo turned Ada's waves up".

### 4. People you can see

Each joined person's page posts where they stand (`POST /api/sessions/:id/move`,
at most five times a second, only when they've moved or turned). The
server keeps positions in memory only and sends everyone in the place a
`moves` message five times a second; a person silent for 20 s, or whose
last page closes, is dropped. Each page draws the others as their cat or
dog, walking or standing, with their name over their head, eased towards
where the server last put them. You can't walk through another person.

### 5. Talking when you meet

Within 3.5 m of someone, a talk box opens ("Bo is here. Say something:"),
and stays open while you're typing. What you say (`POST /api/sessions/:id/say`,
trimmed, control characters removed, at most 120 characters, at most one
every 0.6 s and 8 per 10 s) goes only to pages of people within 12 m of you
(and your own), as a `said` message, and appears over your head until you
say something else or for 5 seconds. You see your own words under the box.

Nothing said is stored. The log records that someone spoke, how many
characters, and how many people heard, never the words.

## Consequences

- Opening the seaside tomorrow shows today's sounds, at any time of day.
- With no recording, the archive only holds memories from the retired
  scenes.
- Talk is ephemeral by design: there's no history to read back, and no
  record to moderate. Someone far away can't read what's said.
- Positions are lost on a restart (people reappear as soon as they move).

## How it is checked

- `spec/world.test.ts` ("a living place"): a sound added in the morning is
  there at dusk (one session); start and finish refused; a non-owner turns
  a sound up and someone watching at another time of day sees it, but can't
  remove it; a fourth sound at one spot refused; a fifth sound replaces the
  oldest; positions reach everyone; words reach someone 3 m away but not
  someone 100 m away, cleaned and cut to 120; empty words refused; speaking
  before you're anywhere refused. The spec removes the sounds it adds.
- `e2e/meet-and-talk.mjs`: two people at different times of day see each
  other with names; close together both get a talk box; words appear over
  the speaker's head, are replaced by the next, and are gone after 5 s; the
  other gets a slider for your sound; a reload keeps it; nobody is offered
  a recording.
