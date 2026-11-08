# ADR 033 — Neighbours have a day

Date: 2026-11-08. Status: locally promoted as `40ed231`, independently
inspected at the actual preview, and source pushed to the authorised public
branch. Evidence-only follow-up remains on that branch; no main deployment.

## Request and observed starting point

The author says residents remain stiff, without independent activities or
recognisable conversation. Inspection of the running 3D café and its controller
found a small one-off approach to a source, followed by an indefinite hold.
Persistent sources suppressed the café idle layer; shared-work gestures could
replace a walking pose with standing, making movement read as sliding.

The author initially requested a private save to Alison's final repository.
Read-only GitHub API inspection found that the configured course origin was
already public, and Alison SSH authentication alone could not establish
visibility-management permission. Remote writes paused for clarification.
The author then explicitly accepted public delivery: “那就public吧，刚好也方便我测试了”.
Use the existing course repository and only `codex/neighbours-in-motion` for
this delivery. Do not push `main`, trigger its deployment, change visibility or
switch global credentials. A branch in a public repository is public too.
The verified `40ed231` source push has now completed through the project-only
Alison SSH identity. Evidence updates follow on the same independent branch.

## Daily life without replacing sound response

Reuse the same twelve named planet residents and IDs, existing character rigs,
world, sound selection and shared server clock. NPC homes/routes may be adjusted
to the actual café counter front and clear furniture. Human positions, stored
sound coordinates, identity and source history do not move. No new player,
public sound row, AI dialogue service, recording or schema migration is needed.

Plans provide short walking routes and work, rest or conversation stops. The
server-time sample determines position, facing and route phase; arrival order,
frame rate and accumulated local time do not select a different day. A new real
sound still wins attention over a teaching example. After the existing two-second
settle, its initial eased attention window lasts up to seven seconds; settled
sources later receive eight-second windows per thirty seconds with stable phase
offsets. Old sounds no longer freeze the rest of a resident's life.

For a resident with a life plan, sound attention changes gaze/upper-body gesture,
not the canonical walking path or position. Walking owns the legs and world
heading; a source-facing head turn is bounded. The old approach-to-source
controller remains for scenes without the optional life contract. Shared-work
animation yields to daily walking and conversation.

Paired residents converse only at compatible nearby stationary stops, with
mutual orientation and complementary speaking/listening roles alternating every
3.2 seconds. Speaking uses alternating hands and actual rests; listening uses
smaller nods and attentive hands. Rig state resets before another pose. The
small wordless turn cue is procedurally drawn and explicitly an NPC cue, not
real-player chat, generated dialogue or a stored conversation. Reduced motion
keeps a validated authored stop and still role/rig state.

## Real geometry and a bounded fallback

Route validation samples actual spherical paths, floor changes and building
clearance, plus NPC-specific body clearance from real tables, chairs, counter,
menu and Green furniture. Player collision is unchanged. Retain the separate
authoritative restroom routine and lock; this iteration adds no toilet visitors.

A blocked plan uses a deterministic safe stationary fallback. Canonical shared
work updates revalidate against current garden geometry. If a real installation
now blocks the route, the resident may be repositioned to that safe stop; this
is a deliberate cost of shared geometry, not a promise of never teleporting.
Source audition alone does not reauthor the plan or move a source. Both late
and existing browsers must derive the same blocked/fallback result.

## Evidence boundary at the implementation checkpoint

- The first authored-route QA run failed two checks because the test lacked
  the sign canvas/document stub: 30 passed, two failed. This was a harness
  failure, not an observed navigation defect. Adding the stub gave 32 passes
  in five files; the expanded integrated group then passed 41 in six files.
- Against frozen `3ee3493` SoundResidents, the new controller group reports
  eight failures and one pass. The new pure life module still comes from
  current source, so this is not nine old-application behaviour comparisons.
- Conversation-rig expectations failed four of twelve before the forward
  implementation, then all twelve passed. Missing API failures and static
  hand-range failure are distinguished from acoustic or visual judgements.
- The actual old-browser visit on isolated 18920 is anonymous and quiet, with
  zero completed activity checks: it lacks the new life diagnostic. It cannot
  establish a measured full-cycle comparison of old conversation or walking.
- The 328-check source run belongs to the preceding motion release and its old
  NPC controller. It is not acceptance of this candidate. The first new source
  run passes 344 in 53 files, 72.84 s, and its native-clock browser path passes
  17 checks over 49.3 server seconds. All six café residents actually walk more
  than 1.5 m, with paired roles, quiet listening, source withdrawal and phone
  controls. These are the first candidate's results, not the latest revision.
- The first scratch boot lacked the canonical README symlink and failed before
  acceptance. Fixing that scratch package did not alter the then-running
  `3ee3493` at 18861. Tests use separate databases/ports.

## Two visual corrections after green checks

Root rejected the first paired-conversation screenshot: the café name board
hid heads and three-dot turn cues despite passing activity/rig assertions.
Milestone `7e0e565` moved the actual talk stop to the front porch through a
furniture-cleared NPC aisle. Its focused 41/six-file group, 18-check browser
path and 344-check source run passed, but a second visual inspection found
the cue floating too far above the person. These are earlier scopes, not
acceptance of the final cue placement.

The cue's local height had been multiplied by AnimalFigure's scale. Its
screen diagnostic projected an assumed 1.92 m point instead of the actual
Sprite, so a green visibility assertion did not validate the visible cue.
The first new negative invocation accidentally omitted the test from its
config and found no tests; it is a harness mistake, not a product negative.
The correctly selected check then failed on the real approximately 0.899 m
head-to-cue gap. The final fix follows the animated headAnchor with a 0.22 m
world offset and a fixed 0.62 m world width. Screen checks now project the
actual Sprite world position. The focused group passes 42 checks/seven files,
1.50 s after that repair.

## Verified local outcome and public source delivery

Application `40ed231` passes the final 18-check browser path in
`.cache/neighbours/final-artifacts/results.json`, with no runtime or cleanup
errors. The independent identities, native-clock activity/role changes,
actual visible cue, true-source attention/withdrawal, quiet visits, phone
controls and reduced motion are developer checks. A separate coherent
source/HTTP run passes 345 checks in 54 files, 67.90 s. Neither total establishes
unfamiliar-player understanding or artistic naturalness.

The actual 18861 preview now serves `40ed231` at PID 85402. All 72 compiled
files match the reviewed candidate; every row in all twelve current tables,
including 44 sound-history rows, is preserved, and 65 served assets match.
The application-only rollback target is `3ee3493` with the current database,
never a restored historical database.

The actual promoted anonymous observer passes with no joins, writes or page
errors. Its normal coast walk records 386 safe rendered samples; all sixteen
public planet source IDs remain unchanged. Desktop and 390×844 captures each
expose the twelve actual NPC life rigs. This is a short promoted inspection,
not a second whole-cycle study. The authorised source push of `40ed231` to
`codex/neighbours-in-motion` also succeeds through Alison SSH. `main` remains
untouched; this publishes branch code, not a new deployed website.

Raw pure-check provenance is stored under
`docs/evidence/neighbours-in-motion/pure-checks.json`; root archives the later
cue/full/browser records separately. This is a small behaviour vocabulary,
not a needs simulation. No human listening, unfamiliar-pair, physical-phone,
next-day or public website-deployment result is claimed. The
[release index](../evidence/neighbours-in-motion-2026-11-08.json) separates
source checks, browser paths, actual promotion, observer and public code push.
An evidence-only follow-up does not change the accepted application build.
