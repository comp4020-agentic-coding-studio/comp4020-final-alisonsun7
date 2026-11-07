# 023 — A world friends shape through sound

2026-11-07. Wen asked to learn the actual staged production methods in Little
Ritual, Tidegarden and Stillwater and improve this project autonomously. The
product is a place friends can make cozy, lively or something in between
through several suitable sounds. Different sounds should produce different
NPC behavior. This explicitly authorizes new suitable recordings and sound
reaction rules, superseding the earlier requirement to wait for a new sound
design before adding any. Individual sounds remain optional, previewable and
placed by a person; there is no automatically populated background bed.

## Learn the method and make a playable slice

- [Little Ritual](https://developers.openai.com/showcase/little-ritual): start
  with a playable core loop, then refine rounded painted characters, editable
  assets, encounters, controls and performance. Use one original visual
  language throughout the place. This replaces the old design-pack priority
  for restrained realistic adult proportions; preserve readable scale and
  physical grounding rather than copying the example's characters.
- [Tidegarden](https://developers.openai.com/showcase/tidegarden): inspect
  actual rendered geometry and lighting, improve vegetation and water as
  separate problems, and measure rendering cost. Keep a narrow visual target
  that can be achieved in the running scene.
- [Stillwater creator](https://www.reddit.com/r/TopologyAI/comments/1x3xr84/codex_blender_threejs_a_cozy_3d_world_that_runs/):
  authored small places and legible resident routines make a world inhabited.
  Codex/Blender involvement is the creator's report; the project source and
  complete production process are not independently available here.

These are process references, not asset sources. Their concept covers are not
evidence of our rendered result. Keep all existing routes, contributions,
weather/time, human controls and persistence while testing actual before/after
screenshots and the cooperative loop on an isolated scratch server.

## Sound shapes the residents, without inventing people

Public active contributions select reactions at authored resident homes.
Natural/gentle sources invite listening, musical/rhythmic sources invite
gathering and swaying, and short playful calls invite curiosity. Use explicit
sound profiles rather than a volume/loudness score. Sound off changes what the
browser hears, not what everyone has made. Private hut stay sounds, removed
sources, the automatic busker recording and uncommitted previews do not select
public reactions. Human visitors remain separate from NPCs and counts.

Select deterministically from shared contribution state and shared server time,
with stable tie-breaking and bounded authored activity areas. Do not let each
viewer choose NPC behavior from their own position or audio settings. People
can combine contrasting sounds in different corners; one world-wide cozy/loud
switch would erase that agency. A local descriptive summary reports the real
sources near the visitor; it never changes a shared setting on its own.

## Build and rollback

`before-living-sound-world-2026-11-07` preserves `2486e70`. Work is on
`codex/living-sound-world`, with `.cache/living-world-build/dist` and a scratch
database on port 18880. `.cache/living-world-baseline/dist` retains the previous
compiled application. Rollback uses the current DB, never an older snapshot.
The local preview is updated only after functional and rendered review. No
push or deployment is included.
