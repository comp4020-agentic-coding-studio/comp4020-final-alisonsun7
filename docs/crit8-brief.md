# DayDraw C8 frozen product brief

## Course grounding

Sources checked on 7 October 2026, Australia/Sydney:
- https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/
- https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/
- https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/
- https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/studio-crit-model/

C8 needs Fly proof of life, a visitor's durable trace, a sourced initial definition of good at README and /readme/, a public continuing repo, process evidence and the C8 reflection. Explain your direction and corrections. Real-time and polish may wait. Follow the actual course template and installed shipping workflow.

## Our response

Audience: friends planning one outing, including a pair testing the app. Desired outcome this week: a real suggestion remains accessible to the group after leaving and returning. This is a first part of DayDraw, not a completed decision tool.

Core design: make participation lightweight, contribution visible and shared work recoverable. The card provides a prompt for responsibility without confining anyone to one category. Invitation is by short code, with no email or account creation.

## Screens and actions

Home: DAYDRAW; “Plan a day together.”; “Split the thinking. Share the ideas.”; “Designed for groups of up to 12. Start with 2.” Create form takes room title and nickname. Join form takes code and nickname. Explain WHERE / EAT / DO in one line. Add a conspicuous Read our approach link to /readme/.

Recent room: show name, nickname, saved phase and Continue. Fetch authoritative state before displaying restored data. If stored identity is unavailable, explain that clearing browser storage loses automatic identity recovery, and offer joining by code. No silent duplicate participants or redirect loop.

Room: title, copyable code, joined count, participant names, and a simple Draw → Ideas → Vote later → Reveal later indicator. Registered membership is not online presence: “2 joined” must not imply both are currently connected. Manual Refresh board reads DB state; no fake live UI.

Starting: room with 2–12 participants can start, with any member able to do so. One visitor can still contribute before starting. This separates an optional shared start from the compulsory persistence proof. Suggestion form never waits for someone else's card animation.

Card: WHERE / EAT / DO, one-sentence responsibility, quick reveal. Persist assignment on creation/join or first draw, choose the least-populated category transactionally, break equal counts randomly, and never change an assigned role. Different join times still keep category counts within one. For 2 members, explain that the unassigned mission is open to both. For 12: 4/4/4; 5: 2/2/1 up to category order.

Ideas board: every member sees WHERE, EAT and DO. Highlight own responsibility, allow selecting any category. Inspiration chips are examples, not saved suggestions. Fields: category and title; no description field needed. Each proposal shows title, category and author nickname. Keep empty states and explicit next action.

Submission: idle → Saving… → Saved, or actionable error. Preserve a failed draft and retry key. Use actual HTTP/DB confirmation, not a timer. Reload reads real data. Another session can refresh to see the same shared board.

## Data and request semantics

Smallest useful tables:
- Room: id, unique normalised code, title, phase (collecting/planning), createdAt.
- Participant: id, roomId, nickname, credentialHash, role, createdAt.
- Proposal: id, roomId, participantId, category, title, requestKey, createdAt; unique(roomId, participantId, requestKey).

Use immutable IDs. Same nickname does not merge participants. Credential is random and server-issued; save a browser reference privately, validate membership server-side. Secure cookie is an alternative if it fits the template; describe the actual choice. A same-origin browser/profile shares identity across tabs: test independent identities using normal + incognito, separate profiles or two Playwright contexts, not just two tabs.

Validate room title 1–60, nickname 1–30 and idea title 1–120 characters after trimming; category is an enum. Proposed bounds are product decisions, not course requirements. Return clear errors for invalid code, full room, invalid input and unavailable storage. Reserve the 12th seat transactionally. No data-reset seed on startup. No whole-board overwrite for proposal append.

## Scope boundary

C8 ends at saved contributions and return. No voting/shortlist/reveal, realtime transport, dashboard, chat, accounts, venue search, map or AI. Later work extends this same database and repo. Do not promise anonymous moving votes in the C8 README as an implemented feature.

## Priority under deadline

P0: actual course repo, deployed / and /readme/, room/create/join, save suggestion, volume-backed DB, return, truthful written evidence and public shipping.
P1: persist balanced card, clear all-category board, capacity/validation checks, two viewport refinement.
P2: optional animation embellishment. Cut P2 first. If P1 remains incomplete, revise README honestly and tell Wen; do not mark unfinished promises complete.
