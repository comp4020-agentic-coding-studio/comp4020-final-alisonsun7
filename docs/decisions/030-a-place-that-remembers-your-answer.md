# 030 — A place that remembers your answer

Date: 2026-11-08. Status: locally validated and promoted; human play/listening,
author review and public release remain separate open gates.

## Decision

Retain the playable 3D world, identity, room history, audio engine and reply
projection. Concentrate this iteration on making one joint creation legible:
choose an ingredient, understand its possible consequence, answer an actual
friend, recognise the two contributions, and return to their persistent work.
Do not expand the number of destinations or introduce another engine.

The course's HD descriptors reward a defensible idea carried through the
application and development evidence. More features and more assertions are
not substitutes for unfamiliar people understanding that idea. This is a
quality hypothesis, not a grade prediction or a recorded user-study result.

## Experience and failure observed before implementation

On an isolated backup of the current preview database, an actual browser visit
answered nick's Warm chords, privately previewed Soft pulse, then chose Leave.
The service rejected the contribution as `too_close`. The recommendation had
not considered historical sound density. This is a completion failure, not a
problem that a brighter sculpture can fix. The original preview was untouched.

## Changes and constraints

- Predict consequences from all live sources in the selected work. A new
  rhythm does not promise a beat flower if a water/bird canopy already wins
  the canonical variant rule.
- Share one stable author colour and shape between the record and source
  leaf. Live, cross-author parent/child relations produce directed light
  movement; identical-cookie tabs and NPCs do not. Withdrawn endpoints remain
  recorded but cease shaping the live object.
- Provide a public work link. Joining keeps that link; it grants no identity,
  sound preference or write permission. A returning visitor can inspect and
  visit the existing work. Merely opening a link never publishes or unmutes.
- Keep private preview available when a location is blocked. A player may
  explicitly request a nearby safe spot, cancel the walk, and then explicitly
  choose Leave. The planner uses great-circle distances and the real collision
  predicate. It never rewrites old coordinates or bypasses server limits.
  Some full corners have no feasible spot: explain this and offer another
  place or an explicit withdrawal. There is no infinite-space promise.
- A reply stays within the existing 4 m interaction range in the client.
  The service still checks real identity, parent existence, operation keys and
  public room limits; the new planner does not claim server enforcement of
  that additional contextual distance guard.

## Alternatives and tradeoffs

A 2D replacement could simplify composition but would spend this iteration on
parity rather than the observed failure. Cinematic assets would not establish
authorship or make an impossible placement possible. A separate saved-work
database would duplicate reliable contribution history. These alternatives
are deferred. Six visible leaves prioritise different authors and the latest
real answer; the record retains every source.

## Validation boundary

See `docs/evidence/answers-2026-11-08.json` for actual candidate checks, failures
and screenshots. Final application `5f1fc28` passes the independent-browser
answer path and historical populated-corner path. The source suite passes
277 checks/44 files; the separate three-area and process-restart runs retain
their earlier exact build scopes. Browser automation is developer verification.
Pleasantness, unprompted two-pair play and genuine next-day return remain
separate human judgements until they actually occur. No production deployment
or personal research position is implied by this local candidate.

## Reversibility

Branch: `codex/chorus-answers`. Before-code tag:
`before-chorus-answers-2026-11-08` at `2c0a9cc`.
Use `python3 scripts/local-preview.py --rollback` after local promotion to
switch the compiled application while retaining the current database.
Never restore an old database merely to roll back the appearance.
