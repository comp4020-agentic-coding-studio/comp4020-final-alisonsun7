# ADR 027 — Neighbours within reach

Date: 2026-11-07. Status: implemented; verified and promoted locally on 2026-11-08.

## Request and observed problem

Wen reports a fresh browser unable to hear a nearby sound, inaccessible chat and private rooms, weak contribution lighting and shared changes, a missing busy café, and a large undismissible nearby/work card.

Developer self-test on an isolated snapshot of the current preview confirmed that a visitor could physically walk inside a restroom while no Flush/Run shower action appeared in the scene. The existing authoritative backend had not been removed: its actions and chat were buried inside Places & friends. The owner's door also swung open from too far inside the small room. These are discoverability and scene-feedback failures rather than grounds to replace occupancy or migrate data.

An actual WebAudio destination probe, using the real engine, trusted user activation and an in-memory source (no database writes), measured Reading Nook bells at four metres at -62.78 dBFS RMS despite a running context. This demonstrates excessive attenuation; it does not establish Nick's browser/hardware state. The first deterministic near-field check failed against the previous engine. A fresh document also defaults to Sound off; a saved welcome dismissal must not imply audio is running.

## Decision

- Retain explicit local listening. Show Sound off / Audio paused honestly and offer a direct user-activated listening/resume action. Raise the near field using the same listening boundaries, role gains, eight-voice limit and output protection. Remote contributions never unmute a listener.
- Put nearby Talk and context-sensitive private-room entry, Flush, Run shower and exit in the world. Keep real cookie identity, twelve-metre ephemeral chat, server occupancy, private stay tokens and NPC reservations. Add projected five-second speech bubbles; never store chat text.
- Make both work and individual-source panels dismissible and explicitly reopenable. Remote updates must not undo a dismissal. Fold the explanation behind What changed?, preserving authors and the main action.
- Rebuild the existing tea anchor as Tide & Coffee, an open-front café with tables, counter and varied clearly marked NPC regulars. Keep its ID, coordinates and all historical source locations. Steam, a spinning record and warm tables follow real nearby public contributions. No example people or NPC sounds count as human contributions.
- Give each contribution a small layered paper/glass marker and ground ripple. Give real cross-author works a much larger spatial silhouette: canopy/birds/water, rhythmic floor flower/garland, or hanging lantern fan/light pattern. These project canonical accepted works, including removal and reduced motion; they add no mutable shared store.

## Tradeoffs and alternatives

A louder world is not an autoplay exemption: silent visits remain silent, and individual source positions remain different from the venue's sculpture anchor. The café reuses the sound library and resident response system rather than opening a fourth independent work database. Room controls use actual walking through the front door; they do not bypass admission. Broader geometry makes shared changes legible but requires real phone sightline and GPU review; visual or auditory appeal cannot be inferred from test counts.

## Verification boundary

Focused local checks cover audio gain/lifecycle/headroom, source filtering and removal, real geometry, chat/private-room UI and dismiss/reopen persistence. Actual browser output, independent-identity chat/locked-room paths, desktop/phone screenshots and data-preserving candidate promotion are recorded separately in the evidence log and `docs/evidence/neighbours-2026-11-08.json`. No unfamiliar-pair playtest, next-day return or artistic listening acceptance is claimed.
