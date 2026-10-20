# ADR 002: Who can see and change what

## Status

Accepted, 2026-10-21, for Crit 10. Builds on ADR 001, which decides what
happens when two people change the same square at once.

## Context

Crit 10 asks for one decision: what each person may see and change, checked
on the server, and written down with why. At the crit, two people from my
pod will use SoundGarden from its URL alone, in separate Chrome profiles,
while I explain what they did from the server log. So the app has to tell
them apart, and has to stop either of them from acting as the other.

First, what counts as a person here. SoundGarden has no accounts. A person
is **one browser that has joined with a nickname**. Joining sets a random
session token in an HttpOnly cookie, and the database stores only its
SHA-256 hash. Clear the cookie, or open a new Chrome profile, and you are a
new person. Two people can choose the same nickname and are still two
people, because the server identifies them by a random user id, not by name.

## Options considered

**A. Everyone who has joined can change everything (chosen).** Visitors who
haven't joined can look but not change anything. Everyone who has joined
can add, change or erase any note and switch the instrument.

**B. Owners only.** A note can be changed or erased only by the person who
placed it.

**C. Open to anyone, no join.** Anyone with the URL can change the garden
without choosing a name.

## Decision

Option A.

| Who | Can see | Can change | Checked by |
| --- | --- | --- | --- |
| A visitor who hasn't joined | The grid, the instrument and how many people are creating, through `/` and `/preview`. Never nicknames or the activity list. | Nothing. Every write and `/events` returns 401. | `userFromRequest` in `src/server.ts`, before every route below `/join` |
| Someone who has joined | Everything above, plus every nickname and the activity list, through `/events` | Any note, including other people's, and the shared instrument | The same session check; the acting user comes from the cookie |
| Anyone, joined or not | — | Act as someone else. A `userId` or `nickname` in the request body is ignored. | Identity comes only from the cookie |
| Each person, on their own | Their own playback: Play, Stop and where the timeline playhead is | Only their own loop. Playback and seeking happen in that browser and are never sent to the server. | Nothing to check: no route accepts playback |

Why:

- **"Music belongs to everyone."** The README's point is one shared grid
  that anyone can change. B would turn it into 36 private squares, so a
  newcomer couldn't change anything already there, and that is most of the
  grid. ADR 001 already rejected owners-only for the same reason.
- **"Every contribution leaves a trace."** C would let changes arrive with
  no name attached, so the log couldn't say who did what. A costs a
  stranger one step, typing a name, and in return every change in the log
  and the activity list has a name and a user id.
- **Why visitors see the grid but not names.** A stranger should see what is
  in the garden before deciding to take part. But nicknames are chosen by
  people who have joined, for the people they are making music with. So the
  preview carries the music and the crowd count only.
- **Why playback stays personal.** Pressing Play, Stop or dragging the
  timeline changes what one person hears, not the shared garden. If one
  person could start or seek everyone else's playback, a single listener
  could take over every speaker in the room.

## Consequences

- Anyone who has joined can erase anyone else's notes. That is deliberate,
  and the README says so under "Deliberate limits". It is visible, not
  silent: the activity list and the server log both name who did it.
- Because the app is open by design, the crit's question "can one person
  alter what belongs to another?" has a deliberate answer: notes don't
  belong to anyone. What does belong to a person, their identity and their
  playback, can't be changed by anyone else.
- The session cookie is `SameSite=Lax`, so another site can't make a
  visitor's browser post a change with their cookie.
- Every change is one log line naming the user id and nickname, such as
  `note_placed user=usr_… nickname=Alice row=2 col=3 note=E4`. Joining,
  connecting and disconnecting are logged too. Playback and seeking are
  not, because they never reach the server.
- Nicknames are visible to everyone who has joined, and every change is
  stored with the user who made it. The README warns people not to use
  anything private as a nickname.

## How it is checked

`spec/identity.test.ts`: changes without a session and with a forged token
are refused (401); the garden stream without a session is refused (401); a
user id in the request body can't make a change look like someone else's;
two people with the same nickname are two users; the cookie is HttpOnly and
carries no user id.

`spec/welcome.test.ts`: the preview stream needs no session, carries no
nicknames or activity, and doesn't count the watcher as a person creating.
