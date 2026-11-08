# ADR 031 — Discover sound by seeing a place answer

Date: 2026-11-08. Status: implemented and locally promoted; executed browser
and geometry scopes are in the [release index](../evidence/living-discovery-2026-11-08.json).
Artistic listening and unfamiliar-player acceptance remain unverified.

## Request and design judgement

The author asks to record the playable 2D and 2.5D comparison while retaining
3D, which they find more lively and suitable. They also report disconnected
road patches beside the tide pools, a resident whose day appears to consist
only of using or queuing for the restroom, and a discovery problem: players
may not realise that café residents respond to sounds. They suggest a few
existing world sounds whose consequences can be observed and compared,
including bird calls bringing birds and gull calls bringing gulls.

The 3D preference is the author's stated judgement. [ADR028](028-optional-paper-world-presentations.md)
and the [view-comparison record](../evidence/perspectives-2026-11-08.json)
establish implemented, technically exercised alternatives; they do not
establish a preference study with unfamiliar players. [ADR029](029-a-lived-in-3d-world.md)
retains 3D and its camera, occlusion and rendering costs. README and PROCESS
now explain this choice while retaining their author-review notices.

## Decision

Keep the existing world, identity, sound engine and lasting response graph.
Make a few everyday sound-to-world relationships immediately discoverable.
Examples invite a player's own contribution; they do not complete a shared
work, impersonate a friend or replace the first joint creation in ADR030.

### Grounded roads

Replace separately overlapping road pieces with one indexed spherical road
surface. A sampled route field joins branches into one surface, with a warm
centre and a sage shoulder. Subdivision across both axes keeps the road above
the sphere between its vertices. The tide-pool approach follows the bank
instead of crossing the pool and its sea channel; coastal clipping prevents
the road extending over open sea. The longitude seam retains matching heights.

This is a geometry and route repair, not a new road texture or a change to the
world's coordinate system. Existing sources, destinations, collision rules and
historical access keep their meanings. No old sounds are relocated to make a
cleaner picture. The cost is a bounded additional ground mesh and construction
work; connected coverage and branch depth must be checked on real geometry.

### A resident has the rest of a day

The existing restroom visitor spends at least five minutes on ordinary
activity between automatic visits. On the planet, that activity includes an
authored outdoor stroll with resting points, away from the door. Server time
samples the route, so late arrivals receive the same resident position.
Approach and return use waypoints rather than cutting through private rooms.

A busy room permits a brief wait, then the resident leaves and returns to
ordinary activity. A wait deadline is not a standing reservation. Actual entry,
occupancy, flushing and doorway clearance retain the authoritative admission
gate shared with players. The resident creates no user, permanent sound row
or human-presence count. This deliberately improves one existing routine,
rather than introducing a needs simulation or multiple permanent queues.

### Three honest world examples

Use three small discovery spots: café coffee, woodland bird calls and coastal
gulls. Their small positional variation comes from a stable room seed,
rather than a different random layout in each browser. Each signal has
`origin: "example"` and a reserved world-example identifier. It has no invented
author, contribution row, reply parent or work identity.

The examples operate only in the current 3D presentation. They are explicitly
labelled **World example · local demonstration**, have a nearby cause-and-effect
explanation and can be paused or shown locally. The setting is available in
Your listening and persists in this browser. The discovery card can be closed
and reopened. **Make it yours** opens an ordinary private audition/choice;
sharing still requires a separate explicit Leave action under the normal
server rules. It never publishes an example or automatically fills the world.

Nearby real public contributions take precedence: a matching bird/gull source,
or an appropriate café source within eight metres, replaces that example.
The discovery card then names the actual author and sound. Turning examples
off never removes, changes or silences a friend's contribution. Real in-range
sources also precede examples in the existing audio voice budget.

For resident attention, an eligible live public contribution within hearing
range takes precedence over every example, after the existing two-second
settling period. Only when no real responsive source is eligible can an
example lead that resident. Distance/preference bands and canonical time/ID
ties still choose among real sources. This is broader than the eight-metre
matching rule that hides a discovery prop; a nearby demonstration cannot take
attention away from a friend's eligible sound of another type.

Coffee reuses the existing source-driven steam and resident responses. Bird
and gull calls bring visibly different small volumetric visitors: sage birds
and white, long-winged gulls. The same mapping applies to actual player sources.
Each active source supports two visitors, with a global cap of twelve and
canonical ordering that favours actual contributions. Private and withdrawn
sources produce none; server-time motion agrees across arrivals, with a still
reduced-motion pose. These visitors are an environmental effect, never players
or a substitute for a live cross-author response.

## Explicit exception to the earlier sound rule

This request supersedes ADR011 and ADR023's prohibition on an automatically
populated background bed **only for these three labelled, optional, spatial
world examples**. It does not authorise an unlabelled ambient soundtrack,
invented player history, random database seeding or sounds that bypass local
consent. A fresh page remains silent until an explicit local listening action.
Global Sound off, volume, page visibility and cancellation still apply.

Examples use existing licensed recordings and their documented event/texture
playback roles. They join the bounded spatial mix at a lower level, not a new
unlimited loop bus. Clearing examples must invalidate pending loads, including
a quick off/on cycle. Identical shared refreshes must not continually cancel
an otherwise valid load. No other person's action may unmute this browser.

## Alternatives and costs

- Randomly inserting ordinary contribution rows would make demonstrations
  indistinguishable from authored history and consume real room capacity.
  Keep examples outside that state instead.
- A global background track would provide atmosphere but conceal spatial
  causality. A few local, switchable examples permit an observable comparison.
- Simulating needs for every resident would expand peripheral engineering.
  A bounded existing routine addresses the reported repetition directly.
- A new art engine or parallel flat-view expansion would defer the current
  3D discovery problem. Retain the working alternatives without expanding them.

Local example settings mean two people may deliberately see or hear different
demonstration props. Real sounds, authors, replies and shared works retain the
same authoritative state. Do not describe a local example comparison as a
shared-world mutation or successful human collaboration.

## Validation boundary and reversibility

Source checks target continuous branch/seam coverage, no road over the pool
channel, bounded geometry, ordinary resident time and busy-room departure,
real-source priority, no example authorship, quiet preference, pending-load
cancellation, dismissible guidance and source-derived wildlife cleanup.
Wildlife's five pure checks and TypeScript compilation passed during its
implementation; this establishes neither visual charm nor sound quality.

Developer acceptance requires actual desktop and phone browser paths, comparison
before/after locally pausing examples, a real source replacing a demonstration,
withdrawal, quiet-browser protection, and preservation of current history.
Screenshots must show rendered geometry, not concept art. The final browser
outcomes and exact build are recorded in the
[current discovery index](../evidence/living-discovery-2026-11-08.json); earlier
answer-release checks are not evidence for this iteration. Report each actual
build and run scope separately. No artistic listening, unfamiliar-player
understanding, physical-phone performance, next-day return or public release
has been verified by this decision record.

## Observed implementation outcomes

The 26-check independent-browser discovery path passed: locally pausing
examples, explicit private listening without unmuting, real coffee/bird/gull
sources in both browsers, withdrawal and actual SQLite tombstones. The
31-check room/chat regression and 43-check three-place creation regression
also passed on isolated data. These are different scopes, not an accumulated
quality score. The source/HTTP run passed 311 checks before the final
conservatory-arrival adjustment; a separate actual-view check verifies that
adjustment at 1920×1080 and 390×844. See the index for exact boundaries.

The first phone run caught a real one-frame chat obstruction. CSS now clears
the guide synchronously with chat opening. A hidden guide also stops touching
another dialog's preview after a friend's update. Two later script failures
were incorrect desktop/tombstone assumptions; checks now use the actual
desktop control and read-only scratch SQLite. The old creation script's
350 ms movement assumption was replaced by bounded observation while the
real key remains held, without changing movement speed or injecting position.

Visual review caught a conservatory beam obscuring the body even though
source-state checks passed. An initial arrival correction faced the sea;
the final visit approaches from inland, preserving all historical sources.
The rejected captures remain evidence. This does not establish a polished
camera from every possible indoor position.

Local promotion preserves every row in all twelve durable tables, including
42 sound rows; 59 served module/style assets match the reviewed build. A new
unjoined read-only browser sees 19 current public planet sounds with zero
writes or page errors. The former app `5f1fc28` is retained with the current
database for application-only rollback. No public release occurred.

Branch: `codex/living-sound-discovery`. Before-code tag:
`before-living-sound-discovery-2026-11-08`. No schema migration, database seed,
main push or external deployment is required. Local application rollback uses
`python3 scripts/local-preview.py --rollback` with the current database;
never restore an old database to reverse visual changes.
