# ADR 001 — one server and durable SQLite

Status: accepted (2026-10-07, Australia/Sydney).

## Context

C8 needs a working contribution/return loop quickly. The product is a small bounded group, and the course supplies a Fly app with a machine and persistent volume. Browser-only storage cannot carry the shared board. We need a stack that preserves the course check/deploy path and leaves room for later real-time updates.

## Options

1. Continue the existing template's viable runtime, adding a small server and SQLite where necessary.
2. Small Node/TypeScript server, server-rendered HTML and minimal browser JavaScript, SQLite on the supplied volume.
3. A full SPA plus a separate API and externally hosted relational database.

## Actual choice

Option 2: the supplied starter had no runtime dependencies at all (only `typescript`/`vitest`/`jsdom` for the harness) and a busybox placeholder Dockerfile, so option 1 ("continue the existing viable runtime") wasn't available — there was no app runtime to continue. The stack now is:

- **Node 24.21.0** (already pinned in `mise.toml`), plain **`node:http`**, no web framework. The route surface this week is a handful of paths, so a hand-rolled router avoids an extra maintained dependency to track and secret-scan, and `node:http` supports SSE directly for C9 without a framework swap.
- **TypeScript**, compiled ahead of time with `tsc` (`tsconfig.build.json`) to `dist/`, run with plain `node dist/server.js` — no `ts-node`/`tsx` in the runtime image, keeping the 256 MB machine's process small.
- **`marked`** (one small, maintained dependency) to render the full `README.md` to real HTML at `/readme/`, preserving headings and turning its citation links into real `<a>` elements — a hand-written renderer risked mangling link/list syntax, and the Dockerfile's old sed-based approach only escaped text, it didn't render links as navigable markup.
- **SQLite via Node's built-in `node:sqlite`** (`src/db.ts`), not `better-sqlite3` — it ships inside the Node binary itself, so it sidesteps the native-module-must-build-for-Docker risk named below entirely. Confirmed locally before choosing: `node -e "require('node:sqlite').DatabaseSync"` resolves without a native-module/experimental-flag warning on the pinned Node 24.21.0, and the same image now runs it in production.
- DB path is `DB_PATH` env var, defaulting to `/data/daydraw.db` when `NODE_ENV=production` (set in the Dockerfile's runtime stage) and `./.data/dev.db` otherwise (`.gitignored`) — one real mount in production, a separate throwaway file locally, never the same path.
- Migrations: a small versioned list in `src/db.ts`, each guarded by a `_migrations` table so re-running them on every boot is a no-op once applied — satisfies "no table-drop shortcut" and "restart cannot reset state" without a migration framework dependency.
- Idempotency key: `UNIQUE(room_id, participant_id, request_key)` at the DB layer, not just an application check — a retry with the same key and the same payload replays the existing row (200), the same key with a different payload is rejected (409, not silently overwritten), and a fresh key always inserts. Verified directly against SQLite's actual constraint-violation error shape (see evidence below) rather than assumed.
- Credential: a random server-issued secret (`src/ids.ts`), stored only as its SHA-256 hash in `participants.credential_hash`; the raw value lives in an httpOnly cookie, never in a URL, log or JSON response. Membership is checked as (credential hash, room id) together, so a credential valid in room A resolves to no row when checked against room B — a client can't spoof membership by supplying a participant id alone.

Real implementation commits: [`a6db826`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/a6db82626b4a8c1ba406facd5fe75d339fa19c94) (slice 1: server + Dockerfile) and [`cd58cb5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/cd58cb53c8603631b451daf1c364c2ba57fea34b) (slice 2: `src/db.ts`, `src/rooms.ts`, `src/cookies.ts`, `src/validation.ts`, `src/pages.ts`, `src/client/`, `spec/rooms-db.test.ts`/`spec/proposal.test.ts`/`spec/submit-state.test.ts`).

## Costs and constraints

A single SQLite writer and machine limit scaling and high availability — acceptable for a 2–12 person room. Later SSE is feasible on this same `node:http` server, but not implemented yet. The DB file, WAL and shared-memory files live under `/data` in production, confirmed by `docker exec`/the real deploy (see evidence). No role/join logic yet, so `participants` has no `role` column; adding one later is an additive `ALTER TABLE`, not a rewrite.

## Evidence recorded

- Starter had zero runtime dependencies and a placeholder Dockerfile — confirmed by reading `package.json` and `Dockerfile` before choosing; see slice-1 commit above.
- Build/test result on the selected runtime: `pnpm check` (19 tests) passed locally, against the CI-equivalent container (`docker build` + `docker run --tmpfs /data`), and against the live deployed app — see docs/evidence-log.md for exact commands.
- `docker exec daydraw-test ls -la /data` showed `daydraw.db`, `daydraw.db-shm` and `daydraw.db-wal` under the mount, confirming the DB actually lives at the persistent path, not the image or working directory.
- Volume-backed restart proof: created a real room+idea on the deployed app, ran `flyctl machine restart` on the real machine (not a local tmpfs test — those are deliberately wiped on restart, which is why CI uses one), and read the same idea back afterward. Local tmpfs restart was tried first and correctly lost data, which is expected Docker `--tmpfs` behaviour and not evidence about Fly's real volume — the real-machine test is the one that counts.
- Remaining limit: `pnpm check:evidence` still fails (no `reflections/crit-8.md` yet) — that's Wen's writing, not part of this engineering slice.

ADR format reference: Michael Nygard, [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Its value here is keeping options and consequences visible; the proposed technical choice is our project judgement.
