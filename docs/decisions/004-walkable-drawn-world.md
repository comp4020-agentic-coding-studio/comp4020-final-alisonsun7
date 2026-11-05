# ADR 004: One walkable, drawn world instead of separate photos

## Status

Accepted, 2026-11-05. Changes ADR 003's view of a place (and the "scenes are
evidence, not invention" rule in `CLAUDE.md`). ADR 003's server contract
(sessions, the server clock, owner checks, ops, memories) is unchanged.

## Context

Wen looked at the photo version and asked for two things:

1. **One place, not scattered pictures.** Each view was one of Wen's photos,
   and moving between them swapped the picture. The rule that the photos
   mustn't imply a floor plan meant they could never join up into a place
   you move through. Wen wants to enter in first person and walk.
2. **Morning that looks like morning.** Every photo was taken at night. Early
   Morning was a brightness and sepia grade over a night photo: the sky stayed
   black, the lamp stayed on, the windows glowed. Grading can't remove those,
   so it read as an over-exposed night.

Wen agreed (2026-11-05) to drop the photos as the picture, to add one
library, and that the people in one hour should all share one place. Wen
drew the ground floor's layout: door bottom left, a corridor up the left, two
tables, three lifts facing them, bins at the end of the lift wall, the tea
point facing the bins, the stair top right, and a hall.

## Decisions

### 1. The world is drawn from the photos; the page says it isn't surveyed

`campus` is one scene with `view: "world"`: the Chifley bridge, the library
front, Marie Reay's door and its ground floor, built from simple flat-shaded
shapes in three.js (`src/client/world-build.ts`). The layout follows Wen's
sketch; the things in it follow the photos (timber wall with three steel
lifts, the orange stair, cushioned tiers, the dark cabinet with four
microwaves and the sink to their left). The two relations Wen stated are
kept: Marie Reay's door is on your right as you face the library, and the tea
point faces the bins.

The rule becomes **drawn from Wen's photos, not surveyed**. Every scene page
says the layout and sizes are estimates. Each part of the world shows Wen's
real photo of it as a postcard, so the evidence is still on the page. The
hall is drawn closed: no photo shows inside it.

### 2. Zones play the part of shots; the server contract doesn't change

The world's `shots` are zones (bridge, entrance, lobby, tea point, stair).
Each spot keeps an `id`, its allowed sounds, and an `x`/`y`, now its point on
the map (0..1), plus `at` and `foot` in metres for drawing and for sound.
Placements still store `shotId` and `anchorId`, `checkPlace` still validates
them, and the database is unchanged. The zone you're standing in is the
`shot` in the URL.

### 3. One live place per hour, holding 24 sounds

A place is still a scene in one mode, so everyone in Early Morning shares one
session, from the bridge to the stair. A whole world holds `maxSounds: 24`
(4 per person, as before); the photo scenes keep 12.

### 4. Light, not grading, sets the hour (`src/client/sky.ts`)

| | Early Morning | Busy Weekday | Rainy Dusk |
| --- | --- | --- | --- |
| Sky | pale blue over peach; the brightest thing in view | clear blue | dark blue-grey |
| Sun | low in the north-east, warm; long shadows | high and white; short shadows | none |
| Lamps, windows | off | off | on |
| Air | light mist | clear | rain, wet paving that shines |

Early Morning opens with a four-second sunrise from the light before dawn
(skipped when reduced motion is set).

### 5. Sound is heard from where it is

In the world each sound is a `PannerNode` at its spot, and the listener is
the camera: closer is louder, turning swaps ears. A sound indoors heard from
outside (or the reverse) is quieter and muffled, and the background changes
from birds, crowd or rain to room tone when you step inside.

### 6. Controls

Drag to look; W A S D or the arrows to walk; click or tap the floor to walk
there; a thumb stick on touch screens; "Go to" buttons for each zone, which
work from the keyboard. Spots and sound markers are real buttons laid over
the canvas at their projected positions, hidden when behind you, too far, or
behind a wall, so they can be tabbed to and read by a screen reader.

### 7. The photo scenes stay, unlisted

`marie-reay-ground`, `chifley-path` and `lab-cafe` are `retired`: not listed
on Places, but their pages and memories still work, so every memory saved
before this change still replays.

## Consequences

- three.js is the browser's one library. It's a runtime dependency served
  from `node_modules` at `/vendor/three.module.min.js`, and pages map the bare
  `three` import to it with an import map.
- The world is a drawing. Someone who knows Marie Reay may find distances
  wrong; the page says they're estimates.
- A slow device renders fewer frames but walks at the same speed: long frames
  are split into short steps, so nobody passes through a wall.
- LAB ANU isn't in the world yet (still no licensed photos).

## How it is checked

- `spec/world.test.ts`: only the world is listed and the old scenes still
  answer; every spot has a position and a map point in 0..1; the page says
  "not a survey", shows the postcard and maps `three`; the server accepts a
  world spot, refuses a sound at the wrong one, and holds more than 12.
- `spec/pages.test.ts` follows bare imports through the page's import map,
  so a module the map doesn't name fails.
- `e2e/world-two-browsers.mjs`: Go to, choosing a sound, clicking a glowing
  spot, the other browser seeing the marker (about 300 ms), and W walking
  from the corridor into the lobby.
- `e2e/look-world.mjs`: screenshots of every mode and zone, for a person to
  look at.
