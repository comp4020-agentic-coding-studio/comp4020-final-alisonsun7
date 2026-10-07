# DayDraw staged execution prompts

Send one stage at a time, or explicitly authorise continuing through all engineering stages. Start from current code. Routine edits, real checks, evidence entries and local commits do not need repeated approval. Initial publication and production deployment follow actual authorisation/course workflow. Missing student notes do not block independent engineering.

## M0 — current state and C8 closeout

```text
Audit this existing DayDraw repo, not a new project. Read the master prompt, current harness and docs/daydraw-course-checklist.md. Verify remote/app identities, branch/status, HEAD/origin, current public/private visibility, cutoff tags, root README/PROCESS/reflections, actual scripts, CI and live routes. Existing P1–P4 reports are clues, not proof of current results.
Re-read C8 and Final. Its 7 October morning cutoff is historical now. Preserve old tags and actual timestamps; do not call new work submitted at that cutoff. Do not rerun P1 scaffolding.
Check the durable idea loop and full README HTML. If existing honest writing is complete, preserve it. If placeholders/missing reflection remain, list personal facts needed once and assemble only verifiable engineering evidence. Inspect check:evidence code and output; a missed placeholder is still incomplete writing.
Correct misleading README “Draw” wording if roles are automatic: “Receive a responsibility card when you join, then add suggestions to any of the three categories.” Verify multi-room identity recovery and appropriate membership/viewing policy from actual code. Don't inherit test counts blindly.
Record actual verified baseline in evidence-log and a concise gap list. If C8-only mode, stop here after preparing fixes. In full-project mode, create an appropriate feature branch and proceed to M1 when authorised by Wen's opening instruction. Do not flip repository visibility during this audit.
```

## M1 — minimum C9 realtime and one behaviour decision

```text
Continue existing DayDraw. Activate M1 in root CLAUDE.md by explicitly retiring C8's no-realtime restriction; preserve course harness/history. Read C9, product-spec, test-plan and proposed live-behaviour ADR.
Implement the smallest live shared-state slice: membership, proposals and room phase reach other authorised sessions without reload in about a second on a normal warmed connection. Prefer SSE with versioned server state for this one-server stack; justify alternatives if actual constraints differ. DB commit precedes notifications; connect/reconnect refetch authoritative state. Guard subscribe/snapshot races and stale responses. Preserve typed draft, focus and pending actions during remote updates. Implement truthful Live/Reconnecting feedback and clean timers/listeners on disconnect.
Use two isolated real browser contexts, reverse-direction updates and a measured timing result. Verify reconnect after another participant changes state, room access control and production restart reconnect where relevant. Add executable behaviour checks through actual runners. A five-second eventual assertion alone does not verify about-one-second realtime.
Record a multiplayer behaviour choice, not merely SSE versus WebSockets. If voting isn't built, accept ADR section A about append-only shared ideas and recoverable snapshots; section B on public tallies remains proposed until M2. Include alternatives and costs, grounded in README's argument.
Commit this verified slice and push to the appropriate feature branch. Prepare deployment and follow existing authorisation. Update only current verified claims in README, evidence and current PROCESS factual material. reflections/crit-9.md requires Wen's own notes. Finish with precise CI/live state and current gaps; don't block working realtime on unbuilt voting.
```

## M2 — complete DayDraw's bounded decision journey

```text
Continue from verified M1; activate voting rules in CLAUDE.md. Implement product-spec's minimal support/finalist/ballot/result workflow in smaller verified slices rather than one giant patch.
First implement idempotent desired-state supports and a frozen 2–4 candidate preview per category. At ≥2 members and ≥2 proposals per category, any member opens voting. Snapshot cohort/candidates and create WHERE round transactionally; versioned requests cannot open twice. No artificial proposals and no mandatory 12/all-ready gate.
Next implement one confirmed vote per member per round attempt, live aggregate totals, own selection, and vote changes with safe client request ordering. Shared state must not expose voter-option mappings. Freeze ballots, validate membership/candidate/round server-side, and reject old-round requests. Document multiple-tab server-arrival semantics rather than claiming hidden anonymity.
Then implement three category rounds, all-voted close or explicit partial close after server-side 60 seconds with ≥1 vote, one tie-only revote, then one stored server draw for a repeated tie. All close/vote/advance operations serialize and use expected phase/round/version. No stale request may skip a round; no reroll after reconnect. Label partial/drawn outcomes. Completion saves itinerary and rejects future planning writes/new joins.
Add behaviour checks for two-user completion, support sorting, freeze, vote changes, double transition, vote/close races, offline fallback, finite ties, immutability and migration from C8 data. Keep browser draft/focus and feedback honest. Preserve existing volume and backup correctly before migration.
Record choices/costs, accept only implemented ADR portions, commit meaningful slices and sync feature branch. Update root README only after actual full journey verification; use docs/writing/daydraw-readme-final.md as a candidate Wen must review, not as a claim already true. Prepare production verification under existing authorisation.
```

## M3 — C10 server logs, no mandatory dashboard

```text
Read C10 and docs/daydraw-logging.md. Activate M3 rules. Implement structured server-side logging for every meaningful user action with time, stable opaque room-scoped actor, event, room, phase, outcome and revision. Avoid names, proposal titles, credentials, request bodies, IPs and voter-to-option mappings. Successful commits and retries must be distinguished; rejected mutations are useful outcomes, not fabricated successes.
Instrument create/join/restore/role reveal as applicable, proposal/support, vote change, open/close/revote/draw/completion and reconnect observations that the server can actually detect. Do not log a client click the server never received. Keep request failures observable and logging overhead bounded for the supplied small machine.
Add logging schema/redaction/idempotency tests and verify actual deployed actions show up in a live flyctl log tail. Use terminal tail as default live view; no analytics dashboard, tracking SDK or paid service is needed. Provide exact command based on real configuration and a short instruments-only demo guide.
Keep logging permanent in the Final repo. Let Wen narrate multiple actors and progress using logs while peers operate the app, without exposing vote choices. A reconnect only proves stream connection, not resumed attention. Update factual PROCESS/evidence and request genuine crit-10 reflection notes. Commit and prepare release through the real workflow.
```

## M4 — resilience and human-readable polish

```text
Audit the entire DayDraw against test-plan and current README promises. Prioritise unfinished behaviour over new features. Verify normal + isolated browser full journey, simultaneous actions, slow/failing network, disconnect/reconnect, resize with draft, keyboard, reduced motion, exact 1920×1080/390×844 and persisted recent unfinished/completed rooms.
Resolve gaps with minimal fixes plus targeted regressions. Verify migration from old C8 state and an authorised actual Fly restart/redeploy readback. Log simulated time tests separately from a genuine next-day return observation. Check stale snapshots, lost acknowledgements, pending vote intent, cookie multi-room restore and completed-room write rejection.
Refine restrained paper/ink/category-card design within existing code. No dependency-heavy redesign, account system, chat, map or recommendation API. Add plain next-step explanations, explicit partial/draw outcome labels, accessible vote buttons and status messages.
Run appropriate checks for actual changes; connect browser checks to CI where viable rather than only claim they ran locally. Report real timings, test results, human-review gaps and production status. Revise rule/test if a repeated mistake was permitted by the harness. Preserve honest student writing and cutoff tags.
```

## M5 — factual writing assistance and Final preparation

```text
Read Wen's supplied personal notes, the actual git record and writing guides. Check rather than invent the product argument, process account, three reflections and COMP8020 research note. README concerns the app; PROCESS concerns our actual work; research note takes a field-level position from literature. Don't paste the same argument into all three.
Use real commit/compare links for factual process claims. Rewrite PROCESS as a current overview, retaining actual decisions; final guidance is 900–1100 words. Review README's 400–600-word candidate against actual implementation; label unproven social-pressure claims as judgement, not findings. Each reflection is based on Wen's real breakthrough and developer identity shift, about 150–300 English words.
Help locate/check research sources from primary papers/documentation/practitioner originals and request Wen's actual reading position. Final research-note guidance is 600–800 words. Do not invent citations, quote unseen sources or turn project evidence alone into a literature argument.
Run actual check and check:evidence; inspect manually for remaining scaffolding even if scripts pass. Prepare release facts and unresolved gaps. Do not automatically publish a candidly unfinished essay just to turn a check green. Routine engineering can continue while personal notes are pending.
```

## RELEASE — send only when you mean to deploy/publish

```text
I authorise releasing the verified DayDraw changes to this existing course Final repository and its existing Fly app. Read actual course preflight/ship instructions, verify repo/app identity and current public state, and scan full history for secrets without printing them. Do not proceed with a real secret in history. Do not delete data, remove volume, force push or move earlier cutoff tags.
If private, publish using the course ship workflow; if already public, keep it public and follow the normal verified merge/push/deploy path. Push/merge only the reviewed current milestone into the required branch. Confirm CI required checks and deploy status, then verify live /, full /readme/ and the applicable two-user journey at the actual URL. Observe persistence at the real volume, with a safe backup/restart procedure when relevant.
Verify truthful README/PROCESS/reflections and research-note for the applicable stage. Record actual commit, public repo URL, Fly URL, test/CI status and remaining limitations. A release after a passed cutoff is a later release, not retrospective submission credit. Stop with a precise blocker if real checks or publication rules prevent completion; don't silently weaken them.
```

## RESUME / CORRECT

```text
Resume this existing DayDraw feature branch. Read git status/log, current phase in CLAUDE.md, product-spec and evidence before editing. Preserve unrelated changes. Identify the next unverified acceptance behaviour and continue that slice; do not scaffold again or rerun all old work without cause.
```

```text
Observed failure: [action / actual result / expected result / screenshot or error]. Reproduce it; locate the violated promise; fix the smallest cause; add appropriate regression and harness correction; record observed results and commit. Do not replace the application or claim personal observations that weren't supplied.
```
