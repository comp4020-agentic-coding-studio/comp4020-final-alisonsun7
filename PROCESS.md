# NoteGrid — process overview

## From the brief to a deliberate scope

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/#what-you-submit)
asks for a week-9 "all at once" step: make the app genuinely real-time, by the
course's precise definition ("a change one person makes reaches everyone else
within about a second, without a reload"), and make and document one decision
about multi-user behaviour. [`crits/09-all-at-once`](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/)
names the mechanism (WebSockets/SSE/polling) as "mostly settled by your
stack" and the actual decision as one level up — what happens when several
people act at once.

NoteGrid's own idea already pointed straight at this requirement before the
brief was even checked: a shared 6×6 grid that several people edit together,
with an instrument switch that's meant to audibly change what someone else is
currently hearing, is only a real feature if it is real-time. The product and
the assessment requirement are the same thing here, which shaped an early
scope decision: keep the board a single global shared state (one grid, one
instrument, one Play button) rather than private per-user rooms. A private
room would have been easier to build, but it would also make "switching
instrument mid-playback changes what someone else hears" structurally
impossible — the one behaviour the whole idea, and the crit, is about.

## The one documented decision

[`docs/decisions/001-cell-conflict-resolution.md`](docs/decisions/001-cell-conflict-resolution.md)
is the required Crit 9 decision: what happens when two people edit the same
cell at (almost) the same moment. Last-write-wins was chosen over a per-cell
lock or an optimistic-version check, evaluated directly against README's
"what good means here" — good is defined there as *instant, audibly shared
change*, not *every edit preserved* — so protecting a half-second-old edit
from being overwritten is not a promise this app makes, and the locking
alternatives would have made the board feel less responsive, which is the
opposite of what the requirement actually asks for.

## Stack and workflow

The stack continues what this repo's Fly/Docker/CI shape already requires:
one process, one machine, 256 MB, no separate database. Rather than add
SQLite for a product whose only real persistence requirement is "the current
board while people are using it," the whole board lives as one in-memory
object in `src/state.ts`, broadcast to every open SSE connection on every
mutation. That is a deliberate scope decision, not a shortcut: README's
"deliberate limits" section says plainly that nothing is saved once every tab
closes, so there is no gap between what the app promises and what it does.

For real-time transport, Server-Sent Events were used again (the same
general shape — a versioned state object pushed to every open connection —
as this repo's earlier realtime work before the reset), because the route
surface is small (grid, instrument, transport) and SSE needs nothing beyond
plain `node:http`. Playback stays synchronised across open tabs without the
server itself ticking: the server only records *when* Play was pressed
(`startedAtMs`), and each client computes "which of the 36 steps is playing
right now" from that timestamp plus a fixed step duration, so every open tab
converges on the same step without a server-side clock loop.

The audio engine (`src/client/audio.ts`) uses three Web Audio oscillator
presets (triangle+short decay for piano, sawtooth+lowpass sweep for guitar,
sine+vibrato for saxophone) rather than sampled instruments, specifically so
an instrument switch takes effect on the very next note with zero loading
delay — a soundfont fetch would risk exactly the kind of latency the crit is
testing for.

## Verification

Automated (`pnpm check`): the two required invariants (`/` returns 200,
`/readme/` renders every README heading in order) plus a new real-time spec
(`spec/realtime.test.ts`) that opens two independent SSE connections — one
standing in for the person who makes a change, the other for the person who
should see it — and asserts a cell edit, a cell clear, an instrument switch,
and a Play press each reach the second connection within a 1-second budget,
matching the crit's own definition of real-time. A rejection test confirms
an out-of-range cell index and an invalid note are both refused rather than
corrupting the shared board.

Not yet verified at the time of writing: a real `docker build` of this app
(Docker was unavailable in the working environment this was built in — see
`docs/evidence-log.md`), so the Dockerfile's first real build-and-run
happens in CI on push and must be watched there before the crit. The actual
felt experience — does switching instrument really sound like it changes
what another person is hearing, in under a second, in two real browser
windows — is exactly what the crit's own side-by-side device check is for,
and is named here as unverified by any automated test, consistent with
`spec/README.md`'s own statement that some lines of the spec are a person's
judgement call, not a script's.
