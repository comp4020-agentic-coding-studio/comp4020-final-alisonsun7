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
- **SQLite is not wired up yet** — this slice only needed `/` and `/readme/` to work. The next slice adds Room/Participant/Proposal tables; the plan (not yet implemented) is Node's built-in `node:sqlite` rather than `better-sqlite3`, specifically because it ships inside the Node binary itself and sidesteps the native-module-must-build-for-Docker risk named below. Confirmed locally: `node -e "require('node:sqlite').DatabaseSync"` resolves without a native-module/experimental-flag warning on the pinned Node 24.21.0.

Real implementation commit: [`a6db826`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/a6db82626b4a8c1ba406facd5fe75d339fa19c94) — adds `src/server.ts`, `src/readme.ts`, the multi-stage `Dockerfile`, `tsconfig.build.json`.

## Costs and constraints

A single SQLite writer and machine limit scaling and high availability — acceptable for a 2–12 person room. Later SSE is feasible on this same `node:http` server, but not implemented yet. The DB file, WAL and shared-memory files will need to live under `/data` (the actual persistent mount) once SQLite is wired up next slice — not yet verified, since no DB code exists yet. Migrations must preserve earlier ideas; no table-drop shortcut, once they exist.

## Evidence recorded

- Starter had zero runtime dependencies and a placeholder Dockerfile — confirmed by reading `package.json` and `Dockerfile` before choosing; see commit above.
- Build/test result on the selected runtime: `pnpm check` passed both locally (`node dist/server.js`, `APP_URL=http://localhost:8099`) and against the CI-equivalent container (`docker build` + `docker run --tmpfs /data`, `APP_URL=http://localhost:8080`) — see docs/evidence-log.md for exact commands and output.
- Deployed and reverified against the live URL: `https://comp4020-final-alisonsun7.fly.dev/` and `/readme/` both returned 200 from `curl`, and `pnpm check` passed with `APP_URL` pointed at that live URL — see docs/evidence-log.md.
- Volume-backed proof is **not yet available**: nothing is written to `/data` in this slice, so there is nothing to restart/redeploy and read back yet. That evidence belongs to the slice that adds SQLite.
- Remaining limit: `pnpm check:evidence` still fails (no `reflections/crit-8.md` yet) — that's Wen's writing, not part of this engineering slice.

ADR format reference: Michael Nygard, [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Its value here is keeping options and consequences visible; the proposed technical choice is our project judgement.
