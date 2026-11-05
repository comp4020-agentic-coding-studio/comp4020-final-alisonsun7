# ADR 006: One place from the forest to the sea

## Status

Accepted, 2026-11-05. Builds on ADR 005 (imagined places, CC0 assets). The
café becomes a building in this place; the café on its own street is
retired.

## Context

Wen described the place they want: you appear in a forest, follow a trail
through the trees, and at its end reach buildings by the sea, the café
among them, on a beach.

## Decisions

### 1. One continuous place, about 100 m wide and 220 m long

`seaside` (`client/seaside.ts`), from north to south: a trail through a pine
forest (start), a creek with a footbridge, the forest's edge thinning into
sand, a timber boardwalk with the café, a kiosk and five beach huts, lamps
and benches, then the sand, the water and a pier. Nine zones and 24 spots;
it holds 32 sounds. Everyone in one hour (mode) shares it, as before.

### 2. Trees drawn, everything else CC0

Poly Haven's scanned trees are 20 MB to 950 MB each, so pines are simple
cones over trunks in Poly Haven's pine bark: about 500 of them as three
instanced meshes, seeded so every visitor gets the same forest, kept off
the trail, the creek and the clearing. Ferns, grass, shrubs, rocks,
boulders, a fallen trunk, stumps, lanterns, crates and lifebuoys are Poly
Haven models, drawn instanced (one draw per part of a model, however many
are placed). Ground, trail, sand, wet sand, boardwalk and painted boards are
Poly Haven surfaces.

### 3. The café is a room you can put anywhere

`buildCafeRoom` builds the room into its own `Builder`; a place moves its
root and shifts its walkable and solid rectangles. `furnishCafe` loads the
furniture into that root. The café's own street (`cafeKit`) still uses it,
so its memories replay.

### 4. Water

The sea and the creek are standard materials (so they reflect the sky) with
waves added in the vertex shader; foam on the sand washes in and out. Their
reflections are turned down, or a bright dawn sky turns them white.

### 5. Sounds and backgrounds for the place

Five new synthesised sounds: waves, seagulls, rustling leaves, woodpecker,
creek. Two new backgrounds: forest and sea. The background follows where
you stand (`PlaceKit.ambienceAt`): forest under the trees, sea on the shore,
the café inside it, rain everywhere outdoors at dusk.

### 6. What the engine learned

- Round colliders (`circles`), for trunks.
- A place can change a mode's light (`PlaceKit.light`): the seaside keeps
  its morning mist but further off, or it hid the sea.
- The sun's shadow area follows you (in 8 m steps), since the place is
  bigger than one shadow map.
- `animate` each frame, for the water.

## Consequences

- Assets are now about 88 MB in the repo; a first visit to this place
  downloads its share (roughly 45 MB, then cached for a week).
- The pines are stylised next to photoreal ferns and furniture. A lighter
  CC0 tree pack (e.g. Quaternius, downloaded by hand) could replace them.

## How it is checked

- `spec/world.test.ts`: Go to puts you in the zone it names, for every zone
  (the seaside's nine included); spots inside the place's bounds; a spot is
  accepted, a wrong one refused, more than 12 sounds held.
- `e2e/world-two-browsers.mjs`: the café counter, the other browser seeing
  the sound, walking in the café, and W walking from the forest's edge out
  onto the boardwalk.
