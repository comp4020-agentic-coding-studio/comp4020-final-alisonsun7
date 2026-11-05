# ADR 012: Only the sunny day

## Status

Accepted, 2026-11-05. Narrows ADR 007's "one place at every time of day":
the place keeps one time of day, Sunny Day. Early morning and rainy dusk
are retired.

## Context

Trying the place with sounds and a busier café, Wen asked to keep only the
Sunny Day mode.

The one room everyone shares (ADR 007) was made under the first mode,
`morning`, and that is its name in the `sessions` table. The sounds people
have left (ADR 011) and everyone's participant id hang off that row. Making
Sunny Day the first mode would have opened a new, empty room.

## Decisions

1. **The place has one mode, `weekday` ("Sunny Day").** The time-of-day
   switch isn't shown when there's only one.
2. **The room keeps its name.** `Scene.room` ("morning") is what
   `placeMode` returns, so the same room, people and sounds carry on.
3. **Old links still work.** A scene page for a retired mode
   (`Scene.retiredModes`) answers 301 to the same address with
   `mode=weekday`; the live stream accepts a retired mode as the sunny day,
   so a page left open from before reconnects. An unknown mode is still a
   404.
4. **The retired modes' place settings go** (their sun, mist, skies and
   café regulars in `seasideKit`). The world view's general support for
   other times of day (sunrise, rain, umbrellas) stays, unused. The dawn and
   dusk skies stay in `public/assets/` and the manifest.

## How it is checked

- `spec/world.test.ts`: the place has only `weekday`; its page has no mode
  switch; each retired mode's page is a 301 to `mode=weekday`, keeping the
  zone, and its stream is the same room as the sunny day's.
- `e2e/meet-and-talk.mjs`: Bo comes in by an old rainy-dusk link and still
  meets Ada.
