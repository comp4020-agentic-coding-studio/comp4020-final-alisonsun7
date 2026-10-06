# C8 acceptance and test plan

This is an implementation input. Claude must create executable checks in the existing spec system. No test has been run merely because it is listed here. Keep the shipped checks unchanged and discover their exact invocation from the repo.

## Promise-to-evidence map

| ID | Promise | Evidence to produce |
| --- | --- | --- |
| DD01 | New visitor saves a useful idea | Independent browser flow: create → add → confirmed card → reload |
| DD02 | Shared state is on server | Browser B joins A's code and sees A's idea after loading/refreshed GET |
| DD03 | Return restores existing identity | Reload/reopen browser with saved credential; participant count unchanged, role and idea retained |
| DD04 | Durable storage | Close/reopen DB at same path, restart app; then verify deployed restart/redeploy with actual volume |
| DD05 | Roles guide rather than restrict | WHERE participant reads and submits EAT and DO; reject only invalid categories |
| DD06 | Balanced stable roles | Membership sizes 2,3,4,5,6,9,12: largest-minus-smallest role count ≤1; repeated draw returns same role |
| DD07 | Capacity and independent identities | Two equal nicknames have distinct IDs; 13th rejected; racing joins for final seat accept at most one |
| DD08 | Reliable mutation | Forced non-2xx/slow response leaves draft intact, reports pending/error; successful same-key retry adds one record |
| DD09 | Append preserves others | Two independently submitted proposals are both persisted; same-key different payload is rejected, not silently replaced |
| DD10 | Server validates membership | Credential A cannot submit in room B; spoofing participantId is insufficient; no credentials in board responses |
| DD11 | README is really published | Root file's full prose/headings/source links are present at /readme/ without client execution |
| DD12 | Legible interface | Both exact viewports, keyboard pass, reduced-motion reveal, empty states and errors |
| DD13 | Restart cannot reset state | Running migration/startup twice preserves existing room/member/proposal rows |
| DD14 | A pair can begin | With 1 member shared start unavailable but idea input available; 2 members can start; duplicate start doesn't reset |

## Minimal test tiers

1. Use real SQLite in isolated temporary files for capacity, balance, auth, proposal idempotency and restart checks. Do not only mock persistence. Avoid writing tests that assert SQL strings rather than behaviour.
2. Use the real HTTP app and two isolated browser contexts for creation, join, role, submission, refresh and return. Inspect actual stored results. Verify the failure UI by controlling responses/latency. Never use production records for destructive tests.
3. Keep the course GET / and README checks; add your new checks to pnpm check. If a separate e2e invocation is necessary, explain how CI runs it and don't claim it ran via check unless it did.
4. Deployed smoke test confirms mount configuration, then saves a distinctive test idea, restarts the machine or redeploys through the actual permitted workflow, and checks it remains. Local close/reopen is useful but not proof of a correct Fly volume.

## Independent-session manual walkthrough

A: regular browser. B: incognito or separate profile; two same-profile tabs share origin storage and are not independent identities.

- Start at /readme/; read the entire argument, follow app link.
- A creates Saturday Out as Wen. Copy code; record room and role without publishing credentials.
- A submits National Zoo in WHERE even before B joins. Confirm Saved.
- B joins as Alex. Reload A's board; both names and the saved idea exist.
- Start with 2. Each draws; repeat draw/reload; assignments stay the same.
- B submits Korean BBQ in EAT. A refreshes; sees it. A contributes Bowling to DO.
- Submit distinct ideas concurrently; both remain. Retry one submission with its same request key; no duplicate.
- Refresh and close/reopen A with retained browser data. Continue card leads to same participant, room, role and proposals.
- Inspect at 1920×1080 and 390×844, resize with an unsaved draft, navigate only by keyboard.
- Slow or fail one request. Pending is visible, false Saved is absent, draft remains, retry works.
- Restart/redeploy and repeat readback. Record URL, time, actual result and commit.

## Human questions, not automatic scores

Can a newcomer explain the three categories? Can they distinguish their role from a restriction? Do they recognise that their idea is saved but not decided? Do they find Continue without instructions? Ask a peer and record their actual words/actions only after the exercise.
