# ADR 016: Sounds answering sounds

## Status

Accepted, 2026-11-06. Wen approved developing the multiplayer proposal.
Implement its recommended V0, Option A. Shared walks and listening invitations
remain proposed extensions, rather than expanding this first release.

## Experience

Beside an ordinary contribution, choose **Reply with a sound**. The existing
sound library names the target and its author. Close it to walk elsewhere;
a small pending card keeps that target visible, with **Choose a sound** and
**Cancel reply**. An explicit placement leaves an ordinary sound at the
server-known position, linked to the original. Both people see the confirmed
answer. Anyone arriving later can discover and continue it.

**Conversation** opens a native relationship view: its parent, the selected
contribution and a page of direct answers. **View conversation** navigates to a
related node; **Face sound** turns towards a live sound without moving or
starting it. Visitors who choose Just look can read conversations; placing or
removing still requires entering with a name. Ordinary sound lights and the
nearby listening guide keep their existing roles.

The current reply target stays visible in the library. Closing does not cancel
it. A pending reply card temporarily replaces duplicate floating source actions
and the exploration panel, while the lights, movement and nearby chat remain.
Cancel or successful submission restores them. Informational toasts appear at
the top of the view with no pointer interception. No score, recording, forced
task, ownership, separate room or sound quota is introduced.

## Persistence and authority

- `sound_replies` adds one parent for a new ordinary placement. Many answers
  may share a parent. `sound_operations` records a user's submitted operation
  identity and request fingerprint. Both tables are additive; pre-existing
  sound rows are not rewritten. Placement, relation and operation commit in
  one SQLite transaction, then one event is broadcast.
- Every fresh request uses ADR 011's standing position, rate, spacing,
  crowding and capacity rules. A retried committed operation returns its
  original sound and no new event. A key used for different content returns
  operation_conflict. A retry after removal acknowledges removedAt and never
  creates a replacement.
- Removing either endpoint remains public removal from beside the sound.
  It does not delete its relation, remove its neighbour or restore audio.
  Snapshots include an answer's parent metadata after that parent is removed.
  A bounded public GET returns the selected node, its parent and up to 50
  direct answers, including removed metadata, with a stable next cursor.
- If the source is removed before a new reply commits, return reply_gone.
  Keep the choice visible and offer explicit **Leave without a reply**.
  Cancelling or changing context never silently submits an unlinked sound.
- Private-stay toilet/shower sounds can be neither parent nor answer; their
  occupants and transient behaviour stay outside public conversations.
- Network failure retains the operation key and target for explicit retry.
  Reconnection refreshes the public snapshot and never automatically publishes
  an unfinished reply. A page remembers observed removals, including snapshot
  differences, so a late original HTTP acknowledgement cannot revive a sound.
  Library errors belong to their original context; an old error cannot label
  a newly selected source as removed.

## Verification

Controlled SQLite and real HTTP/SSE tests cover attribution, concurrent branches,
same-operation retries, ordinary limits, source-removal races, private sounds,
pagination, restart recovery and unchanged old rows. The two-browser cooperative
suite exercises actual UI choices, movement, cancellation, network failure,
explicit retry, mobile late arrival and removed-source recovery. A separate
acknowledgement race test holds a real HTTP result after commit, removes the
sound in another browser, and releases the old acknowledgement, including when
the first page missed removal and recovered through a real reconnect snapshot.
Removing the tombstone guard makes that assertion fail.

See the evidence log for exact runs and limits. These checks establish shared
state and interaction; human listening and product observation still matter.
