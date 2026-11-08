# ADR 032 — Sounds set the world in motion

Date: 2026-11-08. Status: locally promoted as application `3ee3493` after
scoped source, coastal-walk and dual-browser boat/wind checks. Fresh promoted
read-only coastal inspection also passes; artistic and unfamiliar-player acceptance are not claimed.

## Request and inspected starting point

The author asks for a placed boat horn to make a boat sail, and for similarly
coherent sound effects. They also report that walking beside the coast can
put the camera inside the planet. The latter has been reproduced and traced
to surface classification rather than cosmetic camera distance.

At inspection, the coast already contained a pier, a volumetric sailboat,
sails, water and a tide-pool channel. That boat bobs and rolls but does not
sail in response to a source; keep it as moored scenery. Meadow/dune grass
and stage cloth establish a visual language for wind, but there was no
working windmill or boat-navigation system to claim or preserve.
`harbour-boat` is labelled **Boat by the pier** and `gentle-breeze` is **Breeze and birds**: existing
recording IDs, licences and playback roles remain unchanged.

At the starting checkpoint, the studio separated private Listen from explicit
Leave and could show an environmental consequence outside the three main work
places. Its effect copy covered birds, gulls and café responses, but not the
boat or wind changes. The local discovery guide currently covers only ADR031's
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

The geometry investigation identified a concrete cause: tangent projection
classified the café's antipode as inside its footprint, yielding a -44.16 m
floor. The old coast sweep contained 49 negative walkable samples. Front-
hemisphere gating now precedes local footprint, floor and wall checks; the
bounded repaired sweep has 553 walkable samples with no negative/nonfinite
heights. Raising the camera would conceal the wrong ground model. Geometry
alone was insufficient, so an actual continuous coast path was checked too.

Reproduce the reported walk with the actual controls and inspect the corrected
path. The avatar's ground height and the camera must remain outside the authored
planet surface and water through coastal walking, turning, zoom changes and
viewport changes. Preserve the normal follow/drag conventions, first-/third-person modes, run/jump, collision
and source positions. A successful Go here jump or a numerical camera check
alone cannot establish that the continuous coast walk is fixed.

## Acceptance protocol and remaining checks

This protocol set the candidate targets. The executed runs below establish
their named cases only; manual hearing, unfamiliar-player comprehension and
exhaustive run/jump/seam coverage have not been supplied by these new paths.

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

## Observed candidate and local promotion results

The final coastal browser path passes 19 checks: sustained desktop and touch
walking in first/third person, close/far camera settings, and a continuous far-
shore leg within one metre of the café antipode. Observed signed feet and
camera remain outside the globe, with quiet preference and source history
preserved. This is bounded developer automation, not a guarantee for every
camera angle. The coherent restarted scratch application also passes 328
source/HTTP checks in 51 files, 65.31 s; earlier 326/327 runs have narrower
build scopes and must not be called final-package acceptance.

During candidate work, the author still observed clipping at port 18861. Its
recorded application remained the preceding `cd73f2a`: this fix had not yet
reached that preview. Do not treat the report as a completed retest of the
candidate. The subsequent promotion below delivers the candidate, without
claiming the author has personally retested it.

Boat/wind browser attempts also exposed three real integration gaps: ordinary
Tide-pools Share showed Green recommendations; the withdrawal path attempted
an invisible desktop header on phone; and new client JS ran against stale
server-held HTML, causing a null-control startup failure. Venue-aware choices,
a reachable phone drawer entry and a complete candidate rebuild/restart address
those causes. A final test-harness correction uses Reading Nook's visible
primary action rather than assuming a separate Share button is visible there.
The complete 17-check path then passes; earlier failures remain evidence.

The final `.cache/motion/sounds-ready/results.json` records two independent
quiet identities, real horn and breeze publication, attributed moving geometry,
late arrival, desktop/touch Watch, withdrawal in both sessions, reload quiet
preference and real SQLite tombstones. Its 17 checks pass without runtime
errors. This is developer automation, not an unfamiliar-player study or sound
quality judgement.

Source commit `3ee3493` matches all 69 reviewed compiled files. Local promotion
at port 18861 preserves all twelve current tables and verifies 62 served
assets. The previous application remains the application-only rollback target
with the current database. A fresh anonymous promoted observer then passes:
all non-GET/HEAD requests are blocked, all sixteen current public planet source
IDs remain unchanged, and an actual S/D/S coast walk records 387 safe render
samples from the Lookout to x60.387/z7.270. The feet remain at radius 22 m and
the default third-person camera at 31.638 m. This post-promotion path is desktop;
the earlier isolated coastal run covers touch. The
[release index](../evidence/sounds-in-motion-2026-11-08.json) keeps each scope
and raw artifact separate, including the original failures. No artistic listening,
physical-phone or public-release acceptance is asserted. Rollback must retain
the current database, never restore an old one for visuals.
