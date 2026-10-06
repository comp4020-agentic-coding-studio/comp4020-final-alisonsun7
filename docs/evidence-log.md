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
