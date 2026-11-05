# ADR 011: Sounds people leave where they stand

## Status

Accepted, 2026-11-05. Wen's new sound design, which ADR 010 was waiting
for. ADR 010's removals stand (the old audio engine, spots, cards, memories
and their routes stay gone); this adds sound back in a new form.

## Context

Wen's starting point: the feeling of a place comes from the sounds in it.
Whoever comes in can add to the place's sound or take something away, and
together people make it varied and full.

The earlier designs (ADR 003, 007, 008) failed on their rules: fixed spots
that were hard to find, caps per spot and per person, silent replacement of
someone's oldest sound, owners, two ways to add with different rules,
synthesised sounds, and every sound in the world played however far away.

Wen decided (2026-11-05): sounds are placed freely; there is no background
bed (Wen will be the first to leave sounds); sounds never fade; recordings
come from free sources for now. Wen listened to 21 candidates and kept six.

## Decisions

1. **You leave a sound where you stand.** "Leave a sound here" opens the
   six sounds, those that suit the zone you're in first, each with Listen
   (a few seconds only you hear) and "Leave it here". The server places it
   where it last saw you standing, not where the page says, so a sound can
   only be left by walking there.
2. **You remove a sound by standing beside it** (within 4 m). Near a sound
   its label says what it is, who left it and when, with Remove. Anyone may
   remove any sound; the change is shown to everyone ("Bo removed Café
   chatter"). Doing it in the place, in front of whoever is there, is the
   check on it, rather than ownership or quotas.
3. **Three rules about room, and nothing else:** two of the same sound
   need 4 m between them (`too_close`); no more than 6 sounds within 10 m
   (`crowded`); no more than 150 in the place (`place_full`). One change a
   second per person (`slow_down`).
4. **Nothing fades and nothing is deleted.** A sound stays until someone
   removes it. Removing fills in `removed_by` and `removed_at` on its row in
   `placed_sounds`; no row is ever deleted.
5. **Each sound is a coloured light, by what makes it** (after Bernie
   Krause): blue for water and wind (geophony), green for animals
   (biophony), orange for people (anthrophony). A glow, a solid core and a
   thin column, untouched by fog and tone mapping, so where a place is
   lively can be seen from far off, before it can be heard.
6. **What you hear is worked out in your browser.** The nearest 12 sounds
   within 40 m, each looping from its spot (Web Audio, HRTF panning,
   inverse distance from 2.5 m), each starting at a random point so two of
   a kind aren't in step; through the café's walls a sound is quieter and
   duller; a gentle limiter on everything. The network changes the list of
   sounds; the list decides what plays.
7. **One sound switch.** Entering the place (a click) turns sound on,
   unless this browser turned it off last time; the header's switch turns
   it on and off. Leaving a sound turns it on too. A hidden tab is silent.
8. **Recordings from Wikimedia Commons, CC0 or public domain.**
   `scripts/fetch-sounds.mjs` downloads each (SHA-1 checked), cuts it into a
   mono loop with its last 2 s crossfaded into its start, brings it to
   -20 LUFS, and records author, licence and processing in
   `public/assets-manifest.json`. The asset rule becomes "CC0 or public
   domain" (Wen agreed): both can be used freely. YouTube wasn't used: its
   audio is mostly copyrighted and its terms forbid downloading.

## Consequences

- The place starts silent and gets its sound only from people.
- With six sounds (four of them people's), the beach, pier and creek have
  little to choose from; more sounds are to be added, one line each in
  `src/shared/sounds.ts` and `scripts/fetch-sounds.mjs`.
- A tug of war (one person removing what another leaves) is possible and
  visible. If it happens, a short hold after leaving is the obvious next
  step.
- The log tells the story without the screen: `sound_left` and
  `sound_removed` lines with who, which sound, where, and whose sound it was.

## How it is checked

- `spec/world.test.ts` ("sounds people leave"): every sound on offer is
  served as audio and recorded as CC0 or public domain from Commons;
  someone not joined, not standing anywhere, or naming no real sound is
  refused; a sound is left where you stand, someone watching at another
  time of day gets it within a second, the next snapshot has it; removing
  from 10 m is refused, from beside it works once and everyone is told;
  the same sound 1.4 m away is refused, five others share the spot, a
  seventh is `crowded`. Taking out the reach or the crowding check makes
  those tests fail. The spec works far out at sea and removes what it
  leaves.
- `e2e/leave-a-sound.mjs` (two Chrome sessions on the GPU): entering turns
  sound on; the palette has six sounds, those suiting the boardwalk first;
  Ada leaves café chatter; Bo, at dusk, gets its light within 1.5 s, is
  told who left what and where, and his page plays it; near it he sees its
  label; a reload keeps it; his switch stops it; beside it he removes it,
  and Ada's light, sound and notice follow.
- Not checked by a machine: whether it sounds good. That needs people
  listening, together.
