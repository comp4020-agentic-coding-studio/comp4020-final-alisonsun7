# Building a world friends shape through sound

This walkthrough records the production approach behind ADR [023](decisions/023-a-world-shaped-through-sound.md).
The goal is a coherent, inhabited coast where friends compose different atmospheres through sounds; cozy and lively corners can coexist.
There is no global mood switch or automatic sound bed.
The briefs below are condensed, reproducible implementation briefs, not quotations from showcase prompts.

## 1. Learn the process, then protect the playable loop

[Little Ritual](https://developers.openai.com/showcase/little-ritual) informed the sequence:
make the central interaction playable, then refine characters, encounters, controls and performance together.
[Tidegarden](https://developers.openai.com/showcase/tidegarden) informed incremental work on actual vegetation,
water, materials and lighting, with rendered inspection rather than relying on a concept cover.
The [Stillwater creator's account](https://www.reddit.com/r/TopologyAI/comments/1x3xr84/codex_blender_threejs_a_cozy_3d_world_that_runs/)
suggested bounded places and legible resident routines. Its Codex/Blender involvement is creator self-report;
we did not independently inspect its source or complete production history.

These examples are process references, not asset sources; no characters, models or textures were copied from them.
Our scene remains procedural Three.js geometry with existing licensed assets, not a Blender production.

Brief: “Preserve walking, meeting, listening, leaving, replying and removing. Keep one shared place and its
lasting contributions. Make the consequences of a friend's sound visible before adding more scenery.”

The existing [shared contribution drawer](../src/client/shared-sound-place.ts),
[sound playback](../src/client/soundscape.ts) and [reply connections](../src/client/sound-connections.ts)
remain the core loop. A sound is placed by an explicit human action; browsing never creates a contribution.

## 2. Establish one visual language

Brief: “Build original rounded cat and dog inhabitants in cream, sage, honey and terracotta. Give them
readable faces, broad cheeks, mitten paws and matte garments. Keep physical scale, grounded feet and every pose.”

[Characters](../src/client/characters.ts) use continuous skinned garments and real volumetric heads.
Shorter legs and broader heads replace the earlier restrained adult proportions. Seeded coordinated outfits
provide variety without unrelated colours. Photographic fur and instrument maps were removed from the cast.
Visitors, children and NPCs share this construction; visitor labels follow the actual head rig.

[Coastal geometry](../src/client/seaside.ts), [pine crowns](../src/client/d-pines.ts) and
[café surfaces](../src/client/cafe.ts) use compatible forms and colours. Existing licensed grain is restrained
within painted surfaces rather than allowed to dictate the palette. This is a painted storybook coast,
not a claim of photorealism or a pixel-identical reproduction of another project.

The original generated [café mural](assets/sound-world-mural.md) adds authored surface art.
Its prompt, provenance and use are recorded separately. It sits on a lit 3D wall and never replaces walkable geometry.

## 3. Let real contributions drive authored residents

Brief: “Four authored NPC neighbours react to public sounds near their homes and are identified as NPCs in the response drawer.
Choose from shared sources and server time. Give each sound a deliberate response; never infer a world-wide
mood from volume, the listener's position, or whether their browser has audio enabled.”

[Sound profiles and selection](../src/shared/sound-response.ts) define six behaviours:
listening, watching, swaying, joining in, playing and waving. Four responsive residents occupy the coast,
promenade, beach and trail. Other existing roles, including the guitarist and children's game, retain their purpose.
[Resident animation](../src/client/sound-residents.ts) combines grounded poses, small gestures and bounded approaches.
Movement checks real solids and private areas; residents do not pathfind through furniture toward arbitrary sounds.

Public sources settle for two seconds, qualify within 18 metres of a resident's home, and use deterministic
distance bands, preferences and stable ties. Animation phase comes from shared server time, so a late visitor
can see the same selected source and phase. Reduced motion preserves a readable static response.
Sound off changes hearing, while public visual responses remain. Private hut stays, removed sounds,
library previews and the automatic busker recording do not select these reactions. NPCs never inflate human counts.

The interface describes the actual nearby mix and its ingredients. Friends can make one corner quiet and
another rhythmic; these descriptions do not apply a hidden shared setting or overwrite anyone's contributions.

## 4. Add ingredients with provenance and technical checks

The [catalog](../src/shared/sounds.ts) now contains 18 recordings. Optional rainstick and hand-clap ingredients
extend the previous 16, whose audio bytes and provenance records were retained.
The [importer](../scripts/fetch-sounds.mjs) checks Commons licensing and original SHA-1 before encoding.
Only the rainstick receives `highpass=f=35` to remove a measured source DC offset.
Both new loops use the existing two-second crossfade, mono 44.1 kHz MP3 and peak-constrained normalization.

Independent decoded measurements were -20.58 LUFS / -2.03 dBTP for rainstick and -24.04 LUFS / -2.16 dBTP
for hand-claps. Gentle compression experiments did not improve the clap crest factor and were discarded.
Its quieter result is recorded honestly alongside the -20 LUFS target; the target is not an achieved-value claim.
Finite samples, DC and peaks were checked. Technical verification does not replace listening and choosing by ear.

## 5. Inspect renders and iterate on specific failures

Brief: “Render the real modules in a silent isolated fixture. Compare front, three-quarter, seated and moving
characters; inspect day, night and wet surfaces. Diagnose silhouette, material colour and lighting separately.”

Use actual gallery and scene screenshots to judge the result. Keep dry material colours distinct from weather and time adjustments, inspect shadows and grounding,
and measure rendering cost before adding geometry. The character pass caught a reduced sitting-height change;
leg proportions were corrected while retaining the existing grounded-pose requirement.

## 6. Verify the shared experience before promotion

[Character tests](../spec/characters.test.ts) cover shape, matte materials, skinning, LOD, soles, poses and resources.
[Response tests](../spec/sound-response.test.ts) cover deterministic source selection and exclusions.
[The living-world browser suite](../e2e/living-sound-world.mjs) exercises real contributors, local mixes,
resident responses, Sound off, private stays and new audio decoding on an isolated scratch server.
Run it with `APP_URL=http://localhost:18880 node e2e/living-sound-world.mjs <shots-dir>`.
Existing movement, reply, hut, weather, focus and phone regressions still matter. Run browser checks against scratch data, never the working preview database.
Retain the rollback tag
`before-living-sound-world-2026-11-07` and roll application code back with the current database.
This walkthrough does not certify the complete regression run, preview promotion or final artistic acceptance;
the evidence log records the checks and rendered results actually completed.
