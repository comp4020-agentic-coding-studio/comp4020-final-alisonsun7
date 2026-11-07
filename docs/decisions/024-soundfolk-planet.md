# 024 — Soundfolk and a little world made together

2026-11-07. Wen requested a new version with a stronger identity, a small
planet-like world, more places to do things with friends, first- and
third-person views, and visible restroom checks. Keep the existing coastal
version available and reversible. The product is now named **Soundfolk**:

> A little world, made together through sound.

Sound and people remain the centre. A reading corner and a lively gathering
can coexist; an automatic whole-world mood preset would remove that choice.

## Two deliberate editions

The new route is `/planet`, with scene id `planet`. The existing
`/scene/seaside?mode=weekday` route remains the coastal edition. They use the
same cookie identity and database, but each scene has its own ordinary shared
room (`morning`) and its own coordinate system. Never copy, move, reset or
reinterpret a coastal contribution as a planet contribution. Weather, time and
sound replies stay within their scene. Mood filters and camera views never
create additional rooms.

This deliberately supersedes the single-scene restriction in ADRs 007, 012 and
018 for the explicitly requested second version. It does not change durable
sound ownership, removal, operation keys, private-stay rules, chat privacy or
the existing server authority. The database filename, account configuration,
README, PROCESS and personal reflections retain their existing identity.

Home, navigation and Explore make the little world prominent while clearly
linking the coast. The new route must not strand old bookmarks or erase what
people already made. Rollback changes application files while retaining the
current database; it never restores an old database snapshot.

## Eight small places, and a way around

| Place | What it invites |
| --- | --- |
| Listening Green | Meet, listen to the existing mix and leave a first sound. |
| Jam Stage | Answer music with rhythm, and watch nearby residents respond. |
| Reading Nook | Make a quieter corner with gentle sound ingredients. |
| Tea House | Gather around conversation, cups and a friend's sound reply. |
| Rain Conservatory | Explore soft water, breeze and rainstick textures. |
| Tide Pools | Combine shore and animal sounds in a small coastal corner. |
| Lantern Workshop | Meet by warm objects and leave a sound for another visitor. |
| Restrooms | Use doors, flushing and showers with authoritative occupancy. |
| Other-side Lookout | Walk around the globe, cross its coordinate seam and meet again. |

These are invitations into the existing sound mechanics, not fabricated
multiplayer activities or claims that every prop has a new shared state.
Sound placement and replies are explicit and persistent. A purely local prop
gesture must not be described as something all friends changed together.
Resident behaviour must come from actual active public sound sources, with
the same deterministic choice on each visitor's page. NPCs remain distinct
from real joined people and never inflate their count.

## One frame around the world

Retain warm paper, sea sage, timber and the three sound-family colours. Use
the existing system fonts and original geometry rather than introducing
another UI style or remote font dependency. The UI/UX skill's automatic
whole-system results suggested dark entertainment styling and then generic
community purple; neither matched this established world. Its targeted touch
spacing and focus guidance informs the implementation instead.

Keep the first invitation small: the current place and real people count,
one **Share a sound** action, and first-/third-person and listening controls.
The existing library keeps private Listen separate from explicit placement.
Places, friends, visit-scoped activity, weather, help and restroom checks live
in a native drawer. Native dialogs retain their keyboard focus and return it
to the control that opened them. Phone controls keep 44 px targets and wrap
their labels; the world retains room to be seen.

The native arrival card asks for a nickname and cat/dog choice, explains who
sees the name, and offers both remembered pointer directions. A person may
look around before joining. First-person view supports close listening;
third-person view makes the visitor's own character visible. Neither changes
the person's room, shared contributions or sound setting.

## Acceptance and rollback

Review the actual planet, its arrival card, both camera views and the narrow
phone controls. Use two real joined identities for placement, reply, chat,
late arrival and resident response. Verify that the coast's existing sounds
are unchanged and do not appear at planet coordinates. An occupancy check
must report real admission and door state; it must not claim a scripted label
is proof of a locked room. Keep public contribution tests separate from
private-stay sounds, and leave test data through normal soft-removal.

Record build, screenshot and test evidence after implementation. Keep the
pre-change Git version and a separate candidate build. No push or deployment
is part of this local development pass.
