# ADR 018: A shared sky and a connected landscape

Accepted, 2026-11-06. Wen requested weather, time and scene systems. This
replaces ADR 012's Sunny Day-only visual restriction; its room identity and
legacy-link compatibility remain. It extends ADR 017's coastal art direction.

## Experience

Weather & time offers Clear, Cloudy, Rain and Mist, a continuous time slider,
Dawn / Afternoon / Dusk / Night, and an optional 24-minute day. Time starts
paused at 14:00 in clear weather, matching the original afternoon. Applying a
choice changes the shared environment for everyone. Merely browsing does not.
The running clock can be paused; weather remains the chosen weather until
someone changes it. This is an imagined environment, not a live forecast.

Explore scenes provides illustrated destinations for the nine existing forest,
creek, shore and cafe zones. Go here moves only the visitor who chooses it;
browsing does not move them. These are connected parts of the same world, with
the same people and sound contributions, rather than separate multiplayer rooms.
Existing zone links still work. The route retains `mode=weekday`, with retired
mode links redirecting as before, and the database room remains `morning`.

## Shared state

An additive `session_environments` table keeps weather, an integer minute anchor,
a running flag, the server timestamp and a revision per existing session. A
running day advances one simulated minute each real second, including while
nobody is online or the server restarts. It never writes a database row per
tick. Clients calculate elapsed time against a server sample and a monotonic
browser clock, rather than trusting the computer's local clock.

Cookie-authenticated visitors can explicitly apply settings through the
session's environment endpoint. A reviewed revision must still match. If
someone changed it first, show the latest settings and preserve the unsubmitted
draft until the person explicitly reloads it. Changes are independently limited
to one per second per user and attributed through SSE. Reconnects start with
the latest snapshot; an old HTTP acknowledgement cannot replace a newer edit.
An interrupted request never causes an automatic retry. Guests can browse and
travel but cannot change the shared environment.

## Rendering and sound

Continuous keyframe lighting drives sky, sun, shadows, fog, lamps, wet boardwalk
and HDR illumination. Night adds a stationary procedural moon and stars.
Rain uses one reusable, bounded buffer, excludes indoor roof footprints and is
hidden for reduced motion. Entering the cafe can still show rain outside its
windows. Reduced motion also skips environmental transitions. Adaptive quality
reductions remain in force when the environment changes.

No new dependency, downloaded asset or automatic audio layer is introduced.
Weather and time do not change sound placement, removal, reply relationships,
guitar playback, private-hut admission or the lasting record of contributions.

Verification results and limitations are recorded in `docs/evidence-log.md`.
