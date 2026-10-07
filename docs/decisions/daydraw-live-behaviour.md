# ADR — visible shared actions, recoverable state

Status: proposed. Preserve existing accepted ADRs; give this a suitable numbered filename on adoption. Accept section A at M1 only after implementation; section B at M2. Link actual commits and actual observations, not a predicted result.

## A. Live contributions and reconnection

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
