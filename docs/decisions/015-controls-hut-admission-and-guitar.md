# ADR 015: Choose look direction, protect occupied huts, restore the guitarist

## Status and request

Accepted, 2026-11-06. Wen requested both mouse directions as settings, explained
at arrival; tests for toilets, showers, flushing and locked occupied doors;
and the missing guitar sound. Multiplayer gameplay was requested as a design
first, so `docs/proposals/cooperative-play.md` remains a proposal only.

## Decisions

1. **Explain the actual gesture.** Arrival offers Follow pointer (down looks
   down, left looks left, the default) and Drag the scene (both axes reversed).
   Controls changes it later; localStorage remembers only this browser's
   preference. The dialog releases held movement, traps focus natively and
   returns focus on close. Walking, sensitivity and pitch limits are unchanged.
   Arrival can scroll on short screens without losing its action buttons.
2. **Occupancy is authoritative.** The first accepted position inside a private
   hut claims it. In this one-process service the check and acceptance are
   synchronous. Another person's move receives `409 hut_taken` and a valid
   previous position or a position just outside the door. A stale or contested
   previous position is discarded, with its temporary sound ended, so a
   reconnect cannot revive a second occupant before the periodic sweep runs.
3. **Position commands stay ordered.** Only one client move request is in
   flight. Its response is fully handled before the next current position is
   sent; a five-second abort prevents a stuck request blocking later updates.
   A rejection clears held movement and returns to the server's position.
   A delayed rejection therefore cannot overwrite a newer accepted command.
4. **Joining sees the door's actual state.** A new SSE connection receives
   existing positions immediately. Red/green lights, shut doors and local
   collision still provide feedback. The HTTP check also handles simultaneous
   entrants and a client getting ahead of its stream. ADR 013's last-page
   disconnect, exit, inactivity and restart cleanup remain soft removals.
5. **Temporary sounds stay outside ordinary capacity.** ADR 013 already
   exempts them from ADR 011 room rules. A full permanent soundscape must not
   prevent flushing or showering; temporary sounds also do not consume ordinary
   slots, spacing or crowding allowances. No permanent quota is raised.
6. **Mateo is an explicit, local exception.** His animation and spatial guitar
   share a position. The voice plays within 18 m, using HRTF, distance falloff
   and indoor low-pass filtering. Sound off and hidden-page suspension apply.
   A selected nearby player guitar suppresses it to avoid doubling. It creates
   no contribution, light, quota usage or database row. Other NPCs remain silent;
   this does not restore a background bed or populate the shared soundscape.

## Verification

`e2e/look-controls.mjs` exercises arrival, persistence, Escape focus and real
camera direction on both axes. `e2e/huts.mjs` uses two browser identities,
actual keyboard collision, delayed server rejection, real flush/shower audio
sources and release to the next visitor. HTTP specs cover simultaneous entry,
new subscribers, multiple tabs, disconnect, actual 20-second inactivity and
the 150-sound limit. `spec/hut-admission.test.ts` controls time to reproduce
the exact expiry-before-sweep boundary while retaining the old database row.

`e2e/busker-sound.mjs` checks real source/output, distance, the sound switch and
player-guitar precedence. Its visibility check explicitly supplies the platform
event, then observes the real AudioContext; automated Chrome did not hide a tab
on tab selection. Technical audio checks are not human listening approval.
Desktop and phone screenshots must be viewed. See the evidence log for runs,
failures, local environment workarounds and limits.
