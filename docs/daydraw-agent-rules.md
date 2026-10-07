# DayDraw phase-aware agent rules

Merge with root CLAUDE.md after inspecting its current content. Retain installed course rules and shipped assertions. Keep the previous C8 restriction identifiable as historical scope, with an explicit current phase. The source of current behaviour is the actual implementation plus Wen's accepted product decisions.

## Always

- Capacity is at most 12 registered participants. Two can complete the full journey. One can save an idea before shared planning starts.
- Role is encouragement, never a viewing or contribution permission. Everyone sees all categories.
- Nickname is display text. Server credential establishes membership; same nickname does not collapse users. Independent contexts represent independent browsers; same-profile tabs share storage.
- DB records are authoritative and persist on the existing Fly volume. Migrations retain C8 data. Never reset on startup.
- Saved means server-confirmed. Pending/error/retry states preserve the user's intent. Proposals use retry keys; retries do not duplicate records.
- HTML renders user input safely. No credential in URLs, shared state, events, logs or evidence. Validate membership, category, payload bounds and request origin at every mutation.
- /readme/ serves the complete current root README in server HTML. Root writing cannot promise planned features as existing.
- Explicit semantics for membership versus online connection; “joined” is not “online”. No fake live badge.
- All controls support keyboard; readable focus and errors; two marking viewports; small reduced-motion-compatible reveal. No mandatory drag interactions.
- Completed rooms reject participant joins and all planning mutations. Viewing, identity restoration and logging access may remain; they cannot change plan records.

## M0 / C8

Audit current saved-idea loop and writing. No requirement to add voting/realtime for C8. Preserve true cutoff state. Keep observed failures and test fixes distinguished from product defects.

## M1 / C9 live extension

Room membership, proposals and phase changes propagate without user refresh in about a second on a normal warmed connection. Measure other-context rendered state. Report cold-start and impaired-network limitations separately. Events notify; refetch current room state on connect/reconnect. Room revision prevents older responses overwriting newer state. Do not replace the whole page and erase draft/focus.

Every stream is authorised for its room. Events contain no voter mapping. Close/disconnect cleans heartbeat timers and subscriber references. Reconnect uses bounded retry; authoritative state corrects missed events even after server restart.

Record one behavioural ADR beyond transport mechanics. Human judgement about social pressure must not be presented as a proven benefit of anonymous totals.

## M2 / bounded decisions

All phase transitions use persisted expected phase/round/version and transactional compare-and-set. Stale requests fail safely; never reinterpret an old “next” request against the new round. Current members at voting start form the voting cohort; later join attempts receive a viewing-only explanation. Disconnected members are not silently removed from that cohort.

One confirmed vote per eligible participant per round/attempt. Public totals are visible, voter identities hidden; each participant sees their own confirmed choice. This is an interface promise, not anonymity from the server or from inference in a two-person room. No participant-option mapping in shared endpoints/SSE/logs.

Candidates freeze before vote; support/proposal edits cannot change an active ballot. Round close is idempotent. No winner with zero votes. Finite tie process: one revote on tied options, then one server-persisted draw if still tied. No reroll on reload or racing closes. Completed rooms are read-only.

## M3 / C10 instruments

Server logs committed actions once, rejected attempts distinctly, stable opaque room-scoped actor, UTC time, event, room, phase, outcome and revision. No names, titles, cookies, request bodies, raw tokens or vote-to-option mapping. Logs support telling who acted without revealing vote choice. A live flyctl log tail fulfils the viewing route; dashboard is optional.

## Evidence/workflow

Execute real checks and record results. Distinguish automated API checks, actual browser observations and production persistence. Preserve shipped course tests, real student writing, commit history and cutoff tags. Feature branch by default when main deploys. Facts in evidence-log/ADR can be recorded autonomously; student experiences cannot be invented. Use authoritative library/runtime docs for changing technical claims.
