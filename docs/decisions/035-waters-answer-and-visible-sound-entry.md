# ADR 035 — Waters answer, and sharing stays within reach

Date: 2026-11-08. Status: implementation approved; candidate in development.
Marine-route corrections and integrated browser acceptance are still in
progress. This record does not claim a completed release or local promotion.

## Request and observed failure

The author cannot reliably find the sound-setting/placing entrance, and asks
for fish, frog and whale sounds with visible life in the existing 3D water.
Keep the playable world and the shared sound experience as the focus.

The missing entrance has a concrete cause. Four contextual CSS rules hide
`#planet-place` when a work dock, a discovery card or a private-room card is
visible. The dock rule also applies after a work is collapsed. At the principal
creation areas this removes the generic Share action for ordinary visits.
On narrow screens the separate local Sound control is icon-only, while volume
and examples are deeper inside Places & friends. These are different actions,
but their discoverability does not make that distinction clear enough.

A pre-fix JSDOM run uses the actual `renderPlanet` output and complete CSS:
expanded work, collapsed work, discovery and private-room fixtures all compute
`display: none` for Share. A fifth check fails because there is no direct
listening-settings entrance. This is executed DOM/CSS evidence, not a GPU
layout observation or an unfamiliar-player study.

## An entrance that contextual cards cannot remove

- Move the single existing Share a sound control into the header, keeping its
  ID and explicit chooser. It remains outside contextual world-card selectors.
  Keep a readable label on a phone and retain run, jump and camera controls.
  Remove the hiding rules rather than adding another specificity override.
- Put a compact listening-settings entrance beside Share. It opens the
  existing native drawer at its one actual set of local controls: listening
  on/off/resume, work volume and the existing world-example preference. Do not
  introduce a second preference store or imply that a local mix edits a work.
  Escape/Close remains available and returns focus to the opener.
- An unjoined visitor reaches the existing arrival choice through Share.
  Joining, browsing, sharing and another person's changes never enable local
  listening. Explore quietly and private Listen keep their distinct meanings.
- Keep the entrance visible while offline, in a private stay or at a crowded
  spot. The curated chooser and full library retain private Listen, disable
  unavailable Leave actions and explain the reason. A reconnect, safe walk or
  room exit does not submit anything: another explicit Leave is required.
  Private Flush/shower actions retain the authoritative stay/admission gate.

The ordinary publisher still owns identity, confirmed position, explicit
operation keys and server errors. Its canonical SSE/snapshot state remains
the authority for live sources; a late HTTP receipt cannot revive a withdrawal.

## Water life belongs to actual water and actual sources

`client/sound-waterlife.ts` adds original, bounded 3D geometry to the retained
renderer. Two small pond fish and three small shore fish are scenery, where a
safe water anchor is available. Their diagnostic origin is `scenery`, their
instance source is null, and they have no invented author, public contribution,
reply or audio emitter. They do not complete a shared work.

The three new ordinary ingredients produce separate source-attributed effects:

| Public ingredient | Visible consequence |
| --- | --- |
| Pond bubbles | A larger group of fish and short rising bubble clusters near suitable pond or shore water. |
| Pond frogs | Frogs resting on pads, calling throats and occasional small hops at the pond. |
| Whale song | A nearby ocean whale with an introductory breath, a periodic articulated breach, spray and a return to cruising. |

Retain each real `sourceId`, `byId`, author name, timestamp and original source
coordinates. Sample complete poses from anchored `serverNow` and `source.at`;
do not integrate a different animal route for each arrival. Canonical timestamp
and ID selection bounds effects to four fish sources, two frog sources and two
whale sources. This gives at most seventeen fish including scenery, four frogs
and two whales, with bounded instance batches for particles and pads.

Private stays, examples, malformed inputs and withdrawn sources cannot create
these public consequences. A source may have no visible animal when suitable
water, a complete safe route or an effect-budget slot is unavailable. Do not
move its historical coordinates to manufacture an effect. Ocean routes must
keep the whole whale and spray over actual water, clear of the shore and pier,
including across the longitude seam. This requirement is still being exercised
and corrected at this checkpoint.

Withdrawal removes source-owned animals, pads and particles immediately;
observed tombstones outrank an old live snapshot. Shared meshes and materials
have bounded ownership and disposal. Reduced motion keeps a still recognisable
pose and suppresses moving bubbles, ripples and spray. Explicit Watch actions
offer a local viewing visit to an eligible real effect; they never relocate its
sound source, publish, answer a work or turn listening on. Merely receiving a
source never initiates that viewing visit.

## Original sounds, with honest event and file durations

The assets are original procedural sound illustrations made with coding-agent
assistance. They contain no downloaded animal recordings or music samples.
Pond bubbles illustrates air leaving water; it is not a recording of a fish's
voice. The frog and whale timbres do not identify a species or reproduce a
documented natural call. Their provenance is original project-generated audio,
not an external CC0 claim. See [the asset record](../assets/waterlife-sounds.md).

| Sound ID | Audible event window | Padded MP3 file / event interval |
| --- | ---: | ---: |
| `pond-bubbles` | 3 s | 12 s |
| `pond-frogs` | 4.5 s | 18 s |
| `whale-song` | 7.5 s | 32 s |

Optional catalogue playback metadata extends the existing event scheduler.
Existing event fallbacks, texture loops and tempo-compatible score branches
keep their meanings. The planet schedules only the declared audible window;
the padded full file also gives the older coastal loop player genuine quiet
gaps. A five-second private whale preview has a short release when it cuts the
longer phrase. New files never seed contributions or create another background
bed. Local permission, volume, visibility, range, voice limits and asynchronous
cancellation still apply. Asset/index updates preserve existing original and
licensed entries rather than replacing their metadata wholesale.

## Evidence boundary and reversibility

The entrance's pre-fix five failures and subsequent nine passing focused checks
are separate from the audio asset/controller's 23 passing focused checks. The
latter include deterministic PCM, actual encoded-byte hashes, event scheduling,
quiet preferences, private-preview cancellation and a softened whale cutoff;
their audio nodes are test doubles. Actual offline decoding measurements and
provenance are recorded with the assets. These checks do not establish pleasant
sound, convincing rendered motion or successful friend collaboration.

Initial marine tests caught rejected water anchors/routes, missing whale
visibility and downstream budget/withdrawal failures. A subsequent eight-check
route-focused source run passes, but the integrated 3D visit and final browser
matrix are still pending here. The final coherent full-source/HTTP run, actual
desktop/phone review and promotion require separately recorded outcomes.
Human listening and unfamiliar-player acceptance remain pending regardless of
automated results. [The evidence log](../evidence-log.md) separates each scope.

No identity, room, storage path, schema or historical coordinates change. The
existing quiet consent and durable reply graph remain intact. The starting
preview is application `8f32290`; current preview data must survive any eventual
candidate promotion or code-only rollback. No promotion, public push, `main`
change or deployment is claimed by this implementation checkpoint.
