# ADR 009: Footsteps belong to walking, not to a place

## Status

Accepted, 2026-11-05, for living places.

## Context

Wen: choosing footsteps should mean you hear your own steps as you walk,
and other people's when they pass you, theirs quieter than yours. A
footsteps sound looping at a fixed place (someone forever walking there)
was one of the problems ADR 008 described.

## Decisions

1. **Footsteps are a switch each person sets for themselves** ("Footsteps
   on/off" beside the sound switch, and the same switch in the sound map),
   remembered in that browser. Turning them on turns sound on. They aren't
   shared state and aren't sent to the server: other people's steps come
   from the positions everyone already receives (ADR 007).
2. **A step every 0.72 m walked.** Yours: close and centred, alternating a
   little left and right, at 0.55. Theirs: positioned where they are, at
   0.3 before distance (inverse, reference 1.5 m, roll-off 1.4), not played
   beyond 20 m, so yours are always loudest. A jump (Go to, the kangaroo's
   ride) makes no steps.
3. **The ground decides the sound** (`PlaceKit.groundAt`): leaves in the
   forest, gravel on the trail, hollow timber on the footbridge, boardwalk
   and pier, soft sand on the beach, a wooden floor in the café; outdoors at
   rainy dusk, a splash on top. All synthesised.
4. **Footsteps and steps in puddles are no longer a place's sound** in the
   seaside. Sounds already placed stay until someone switches or turns them
   off.

## How it is checked

`e2e/meet-and-talk.mjs`: Ada turns footsteps on and hears her own steps
walking; Bo walks past and she hears his, at a lower level than hers; Bo,
with footsteps off, hears none. (The page records counts and levels for
the check; nobody listened by ear.)
