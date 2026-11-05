# ADR 010: Sound taken out, pending a new design

## Status

Accepted, 2026-11-05. Withdraws the sound parts of ADRs 003, 007, 008 and
009. Everything else they decided (one place at every time of day, seeing
each other, talk, the arrival card) stands.

## Context

After several rounds of sound bugs, and a fix of the idea itself (ADR 008),
Wen asked to delete everything to do with sound so that sound can be
designed again from a clean start, to a design Wen will give.

## Decisions

Removed:

- the audio engine and every synthesised sound, backgrounds and footsteps
  (`client/audio.ts`, `client/synth.ts`);
- spots, their labels and cards, the glowing rings, the sound map (tray),
  the sound switch and "Enter with sound", the background switch;
- the server's sound operations (`/api/sessions/:id/ops`, `/events`, the
  session snapshot route), sealing, 3-minute memories, the archive and
  replay pages (`/archive`, `/memory/:id`, `/api/memories`), and the
  restart recovery of clocks;
- the scenes that existed only for sound: the ANU photo scenes, the drawn
  campus, and the café on its own street (`client/stage.ts`,
  `client/memory.ts`, `shared/state.ts`, `memories.ts`, `cafeKit`,
  `campusKit`);
- their checks (`spec/live.test.ts`, `spec/lifecycle.test.ts`,
  `e2e/two-browsers.mjs`, `e2e/look.mjs`) and the sound parts of the others.

Kept: the seaside world and walking, its zones and Go to, the times of day,
seeing other people, talk, the kangaroo, the arrival card (now just a name,
a cat or a dog, and Enter), joining, and the not-affiliated notice.

**No data is deleted.** The database keeps its sound tables and rows
(placements, events, memories); the app no longer reads them. Wen's
processed photos stay in `public/scenes/`, unused. The code as it was is
tagged `before-sound-removal`.

## Consequences

- The place is silent until the new design is built.
- `PlaceKit` lost `ambienceAt` and `groundAt`; a new sound design can add
  what it needs to it.
- The room a place shares is still a `sessions` row, so a person keeps the
  same participant id across visits.

## How it is checked

- `spec/world.test.ts` ("sound is gone"): the place's page has no sound
  controls; the snapshot has no placements; the ops, events, session,
  archive and memory routes and the audio scripts are 404.
- `e2e/meet-and-talk.mjs`: nothing about sound is offered.
