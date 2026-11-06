# ADR 019: Quiet Light, with an explicit way back

Accepted, 2026-11-07. Wen selected D from the four art directions and asked
that the previous version remain recoverable. This develops ADRs 017/018.

## One coherent place

Quiet Light uses layered pine silhouettes, timber-and-glass buildings, olive
awnings, a restrained blue-green sea and warm light against cool shade. Original
three-dimensional cat and dog figures replace the world's flat animal sprites;
arrival illustrations remain compact identity choices. Reading surfaces use
warm ivory, mineral blue, sage and walnut. Sound cues become smaller lights and
grounded rings, with existing labels and reachable actions retained.

Use original code geometry and procedural drawings alongside the already
recorded CC0 assets. The AI-generated D image is a reference, never a runtime
asset or an implemented screenshot. Keep real-time performance, movement and
readable sources across all four weathers, time of day and phone layouts as
acceptance criteria, rather than promising pixel identity with the concept.

## Scope and invariants

This is a visual change. Preserve terrain coordinates and collision boundaries,
private-hut admission and doors, sound choices/playback/placement/replies,
persistence, nearby talk, shared environment revisions and the single room.
No automatic ambience, dependency upgrade or database migration is needed.
Reduced motion and adaptive quality remain available.

## Reversibility

The annotated tag `before-quiet-light-2026-11-07` records the exact previous
application commit, `0becc46dd87348fd7226783a09eea7621b966ec1`. Development
uses `feat/quiet-light-art`, leaving the old branch intact. Each verified step
is committed separately. The old compiled bundle and a consistent SQLite backup
are held in ignored local cache, while candidate builds use a separate output
root and scratch database. The running review is replaced only after checks.

A visual rollback restores application code, not an earlier database: later
contributions must survive. [The rollback guide](../quiet-light-rollback.md)
records clean-checkout recovery without discarding this branch's history.
Results, corrections and unverified limitations belong in the evidence log.
