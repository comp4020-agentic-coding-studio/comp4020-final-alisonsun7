# ADR 003: Live places, owned sounds, and memories sealed by the server

## Status

Accepted, 2026-11-05, for the final project. Supersedes ADR 001 and ADR 002,
which decided these questions for SoundGarden (one shared grid, anyone may
change any note). Sound of a City is a different product with different
promises, so the answers change. Those records stay as history.

## Context

The final project replaces SoundGarden with Sound of a City — ANU Edition,
following the design pack in `design/sound-of-a-city/`. The pack fixes the
product (places, sounds placed at spots in a scene, a shared 3-minute memory)
and most of the contract (`docs/05_DATA_MODEL_AND_API.md`: snapshot on join,
`operationId`, `serverSeq`, `baseRevision`, owner checks on the server). It
leaves four things to decide, and departs from the existing repo on one:

1. **Transport.** The pack describes WebSocket events. The repo has a working
   SSE + POST stack, with a spec and a deploy that already pass.
2. **What a live place is.** The pack has sessions but doesn't say how many
   can be open in one scene, or what happens to a place after a memory is
   saved.
3. **Who may change a sound.** ADR 002 chose "anyone can change anything" for
   SoundGarden. The pack (docs/03 §45, docs/05 §69) says the creator controls
   their own sound and others add complementary ones.
4. **What happens when saving fails,** and when the server restarts mid-memory.

## Decisions

### 1. SSE stream plus JSON ops, with the pack's event semantics

Kept SSE (`GET /api/stream?scene=&mode=`) for server → client and JSON POST
(`/api/sessions/:id/ops`) for client → server. Everything the pack asks of
the events is kept:

| Pack (docs/04, docs/05) | Here |
| --- | --- |
| `session.join` → snapshot + revision + serverNow | Every stream connection, and every automatic reconnect, starts with a full `snapshot` (placements, people, status, `startedAt`, `serverNow`, `seq`) |
| `server.committed {serverSeq, operationId, payload, serverAt}` | Same fields, on the stream and in the POST response |
| `server.rejected {operationId, code, message}` | The POST response, with an HTTP status (401, 400, 404, 409, 429, 500) and the pack's copy |
| `operationId` unique per session | `UNIQUE(session_id, operation_id)`; a repeat is answered `ok, duplicate` before anything else is checked |
| No reliance on missed socket messages | A client that sees `serverSeq` skip refetches the snapshot; `GET /events?sinceSeq=` also exists |

Why not WebSocket: the only thing it adds here is one connection instead of
two, and it would replace a stack that is tested, deployed, and works through
Fly's proxy without extra configuration. Sends are rare (a person adds a few
sounds, nudges a volume), so a POST per op costs nothing anyone notices: the
two-browser run measures 40–60 ms from click to the other screen.

### 2. One open session per place; sealing rolls the place over

A place is a scene in one mode (Chifley at dusk and Chifley in the morning are
different places with different people). Each has at most one open session.
People can place sounds while it's idle. "Start a 3-minute memory" starts the
**server's** clock. At 3:00, or when the person who started it saves early, the
server seals it: `session.ending`, then `session.saved` with a memory id (or
`session.failed`), and immediately opens a new, empty session for the same
place and sends everyone there its snapshot.

Why: the pack's loop ends "the memory is saved and the place starts silent
again". One session per place means two people who open the same place are
always together, without links or room codes. The clock is the server's
because the pack requires everyone to see the same countdown (docs/03 §36).

### 3. People change only their own sounds

Anyone who has joined may add sounds (up to 4 each, 12 per place). Only the
person who added a sound can change its volume, move it, or remove it. Edits
carry `baseRevision`; an edit from an old revision is refused as `stale` with
the current placement, and the client reloads it. Only the person who started
a memory may save it early; anyone may retry a save that failed.

Why it differs from ADR 002: in SoundGarden every note was everyone's, and
the grid was the shared work. Here each sound is a person's contribution to a
memory that names them. If someone else could remove it, the saved memory
could credit them for something that isn't there. The pack asks for exactly
this rule. The limits keep a crowded place from becoming noise.

### 4. A failed save says so; a restart doesn't lose the clock

Sealing is two transactions: mark the session `ending`, then write the memory
and mark it `saved`. If the second throws, the session becomes `failed` with
the pack's message, every sound stays, nothing appears in the archive, and a
retry seals it again. The client shows exactly what the server says: it never
announces "saved" on its own.

On start, `recover()` looks for sessions that were `active` or `ending`. A
clock with time left is rescheduled; one that ran out while the server was
down is sealed now.

## Consequences

- A person can't silence someone else's sound. If a place fills up, the
  people who placed sounds have to remove them, or the memory has to end.
  The message says so.
- Memories are public by default, with nicknames (Wen's decision). The join
  form says this before anyone joins.
- "Who is here" counts people with an open stream who have joined. Visitors
  who are only looking aren't counted and can't change anything.
- A memory stores the placements and a timeline of changes, not audio. Replay
  runs the same synthesis again, so it sounds like the place did.
- A memory saved early is as long as it actually ran.

## How it is checked

- `spec/live.test.ts`, against the running app: snapshot first; visitors not
  counted; a sound reaches another stream within a second in `serverSeq`
  order; reconnect gets the full state; `operationId` dedupe; every reject
  code; owner-only edits; stale `baseRevision`; per-person limit.
- `spec/lifecycle.test.ts`, on its own app with a 3-second clock: the server
  seals and rolls the place over; early save by the starter only; an injected
  save failure is reported, keeps the sounds, saves nothing and can be retried;
  sounds and memories survive a kill and restart; a clock that ran out during
  downtime is sealed on start, and one still running resumes.
- `e2e/two-browsers.mjs`: the same, through the UI in two Chrome sessions,
  including a real server restart while both pages are open.
