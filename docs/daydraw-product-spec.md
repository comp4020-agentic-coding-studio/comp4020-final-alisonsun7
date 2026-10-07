# DayDraw complete product specification

Status: proposed extension scope. Validate against current code and preserve accepted choices. Do not implement all stages during a C8-only task. The rules below settle product decisions; they are not additional course requirements.

## Product argument

Friends should share the initial thinking and see a decision become a plan without an organiser carrying every step. Small and clear: 2–12 members, WHERE/EAT/DO, quick responsibility cards, shared ideas, a bounded ballot, one saved itinerary. No accounts, chat, map, venue search, recommendations, budget optimiser or general event platform.

## Journey and phases

| Phase | Work allowed | Advance rule |
| --- | --- | --- |
| collecting | join, reveal role, add ideas in any category | Any member starts at ≥2 members; single member can already add ideas |
| planning | proposals and support toggles, all-category board | Any member opens voting once all categories have ≥2 different proposal records |
| voting | change own vote for current WHERE/EAT/DO round | Close after all eligible have voted, or bounded partial fallback below |
| revote | same cohort votes only tied options once | Same close rules; second tie triggers persisted draw |
| completed | view itinerary and return | No further planning writes or joins |

Treat role reveal as a presentation state and shortlist as part of planning, not extra global phases. Adapt current C8 phase names by migration if required, without erasing records. Always display current stage and next condition.

## Membership and roles

Keep persistent server-issued cookie identity; extend actual recovery mechanism, not replace it. One browser can retain credentials for its recent rooms without overwriting another room. Duplicate join with existing valid credential restores the member. Register transactionally with capacity and least-populated category selection. Tie among role counts may use server randomness. Existing assigned role never changes, including old-record migration.

Joining is allowed until voting opens. At that instant snapshot eligible participant IDs as the cohort. Later visitors with room code can see the result/board under actual viewing policy but cannot acquire ballot rights mid-round. Say why. Presence/disconnection is separate from eligibility. There is no dependency on creator remaining online.

## Ideas and shortlist

Inspiration text is not a saved proposal. Existing title bounds remain unless justified; trim and validate. Allow any member to append an idea in any category; no idea deletes/edits in this minimal version. Preserve proposal retry keys and distinct concurrent inserts. Optional identical-looking ideas are shown with their authors; do not silently merge them as one person's contribution.

Each member may support multiple proposals, at most once per proposal. Use idempotent desired state (supported=true/false), not an ambiguous toggle request that retries can reverse. Support totals can update live. Treat supports as an initial indication, not a final vote.

When voting opens, transactionally freeze 2–4 candidates per category. If 2–4 ideas exist, use all. If more than 4, use the four with most supports, with ascending creation timestamp then immutable ID to resolve equal support counts. Display this rule before opening the ballot. It privileges earlier suggestions when support ties; document that cost. Keep excluded proposals visible as non-finalists. No manual curator UI or separate shortlist phase is needed. At least 2 candidates each; never prefill fake answers to bypass this gate. Two members can supply two ideas for each category themselves.

Any participant can open voting after seeing the frozen-preview rule. Ready indicators are optional/advisory; not a new requirement that all 12 seats or all online members agree before any progress. Open request sends expected phase and revision. Server snapshots candidate IDs and cohort in one transaction and creates exactly one WHERE round.

## Voting and closing

Three categories in order: WHERE → EAT → DO. Visible round label and totals, plain clickable buttons with selected state; dragging is optional and never required. API includes current round/attempt/version. One active choice per cohort member per round attempt, unique(roundId, attempt, participantId); validate proposal is a candidate. Server confirms choice and publishes aggregate snapshot. Shared state does not disclose who chose which option.

Close is available to any eligible member when all cohort members have confirmed votes. For an offline member fallback, persist openedAt and allow a clearly labelled “Close with N missing votes” after 60 seconds and at least one vote. Require a separate explicit confirmation of partial closure. The deadline is evaluated from server time on request, not a client timer or a background process that must stay running. Voting changes do not reset it. This prevents an abandoned tab indefinitely blocking a pair while acknowledging partial results may not reflect everyone. This trade-off must appear in the ADR and UI. Members may still vote until close commits.

Close serialises with vote writes and reads a consistent tally. A vote racing close either commits before the result or is rejected as closed; never displays Saved after rejection. Do not claim fairness or consensus beyond the actual tally. Close response includes the authoritative outcome. Retries/parallel close with stale phase/round/version return already-applied outcome or a conflict, never advance twice.

If one candidate leads, persist result and advance exactly to the next category. If tied, create one revote attempt containing only tied leaders, reset attempt votes and openedAt, retaining the same cohort. If that attempt ties again, draw one of those tied leaders on the server, store the selected proposal and resolution method inside the closing transaction, and advance. Reconnecting or simultaneous close cannot reroll. Zero votes never yields a winner; show that at least one person must vote. The plan marks “chosen by draw” when used.

## Completion and return

After DO resolution, atomically save three result references and completedAt; room becomes completed. Show room title, three choices, tie/partial indicators, and saved state. No fabricated map/travel schedule. Original proposals and results persist. Disallow every planning mutation and new joins after completion; existing-member restoration remains possible.

Home lists current server-validated recent room(s): unfinished phase or completed summary with Continue/View our day. Identity loss has a truthful explanation; joining with code creates a new participant only before voting, never claims to recover an old identity. Do not store authoritative plan in browser storage. Same-day simulated elapsed time tests do not establish a real next-day observation; distinguish them in evidence.

## Live state and failure handling

Prefer SSE with room state snapshots/notifications for the current one-server architecture, unless actual repo constraints justify another transport. On successful mutation commit increment durable room revision, then notify. On initial connection and reconnection fetch authoritative state. Reject response revisions older than rendered state. Ensure subscribe/snapshot ordering cannot miss a mutation between them; one option is register stream then send a fresh versioned snapshot and follow notifications. Coalesce fetches under bursts.

Preserve inputs, focus, own pending intent and confirmed state separately while rendering remote updates. Render Live only with current connection; disconnect displays Reconnecting. A disconnected client cannot confirm an unsaved mutation by appearance. Vote requests from one client are serialised/coalesced so an old slow request cannot override a newer intended choice; document server-arrival semantics for multiple tabs of one identity. Guard stale-round and stale-phase responses.

## Storage additions and constraints

Extend current schema through numbered migrations; exact names follow existing conventions. Add room revision/completedAt, supports, frozen candidate records, voting cohort, rounds/attempts, votes and persisted results only as needed. Constraints include unique support, unique vote, candidate/room relationship and role enum. Do not create a second parallel store. Use transactions for capacity, shortlist freeze, ballots, close/draw and completion. Verify backing up SQLite consistently, migrations against a C8-shaped DB and production volume retention before release.
