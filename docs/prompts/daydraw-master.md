# DayDraw continuation — master prompt

You are continuing Wen Sun's existing COMP8020 DayDraw in the course Final repo. Use Chinese progress reports, English interface and technical docs. Read this instruction and docs/daydraw-agent-rules.md, product-spec, test-plan and course-checklist. Start with M0 in docs/prompts/daydraw-stages.md.

## Existing work is a checkpoint, not a scaffold to replace

Expected remote: comp4020-agentic-coding-studio/comp4020-final-alisonsun7; expected Fly app: comp4020-final-alisonsun7. Verify actual identity without printing secrets. Never touch comp4020-final-dachi, a riff repo or the Crit 7 printer project.

Prior reports describe a Node/TypeScript/node:http/node:sqlite/marked app with saved rooms/ideas, hashed server credentials in HttpOnly cookies, persistent roles, capacity, start, recent rooms, migrations and browser tests. Verify real current state and preserve working code, data and student writing. Do not assume the reported 39+8 test counts or hashes remain current.

Read existing CLAUDE.md, README.md, PROCESS.md, reflections, spec/README.md, actual scripts, CI, Dockerfile, fly.toml, accepted ADRs and evidence log. Read current C8/C9/C10/Final pages linked in course-checklist. If access fails, state that and use the provided summary without claiming a fresh read.

## Goal and staged execution

C8-only goal: durable useful contribution plus truthful writing and real submission state. Full project goal: 2–12 friends can join, see shared ideas live, decide one WHERE/EAT/DO itinerary, reconnect and return to it. The default first turn audits M0 and, if C8 is complete, implements only M1. Execute later stages when Wen sends their prompt or explicitly asks for all remaining stages.

Continue necessary implementation, tests, documentation of facts and local commits autonomously. Do not stop after an empty plan or ask approval for each ordinary file. Report scope disagreements; resolve routine details yourself. If personal writing inputs are missing, request them in one bundle while progressing independent engineering.

When activating M1/M2/M3, merge corresponding rules into root CLAUDE.md and explicitly retire the old C8 prohibitions for that phase. Do not delete the course harness or rewrite honest prior reflection. Keep future functionality labelled planned until actually verified. Root README remains the current product argument, not the aspirational final candidate.

## Work structure

Each vertical slice: inspect → smallest implementation → behaviour checks → actual UI/production evidence where relevant → truthful evidence entry → real milestone commit. Update progress succinctly as you work. Add regression checks for failures that invalidate a promise. Do not broaden/repeat testing without new changes or unresolved risk.

Default extension work goes on a feature branch because main in a public course repo may deploy automatically. Inspect CI before push; push verified commits to an appropriate remote branch under the user's existing sync authorisation. Do not force-push or rewrite historical cutoff tags. Merging to deploy or initial publication requires a concrete instruction unless already authorised in this session; prepare the result first, then surface exactly what action remains.

Do not destroy/reseed /data, remove a volume, replace the repo, add a hosted DB or scale to several machines. Before schema changes, use a verified backup procedure supported by the selected SQLite/runtime; do not copy a live WAL database carelessly. Keep credentials outside code/logs/evidence. Follow installed course preflight/ship instructions rather than inventing skill commands.

## Required reports

Distinguish actual observations from inherited reports and proposed tests. State files, behaviour, real test results, commit/push/CI/live states, material limitations and next action. An SSE endpoint existing is not proof of realtime; a mocked event is not two-user proof; local DB restart is not Fly redeploy evidence; a green check is not proof that personal writing is complete.

The completion pack provides writing candidates, not completed student claims. Preserve Wen's voice and factual notes. Do not invent reading, peer feedback, breakthroughs, missing commits or research results. Do not run a fake public ship or claim present work met a past cutoff.
