# DayDraw evidence log

A factual working record for writing the process overview. Not a replacement for commits, a student's reflection or executable checks. Keep secrets, participant credentials and private personal information out of it.

## Milestone record — copy for each real slice

- Date/time/timezone:
- Goal:
- Exact consequential prompt or link to the relevant prompt file/section:
- Inputs actually inspected:
- Decision made by Wen or agent; rationale and alternative:
- Files changed:
- Commands actually run, with exit/result:
- Browser/deployed observations (include URL and viewport):
- Failure or rejected attempt, if it occurred:
- Root cause and code/harness/test correction:
- Before/after evidence, if available:
- Real commit URL:
- What remains unverified:

## Slice 1 — deploy baseline (real app, not placeholder)

- Date/time/timezone: 2026-10-07, ~03:20–03:55 AEDT (Australia/Sydney)
- Goal: replace the busybox placeholder with a real server; `/` responds, `/readme/` serves the full root README with real headings and source links, built/deployed within the supplied Fly machine + volume constraints. No DB, join/room/roles work yet — that's the next slice.
- Exact consequential prompt: agent instruction to "establish the smallest working production path: / responds; /readme/ renders the FULL actual root README in server HTML, including source links" and to prefer existing dependencies or justify a small Node/TypeScript + SQLite stack in docs/decisions/001-stack.md.
- Inputs actually inspected: `package.json` (no runtime deps existed yet), `Dockerfile`/`fly.toml` (busybox placeholder; single machine, single volume at `/data`, PORT=8080), `tsconfig.json` (`noEmit`, bundler resolution), `.github/workflows/checks.yml` (exact CI build/run invocation), `mise.toml`/`mise.local.toml` (FLY_API_TOKEN present locally, value not read), `gh secret list` (confirmed the same secret exists on GitHub, value not read).
- Decision made by agent, confirmed by Wen's go-ahead to implement: plain `node:http` (no framework) + TypeScript compiled by `tsc`, `marked` for README rendering, SQLite deferred to the next slice. Rationale and the rejected alternative (`better-sqlite3`, Express) are in docs/decisions/001-stack.md.
- Files changed: `Dockerfile`, `package.json` (added `marked`, `build`/`start` scripts), `pnpm-lock.yaml`, `tsconfig.json` (added `src` to `include`), `tsconfig.build.json` (new), `src/server.ts` (new), `src/readme.ts` (new).
- Commands actually run, with exit/result:
  - `pnpm add marked` — added `marked@18.1.0`, exit 0.
  - `pnpm typecheck` — exit 0.
  - `pnpm build` (`tsc -p tsconfig.build.json`) — exit 0, emitted `dist/server.js`, `dist/readme.js`.
  - `PORT=8099 node dist/server.js` then `curl` — `GET / -> 200`, `GET /readme/ -> 200`, body inspected directly (not a screenshot): real heading structure and live `<a href="https://www.robinsloan.com/...">`/`<a href="https://www.nngroup.com/...">` links present.
  - `APP_URL=http://localhost:8099 pnpm check` — `2 passed (2)`, exit 0.
  - `docker build -t daydraw-app .` — exit 0, image 71 MB.
  - `docker run -d --init --name daydraw-test -p 8080:8080 -e PORT=8080 --tmpfs /data daydraw-app` (the same invocation CI uses) — container healthy; `curl` to `/` and `/readme/` both 200.
  - `APP_URL=http://localhost:8080 pnpm check` against that container — `2 passed (2)`, exit 0.
  - `pnpm check:evidence` — **failed**: "no reflection — each crit's cutoff reads its own: crit-8.md, crit-9.md, crit-10.md". Expected and unresolved here; `reflections/crit-8.md` is Wen's own writing, not fabricated by the agent.
  - `mise exec -- flyctl status -a comp4020-final-alisonsun7` — confirmed the app identity already exists (owner `comp4020-agentic-coding-studio`, hostname `comp4020-final-alisonsun7.fly.dev`), one machine, previously `stopped`.
  - `mise exec -- flyctl deploy --remote-only --ha=false -a comp4020-final-alisonsun7` — exit 0, rolling update of the existing machine, "Machine ... is now in a good state".
- Browser/deployed observations: `curl https://comp4020-final-alisonsun7.fly.dev/` → 200; `curl https://comp4020-final-alisonsun7.fly.dev/readme/` → 200, response body contains the full rendered README (grepped for `<h1>`/`<h2>` and the two source links directly in the HTTP response, not a screenshot). `APP_URL=https://comp4020-final-alisonsun7.fly.dev pnpm check` → `2 passed (2)`.
- Failure or rejected attempt: first `tsc -p tsconfig.build.json` run failed (`TS5096`/`TS5011`) because the base `tsconfig.json`'s `allowImportingTsExtensions` conflicts with actually emitting; fixed by disabling that flag and setting `rootDir`/`outDir` explicitly in `tsconfig.build.json`. Root cause: the base config's `.ts`-extension-import convention (for `noEmit` type-checking only) isn't valid once a config actually emits; the build config now uses plain `.js`-suffixed relative imports in `src/`, which both the bundler-mode type checker and the compiled output resolve correctly.
- Root cause and correction: see above; fix lives in `tsconfig.build.json` itself (commit below), not a separate test, since there's no existing spec for the build step — `pnpm check` only exercises the running app, which is why both the local-node and dockerized runs above were checked independently.
- Before/after evidence: before, `GET /` and `GET /readme/` were served by the busybox+sed placeholder (verbatim-escaped text, no real links, no headings structure); after, both routes are served by the real app with `marked`-rendered HTML.
- Real commit: [`a6db826`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/a6db82626b4a8c1ba406facd5fe75d339fa19c94) (engineering), preceded by [`d05a97f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/d05a97f) (committing scaffolding — CLAUDE.md/README.md/PROCESS.md/docs/ — that was already on disk uncommitted before this slice started). Neither is pushed to `origin` yet; the links above resolve once pushed.
- What remains unverified: no restart/redeploy readback test, because nothing is written to `/data` yet (no DB in this slice — that's next). `pnpm check:evidence` still fails pending `reflections/crit-8.md`. CI itself (`.github/workflows/checks.yml`) hasn't run, since the repository is still private and the `check`/`deploy` jobs are gated on `!github.event.repository.private`.

## Slice 2 — create room, save an idea, reload and find it

- Date/time/timezone: 2026-10-06 ~17:00 UTC (2026-10-07 early morning AEDT, Australia/Sydney)
- Goal: a single visitor creates a named room with a nickname, receives a server identity and code, submits a WHERE/EAT/DO idea with idle/Saving/Saved/error feedback, and finds it again after reload — before anyone else joins. Real SQLite, prepared queries, membership checks, an idempotency key so a retry can't duplicate, escaped user text, no credentials in shared responses.
- Exact consequential prompt: agent instruction to "Implement the first full DayDraw slice under CLAUDE.md: create a named room with nickname → receive server identity and code → submit a category/title idea → Saving/Saved/error → reload and find the saved idea," with an explicit idempotency-key requirement and isolated real-DB tests.
- Inputs actually inspected: docs/acceptance.md's DD01/DD08/DD09/DD10 rows and data-bounds section (title 1-60, nickname 1-30, idea title 1-120); a `node:sqlite` probe for exact transaction/constraint-violation error shape (`err.code === 'ERR_SQLITE_ERROR'`, message `UNIQUE constraint failed: <table>.<columns>`) before writing src/rooms.ts, rather than guessing the API.
- Decision made by agent: credential is a random secret, stored server-side only as its SHA-256 hash; membership check is (credential hash, room id) together, never a client-supplied participant id alone. Idempotency enforced at the DB layer via `UNIQUE(room_id, participant_id, request_key)`, with same-key/different-payload explicitly rejected (409) rather than silently replacing the row. Rationale and alternatives in docs/decisions/001-stack.md.
- Files changed: `src/db.ts`, `src/ids.ts`, `src/validation.ts`, `src/html.ts`, `src/rooms.ts`, `src/cookies.ts`, `src/body.ts`, `src/pages.ts`, `src/client/submit-state.ts`, `src/client/room.ts`, `src/server.ts` (routing), `src/readme.ts` (refactored to share `src/html.ts`'s page shell), `.gitignore` (`.data/`), `spec/session.ts`, `spec/rooms-db.test.ts`, `spec/proposal.test.ts`, `spec/submit-state.test.ts`.
- Commands actually run, with exit/result:
  - `node --input-type=module -e "..."` against `node:sqlite` directly — confirmed `BEGIN`/`COMMIT`/`ROLLBACK` work via `.exec()`, and the exact shape of a unique-constraint error, before writing the real code.
  - `pnpm typecheck` — failed twice first (`TS2339`: accessing `.requestKey` on a non-narrowed union in `src/client/room.ts`; `TS2352`: unsafe `as RoomRow` cast with insufficient overlap in `src/rooms.ts`), fixed by narrowing via an explicit status check and routing all `.get()`/`.all()` casts through a `asRow<T>(row: unknown): T` helper; exit 0 after.
  - `pnpm build` then manual `curl` walkthrough against `node dist/server.js` (not a screenshot): create room → 303 + two httpOnly `Set-Cookie`s; GET room page as creator shows the idea form; `POST .../proposals` → 201; reload (fresh GET, same cookies) → idea present in the HTML; same-key retry → 200 with the *same* proposal id as the first insert; same-key different payload → 409, board unchanged; new-key distinct idea → 201; empty title / bad category → 400, nothing saved; `<script>...</script> & friends` title and `<b>Wen</b>` nickname both come back HTML-escaped in the response, never as live markup; second room's credential posting into the first room's code → 401, nothing saved; anonymous (no-cookie) GET shows the board but no `id="idea-form"`.
  - `APP_URL=http://localhost:8099 pnpm check` — `19 passed (19)`, exit 0 (4 test files: course invariants, `rooms-db`, `proposal`, `submit-state`).
  - `docker build` + `docker run --tmpfs /data` (CI-equivalent) then `APP_URL=http://localhost:8080 pnpm check` — `19 passed (19)`, exit 0; `docker exec daydraw-test ls -la /data` showed `daydraw.db`, `daydraw.db-shm`, `daydraw.db-wal` actually under the mount.
  - `docker restart daydraw-test` then re-read the same room — **404, the idea was gone**. This is expected Docker behaviour (`--tmpfs` is remounted fresh on every container start, which is exactly why CI uses it for throwaway test data) and not a code defect; it is not evidence about Fly's real volume, so it's recorded here as a methodology note, not a DD04 result.
  - `flyctl deploy --remote-only --ha=false -a comp4020-final-alisonsun7` — exit 0.
  - Real deployed walkthrough: created room `M4RZNW` ("Fly Volume Proof" / Wen), submitted "Survives real redeploy", confirmed present via `curl`; ran `flyctl machine restart d89565db360758 -a comp4020-final-alisonsun7` against the actual machine/volume; re-`curl`'d the same room afterward — the idea was still there. `APP_URL=https://comp4020-final-alisonsun7.fly.dev pnpm check` — `19 passed (19)`.
  - `pnpm check:evidence` — still fails on the missing `reflections/crit-8.md`, as in slice 1; unchanged and expected.
- Browser/deployed observations: `https://comp4020-final-alisonsun7.fly.dev/rooms/M4RZNW` returns 200 and contains "Survives real redeploy" both before and after the real machine restart above.
- Failure or rejected attempt: the local Docker `--tmpfs` restart test above "failed" (data gone) by design, not by bug — recorded so it isn't mistaken later for a real volume-persistence result. Root cause: tmpfs mounts are ephemeral per container start; the course's own CI comment says as much ("a throwaway `/data` in place of the volume"). No code or test needed correcting; the correction here was methodological (switch to testing the real Fly volume instead).
- Before/after evidence: before this slice, `/rooms/*` didn't exist (every path 404 except `/` and `/readme/`); after, a visitor can create a room, save an idea and find it after reload, a real restart, and from a second independent cookie session that is correctly refused write access to someone else's room.
- Real commit: [`cd58cb5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/cd58cb53c8603631b451daf1c364c2ba57fea34b), preceded by `a6db826`/`d05a97f`/`4d058e4` (prior slices). Not yet pushed to `origin`; links resolve once pushed.
- What remains unverified: join/second-participant flow, role assignment and capacity limits (next slice — not implemented yet, so untested here); the "Saving…"/"Saved"/retry-preserves-draft UI was verified at the HTTP level (curl) and as a pure, directly-tested state machine (`spec/submit-state.test.ts`, imported unmodified by the real browser script), but not yet driven through an actual browser — no Playwright/browser-automation tool is installed in this repo, so that remains a manual/tier-2 check for the verify-and-refine slice. Two exact viewports, keyboard-only pass and reduced-motion have not been checked (no UI polish done yet, by design — CLAUDE.md says build the complete loop before visual polish).

## Slice 3 — join by code, capacity, balanced roles, start, Continue

- Date/time/timezone: 2026-10-06 ~17:40 UTC (2026-10-07 early morning AEDT, Australia/Sydney)
- Goal: extend the saved-idea slice with join by normalised code, up to 12 distinct server participants, persisted balanced responsibility cards, and a Recent room/Continue path — transactional capacity and role allocation, stable repeated draw, idempotent start, and the docs/acceptance.md behaviours (concurrent final-seat joins, concurrent proposal inserts, stable identity on reload, isolation across rooms).
- Exact consequential prompt: agent instruction to extend the slice with join/capacity/roles/start/Continue, explicitly requiring normal+incognito-style isolated contexts for distinct identities, transactional capacity/role allocation, optional starting, explicit Refresh (no realtime/Live claims), and durable migrations.
- Inputs actually inspected: docs/acceptance.md's DD06/DD07/DD14 rows and the "independent-session manual walkthrough" section; a direct `node:sqlite` probe confirming `INSERT ... SELECT ... WHERE (subquery count) < n` reports `changes: 0` when the condition fails (capacity gate) and that a conditional `UPDATE ... WHERE phase = 'collecting' AND (subquery count) >= 2` is a clean idempotent start, before writing src/rooms.ts — not assumed.
- Decision made by agent: role assignment and the capacity check are the *same* SQL statement (role pre-computed from a tally query, then one gated INSERT), relying on `node:sqlite`'s synchronous, single-threaded execution for atomicity rather than a database-level lock — documented and deliberately tested (see "two simultaneous joins" below) rather than assumed. Migration 002's column-add is guarded independently of the outer `_migrations` table (via `pragma_table_info`), specifically so a crash between adding the column and finishing the backfill doesn't permanently break the next boot. Rationale in docs/decisions/001-stack.md.
- Files changed: `src/roles.ts` (new), `src/db.ts` (migration 002 + backfill), `src/rooms.ts` (addParticipant/joinRoom/startRoom/tallyRoles/listParticipants, `createRoom` now a discriminated result), `src/pages.ts` (join form, Recent room, participants+roles, stage line, start control, shared-category label, inspiration examples, Refresh link), `src/server.ts` (`/join`, `/rooms/:code/start` routes, recent-room cookie re-authentication), `src/validation.ts` (`validateRoomCode`), `spec/session.ts` (`joinRoom`/`startRoom`/`homePage`), `spec/rooms-db.test.ts` and `spec/join.test.ts` (new).
- Commands actually run, with exit/result:
  - `node --input-type=module -e "..."` against `node:sqlite` directly — confirmed the gated-INSERT and gated-UPDATE patterns report `changes: 0` exactly when expected, before relying on them.
  - `pnpm typecheck` — passed after fixing the fallout of `createRoom`'s return type becoming a discriminated union (spec/rooms-db.test.ts needed a `mustCreate` helper).
  - `pnpm build` + `APP_URL=http://localhost:8099 pnpm check` — first run: 1 failure (`expected 2 to be 1` on a "Dumpling House"/"Korean BBQ" occurrence count). Root cause: the new per-category inspiration example text for EAT literally says "e.g. Korean BBQ, ...", which collided with an existing test fixture's idea title of the same name — a test-fixture naming collision, not a product bug. Fixed by renaming the fixture idea to "Dumpling House"; exit 0 after, 39/39 passed.
  - Manual `curl` walkthrough: created a room, joined a second nickname via `POST /join`, fetched the room page as the creator — confirmed by eye (not just assertions) that the participant list shows "Wen (you) — WHERE" / "Alex — EAT", the DO section is labelled "(shared — no one's assigned here yet)", the Start button appears only once 2 members exist, and inspiration examples render under each category without being mistaken for saved ideas.
  - `docker build` + `docker run --tmpfs /data` (CI-equivalent) then `APP_URL=http://localhost:8080 pnpm check` — 39/39 passed.
  - `flyctl deploy --remote-only --ha=false -a comp4020-final-alisonsun7` — exit 0, deployed over the **real, already-populated** production database from slices 1–2.
  - Read back the pre-existing slice-2 room `M4RZNW` (created before the `role` column existed) via `curl` after this deploy: its one participant, "Wen", now shows `role = EAT` — the real migration 002 backfill ran against real production data, not a synthetic fixture, and didn't drop the room, its proposal, or its participant.
  - `APP_URL=https://comp4020-final-alisonsun7.fly.dev pnpm check` — first run: 2 timeouts (`joining an unknown code or a full room...` and the final-seat race test), both from vitest's 5s default being too short for 11+ sequential real HTTPS round trips to fill a room to capacity over the actual internet (these same tests run in under a second locally/in Docker over loopback). Not a product defect — extended those two tests' timeouts to 20s; rerun: 39/39 passed against the live app.
- Browser/deployed observations: `https://comp4020-final-alisonsun7.fly.dev/rooms/M4RZNW` shows "Wen — EAT" in its participant list post-migration; a freshly created/joined/started room against the live URL shows the join, role-balance, and start behaviour identically to local/Docker.
- Failure or rejected attempt: (1) the "Korean BBQ"/"Dumpling House" fixture collision above — test-only fix, no product code changed. (2) the two network-timeout failures against the live app above — test-infrastructure-only fix (raised those two tests' timeout to 20000ms); the assertions themselves were not weakened.
- Before/after evidence: before this slice, only the room's creator could ever exist in a room and no room ever left "collecting"; after, up to 12 independent identities can join, get a persisted balanced role, see each other, and any pair can start — all demonstrated against both a fresh local DB and the real, previously-populated production database.
- Real commit: [`649cd90`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/649cd9080c3bcc3597aa7f4cf0c097dd49d49067), following `cd58cb5`/`3c57f2f` (slice 2) and `a6db826`/`4d058e4` (slice 1). Not yet pushed to `origin`; links resolve once pushed.
- What remains unverified: no browser-automation (Playwright etc.) pass yet — the "two independent browser contexts" requirement is covered here by independent `Session`/cookie-jar objects making real HTTP requests (genuinely independent credentials/identities, per docs/acceptance.md's definition), not by two actual rendered browser windows; that remains a manual/tier-2 check. Visual/viewport/keyboard/reduced-motion review is still pending (verify-and-refine slice, by design). `pnpm check:evidence` still fails on the missing `reflections/crit-8.md` — unchanged, Wen's writing.

## Observation rules

“Expected to pass” is not “passed”. Local DB close/reopen is not deployed redeploy proof. Two tabs sharing credentials are not two identities. A mock or seeded suggestion is not a visitor's saved contribution. A screenshot cannot establish that data survived a restart. A source summary is not evidence that Wen read it. Writing fields left blank are not complete submission evidence.

## Peer observation record — only after an actual session

- Consent to capture relevant feedback:
- Task given without explaining controls:
- What the peer did/said:
- Where they hesitated:
- Change justified by observation:
- Commit/evidence link:

Avoid naming peers unless needed and appropriate. Do not insert plausible feedback in advance.
