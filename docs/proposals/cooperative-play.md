# Cooperative play in Sound of a City

Status: **Option A accepted for V0; Options B and C remain proposed**.
Wen approved development on 2026-11-06. Sound replies are recorded in
[ADR 016](../decisions/016-sounds-answering-sounds.md). This document preserves
the alternatives; it does not imply that walks or invitations are implemented.

## Intent and existing contracts

Make being here with another person change what people make and discover. Keep
the place leisurely: no score, ranking, required quest, completion reward or
scheduled reset. Someone arriving alone should still have a worthwhile visit.

This proposal builds on the root `CLAUDE.md` and ADRs 011–014. There is one
public seaside world, one Sunny Day, and the same database room named `morning`.
All ordinary sounds remain public contributions: anyone can remove one while
standing beside it. No activity owns, locks, reserves, clears or restores a
sound. Existing placement, reach, crowding, rate and persistence rules apply.
Nothing here records a soundscape or restores the retired three-minute memory
system. People hear the current world through the existing spatial player.

The sound library remains the place to preview and choose an approved recording.
Private previews never become public sounds without an explicit placement.
No new recordings or automatic background sounds are proposed.

## Option A: Sounds answering sounds — recommended V0

### Experience

A contribution can answer another contribution. The answer might complement,
contrast with or continue what someone left; the product never judges whether
the combination is correct. This adds a visible relationship to the existing
act of leaving a sound, rather than assigning people a task.

Example, with two people:

1. Ada leaves Bird sounds beside the creek, using the existing library.
2. Bo walks to the sound, hears it and chooses **Reply with a sound** on its
   nearby label. The library says **Replying to Bird sounds, left by Ada**.
3. Bo previews Trickling stream, chooses where to stand and explicitly leaves
   it. Ordinary placement validation still decides whether it fits there.
4. Both pages show **Bo answered Ada's Bird sounds with Trickling stream**.
   Each of the two sound labels can open their small conversation. Ada can
   walk to Bo's contribution and answer again; they can also simply listen.

The reply target stays visible while the library is open. Closing or cancelling
does not place anything. If Bo wants to walk elsewhere before answering, the
existing library closes first; a small cancellable **Replying to …** indicator
keeps the intent clear. Browsing, selecting and facing a source do not move Bo.
For the smallest implementation, Bo can also answer immediately from beside
Ada's source and reopen the library after moving when crowding requires it.

### Durable result and late arrivals

The result is a relation between two ordinary `placed_sounds` records, not a
second sound copy. A new sound may have one parent; many people may answer the
same parent. This naturally permits branches instead of forcing one winner.
The relation and its creator survive a reload or restart.

Tomorrow, Chen discovers the live pair and can follow its labels, listen at
their locations and add a third response. There is no requirement that Ada or
Bo remain connected. The UI describes authorship without awarding ownership.
If an endpoint has been removed, the relation says **This contribution has been
removed**. The remaining contribution keeps playing normally. There is no
playback, hidden restoration or global mixing of a historical conversation.

### Real-time and failure boundaries

- The server validates and commits the reply relation with the new ordinary
  placement, then broadcasts the confirmed result. The UI shows pending state
  and prevents a duplicate submit while waiting; it does not claim success
  before the server answers. An operation id makes a retried request safe.
- Two people answering the same source are both valid, subject to the existing
  space rules. No last-write-wins replacement is needed: each makes a new row.
- If the source was removed before the request commits, keep the library open
  with **That sound has been removed. Leave without a reply, or choose another**.
  Do not silently place an unlinked sound. Once both records are committed,
  removing either follows the normal public removal rule.
- An offline client can browse cached information and keep its unsubmitted
  choice locally. It cannot publish a reply offline or silently submit one
  after reconnecting; the person retries from their current server-known
  position. Reconnect uses the authoritative snapshot to recover missed links.
- Only the person leaving a new sound chooses its reply target. Existing
  contributions are never reassigned, moved or relabelled as someone's answer.
  Links are factual attribution, not permission to control either sound.
- A private-stay toilet or shower sound cannot be a public reply target or an
  answer. Its occupant and its short lifetime are outside this public feature.
- Removing a sound can interrupt a conversation; that is visible and permitted
  under ADR 011. This proposal does not add protection, a hold or a new quota.
  Link spam remains bounded by the existing sound-placement limits; replies do
  not bypass `too_close`, `crowded`, `place_full` or `slow_down`.

### V0 boundary

Add one explicit reply action, a visible target with Cancel, one parent reference
on a new ordinary sound, and a compact list of live/removed related sounds.
Keep the current sound library, spatial audio, attribution and removal controls.
No new free-text notes, invitations, synchronised playback, route editing,
conversation ranking or sound ownership. A sound is still meaningful without
any relationship, and a person can always leave one normally.

The server representation could be a nullable parent id or a small relation
table; decide during implementation after reviewing migrations. This document
does not prescribe a migration or modify old rows.

## Option B: A listening walk, made together

### Experience

People assemble a short public walk through contributions they actually visit.
The route is an invitation to notice a place, not a checklist to finish.

Ada visits the creek and starts **A walk from here** at an ordinary sound. Bo
sees the open walk, visits a café sound and adds **Next stop here**. Ada adds a
last stop at the pier. The pair can walk it together, or leave it for the next
visitor. Three stops are an example, not a completion requirement.

A small **Shared walks** tab can sit beside ADR 014's existing nearby guide;
the nearby guide keeps its present meaning. Following a stop gives its distance
and a **Face stop** action, without teleportation, forced movement or remotely
starting its audio. Stop numbers appear only while someone chooses to follow.

### Durable result, real-time feedback and late arrivals

A walk stores an ordered list of coordinates and ordinary sound references,
with explicit contributor attribution. It stores neither audio nor anyone's
movement history. Contributions appear in the collaborators' panels when the
server confirms them. A late arrival opens the same list and can choose any
stop, without waiting for the original makers or joining a separate room.

Publication saves an immutable edition. Later additions make a visibly new
edition, so publishing never overwrites another edition. Browsing an older
edition still reads the current state of its referenced sounds.

### Failure and destructive-edit boundaries

- If a referenced sound is removed, keep the stop and label it unavailable.
  Visitors can still walk to its location; do not recreate or substitute it.
- A removed private-stay sound must never leak into a walk: those sounds cannot
  be nominated in the first place.
- For a first version, allow append and explicit withdrawal of one's own draft
  stop, with no silent reordering or deletion of someone else's work. A draft
  revision protects publication: if someone appends while another person is
  publishing, show the updated route for review before publication.
- Draft/publication state must be distinct from connection state. An offline
  person cannot publish or append; a disconnected author does not lock the
  draft. Existing published editions stay readable after a server restart.
- The route's authorship governs its metadata only. It never reserves land,
  changes the permission to remove its sounds or excludes outsiders from them.
- Route-specific spam limits, draft retirement and edition governance need a
  separate decision before implementation. They must not become new sound
  quotas or cause existing world contributions to be deleted.

This is a stronger discovery artifact than Option A, but requires more metadata,
revision handling and public-list governance. Prefer it after the basic reply
loop has demonstrated that people want to curate what others will encounter.

## Option C: Listen here together

### Experience

Beside an ordinary sound, Ada chooses **Listen here with me**. Bo, already in
the existing nearby conversation range, sees an optional invitation, walks over
and accepts. Both get a small shared cue saying who is listening there. Each
can tap **I hear it** and then discuss the place using the existing ephemeral
talk. They may choose to leave a reply as their shared result.

The invitation is a request to meet, not automatic movement, forced audio,
exclusive access or a globally broadcast notification. Respect each person's
sound switch. Do not claim sample-accurate synchronisation: the ordinary
spatial player and its individual offsets remain in use.

### Result, late arrivals and failure boundaries

The gathering itself is in memory only, like positions and talk. Someone who
arrives nearby while it is open can accept; they join the same public place,
not an instanced group. A decline is private and creates no public rejection.
Walking away, cancelling or losing presence ends a person's participation;
a disconnect or restart cannot leave a ghost host or a reserved spot.
Removing the sound closes its invitation with a visible explanation.

The only durable result is an ordinary sound reply if someone explicitly
chooses to leave one under Option A. No attendance log, heard-receipt archive,
saved chat or automatic record of who gathered is added. This makes sense as a
later social affordance, but alone it does not satisfy the next-day persistence
goal as directly as A or B.

## Recommendation and decision

Start with **Option A, Sounds answering sounds**, as V0. It gives two people a
clear act to do together, reuses the strongest existing interaction, and leaves
a small, understandable public trace for the next visitor. Option B can later
curate these contributions into walks; Option C can later help strangers begin
the encounter. Do not implement all three at once.

Wen accepted this recommendation: the first cooperative feature helps people
make the soundscape together (A). Walk curation and nearby invitations remain
possible later steps.

## What would establish that V0 works

These are proposed acceptance observations, not test results:

- With two independent browser identities, a sound placed as a reply appears
  with correct attribution for both people, and remains after reload/restart.
- An ordinary sound without a parent is unchanged. Existing placement and
  public removal rules continue to pass; a reply bypasses none of them.
- Two simultaneous answers both survive, and a retried submit makes one sound.
- Removing a source while the library is open produces a recoverable inline
  message; removing it after commit preserves its answer and a removed marker.
- A late visitor can find the conversation and add a response without its
  original makers being online. Reconnection recovers any missed relation.
- Private-stay sounds and their occupants cannot appear in a public reply.
- Keyboard and phone users can choose and cancel a reply, read its target and
  recover from an error. Controls have text labels and visible focus; errors
  appear beside the action and are announced. Motion is optional.
- Two people listen and explain whether answering another contribution feels
  like making the place together. Automated audio state cannot establish that.

UX check: the `ui-ux-pro-max` error-feedback guidance supports inline errors,
an explicit recovery action and an accessible announcement. It does not choose
the gameplay or override the existing world rules.
