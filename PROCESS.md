# Little Chorus — process overview

> Agent-assisted first-person draft, pending author review.

## Directing toward a shared consequence

My brief is for friends without musical training to recognize a place changed
because one answered the other. I asked the agent to implement and exercise a
complete discovery, contribution, response and return path, rather than deliver
another proposal. Durable contributions and replies already existed in
[`e1f2ed7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/e1f2ed7)
and [`a79a9d3`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/a79a9d3).
The design problem was making their relationship perceptible and worth using.

I repeatedly rejected visual attempts that diverged from a chosen reference.
Then I clarified that a coherent, distinctive style and making sound together
mattered more than cinematic fidelity. [ADR022](docs/decisions/022-shared-sound-identity.md)
and [`56f8215`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/56f8215)
record that correction. The first planet also lost running, jumping, direct
responses, the sea and kangaroo. I reported those regressions; [the restoration
decision](docs/decisions/025-little-chorus-play.md) made preserving play a
constraint. A new scene could no longer stand in for a complete product.

## Alternatives without discarding the world

I requested playable 2D and 2.5D versions. The [comparison record](docs/evidence/perspectives-2026-11-08.json)
documents automated and developer-operated paths through both, including two
independent identities responding across presentations. These were functioning
alternatives over the same state, not concept images. I subsequently chose 3D
as more lively and appropriate. This is my recorded design preference; I am
not claiming to have personally conducted those tests. The latest direction
removes parallel flat presentations while retaining their evidence and history.

That choice carries costs: camera obstruction, curved-surface geometry,
legible characters and phone performance require continuing work. Keeping
Three.js avoids rebuilding dependable interaction and audio foundations.
TypeScript, Node HTTP, SQLite and SSE also remain. For this small shared world,
a single persistent backend and ordered event stream are easier to inspect
than a new engine or distributed service. [ADR026](docs/decisions/026-a-world-that-remembers-an-answer.md)
records the rejected rewrite and the choice to prioritize three connected places.

## Delegating implementation, specifying authority

I delegated product implementation, asset integration and checks to coding
agents, with bounded file ownership for parallel work. Their completion reports
were inputs to acceptance, not acceptance itself. Repository rules require real
browser operation, isolated test databases, traceable assets and application
rollback that retains current data. The [promise map](docs/submission/promise-evidence-map.md)
connects those rules to observations and questions still needing people.

The server obtains identity from its cookie and confirms shared mutations.
Same-cookie tabs cannot create a second author. NPCs and the local companion
cannot qualify either. Existing public sound history derives the shared works;
there is no second editable sculpture database to synchronize. Live cross-author
replies enable the common form, while removed ingredients retain provenance
without effects. Listening preferences, previews and cameras stay local.

This makes two product decisions explicit. A solo visitor can leave a beginning
without waiting for a partner; a real friend's answer changes the common form
and arrangement. Green introduces that relationship, the stage makes musical
roles clearer, and the nook reduces listening range. The cost is a deliberately
bounded vocabulary of outcomes. Whether friends recognize ownership and choose
to try another combination remains a question for play, not a deduction from
the reply graph.

Three original musical parts share compatible pitches and 72 BPM timing.
Server-time bars give later arrivals a common phase, without promising
sample-accurate playback across devices. Nature textures and short events keep
different schedules. Encoding, peak measurements and native decoding are useful
checks; they cannot establish a pleasant arrangement. [The audio handoff](docs/chorus-audio.md)
keeps that distinction and source licensing visible.

## Failures that changed the harness

A delayed publication acknowledgement could revive removed audio after the
client missed both relevant events. The correction in
[`92d706b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/92d706b)
makes acknowledgements receipts rather than state authority. Actual-controller
checks fail against frozen old code. The browser fixture deliberately loses
two SSE frames, receives a genuine reconnection snapshot, then releases the
acknowledgement. It tests a specified race, not every possible outage.

Later, walking around the coast exposed an interior view of the planet. The
problem was not merely camera height: a tangent building footprint also matched
its antipode and supplied an invalid floor. The correction in
[`f464e75`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/f464e75)
adds hemisphere-aware support. Real walking checks in
[`83809a7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/83809a7)
sample actual feet and camera radii throughout movement, rather than only
checking a destination. Existing persisted coordinates remain unchanged.

My report that objects still floated led to another physical correction.
Furniture placed on a tangent plane could leave its legs above the curved
ground; characters could use a radial frame over a flat deck. The
grounding change in
[`8f32290`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/8f32290)
uses actual support surfaces, grounded furniture and curved foundations. Pure
geometry checks measure real soles and corners. Shadows reinforce contact;
they do not conceal an unfilled gap. [Before and after evidence](docs/evidence/grounded-world-2026-11-08.json)
records both the defects and bounded corrections.

The water-life addition exposed a different weakness. Its first browser run
passed twenty checks, yet phone cards covered the fish and frog. A whale view
also relied on stale framing. Those captures were rejected rather than counted
as visual success. The correction in
[`3e367ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/3e367ee)
checks actual, fresh animal projection and usable controls together.
[The retained runs](docs/evidence/waterlife/2026-11-08/browser/SCOPE.md) distinguish
the initially green result from the accepted local path. A visible animation
state was an inadequate proxy for a visible animal.

## Keeping claims bounded

My latest rejection of the synthetic frog sound is a real listening judgement,
not approval of the whole mix. The implementation in
[`6ba8b6e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/6ba8b6e)
replaces that timbre with a licensed pond recording, restores the sea guitarist
and retains only 3D.

The integrated application
[`9ea6009`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/9ea6009)
has [scoped evidence](docs/evidence/seaside-performance-2026-11-08.json): 419
source/HTTP checks, twelve presentation browser checks, and a separate
35-check/seven-capture two-identity path using a native silent analysis sink.
It exercises real guitar priority, private recorded-frog audition, reply,
withdrawal and return. Local promotion preserves all rows in twelve tables,
including 48 sound-history rows, and verifies 67 served assets. Application
rollback keeps the current database.

The default-device reruns timed out twice: a nominally running native audio
context had a stalled clock and zero output. An independent non-product control
also stalled; the native silent sink advanced and produced nonzero samples.
This narrows the failure to the tested default-output rendering path without
identifying its underlying cause. No product or system audio repair is claimed.
The earlier default-output pass at 6ba8b6e cannot validate newer cached audio.
Silent analysis establishes neither speaker output nor human listening approval.

The [two-pair URL-only protocol](docs/submission/human-playtest.md) is prepared,
not conducted. No unfamiliar-player result, artistic mix approval, physical-phone
test or next-day return is claimed. Local promotion is not Fly deployment.
Historical reflections retain their original DayDraw, SoundGarden and Bloom
contexts rather than becoming a retrospective success story.
