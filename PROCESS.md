# Little Chorus — process overview

> **Author review draft.** Prepared with coding-agent assistance from recorded requests and repository evidence. Personal judgements and marked author inputs need Alison’s review. No human listening, uncoached playtest or next-day result is claimed.

## Directing toward one shared consequence

My current brief defines Little Chorus for two to six friends without musical
training. I want them to recognize a place changed because one answered the
other. The unit of quality is a complete experience: discover, leave a sound,
receive an answer, notice a common change and find the work again. More
destinations or passing checks do not by themselves answer that brief.

The repository contains earlier answers. Explicit spatial contributions landed
in [`e1f2ed7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/e1f2ed7),
and durable replies in [`a79a9d3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/a79a9d3).
Those foundations preserve who answered whom. They do not guarantee that
players understand what changed. The current brief therefore prioritizes
Listening Green, followed by a stage and reading nook with different uses.

## Rejection changed the criterion

I asked for stronger art and rejected attempts that fell far short of a chosen
reference. I later clarified that coherence, harmony, a distinctive style and
making sound together mattered more than cinematic fidelity.
[ADR022](docs/decisions/022-shared-sound-identity.md) and
[`56f8215`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/56f8215)
record that correction. That changed the criterion; it did not establish success.

The first planet then lost basic play. I reported missing running, jumping,
direct responses, sea and kangaroo, and rejected its quality. The Little Chorus
name and restoration priority appear in
[`f282fde`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/f282fde);
movement returned in
[`8e4e43b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/8e4e43b),
and direct response in
[`92bef2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/92bef2c).
These are regression repairs, not evidence of surpassing Little Ritual.

**AUTHOR INPUT:** Which rejection most changed how you personally directed
the agent? Explain the actual change in your method; the commits alone cannot
supply that memory.

## Keeping dependable foundations

The candidate retains TypeScript, Node HTTP, SQLite, SSE and Three.js.
[ADR026](docs/decisions/026-a-world-that-remembers-an-answer.md), authored in
[`5d696e5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/5d696e5),
rejects an engine rewrite and nine shallow games. I nevertheless requested
playable alternatives: **2D Storybook** and **2.5D Paper theatre**, recorded in
[ADR028](docs/decisions/028-optional-paper-world-presentations.md). They present
the same room, contributions and replies rather than starting new worlds.

The [comparison evidence](docs/evidence/perspectives-2026-11-08.json) includes
two independent browser identities answering across the flat views, private
audition, nearby chat, quiet-state protection and phone operation. It establishes
playable alternatives, not an unfamiliar-player preference study. After comparing
them, I still found 3D more lively and suitable for Little Chorus; [ADR029](docs/decisions/029-a-lived-in-3d-world.md)
records that choice. Moving around expressive characters and situated sounds
better fits the world I want friends to inhabit. Keeping 3D also keeps its
occlusion, camera and rendering costs. A close activity camera and bounded
sampling address those costs; optional flat views remain available, without
parallel art expansion.

The server obtains identity from the HttpOnly cookie, confirms mutations and
keeps response metadata. SSE supplies canonical snapshots and changes; SQLite
stores contributions across process restarts. Movement remains transient.
Audio preference, audition, focus and camera remain local. The kangaroo cannot
stand in for a second human. This distinction makes the multiplayer claim
auditable without forcing every playful behaviour into persistent shared state.

Shared objects are projections of existing public contribution history, not a
second editable work database. Root IDs retain work identity. A live direct
reply between different authenticated authors enables the common form;
same-cookie tabs cannot. Removed endpoints keep provenance but lose effects.
This avoids synchronization between duplicate stores, at the cost of explicit
grouping, ordering and variant rules that need adversarial checks.

## A small score, not every recording on repeat

The new score has three original 72 BPM parts in compatible pentatonic pitches,
with different registers and roles. Server-time bars give late joiners the
same phase without promising sample-accurate synchronization across devices.
Nature textures retain their own timing; short events have quiet intervals.
Distance, voice limits, headroom and preview ducking protect intelligibility.
The [audio handoff](docs/chorus-audio.md) explains the remaining listening work.

When ffmpeg failed with a local library error, the build used installed LAME
rather than altering system packages. The manifest distinguishes original generated score derivatives
from licensed third-party recordings. Successful encoding and measured PCM
are technical evidence; neither establishes a pleasant mix.

## Failures changed the harness

The earlier NoteGrid served a healthy page but imported modules the server did
not expose. The [SoundGarden correction](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/fcb3ec9)
added import checking. That history supports the continuing CLAUDE rule that
green specs do not prove the client works, rather than serving as current
planet evidence.

A previous planet screenshot revealed a tree crown hiding the player's body.
[`2ead55d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/2ead55d)
added an actual-geometry raycast and widened the planting gap. The check failed
before the correction. It protects a sightline, not artistic quality.

A later audit found that missing both source events during a pending POST let
its late ACK revive audio and labels while the sculpture stayed correct.
[`92d706b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/92d706b)
makes ACKs receipts; six controller checks pass and fail against frozen old
code. The browser case drops two real SSE frames before the production handler,
then opens a fresh native connection for the actual snapshot before releasing
the ACK. This is controlled frame loss, not natural outage timing.

The earlier garden HTTP/SSE check used two independent cookie jars and three
server processes on isolated port 18886. It observed identical shared work, duplicate
delivery deduplication, reconnection, two real restarts and removed-parent
history. Four local server-to-stream update measurements ranged from 1.97 to
2.71 ms. These establish bounded backend behaviour, not browser presentation
latency, novice success or next-day return.

In the new journal, withdrawal removed the focused button during a live
rerender. [`51cb210`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/51cb210)
restores the surviving action or Back button. The garden release's 43-check browser
path verifies that correction, real shared outcomes at all three places,
quiet-browser behaviour, touch/keyboard/resize and late-acknowledgement removal.
That source run passed 190 tests in 28 files, 63.48 s, against isolated port 18887.

A rollback rehearsal initially passed 17 checks, but missed a normal restart
losing the previous-application pointer.
[`a3d6cf6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/a3d6cf6)
preserves it; an expanded 20-check fixture verifies startup, switch, ordinary
restart and rollback with all twelve tables unchanged. This failure shows why
an operation's lifecycle needs checking beyond its successful first path. The
[release record](docs/evidence/chorus-garden-2026-11-07.json) separates these
runs, later visual refinements and preview promotion; none proves public deployment.

## Acceptance has different observers

Automation can establish identity, deterministic work state, explicit
publication, persistence and cancellation. Developer-operated browsers can
establish that a complete path is operable at 1920×1080 and 390×844. Neither
proves an unfamiliar friend understands the invitation or enjoys the music.
Those require separate observations. The [promise map](docs/submission/promise-evidence-map.md)
connects product claims to agent rules, technical checks and human judgement.

The [two-pair protocol](docs/submission/human-playtest.md) is prepared, not a
completed study. First sound within sixty seconds, a shared answer within three
minutes, voluntary recombination and a real next-day return remain unverified
until observed. Tests write only isolated databases; application rollback keeps
current data. No public deployment or main-branch push is implied by local
acceptance.

**AUTHOR INPUT:** Confirm the account and research argument, identify what you
actually read and heard, and add only real unfamiliar-player findings. The old
README/PROCESS mismatch was a submission defect; labelled drafts correct the
product description while leaving personal sign-off visible. Historical
reflections retain their original context rather than being rewritten as a
successful Little Chorus narrative.
