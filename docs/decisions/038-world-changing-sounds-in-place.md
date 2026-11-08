# ADR 038 — Sounds that change the world are in place from the start

Date: 2026-11-09. Status: implemented on local `main`, not pushed or deployed.

## Request

Wen (2026-11-09): some sounds should already be in place on the map by
default, such as the guitar, the whale and the seagulls, and the sounds
recommended first should be the ones that change the world around you.

## Decision

Build on ADR 031's world examples rather than writing rows to the database.

- **Seven examples, not three.** Coffee, birds and gulls stay where they
  were. Four join them: whale song by the coast east of the tide pools, pond
  frogs at the far side of the pool, a boat's horn on the western shore and
  a guitar at the Pocket Jam stage. Each one has a visible effect: a whale
  that breathes and leaps, frogs on the lily pads, a passing ferry, and
  neighbours swaying. The frogs sit further from the pool's arrival point
  than the gulls do, so the card a visitor sees on arrival stays the same.
- **The examples now cause their effects.** The water life and the ferries
  take examples through a separate `setExamples` channel. `setSources` still
  rejects anything with an `origin`, so its existing checks are unchanged.
  Examples come after every real source in each budget, so two real whales
  push the example whale out. Pausing examples clears them without marking
  them withdrawn. Where something has to show an author, they are named
  "World example" (`@world`), never a person. This replaces ADR 035's
  statement that examples cannot cause water-life effects.
- **They are still examples.** The labels, the local Pause/Show setting, the
  silence until the visitor turns sound on, and the rule that a real nearby
  source takes an example's place (now also a real whale, frogs, horn, or
  music at the stage) all carry over from ADR 031. Nothing is published,
  and no example has a row, an author, a reply or a work.
- **Watch works on a showing example.** The discovery card offers Watch the
  whale, the frogs or the boat for an example as well as for a real source.
  It moves only the viewer's camera.
- **Recommendations lead with sounds that change the world.** The Share
  chooser orders its three choices with world-changing sounds first. When
  fewer than three of them fit, it fills in from the nearest places'
  world-changing sounds. A sound the visitor asked for stays first, and
  replies keep their compatible parts. The full library lists world-changing
  sounds first, then the ones that suit the current place. Both mark them
  **Changes the world**.

## Costs and limits

Two visitors with different example settings still see different
demonstration animals (as in ADR 031). The examples use effect budgets that
real sources could otherwise use, but always behind them. Only the planet
edition has examples; the original coastal edition is unchanged.

## Evidence

The full spec passes: 61 files / 427 tests against a fresh scratch server.
The new `spec/world-examples-in-place.test.ts` and the new Watch cases in
`spec/sound-discovery.test.ts` were seen to fail without the source changes.
Both browser paths pass on fresh scratch databases: `e2e/living-discovery.mjs`
(26 checks) and `e2e/waters-answer.mjs` (29 checks).

Each of those browser paths first failed once against the new examples:

- The pool's arrival card showed the frogs instead of the gulls, so the frogs
  were moved further away.
- After a reload, the example animals appeared in the water. The reload
  check still requires every withdrawn source to stay gone, and now also
  requires anything remaining to be a labelled `@world:` example.

The screenshots show the gulls and frogs at the pool, the guitar card at the
stage, the whale card with Watch the whale, an actual whale leaping, and the
Changes the world badges on desktop and phone. The example ferry reports as
visible and sailing, but no screenshot of it was taken. No one has listened
to the result, and it has not been tried on a real phone.
