# ADR 038 — A link-access Site for the real shared world

Date: 2026-11-08

Status: Published; read-only hosted browser inspection passed.

## Request and authority

After observing the old SoundGarden at the course Fly URL, the author asks to
publish a Site to test with a friend. The author then explicitly selects access
for anyone holding the link, rather than email invitations. This authorizes this
publication and its existing Fly backend update. It does not authorize a course
`main` push, a database reset, a new paid application or an email invitation.
The no-deployment boundary of ADR037 describes the earlier local delivery;
this new request supersedes it for this test publication only.

## Decision

Keep the verified Node/SQLite/SSE application on the existing single Fly machine.
Use a separate Sites Worker as the same-origin, streaming entrance:

https://little-chorus-playtest-20261108.crazylife5.chatgpt.site

Sites runs a Worker `fetch` entry point; it does not directly host this program's
`node:http` listener, synchronous `node:sqlite` file and process-local broadcast
maps. Replacing them with D1 plus a coordination layer would be a new backend
project, with unnecessary identity, persistence and ordering risk for this test.
A static scene would lose the actual shared experience. Neither was chosen.

The gateway forwards only enumerated application routes to one fixed HTTPS
origin. It forwards only the application `soac_session` cookie, never Sites
cookies, authorization or platform identity headers. Returned app cookies stay
host-only, Secure and HttpOnly. It streams responses without parsing or buffering
SSE, preserves real Range/conditional status and the frog content revision, and
does not retry mutations. Same-origin writes are checked. There is no new email
login and no email address in its source. Sixteen isolated gateway checks pass.

Both URLs use the same backend world. A first visit on the new domain requires
a new nickname/character selection: a cookie cannot silently move across domains.
Existing domain identities remain intact. Same-cookie tabs still represent one
person. Public access is explicit; no privacy claim is made about either origin.

## Actual release and data boundary

The backend source is `051919702514877d892f6f79ecf0f60d39a024c5`; remote Docker
build and Fly smoke checks pass. The deployed immutable image is
`registry.fly.io/comp4020-final-alisonsun7@sha256:b32c23416dfd3647764c577895868daba4f1a2c3d8340d9d0ba6b6f394851214`.
The original Sydney machine, 256 MB allocation and mounted `data` volume remain.

Before publication the volume has `daydraw.db` and `garden.db`, but no
`sound-of-a-city.db`. All four tables in each old database retain their exact
row counts and logical content hashes after publication (332 and 515 total rows
respectively). The new application creates its separately named database. The
author's 48 local sound-history rows and local session cookies are not uploaded.
This is a new hosted Little Chorus world, not a clone of the local preview.

A volume snapshot is created at 13:37:41 UTC, with Fly's returned five-day
retention. It is a disaster-recovery precaution, not the normal code rollback.
Read-only HTTP checks confirm Little Chorus, the Mateo module, reviewed README
and the exact replacement frog SHA256 on the deployed Fly origin.

Sites source `9f09fb6583a700fb0a75cb6f15d9c5a4f1757b2c` is saved as version 1.
Native publication `appgdep_6af07cc14d3c8191a013e1bc1d1e71c2` succeeds at
13:44:44 UTC. Its access policy is public, revision 2; no viewer is invited.
The official source helper initially rejects an archive located at the checkout
root; moving it outside the checkout fixes that packaging step. An expired
short-lived source credential is renewed without recreating the Site.

## Verification scope and rollback

The application retains its previously recorded 419-check candidate result;
publication does not reclassify that as a new production test run. Public browser
inspection must use anonymous observation and block non-GET/HEAD requests. No
writing test is directed at either public or the author's local database. A
Python client receives Cloudflare 1010 before the gateway; that client failure
does not prove whether a real browser can play. Subsequent real Chrome/Metal
inspection passes 29 checks at 1920×1080 and 390×844. Two independent anonymous
contexts see the same room and real SSE snapshots/moves/15-second heartbeats;
the actual canvas advances with nonzero geometry. The invitation, quiet entry,
phone layout and Mateo visit work, with zero write attempts, page/console errors
or failed runtime assets. These observers do not prove two-player creation or
audible output. Native publication success and human-playtest success remain
separate claims. Artistic listening, unfamiliar-pair discovery and next-day
return remain unperformed. See [scoped evidence](../evidence/sites-playtest-2026-11-08.json).

A separate transport-local integration then passes nine checks against a real
Node server and fresh SQLite file on guarded port 18954. The unchanged Worker
maps its fixed Fly origin only to that scratch server. Two independent app
cookies create a real cross-author water/bird habitat, receive the same works,
retry without duplicates and recover identity/work on reconnect. Its database
contains exactly two test users, two sources and one reply. The scratch server
is stopped. This is not a cloud-writing or human test. All 74 compiled JS modules
match a clean compilation of the released application source. A final native
Chrome public GET verifies the frog's exact 92,104 bytes and SHA256 through Sites,
without starting playback or an AudioContext. The first restricted scratch
launch fails with EPERM before requests; the approved scoped launch passes.

For a code rollback, deploy the saved preceding image
`registry.fly.io/comp4020-final-alisonsun7:deployment-01M5D6WZG6NEYR4DZ747C383H2`
to the same machine/volume with `--ha=false --update-only`. Retain every current
database, including the new Little Chorus database. Restoring an old volume or
database is not a visual rollback. Gateway versions are independently saved in
Sites. The course `main` branch is unchanged; a later course submission must
explicitly reconcile its source with this separate tested publication.
