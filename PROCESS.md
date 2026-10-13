# SoundGarden — process overview

## From the brief to a deliberate scope

Crit 9's requirement is precise:
["a change one person makes reaches everyone else within about a second, without a reload"](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/),
plus one documented decision about multi-user behaviour, evaluated against
README's own definition of good.

My idea already depended on that requirement before I read the brief. I
wanted a shared grid where switching instrument changes what someone *else*
is hearing, which only works if the instrument is shared and changes travel
fast. So the first scope decision was one garden for everyone (one grid, one
instrument, no rooms) rather than private copies.

The work went through two versions. The first, NoteGrid
([`2dfc5f0...555b2ad`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/compare/2dfc5f0...555b2ad)),
was built from a one-paragraph sketch. It kept everything in memory and ran
one global playback clock. That clock contradicted one of my own answers: I
had chosen "each person plays locally", and the agent built global
synchronised playback anyway. NoteGrid also shipped with a client that never
loaded (below). I then wrote a much fuller design, SoundGarden: the pastel
studio look, column-based playback, an eraser, a SQLite schema, anonymous
session identity, structured logs, presence and an activity list. I asked for
NoteGrid to be replaced with it. This document describes SoundGarden;
`docs/evidence-log.md` records the prompts and corrections in between.

## The one documented decision

[`docs/decisions/001-simultaneous-edits.md`](docs/decisions/001-simultaneous-edits.md)
is the required Crit 9 decision: what happens when two people change the same
square near-simultaneously. Last-write-wins, decided by server arrival order
and a monotonic `version` stamp, was chosen over a per-square lock,
optimistic version rejection, or restricting edits to each note's own author.
Evaluated against README's three principles — "anyone can make music,"
"music belongs to everyone," "every contribution leaves a trace" — the
alternatives all protect a half-second-old intention at the cost of making a
tap sometimes silently fail, which contradicts the first principle directly.
The real cost, named in the ADR: an overwritten note gives its author no
warning, though the activity log and server log both still record who placed
and who replaced it.

## Stack and workflow

Continuing the Node/TypeScript/Fly/single-machine shape this repo already
uses, SoundGarden adds a real persistence layer this time: `node:sqlite`
(built into Node, no native addon to compile for the Docker image) at
`/data/garden.db` on the Fly volume, with four tables — `users`, `notes`,
`garden_state`, `activity_logs` — matching Wen's supplied schema. Every
mutation runs as one transaction that updates the relevant row(s), increments
`garden_state.version`, and appends an activity row, so the version number
and the audit trail can never drift apart.

Identity is a random session token in an HttpOnly cookie; the database stores
only its SHA-256 hash, and every mutating route resolves the acting user from
that cookie — never from anything the request body claims. Two people with
the same nickname get different ids, and a request can't attribute its write
to someone else's name.

Real-time transport stays Server-Sent Events: the server pushes the complete
`GardenState` (the full grid, instrument, online count, and recent activity)
after every mutation and on every new connection, so a client that reconnects
after a drop is never missing an event — it just gets the current truth
again. Playback stays client-local: pressing Play starts only that browser's
loop, reading the live grid and instrument at the moment each beat is
scheduled, so another person's edit or instrument switch is heard on the very
next beat without restarting anything.

The three instruments are synthesised with the Web Audio API (layered sine
harmonics for piano, a detuned sawtooth pair through a closing lowpass filter
for guitar, a bandpass-filtered sawtooth with a vibrato LFO for saxophone) —
recognisably different timbres, not sampled instruments, so a switch takes
effect with no loading delay.

## A real bug that shipped, and what it changed

The first deployed build (NoteGrid, tagged `crit-9` at
[`714901b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/714901b))
passed CI, returned 200 at `/`, and passed every spec test — but no grid ever
appeared in a browser. The compiled `client/app.js` imported `../types.js`
and `./audio.js`, and the server had no route for either, so both 404'd and
the whole client script failed to load. Every test checked server responses
and HTML; none checked what the browser could actually load.

I didn't catch it: the agent reported "opened it in the browser" after
running `open`, without ever confirming the page worked. Wen did, by looking
at it and saying the 6×6 grid and note blocks weren't there. Diagnosing it
took two `curl` calls once someone looked.

The correction went into tests and rules, not just the code.
`spec/client.test.ts` follows every `<script>` and `<link>` on the page and
every `import` inside each script, and requires each to return 200. Before
trusting it, I confirmed the old build 404s exactly those two paths. The
server now lists every browser-loaded file explicitly. `CLAUDE.md` now says a
green spec is not proof a page works: a UI change isn't done until a real
browser renders it and a second session sees the change.

## Verification

Automated (`pnpm check`, 18 tests across `spec/realtime.test.ts`,
`spec/identity.test.ts`, `spec/client.test.ts`, plus the two required
invariants): two independent sessions standing in for two people, asserting
a placed note, an erased note, and an instrument switch each reach the other
session within the crit's 1-second budget; two sessions writing the same
square at the same time converging on one agreed value and version; presence
counting connected people, not requests; a reconnecting session receiving
the full current grid rather than only new events; two people sharing a
nickname still resolving to different users; a request naming someone else's
user id in its body still being attributed to the actual session that sent
it; and every script and module the page loads actually resolving (the
regression test for the bug above).

Manually verified in a real two-browser session (Chromium via Playwright,
one context at 1280×1000, one at 390×844, screenshots kept alongside this
work): both viewports render the full grid, palette, transport and
instrument controls with no horizontal overflow; a note placed by one
browser appeared in the other in under 50ms in that run; an erase by one
browser reached the other in under 40ms; an instrument switched by one
browser while the other was mid-playback took effect in the other's next
beat about 47ms after the click; pressing Play in one browser did not start
playback in the other.

Persistence was checked by placing a note and switching instrument, killing
and restarting the server process, and confirming both survived — the point
of putting state in SQLite on the Fly volume rather than in memory, which
the first (NoteGrid) version of this crit's work did not do.

Not yet verified at the time of writing: the actual Fly deployment and
Docker build for this specific SoundGarden version (see
`docs/evidence-log.md`), and a real stranger's first few seconds with the
app with no instruction — exactly the kind of judgement `spec/README.md`
leaves to a person, not a script.
