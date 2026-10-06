# Your harness


# DayDraw agent rules

Merge these rules with the existing course harness; retain course instructions and preserve shipped tests. Read docs/crit8-brief.md and docs/acceptance.md before implementation. This file governs C8 work; future requirements are not current promises.

## Purpose and scope

DayDraw helps 2–12 friends contribute options for a shared outing, organised into WHERE, EAT and DO. This week's core interaction is a saved suggestion in a shared room. Build that complete loop before visual polish. Use English UI and explain progress to Wen in Chinese.

Do not implement SSE/WebSockets, shortlist, voting, readiness coordination, telemetry, AI recommendations, external venue APIs, accounts, chat or final Reveal for C8. Do not show a working vote button, a Live badge, fabricated participants or seeded proposals. Explain briefly that this version collects ideas and that another session refreshes to see changes.

## Product invariants

- A room contains at most 12 registered participants. Two participants suffice to start; do not require all seats to fill. The creator can already save a suggestion alone, before inviting anyone, so a stranger can leave a trace immediately.
- Room code, nickname and a browser credential are enough. Nickname is display text, never identity or authentication.
- Roles allocate responsibility, not visibility or permission. Every joined participant sees all three categories and may contribute to any of them.
- Role assignment is server-side, persisted, balanced, and idempotent. Repeated draw never rerolls. Starting twice never resets a room.
- Show current stage and the next action. Later stages are visibly unavailable, not deceptive controls.
- Treat DB state as authoritative. Browser storage only remembers a room and participant credential, never the sole proposal record.
- Refresh, server restart and ordinary redeployment must preserve rooms, participants, roles and proposals. Never delete or reseed a production database on startup.
- Render the complete root README at /readme/ in server-delivered HTML, with its headings and source links. Keep a visible navigation link and a route back to the app.
- Only show Saved after server confirmation. Every mutation has pending, success and failure feedback. Preserve the typed suggestion on failure.
- A retried proposal request uses the same client request key. New intentions use a new key. Concurrent distinct proposals must both survive.

## Engineering constraints

Inspect the actual template before selecting libraries. Prefer the shortest maintained stack compatible with the supplied runtime. Keep the course Fly app identity, URL, volume configuration and single-machine constraint. Put SQLite at the existing persistent mount, not in the image or working directory. Honour the declared host/port and health checks. Use migrations that preserve rows. Do not scale SQLite across machines.

Use relational records for Room, Participant and Proposal, prepared SQL, foreign keys, server validation and transactions for capacity/assignment/state changes. Client-supplied room or participant IDs do not establish membership. A credential for room A cannot mutate room B. Escape user content in HTML. Do not leak participant credentials in shared state, URLs, logs, snapshots or committed evidence.

Do not overwrite unrelated user work, existing course skills or the harness. Preserve shipped spec assertions. Add product checks through the existing check entrypoint; do not skip or weaken tests to make CI green. If a build/test cannot be run, report it as unverified.

## Interface quality

Warm paper, dark ink and three distinct category accents; readable, restrained card imagery. Use actual labelled forms and buttons. Full keyboard operation, visible focus, readable errors and text labels beside icons. Test at 1920×1080 and 390×844. No clipped form controls, horizontal overflow or layout shifts that erase a draft. Card reveal stays under 800ms, supports reduced motion, and never gates submitting an idea.

## Work and evidence

Work in vertical slices: deploy baseline; save one idea; add join/roles/return; verify and refine. Commit actual milestones after verification; do not fabricate a development history or squash it into one dump. Log concise prompts, observed failures, corrections and real command results in docs/evidence-log.md. When a failure reveals a violated promise, fix the rule/test as well as the code. Record the test's failure and successful rerun when available.


Deployment can use the supplied private Fly app during work. Keep credentials outside git and logs. Before publishing, follow the installed course preflight/ship instructions, inspect the full history for secrets, and report blockers precisely. Do not invent course skill names or claim that building locally ships the prototype. External publication follows Wen's concrete deployment instruction and the actual installed workflow.
