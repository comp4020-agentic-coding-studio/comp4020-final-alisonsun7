# DayDraw behaviour test plan

A plan is not executable evidence. Extend the existing spec and Playwright system. Preserve C8 tests and course checks; inspect their current count instead of copying 39/8 into a report. Isolate test records from human rooms, and avoid exhausting the production volume with unbounded fixtures.

## C8 checkpoint

Reuse actual coverage for create/join, capacity, server identity, role balance, cross-category contribution, retry keys, escaped input, migrations, restart and return. Inspect multi-room credential recovery, duplicate joins, transaction boundaries and complete README rendering if not previously observed. Do not replay all three test environments for unchanged work merely to accumulate green counts.

## Extension cases

| ID | Claim | Meaningful check |
| --- | --- | --- |
| LIVE01 | Real two-user state | A joins/adds; B renders it without reload; reverse direction works |
| LIVE02 | About-one-second update | Measure receipt/render from other-context action acknowledgement on warmed normal connection; report distribution and environment, no silent wide timeout |
| LIVE03 | Reconnect aligns | A disconnects, B appends, A reconnects sees latest phase/proposals without manual refresh |
| LIVE04 | Snapshot ordering | Change during subscribe/refetch and delayed old response cannot lose or revert committed revision |
| LIVE05 | Lifecycle | Repeated reconnect/page close leaves no stale subscribers/timers; existing draft/focus survives remote update |
| LIVE06 | Room access | Stream/state for B cannot be read with only A's credential under chosen access policy; no credential/vote mapping in output |
| PLAN01 | Finalists freeze | 2,3,4,>4 options; support sorting/creation tie rule; nonfinalists visible; writes after freeze rejected |
| PLAN02 | Two can finish | Independent contexts each add required choices, open, vote WHERE/EAT/DO and view same itinerary |
| PLAN03 | One confirmed vote | Change choice updates aggregate and own choice; retries cannot inflate tally; public payload has no voter-option mapping |
| PLAN04 | Stale operations | Delayed vote from old round and old advance request cannot affect new round/skip stages |
| PLAN05 | Concurrency | Two different votes, changed vote, double open/close and vote-vs-close preserve constraints and one result |
| PLAN06 | Cohort/presence | Late join ballot rights denied; disconnect doesn't remove eligibility; creator closure doesn't block another member |
| PLAN07 | Partial fallback | Before 60s blocked; after 60s + ≥1 vote + confirmation allows close; zero votes cannot close; result labelled partial |
| PLAN08 | Finite tie | First tie creates exactly one revote; second tie draws once; all sessions/reload/restart see identical stored result |
| PLAN09 | Immutability | Completed plan rejects every planning endpoint, supports, vote/advance and new join; restore/read still works |
| PLAN10 | Server authority | Another room's proposal is not a legal candidate; participantId spoof fails; vote/phase value invalid rejected |
| PLAN11 | Intent/latency | Delayed first vote request cannot override newer intended selection within client; slow/failing save remains honest |
| STORE01 | Forward migration | Existing C8 rows/roles survive every migration and restart; backup/restore process tested in isolation |
| STORE02 | Production durability | One distinctive test room/plan survives authorised restart/redeploy at actual volume path |
| LOG01 | Server action events | Actor/time/event/room/outcome present; committed retries don't duplicate action success; rejected actions distinct |
| LOG02 | Log privacy | Captured logs/events contain no secret, nickname, proposal text or voter-choice mapping |
| LOG03 | Live instruments | Actual tail sees actions on deployed app, including two different opaque actors, failures and phase changes |
| UX01 | Basic access | Exact desktop/mobile, keyboard, labels, visible focus, error announcements and reduced motion |
| UX02 | Return/resize | Unsaved draft survives remote refresh and resize; recent room server-validates identity; completed summary restored |

## Timing and test design

Use a monotonic clock in the browser test environment for local durations; measure end-to-end action/render and separately commit-to-render where possible. Course timing is about one second, not a licence to hide a five-second steady state under a large assertion timeout. Longer timeouts for Fly cold start can be separate setup bounds. Slow/offline cases assess recovery, not impossible network speed.

Use real SQLite transactions and independent connections where testing DB race protection, not only Promise.all around one synchronous function. HTTP concurrent requests and isolated browser contexts add application evidence. Plain Node single-thread claims alone do not cover extra connections, async gaps or future refactors.

For persisted random draw, test eligibility and stored invariance, not a particular randomly selected option. Clock-controlled partial-close tests belong to local fixtures; never globally change production time. Mocks can induce an HTTP failure, but successful persistence must read actual DB/server state.

## Human judgement

A peer task can reveal whether roles feel welcoming, tally visibility pressures people, or the partial-close confirmation is understandable. Record actual observation, not a predicted response. If no peer was available, write that. Automated checks cannot prove reduced social pressure, enjoyable cards or usefulness to friends.

## Final ten-minute walkthrough

/readme/ → create A → join B in another context → see live join → add two ideas in each category → see live changes → open candidates → vote and change one choice → close each round → force a tie to exercise finite resolution in a separate fixture → reveal → disconnect/reconnect with B changing state → reopen recent room → resize/keyboard/slow save. Verify production persistence separately without deleting real data.
