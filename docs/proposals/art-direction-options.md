# Four art directions for From the Forest to the Sea

Status: **D — Quiet Light selected by Wen on 2026-11-07.**
Implementation and rollback constraints are recorded in [ADR 019](../decisions/019-quiet-light-art.md).

Wen asked for stronger art and several designs to choose from on 2026-11-06.
These options develop the place in [ADR 017](../decisions/017-coastal-art-direction.md)
and the shared weather and clock in
[ADR 018](../decisions/018-shared-weather-time-and-scenery.md). They are visual
alternatives, not four new scenes or multiplayer rooms.

## What needs to improve

The reviewed beach and boardwalk screenshots show a mismatch between detailed
photographic sand and timber, simple trees and buildings, and thin animal
figures. Each element has a different degree of realism. Large areas of empty
sky and ground also leave little foreground framing or a memorable place to
pause. The next direction should unite shape, materials, people, lighting and
interface, rather than just change the colour grade.

Keep the focus on walking, listening and making a shared soundscape. A bench,
sheltered window or small clearing should invite people to stop together.
Sound contributions must remain easier to recognise than incidental decoration.

## How to compare the concepts

The four concept images use a comparable first-person boardwalk view: sea on
the left, café on the right, forest behind, cat and dog visitors, the nearby
guitarist, and grounded rings for contributed sounds. Similar composition helps
separate a choice of art language from a choice of camera or destination.

**These are AI-generated, preview-only concept images, not screenshots of the
running Three.js application or evidence of an implemented effect.** They are
not selected production assets and are not represented as CC0. This proposal
does not import images into `public/`, change runtime code or touch a database.
Any later implementation must follow the existing CC0/public-domain runtime
asset policy and asset manifest, or use original geometry and code drawings.
Concept details are visual references, not a promise that every generated
detail or lighting effect can be reproduced unchanged in real time.

The four reviewed concepts were generated with the built-in image generation
tool. Their complete prompt set is in `art-direction-prompts.json`. Local
review copies and original-image paths are recorded in ignored
`.cache/art-direction-options.json`; they are kept outside runtime assets.
Small interface samples are illustrative: a microphone symbol in a concept
does not propose recording. Final actions must still use the existing sound
library, with clear contribution and preview controls.

## A — Painted Coast

An illustrated coast with watercolour and gouache qualities, built around a
2.5D storybook appearance.

- **Shape:** slightly irregular roofs, layered plant silhouettes and gently
  simplified café forms. Foreground grasses and tree groups frame the water;
  the scene remains an explorable first-person place rather than a painted
  background.
- **Material:** broad pigment-like colour areas, restrained paper grain and
  soft edge variation. Sand, timber and walls share the same painted treatment
  instead of mixing photography with illustration.
- **Characters:** clear animal silhouettes, expressive ears and simple coats,
  with a lightly painted finish consistent with their surroundings.
- **Water and sky:** spacious blue-green washes, soft cream highlights and
  broad wave gestures. Mist and rain become changes in colour, edges and depth;
  their readability matters more than photorealistic droplets.
- **Sound markers:** translucent painted rings anchored at contributions, with
  small readable labels when relevant. Texture must not obscure source position
  or reply relationships.
- **UI:** warm paper surfaces, restrained serif titles and simple ink-like
  symbols, with clear text and controls rather than decorative handwriting.

**Main tradeoff:** the strongest illustrated personality, but that identity
must survive turning, walking and changing weather. A single attractive still
does not establish that its painted depth works throughout a 3D world.

## B — Clay Harbor

A tactile, fully 3D coast with a consistent matte, hand-shaped finish.

- **Shape:** substantial rounded architecture, gently uneven edges, thick
  timber, rounded stones and compact tree masses. Buildings retain recognisable
  entrances and usable human-scale spaces; rounded forms do not require giant
  baby proportions or a dollhouse camera.
- **Material:** soft clay-like walls, sand, foliage and wood, with subtle
  variation and restrained highlights. Sage, warm cream and muted coral give
  people and landmarks distinct silhouettes without filling the scene with
  saturated props.
- **Characters:** friendly cat and dog figures with fuller bodies, readable
  hands and clothing that belongs to the same tactile world.
- **Water and sky:** broad rounded wave forms and soft reflections, with enough
  material contrast to distinguish water from solid clay. Clouds, wet surfaces
  and evening lamps use the same simple volumes and soft light.
- **Sound markers:** clean rings resting around a source and a small floating
  centre cue. Markers should read as shared sounds, not collectable objects,
  prizes or physical obstacles.
- **UI:** uncluttered rounded panels, calm spacing and clear icons. The interface
  can echo the soft shapes while keeping text, focus and selected states crisp.

**Main tradeoff:** the most coherent fit for friendly animal visitors and
casual multiplayer encounters. Care is needed to retain a believable coast
and meaningful distance, rather than making every surface feel like a toy.

## C — Graphic Tide

A crisp animation-inspired coast with a limited palette and two- or three-tone
cel shading.

- **Shape:** deliberate roof angles, tall recognisable pines, simple rock
  profiles and strong architectural silhouettes. Repeated beams, railings and
  signs establish rhythm instead of small surface detail.
- **Material:** a few controlled colour values per surface, selective outlines
  and little photographic texture. Deep sea blue, mint, warm white and small
  coral accents make the visual hierarchy explicit.
- **Characters:** clean animation-style figures whose ears, clothing and pose
  remain readable at a distance; outlines and shading match the buildings.
- **Water and sky:** designed wave bands, graphic foam and clear horizon shapes.
  Weather and time change the palette and shadow planes coherently; night must
  preserve navigation and marker contrast.
- **Sound markers:** precise rings and restrained pulses that remain distinct
  from wave patterns and landmark signs. Labels carry meaning without relying
  on colour alone.
- **UI:** a clean contemporary coastal guide, with consistent line icons and
  compact controls rather than paper textures or simulated clay.

**Main tradeoff:** the clearest landmarks and visual signals. Outlines, sharp
contrast and pulses need restraint so that an inviting listening place does
not become visually busy or resemble an action-game objective display.

## D — Quiet Light

A painterly 3D coast with mature proportions and atmosphere as its main source
of beauty.

- **Shape:** layered forest canopies, natural rock groups and timber-and-glass
  architecture. Framed sea views, sheltered edges and varied tree spacing give
  the walk a sequence of intimate and open spaces.
- **Material:** simplified, coordinated surfaces with enough variation to feel
  natural. Muted blue-grey, pine green and amber favour broad light and colour
  relationships over highly detailed texture.
- **Characters:** approachable animal people with natural-scale clothing and
  grounded bodies; material softness connects them to the landscape.
- **Water and sky:** a visible path of reflected light, soft moving water,
  layered mist and a restrained horizon. Warm windows, cool shade, rain and
  changing daylight make the existing weather and clock central to the mood.
- **Sound markers:** small, softly lit source cues with subtle grounded rings.
  They must remain visible in fog, bright water and night; subtlety cannot make
  a contribution hard to find.
- **UI:** light, quiet panels with a strong reading surface where needed. The
  view has breathing room, while contribution names and actions remain legible.

**Main tradeoff:** the strongest fit for lingering and listening through shared
weather and time. Atmosphere alone cannot compensate for weak geometry or
inconsistent characters, and a still concept establishes neither runtime
performance nor contrast under every condition.

## Recommendation and selection boundary

Prefer **B, Clay Harbor**, for its consistent 3D language and warmth between
people. **D, Quiet Light**, is the second recommendation when immersion in the
soundscape matters more than a playful tactile identity. A offers the strongest
storybook treatment; C offers the clearest graphic identity. All four remain
available for Wen to select.

Choose one primary direction before developing the world. Mixing the clay
figures of B, photographic ground and the cel shading of C would recreate the
current inconsistency. A later refinement may borrow a restrained accent, but
shape, materials, people, water and UI should follow the chosen direction.

No option changes sound placement or removal, persistence, sound replies,
private hut admission, the nearby guitarist, the shared environment protocol or
the single-room model. The concepts do not propose automatic ambient audio.
No delivery-time estimate, benchmark or device-performance claim is made here.

After a selection, an implemented sample should be reviewed in motion, in the
forest and café as well as on the coast, and across daylight, night, rain and
mist. Sound source readability, nearby actions, movement, reduced motion and
phone layouts need checking in the running application. These are future
acceptance observations, not completed tests.
