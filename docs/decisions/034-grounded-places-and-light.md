# ADR 034 — Grounded places and light

Date: 2026-11-08. Status: accepted repair direction; candidate implementation,
fresh visual acceptance and promotion remain pending at this checkpoint.

## Request and measured starting point

The author reports floating objects and weak lighting. The starting preview is
application `40ed231`, recorded in `.cache/grounding/starting-preview.json`.
Its café screenshots show a thin terrace with an unsupported-looking underside,
weak shoe/table contact and long shadows without a clear anchor. Several coast
tree bases are also difficult to read. These are developer visual observations,
not measurements of every object or a human playtest verdict.

The pre-repair audit in `.cache/support-review/baseline.json` uses actual
compiled scene geometry, with only sign-canvas rasterisation stubbed. It does
not use a GPU or database. Its bounded samples identify physical causes:

- Listening Green's eight sampled bench-leg bases sit 25.9–29.1 cm above the
  terrain. Its two sampled lamp bases have 51.4–54.6 cm gaps. Objects away
  from a parent tangent origin did not acquire their own support.
- Nine sampled café outer-deck underside points reach a 1.357 m globe gap.
  A broad tangent deck needs a real foundation; darkening the ground cannot
  supply missing support geometry.
- Sampled terrace characters use radial up while the terrace has a plane
  normal, differing by up to 13.28 degrees. Sole vertices then straddle or
  separate from the floor. Actor-origin height alone cannot prove contact.

The old 2048 shadow map spans 70 m, approximately 3.42 cm per texel. Bias
-0.0006 across its 1–150 m depth range represents 8.94 cm of depth offset,
with a separate 3.5 cm normal bias. These are parameter scales, not a measured
screen-space gap or offsets that always add along one direction. They are
too coarse to make small soles a reliable contact cue.

## Correct support before adding contact cues

Keep the walkable 3D planet and its procedural paper-like art. Correct relevant
supports against actual terrain or authored floors, including the normal used
by standing people. Give the raised café terrace a visible foundation reaching
the curved ground. Retain usable doors, steps and paths; decorative foundations
must not silently introduce walls across existing access routes.

Evaluate real feet/support geometry, not just group origins. Preserve animated
steps and genuine jumping rather than pinning every moving foot to the floor.
Only then add subtle procedural contact cues that follow the actual receiver
and yield to airborne poses. They cannot conceal a suspended bench, substitute
for a table leg or become dark stickers hovering above a curved globe.

## Focus detail without changing the shared sun

Keep the existing renderer and one global, shared-time key-light direction.
Move shadow focus and light target together around nearby play, reserving
finer texels for the activity. Expand coverage deliberately for world overview,
update its live projection and stabilise the light-space grid against shimmer.
Friends at different longitudes must not receive contradictory sun directions
because a light follows their positions.

Reduce bias against actual acne, contact and coverage checks. Surface-oriented
local sky fill may improve far-side character readability while retaining
shared time/weather. Neither fill nor contact cues replace cast shadows or
require another engine, post-processing composer or dependency.

## Preservation and provenance

No database/schema migration or coordinate reinterpretation is part of this
repair. Preserve human/NPC identities, routes, sources, replies, tombstones,
original planet/coast history, private-room admission and the current database.
Support presentation must not relocate stored contributions or turn a local
preference into shared state. Roll back application code with current data,
never an old database.

New support, contact and lighting modules are original procedural project code,
not third-party models, textures or media. They add no sound or automatic
listening. Retain mute, reduced motion and the existing bounded render budget.

## Evidence required before completion

1. Archive real pre-repair measurements/commands; compare actual leg, lamp,
   deck and shoe/support geometry after repair. Distinguish source negatives,
   candidate passes and harness failures.
2. Inspect a freshly rebuilt coherent candidate at normal café, Green and
   coast cameras, at 1920×1080 and 390×844. Walk, stand, run/jump and enter
   furnished/private rooms; inspect soles, foundations, tree/table bases and
   shadow contact in actual rendered frames.
3. Check shared sun direction, close/overview coverage, seams, night/weather
   and shadow stability during movement. Numerical bounds cannot establish
   convincing light by themselves.
4. Check source/history and local-listening preservation on isolated test
   data. After acceptance, switch the preview with current data and inspect
   the actual served package again.

Old screenshots establish the starting complaint only. An implementation file
or passing source assertions cannot establish the repaired visual result. Raw
evidence archival, final build/check counts, fresh screenshots, visual judgement,
data-preserving promotion and promoted inspection remain pending here.
