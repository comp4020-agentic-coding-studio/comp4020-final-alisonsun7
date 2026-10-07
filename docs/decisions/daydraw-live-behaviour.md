# ADR — visible shared actions, recoverable state

Status: section A accepted at M1, [`46be37d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/46be37d) (following docs scaffolding at [`e01bb3f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/e01bb3f)). Section B remains proposed until M2 (voting isn't built yet). Preserve existing accepted ADRs; this file keeps its current name per the completion pack's own instruction rather than being renumbered.

## A. Live contributions and reconnection — accepted at M1

Accepted on the evidence below, all from commit `46be37d` (docs/evidence-log.md's M1 entry has the full command/test log):

- **Actual two-context measured update**: e2e/live.spec.ts's two independent browser contexts (separate cookie jars) — A's join/idea and B's join/idea each render on the other's already-open page, both directions, without either page reloading. spec/live.test.ts's HTTP-level LIVE01 covers the same at the protocol tier.
- **Disconnect while B appends, reconnect refetch**: e2e/live.spec.ts closes A's page, has B append an idea, then reopens A's page onto the same room and confirms the idea is there without any extra action (closing/reopening a page is a genuine disconnect — Chromium's `setOffline` emulation was tried first and found not to reliably sever an already-open EventSource within 5s in this environment, so it wasn't used for this claim). spec/live.test.ts's LIVE03 covers the same reconnect-catches-up property directly on the SSE stream (cancel, mutate, reconnect, see the mutation).
- **Stale response rejection**: src/client/live.ts's `isNewer` guard (spec/live-client.test.ts, unit) only ever applies a strictly newer revision; spec/live.test.ts's LIVE04 confirms revisions never regress across a burst of concurrent mutations on one open stream, and that connecting after several mutations already happened catches up directly to current state rather than replaying from zero.
- **Authorised stream tests**: spec/live.test.ts's LIVE06 confirms the stream never carries a credential/hash and that an unknown room code's stream answers 404 rather than opening onto nothing.
- **Draft preservation**: e2e/live.spec.ts confirms a typed, unsaved idea draft and its focus survive a remote update rendered while the form is in use (the live renderer only ever touches `#board`/`#participants-list`/`#stage-line`/`#start-block`, never the idea form).
- **Deployed observation**: not yet done — this slice has been verified locally (spec + e2e, both against the built `dist/` output) and against a real pre-M1 production-shaped database copy (40 rooms/90 participants/26 proposals, migrated twice for idempotency), but not against the actual Fly deployment. Flagged here rather than silently assumed; see docs/evidence-log.md's "What remains unverified" for this entry, and docs/daydraw-release.md before any real publish.

Costs actually observed, not just anticipated: the coalescing window (15ms) means a stream can receive one harmless duplicate snapshot at the same revision shortly after connecting if a mutation's own notify was still pending when the connection opened — observed directly while testing (see evidence log), and confirmed harmless by the revision guard, not something client code needs to special-case.

## A. Live contributions and reconnection — original proposal

Context: DayDraw calls contribution visible and work recoverable. Two friends append suggestions while either may briefly disconnect. The decision is what they see and what survives, not just the transport library.

Options:
1. Notify that someone acted; require a reload to see ideas.
2. Apply event deltas as the sole client state, trusting that no event was lost.
3. Display committed shared ideas immediately; events prompt versioned authoritative state refresh, including after reconnect.

Proposed choice: option 3. Registered joins, proposals and phase changes reach every authorised room session; unsaved drafts stay local. Offline people regain current saved state instead of an attempted replay of all intermediate UI events. Append-only proposals avoid different contributions overwriting each other.

Costs: extra snapshot reads and rendering work, possible bursts requiring coalescing, and explicit revision/order handling. People can see a contribution after it commits, not the author's typing. Connection status is observable, but a stream is not evidence of human attention. Distinguish membership from live presence.

Evidence before accepting: actual two-context measured update, disconnect while B appends, reconnect refetch, stale response rejection, authorised stream tests, draft preservation and deployed observation.

## B. Public totals, private labels and bounded closure

Options: publish named votes; hide all totals until close; show aggregate totals without public voter attribution. Proposed: the third, to make progress inspectable while limiting direct attribution. The server knows votes, and small-group inference remains possible. The social-pressure outcome is an unproven human judgement, not a measured fact.

Use fixed voting cohort and finite close rules: all voted, or explicit partial close after 60 seconds with at least one vote. Any eligible member can advance, avoiding creator dependency. This may close before a disconnected member responds, so label partial results. A persistent round identifier/version prevents double advance.

First tied result offers one tie-only revote; second tie draws once and persists the result. Alternative repeated revotes privilege time and can deadlock a pair. A deterministic earliest-proposal winner favours early input. A saved draw introduces chance only after voting fails to distinguish choices; it is visible in the plan.

Evidence before accepting: real ballots, public payload audit, vote/close race, stale-round rejection, bounded ties, partial deadline and completed-room immutability. Record any peer finding honestly, including lack of peer evaluation.
