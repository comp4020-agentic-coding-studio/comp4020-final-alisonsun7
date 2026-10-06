# Design sources and student reading notes

These sources were opened during preparation. This does not mean Wen has read or endorsed them. Before adopting the README, read both and write your own response below. Do not claim a personal reading experience based only on this file.

## Robin Sloan — An app can be a home-cooked meal

https://www.robinsloan.com/notes/home-cooked-app/

Sloan describes a family application whose value comes from fitting a small group. Our interpretation for DayDraw: measure usefulness to one outing instead of designing for growth. It supports omitting feeds and chat; it does not prove that cards distribute labour fairly. Sloan's known-family setting differs from ours: strangers testing DayDraw need clear onboarding.

Wen's note:
- The passage/idea I read and how I understood it: I realised software doesn't need to serve everyone, so I stopped trying to make DayDraw a complete planning platform and focused on a small tool for a group of friends.
- A point I agree with or resist: I agree with judging the app by one gathering rather than growth — but DayDraw differs from Sloan's family app in that it has to welcome a stranger, not just people who already know each other, so the small scale can't lean on shared context the way his does.
- The concrete design I changed because of it: the deliberate limits in README.md (no chat, no accounts, no voting flow yet) and keeping C8 scoped to a saved suggestion rather than a fuller planning tool.

## Aurora Harley — Visibility of System Status

https://www.nngroup.com/articles/visibility-system-status/

Harley explains why feedback about state and action results matters. Our interpretation: Saving and Saved must mean different things, and a returning visitor should recognise what exists. This supports explicit status feedback. It does not demonstrate usability of our specific board; that needs actual inspection.

Wen's note:
- What I read: I realised users shouldn't have to guess whether an action worked, so submitting a suggestion now gives explicit saving/saved feedback.
- A trade-off (feedback clarity versus interface clutter): the feedback is one line of status text next to the form, not a popup or a separate screen, so it stays legible without adding clutter.
- A real observation from trying the UI, if any: [fill once a peer actually tries it — the engineering side of this is tested (spec/submit-state.test.ts, e2e/ui.spec.ts), but whether it *feels* clear to a newcomer still needs an actual observed session]

## How to use a source responsibly

Cite the actual link beside the design claim. Paraphrase narrowly; do not use a source as a decorative endorsement. Separate the author's position, our inference and observations from using DayDraw. Do not invent academic findings about role cards, social pressure or group consensus. Add additional sources only if you actually use them to change or challenge the design.

## Sources for the development record

Course brief, Final brief and assessment pages are linked in docs/crit8-brief.md. The ADR format source is linked in docs/decisions/001-stack.md. Technical library or Fly documentation consulted during implementation belongs in the accepted ADR/evidence record with its actual URL, not made-up citations.
