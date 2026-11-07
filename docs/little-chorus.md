# Little Chorus: a place that remembers an answer

The current candidate follows [ADR026](decisions/026-a-world-that-remembers-an-answer.md):
two to six friends without musical training answer sounds to make a place
recognizably different. Listening Green is the main encounter. Pocket Jam and
Reading Nook offer related experiences with different listening distances and
rhythms. The other destinations remain explorable rather than nine separate
games. This supersedes the prior 16-metre default framing and feature-restoration
priority in [ADR025](decisions/025-little-chorus-play.md); it retains that
release's movement, sea, kangaroo and dependable sound relationships.

`/planet` keeps `planet:morning`, the existing identity and all source
coordinates. The original coast at `/scene/seaside?mode=weekday` retains its
own room and history. Camera, travel and listening preferences never create a
new room or reinterpret a contribution's position.

## First visit: make a beginning

1. Open `/planet`, join with a nickname and animal, then choose **Enter with
   sound** or **Explore quietly**. Quiet browsing does not prevent an explicit
   private audition. Escape dismisses the invitation quietly; **Show the
   invitation again** is in **Places & friends**.
2. At Listening Green choose **Make a first sound**. The studio offers three
   starting ingredients. **Listen** is private, becomes **Stop**, and never
   publishes. **Cancel** returns to the world. **Explore every sound** opens
   the complete library if you want more choice.
3. Choose **Leave it here** once ready. The server confirms the contribution.
   A coloured leaf/seed and the work card identify the real source and author.
   This is a complete solo beginning; no second person is required to continue
   exploring, auditioning, trying another ingredient or visiting another place.
4. Open **Our works** to find the record, its ingredients, authors, replies and
   place. **Begin a new work here** starts another root rather than answering
   the current work. **Answer [name]** continues a saved live ingredient.
5. To try again cheaply, answer with another choice or withdraw a sound while
   within four metres of it. Withdrawal stops its live effect; the record
   retains its author, time and relationship. Nothing silently republishes a
   cancelled choice.

This path is an instruction for trying the product, not evidence that a new
player discovers it in sixty seconds. The [URL-only two-pair protocol](submission/human-playtest.md)
measures that separately.

## Two friends: hear and see the answer

Use separate browser profiles, an incognito profile or separate devices.
Ordinary tabs sharing cookies are one identity even with multiple connections.
Return in the same regular profile with its cookie to keep your identity.
Clearing cookies, changing device or ending a private-browsing session can mean
joining as someone new; existing works still retain the original attribution.

One friend can leave **Warm chords** at Listening Green. The other chooses
**Answer [friend's name]**. The studio states the exact author and ingredient
being answered, recommends **Soft pulse** alongside contrasting alternatives,
and keeps audition separate from publication. After the second friend leaves
the pulse, both browsers receive the same ensemble work: its source petals
open, the kinetic form changes, nearby residents adopt a shared-work gesture,
and the sounding browser gains a low harmony on the next bar. A quiet visitor
sees the change without being unmuted. **Our works** explains who answered whom.

There is no single required recipe:

| Live ingredients in a reply work | Recognizable result | What a different real author's live reply adds |
| --- | --- | --- |
| Water texture and bird/breeze texture | Watersong canopy, paper birds and ripples | Open shared form and the wider source-derived choreography |
| Melody/harmony and pulse | Pocket chorus / beat flower | Open rotating form and a low musical answer on the next shared bar |
| Other combinations | Firefly lantern | Open petals with light travelling between their ingredients |

A response from the same identity still adds a real ingredient and changes the
work. It cannot unlock the two-human form. NPCs and the companion are never
participants in the work's contributor list. Removing a live endpoint can close
that form; its history stays readable. Returning after a reload restores the
same root identity, sources and authors rather than a locally invented result.

## One shared sculpture, many lasting records

The server derives works from actual public contribution and reply history.
A root source provides the stable work ID and original location. Private
restroom stays, previews and unknown sounds cannot grow a public work. No
second mutable work table or scene-coordinate migration is required.

Each of the three places displays its **most recently changed living work**,
chosen by canonical timestamp and ID. The dock, sculpture and residents use
that same choice. Browsing or highlighting an older record is local and does
not replace the shared installation for someone else. Answering an older live
ingredient changes its shared work and can bring it back to the stage. Fully
withdrawn works remain in a bounded recent journal archive; the full durable
conversation endpoint retains their relationship history.

The sculptures are actual procedural Three.js geometry in the walkable world,
not concept-image backdrops. Their visible bases have walking boundaries;
clicking a reachable sculpture opens its corresponding work action. Reduced
motion preserves its final topology, colours and authorship while reducing
movement. Server-anchored time selects the common choreography, independent
of local sound preference or a visitor's wall clock.

## Three places with different uses

| Place | Invitation | Listening range of a contribution originating there |
| --- | --- | --- |
| Listening Green | Begin with one ingredient; answer a friend; recognize a canopy, flower or lantern | 14 m |
| Pocket Jam | Combine Warm chords, Soft pulse and Little bell notes; give friends different musical roles | 18 m |
| Reading Nook | Approach, listen closely and leave a quieter natural answer | 6 m |

The top place buttons move only you through the existing world. They do not
create private copies. Ordinary walking changes the spatial blend continuously;
source distance and direction determine what reaches you. The stage reaches
farther than the nook, while each has the same persistent relationship rules.
Other venues, the blue sea, beach and raised pier remain available through
**Places & friends** and on foot. Books, furniture and the telescope are scenery,
not promised minigames or a furniture editor.

## A small compatible score and private listening

**Warm chords**, **Soft pulse** and **Little bell notes** are original generated
parts with separate harmonic, rhythmic and higher answering roles. They share
72 BPM, four-beat bars and C-major pentatonic pitches. New musical voices enter
on a future server-time bar; late visitors join the same phase. This is
reasonable browser synchronization, not sample locking between audio devices.
Nature recordings keep their own timelines. Bells, claps and other short events
have bounded playback and quiet intervals instead of universal endless looping.

Private auditions soften the world mix and stop on close/cancel. There is an
eight-voice budget including any derived harmony, spatial falloff, density
headroom and a compressor where supported. The [audio handoff](chorus-audio.md)
records the score, legacy recording audit, PCM checks, lifecycle guards,
provenance and exact human-listening questions. None is artistic approval.

**Places & friends → Your listening → Work volume** affects only your mix of
contributions. **Listen closely** is also local. **Sound off** silences the
world and residents; someone else's contribution never turns it back on.
Adding, answering and withdrawing are shared writes. Local volume, mute,
camera and listening focus do not edit the shared work. Every recording and
original score derivative remains documented in the
[asset manifest](../public/assets-manifest.json).

## Moving, characters and useful tools

The default activity camera is eight metres from the character. **World
overview** in **Places & friends** is an explicit wider view; **Back to my
place** returns to the activity distance. The first-/third-person control and
V remain available. Advanced look conventions are under **Moving, listening &
looking**, rather than leading the first sound choice.

| Action | Keyboard / pointer | Touch |
| --- | --- | --- |
| Walk | WASD, arrows, or click ground | Four direction buttons |
| Run | Hold Shift | Run toggle |
| Jump | Space | Jump button |
| Main nearby action | E on the focused world, or its visible button | Visible action button |
| Inspect | Drag; camera plus/minus controls | Drag; camera controls |
| Close a dialog | Cancel/Back or Escape | Cancel/Back |

Native dialogs pause movement, contain keyboard focus and keep typing separate
from movement shortcuts. A live journal rerender preserves the selected action
or returns focus to a surviving button when withdrawal removes it. Players
retain their distinct role styling; residents are labelled NPCs on approach.
Labels are contextual rather than an always-visible crowd of names.

The kangaroo remains a **local companion**. Invite it along, hop together or
let it rest. Near a canonical ensemble work it can look toward the result and
hop with the shared beat. Its following/play position remains local; it never
adds a contributor, creates a sound or impersonates a friend's participation.

**Places & friends** is the Tools drawer: destinations, nearby people/chat,
visit-scoped activity, shared weather/light, local listening, invitation replay,
overview and advanced controls. **Restrooms & doors → Test with a resident**
lets Rowan demonstrate the authoritative occupied-door/flush sequence. Human
and NPC occupancy use the same gate; running or jumping cannot bypass it.
Those exploration features support the world without replacing its core work.

## Run, verify and roll back

The candidate is reviewed on isolated port 18885, with separate data for HTTP
restart checks and other tests. The working preview at
`http://localhost:18861/planet` now serves application `28f1e58`, including the
final portrait camera. Refresh an already-open tab to load its new client. The
[release record](evidence/chorus-garden-2026-11-07.json) confirms the actual
switch: all rows in twelve original tables are exactly preserved, all 47
application modules/styles and three score derivatives match, and all eight
old live sources retain their IDs and coordinates. It separates this cutover
from the browser creation path, HTTP/process checks and scratch lifecycle fixture.
A final fresh-profile check of the actual promoted page passes seven read-only
checks: no join or write attempted, no audio started, the real canvas/invitation
rendered and no page/static/request errors occurred. All twelve table hashes
remain identical after it. The [promoted entry](screenshots/26-chorus-promoted-entry.png)
is an actual unretouched capture. Historical release numbers in
[little-chorus-play](evidence/little-chorus-play-2026-11-07.json) describe the
previous version only.

Runtime `2c2f587`, including the canonical ACK guards and Reading carrier shift,
passed 43 automated browser checks. Its separate full source run passed 190
tests in 28 files, 63.48 s, on 18887. The restart check uses
18886 and an isolated preview-lifecycle fixture uses 18888. These are different
observations, not one summed score or evidence of human enjoyment. The release
record preserves the earlier 184/41 runs and the later discovered
unknown-source late-acknowledgement guard separately. The 43-check path controls
logical loss of two actual sound frames, then opens a fresh native connection
for the real snapshot before releasing the held receipt. Another case checks
actual close/reconnect. No server state/event data is fabricated, and this is
not a natural-outage timing claim. All fifteen unchanged coastal suites also
pass on a dedicated empty 18890 database and frozen application; the earlier
historical-clone fixture failure is retained in the record. The later
portrait-only camera source `26805fb` passes eight focused actual checks of
Reading, Green and Stage, quiet touch preview/cancel, movement/travel/jump and
cleanup. Six actual desktop/phone frames were reviewed; this focused result is
separate from the full 190/43 source/browser scope.

Reviewed real captures from the 43-check run include the
[desktop beginning](screenshots/26-chorus-final-desktop-solo.png),
[desktop duet](screenshots/26-chorus-final-desktop-duet.png),
[phone work](screenshots/26-chorus-final-phone-work.png),
[phone first choices](screenshots/26-chorus-final-phone-studio.png),
[phone journal](screenshots/26-chorus-final-phone-journal.png),
[Pocket Jam](screenshots/26-chorus-final-pocket-jam.png), and the Reading canopy
on [desktop](screenshots/26-chorus-final-reading-canopy.png) and
[phone](screenshots/26-chorus-final-reading-canopy-phone.png). These are
unretouched running screenshots. They include the lateral Reading offset and
precede the final portrait-only camera adjustment. Latest reviewed composition
captures show Listening Green on [desktop](screenshots/26-chorus-portrait-green-desktop.png)
and [phone](screenshots/26-chorus-portrait-green-phone.png), Pocket Jam on
[desktop](screenshots/26-chorus-portrait-stage-desktop.png) and
[phone](screenshots/26-chorus-portrait-stage-phone.png), and the Reading canopy
on [desktop](screenshots/26-chorus-reading-visible-desktop.png) and
[phone](screenshots/26-chorus-reading-visible-phone.png). Full body/feet and the
nearby work remain above the phone contribution card in these reviewed frames.

Use Node 24 and the package's pnpm 11 environment to build with `pnpm build`.
An existing preview can be started safely with
`python3 scripts/local-preview.py`; it refuses an unrecorded listener or a
mismatching database. An intentional candidate switch uses `--dist` and
`--restart`. `python3 scripts/local-preview.py --rollback` restores the retained
previous compiled application with the **same current database**. The source
rollback point is `before-chorus-garden-2026-11-07`; build it in an isolated
checkout if the compiled backup is unavailable. Never restore an older database
for a visual rollback. An older catalogue can omit the new score choices and
their display effects; their stored sources and replies remain for the newer
application to read again. The script's startup/switch/rollback fixture is separate
from the completed 18861 promotion, and neither authorizes a public push/deploy.

The core ambition is understandable, enjoyable shared authorship. Automated
browser success and server persistence do not establish pleasant music, a
newcomer's understanding, voluntary second combinations, physical-phone
performance or a real next-day return. Those remaining judgements and the
[author-review writing packet](submission/README.md) stay explicit.


## Neighbours within reach (ADR 027)

The current revision restores scene-level actions that were previously buried
in Places & friends. **Talk nearby** is available in the world (keyboard **T**);
it names real friends within twelve metres. Messages appear briefly over their
speaker and in the accessible log, then disappear; they are not stored.

At **Restrooms**, use **Walk into restroom**, **Flush**, then **Walk outside**.
The lamp turns red and the door locks during the visit. **Go to shower** reaches
the other doorway, where **Run shower** continues until exit. **Invite Rowan to
try the lock** demonstrates an actual NPC reservation and flush; the NPC never
counts as a player. These controls can be dismissed and reopened.

**Tide & Coffee** is the original tea destination at its original coordinates.
Its open-front counter, patio and regulars offer a social setting for ordinary
contributions. The three starting choices are espresso, conversation and café
music; dishes remain in the complete library. Real nearby public sources bring
steam, table gestures or a spinning record. These are source-driven responses,
not a background soundtrack or a fabricated human contribution.

Work cards now have **Minimise work panel** and an explicit reopen button;
**What changed?** expands the longer causal account. Individual source cards
also close and reopen, including by selecting the actual world pin. An incoming
shared update does not force either card open or discard keyboard focus.

A fresh visit stays silent until an explicit listening action. **Sound off ·
Tap to listen** and **Audio paused · Tap to resume** distinguish local preference
from a browser-paused context. **Enable listening** recovers a zeroed local
volume deliberately. Musical near-field gain has been increased without
widening the 6/14/18-metre area boundaries; source coordinates remain exact.
Grounded folded buds mark those actual positions. Shared works now grow larger
floor and overhead forms, with the same real authors and withdrawal semantics.

See `docs/evidence/neighbours-2026-11-08.json` for the final verified scope.
Automated output measurement does not replace hardware listening, and the
unfamiliar-pair study remains a separate human activity.

## Try the same world in 2D and 2.5D (ADR 028)

Three local presentations share the same identity, source history, responses,
clock and private-room admission:

- **2D Storybook:** `http://localhost:18861/2d`, an illustrated overhead village.
- **2.5D Paper theatre:** `http://localhost:18861/2.5d`, an isometric village with
  upright characters, building sides and foreground/background depth.
- **3D Little planet:** `http://localhost:18861/planet`, the retained default.

Use the desktop header's 2D / 2.5D / 3D links, or **Places & friends → World
style** on a phone. Changing style keeps the same participant and briefly hands
off the current position within that tab. It starts the new document quietly;
use Sound to listen again. A style is not a second room or a copied save.

In the illustrated views, W A S D / arrow keys move in screen directions; Shift
runs and Space jumps. Click or tap a clear path to walk there, drag to pan, and
choose Village overview to see more places. Touch arrows, Run and Jump remain
available. The current three-choice sound invitation, Our works, nearby Talk,
restroom/shower actions, café, local kangaroo and shared environment are reused.

For a short comparison, enter Listening Green, audition and leave Warm chords.
In a separate browser identity, choose Answer and add Soft pulse. Both views
open the same beat flower and show both real authors. Walk around it, minimise
the card, talk nearby, then change the visual style and find the same work.
Shared-cookie tabs still represent one person. Listening volume and Sound off
remain local; leaving, answering and withdrawing affect the common work.

The local candidate is running. To start it again from the repository, use
`python3 scripts/local-preview.py`; it uses the already recorded current DB.
Build source with Node 24 and `npm run build` (or pnpm 11+). For a deliberate
local file switch, build to another directory and use the tracked preview
utility with `--dist`, `--commit` and `--restart`; it checks all rows and retains
the preceding compiled app. The quick rollback on this machine is
`python3 scripts/local-preview.py --rollback`: it switches the application back
to `91ff33d` while keeping the **current** DB. Never restore a historical DB to
undo a visual choice. Git tag `before-chorus-perspectives-2026-11-08` preserves
the source boundary; branch `codex/chorus-perspectives` contains the comparison.

Evidence: `docs/evidence/perspectives-2026-11-08.json`. The full specification
suite passed before final UI corrections; the final real-browser run passed 47
behaviour checks at 1920×1080 and 390×844. A read-only browser subsequently
opened all three promoted views against the player's current history. These
checks do not establish aesthetic preference, speaker/headphone sound quality,
physical-phone performance or unfamiliar-player onboarding. Source pins and
paper-tree occlusion still have room for refinement after choosing a direction.
