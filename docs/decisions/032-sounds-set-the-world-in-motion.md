# ADR 032 — Sounds set the world in motion

Date: 2026-11-08. Status: accepted candidate direction; implementation and
integrated checks are pending. This record is not a completed-feature claim.

## Request and inspected starting point

The author asks for a placed boat horn to make a boat sail, and for similarly
coherent sound effects. They also report that walking beside the coast can
put the camera inside the planet. The latter needs actual reproduction and
repair rather than a cosmetic scene change.

At inspection, the coast already contained a pier, a volumetric sailboat,
sails, water and a tide-pool channel. That boat bobs and rolls but does not
sail in response to a source; keep it as moored scenery. Meadow/dune grass
and stage cloth establish a visual language for wind, but there was no
working windmill or boat-navigation system to claim or preserve.
`harbour-boat` is labelled **Boat by the pier** and `gentle-breeze` is **Breeze and birds**: existing
recording IDs, licences and playback roles remain unchanged.

The studio already separates private Listen from explicit Leave and can show
an environmental consequence outside the three main work places. Its current
effect copy covers birds, gulls and café responses, but not the proposed boat
or wind changes. The local discovery guide currently covers only ADR031's
three clearly labelled examples.

## Product decision

Use a small vocabulary of visible responses rather than another collection of
minigames. A sound should set a recognisable part of its place in motion. A
friend can answer, change the mixture, withdraw an ingredient and observe the
result. Preserve the existing attributed work and real cross-author reply
rules; an animated boat does not itself prove two people collaborated.

| Sound | Proposed visible answer | Existing foundation and scope |
| --- | --- | --- |
| Boat by the pier | A source-driven passing ferry travels a bounded ocean route, with its heading and wake making travel readable | A separate SoundVessels presentation; retain the old moored sailboat. Validate the actual route against safe ocean, never land, pier, pool or walking path |
| Breeze and birds | A small three-leaf paper pinwheel beside the source turns, making that local breeze visible | Original code-built geometry in the existing painted palette. Keep it distinct from bird-call wildlife; do not change global weather |
| Trickling stream | The existing pool-to-sea channel could carry a more visible flowing accent | Deferred; no water-flow expansion in this candidate |

The corresponding no-source state must remain recognisable. Preserve gentle
ambient scenery, but reserve the readable travel/breeze response for an
eligible source. Avoid constant spectacle everywhere or a stronger visual
effect selected by this visitor's mute, position or wall clock.

## A shore answer without moving the sound

A horn can still be left where the player stands. Its contribution marker,
audio emitter, author, position and reply history stay there. The responding
ferry belongs on real ocean water, with a safe route and coastal viewing spot.
It must not become an audio emitter that drags a historical recording around the sea.

Consequence copy should make that distinction useful to a player, for example:
**“Your horn stays here. A passing boat answers at the coast.”** If the boat is
outside the current view, offer an explicit **Watch the boat** action with a coastal
location cue. It moves only the player or chosen view, never the sound. Do not
automatically teleport, turn the camera or publish a suggested ingredient.
Show the actual source author when explaining the response; never imply that
the decorative boat is another connected player.

Show at most three source-driven passing ferries, selected from actual live
public horn sources with newer timestamps first and a deterministic ID tie.
Their source IDs remain attributable; the old moored sailboat is scenery and
does not consume one of these slots. Use a server-clock route phase so a late
arrival sees the same selected ferry at the same point. Withdrawal removes
that source's ferry, including when an older source becomes eligible for the
bounded display. Do not grow speed, loudness or boat count without limit.
Exact route timing and transitions must be implemented and verified before
being described as shipped.

Private auditions must not set shared scenery in motion. Private-room sounds,
withdrawn endpoints, stale acknowledgements and invalid sources cannot keep an
effect alive. Local Sound off still affects only listening; it does not change
the real shared response. The new effects require no contribution reseeding,
schema migration, new human identity or additional background soundtrack.
ADR031's three optional examples remain the only authorised local demonstration
spots in this candidate; this decision does not silently add a horn example.

## Coastal camera requirement

The geometry investigation identified a concrete cause: a tangent-plane
projection could classify an antipodal point as inside a building footprint,
producing a floor height of approximately -44 m. The candidate repair must
reject the opposite hemisphere before treating a point as a local building
interior or floor. Raising the camera would conceal the wrong ground model.
This pure-geometry diagnosis does not establish that the actual walk is fixed.

Reproduce the reported walk with the actual controls and inspect the corrected
path. The avatar's ground height and the camera must remain outside the authored
planet surface and water through coastal walking, turning, zoom changes and
viewport changes. Preserve the normal follow/drag conventions, first-/third-person modes, run/jump, collision
and source positions. A successful Go here jump or a numerical camera check
alone cannot establish that the continuous coast walk is fixed.

## Short acceptance protocol — pending execution

1. In an isolated world, privately audition a horn, cancel, then explicitly
   leave it. Confirm that only publication starts the proposed sailing response
   and that the still-fixed marker/audio origin remains attributable.
2. Observe from an independent browser, then join late. Compare actual source
   IDs and boat pose at anchored server times. Add a second horn, remove one,
   and remove the final one; check the three-ferry limit, source replacement
   and removal while the separate moored sailboat remains.
3. Start quietly in the second browser. Peer changes must remain visible
   without starting local sound. Hide the page or cancel a pending preview;
   delayed loading must not restore stopped audio or withdrawn effects.
4. Try the effect inland as well as near the pier. Can the player understand
   where the answer happened and choose to watch it without relocating the
   contribution? Verify the location action at 1920×1080 and 390×844, touch
   and keyboard, with no large card blocking movement or chat.
5. Walk the reported coast route continuously, turn both ways, run/jump and
   vary camera distance. Inspect rendered frames at the failure point and on
   both sides of the longitude seam; retain an actual pre-fix failure if found.
6. Place and withdraw the breeze source; inspect its three-leaf pinwheel,
   attribution and fixed audio origin. Check reduced motion, bounded resources,
   source removal and current-history preservation. Record each build and check separately. Human listening and
   unfamiliar-player understanding still require their own real observations.

No artistic listening, browser/GPU acceptance, human playtest or final release
is asserted here. Implementation choices, observed failures and actual results
must be appended only after they occur. Application rollback must retain the
current database; never restore an old database to reverse a visual change.
