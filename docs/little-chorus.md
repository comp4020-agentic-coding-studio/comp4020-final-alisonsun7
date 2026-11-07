# Little Chorus: restore play, then author the coast

Wen selected **Little Chorus (小小合鸣)** after rejecting the first Soundfolk
sphere's missing actions, buried sound responses and sparse scenery. ADR
[025](decisions/025-little-chorus-play.md) records the correction. `/planet`
retains its original `planet:morning` room and coordinates. The older coast at
`/scene/seaside?mode=weekday` retains its own people and sound history.

## The playable sound loop

Hear or see something someone left, approach it, and choose **Respond to sound**.
Named markers expose the actual recording and human author in the world.
The nearby action card offers Respond, Conversation and Remove. E on the
focused world responds to a nearby sound before offering the kangaroo action.
Off-screen or more distant sources remain available in **Our soundscape**.

A response within four metres opens the same private audition library. Farther
away, the action starts a cancellable walk; manual movement cancels that travel.
An explicit choice is still required to publish. The response intent offers
Choose a response and Cancel; walking nearby later does not reopen a cancelled
chooser. Removing a source cancels its route, preserves the child's relationship
metadata, and prevents stale confirmations from restarting or resurrecting it.

**Conversation** shows the actual durable parent and answers, including a
removed endpoint. Its Walk toward sound action waits for native dialog closure
before resuming movement. Real public replies form curved threads over the
sphere. Both endpoints must be live and public; preview audio and private
restroom stays never enter this public loop. Labels can move beside one another
with a leader line instead of hiding the farther visible contribution.

## Movement and encounters

| Action | Desktop | Touch |
| --- | --- | --- |
| Walk | WASD or arrows | Direction buttons |
| Run | Hold Shift | Run toggle |
| Jump | Space | Jump button |
| Respond / meet the kangaroo | E on the focused world, or visible action | Visible action button |
| First / third person | V or header control | Header control |
| Inspect the world | Drag; plus/minus camera distance | Drag; plus/minus controls |

Running is 5.6 metres/second versus 3.2 walking. A jump is a real radial body
offset with a 0.72-second arc and 0.88-metre apex. Other people receive actual
running/jump poses through existing movement SSE. Height never changes sound
coordinates or bypasses the authoritative restroom gate. Narrow-door collision
uses movement substeps. Stale network poses land after 450ms without samples;
none of this introduces persistent activity rows.

Meet the original volumetric kangaroo by the listening green. Invite it to
follow, lead it to a sound, jump together, start a hopping game, or let it rest.
It follows safe land and stays outside private rooms. This is a local companion:
it never increments human presence, publishes sounds, starts unsolicited audio
or claims that another human performed an action.

The existing authoritative resident restroom visit and its explicit test remain
under **Places & friends → Restrooms & doors → Test with a resident**. NPC and
human occupancy share the same server gate. Running and jumping cannot evade it.

## A coastal world with authored places

The sphere now has a curved blue ocean, irregular dry/wet sand, low moving foam,
a raised timber pier and a small sailboat. The tide pools join the shore through
a water channel. Open water stops walking; the real pier has a walkable raised
floor. A continuous land route still circles the globe. Existing destination
anchors, private rooms and contribution coordinates remain in place.

Connected paths lead to nine distinct venues. The tea house and workshop have
gabled roofs, deep eaves, windows, porches and flower boxes; the reading nook has
an arched canopy, the stage a cloth sail, and the conservatory raised beds.
Grove, pine and wind-shaped trees form groups instead of a uniform ring. Low
timber lanterns, meadow grass and small flower clusters share the painted palette.
The default camera was selected from eight actual angle/distance comparisons;
its 16-metre framing shows coast while the closer control reveals your figure.
A small central sightline is kept clear. The tide-pool seat no longer blocks
the first-person view toward the water.

The [Little Ritual primary process](https://developers.openai.com/showcase/little-ritual)
informed the order: playable central action, expressive movement, authored
landmarks, then camera/mobile refinement and optimization. Its lead cover is
labelled generated illustration, not gameplay proof. This edition uses our
own procedural Three.js geometry; it does not claim the same Blender asset
pipeline, identical artwork, new furniture minigames or user visual acceptance.

## Verification and rollback

Browser checks use isolated scratch port18882. HTTP-writing specs use another
database on18883; they never race the browser suite's preservation assertions.
The evidence log records actual completed checks and limitations, separately
from silent geometry/camera fixtures. Physical-phone performance, native
tab-blur behavior unavailable in headless Chrome, and an artistic listening
verdict are not claimed.

The final legacy run passed15 suites, followed by all50 planet checks after
correcting stale test camera samples and a duplicate Close selector. The new
two-person play suite passed33 checks. Full specs passed151 tests; the final
actual-geometry sightline test passed separately. See the
[structured verification](evidence/little-chorus-play-2026-11-07.json) for scope
and retained failures. Actual reviewed captures include the
[default view](screenshots/25-chorus-default.png),
[whole globe](screenshots/25-chorus-globe.png),
[sound response on phone](screenshots/25-chorus-phone-response.png),
[durable conversation](screenshots/25-chorus-conversation.png),
[kangaroo play](screenshots/25-chorus-kangaroo.png),
[shore](screenshots/25-chorus-shore.png) and
[night interior](screenshots/25-chorus-night-interior.png).

`before-little-chorus-play-2026-11-07` preserves the prior source at `a65cead`.
Ignored `.cache/chorus-baseline/dist` preserves the prior compiled preview.
Rollback changes application files and retains the **current database**.
The sole intended persistent metadata edit is the planet catalogue title from
Soundfolk to Little Chorus. Users, sound rows, replies, operations, rooms and
shared weather/clock anchors are retained. Never restore an older database to
roll an art or interface change back. No remote push or deployment is included.
