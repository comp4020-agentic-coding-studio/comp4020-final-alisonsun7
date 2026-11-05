# ADR 008: Each place plays one sound, chosen by whoever is there

## Status

Accepted, 2026-11-05, for living places. Replaces ADR 007's sound rules
(three per spot, four per person with the oldest replaced, only the owner
removes). Presence, talk and persistence (ADR 007) are unchanged.

## Context

Wen found the sound design full of bugs and wondered whether the idea was
the problem. It was. The rules came from the first design: a few people
composing together for three minutes, then a sealed memory and an empty
place. Each sound belonged to a person, had a cat or dog "performing" it,
and spots could stack several. In a world that keeps everything and that
people walk through together, those rules fought: a sound left by someone
who'd gone looped for ever; their stand-in figures stood among the real
people and couldn't be told apart; caps and silent replacements needed
explaining; anyone could set a volume but only the owner remove; three
sounds looped at once at one spot; there were two ways to add a sound with
different rules; a hint said "Tap to enable sound" but tapping did nothing;
every sound in the world was synthesised however far away; the background
cut between forest and sea up to eight seconds late.

Wen agreed: each place one sound, decided by everyone.

## Decisions

1. **A place (spot) plays at most one sound.** Choosing a sound where
   another is playing switches it: one transaction turns the old one off
   and the new one on (two committed events). Choosing the one already
   playing is refused (`already_here`). The world holds at most one sound
   per place (24).
2. **Anyone joined may choose, switch, turn up or down, or turn off a
   place's sound.** No per-person limit. The card says who chose it and who
   last set its volume (`adjusted_by`, a new nullable column; old databases
   get it on start).
3. **The cats and dogs are only the people who are here.** A place with a
   sound shows its glowing ring and its label names the sound ("Creek ·
   Rustling leaves").
4. **One way to change a sound: the place's card.** The tray becomes a
   sound map: picking a sound highlights where it can go, and clicking one
   opens that card.
5. **One sound switch.** Arriving asks once; the header toggles; when sound
   is off, the words under the view are a real "Turn sound on" button.
6. **What you hear:** positioned sounds more than 40 m away aren't played;
   a change of background (forest, sea, café) crossfades over about 1.5 s
   and starts at once.

The retired scenes keep their old rules (they aren't living).

## Consequences

- No one owns a place; what it plays is whatever the last person chose.
  Turning off someone's choice is allowed and shown ("Bo turned off the
  waves at water's edge"). If this turns into a tug of war, a short hold
  after a change is the obvious next step.
- At most 24 sounds, so the world never fills, and no rule needs
  explaining.

## How it is checked

- `spec/world.test.ts`: switching replaces (remove then add), the same
  sound is refused, the place shows only the new one; anyone turns a sound
  up (seen at another time of day, with `adjustedBy`) and off; no limit per
  person (five places by one person).
- `e2e/meet-and-talk.mjs` (31 checks): label names the sound; "Turn sound
  on" under the view works; the card shows "volume set by Bo"; Bo switches
  the place and Ada's label and card follow; the only named figure is Bo;
  Ada turns off Bo's choice.
- `e2e/world-two-browsers.mjs`: a sound picked in the tray opens the card
  of a place it can go, and is chosen there.
