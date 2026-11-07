# Five author decisions before submission

Prepared 2026-11-08. This is a completion aid, not Alison's answers, a grade
prediction or a completed study. Technical implementation can continue while
these answers are pending. Short, specific answers are more useful than a
general account of successful development.

1. **What should a friend recognize as the other person's contribution?**
   Complete this sentence in your own words: “Little Chorus is good when two
   friends can ___, because ___.” Name one alternative you deliberately gave
   up, and one thing the current version still fails to communicate. Compare
   your answer with [ADR026](../decisions/026-a-world-that-remembers-an-answer.md),
   [the rejection of cinematic fidelity](../decisions/022-shared-sound-identity.md)
   and [the return to 3D](../decisions/029-a-lived-in-3d-world.md). These record
   choices; they cannot supply your reasons or approval of the result.

2. **Which two failures changed how you directed the agent?**
   Choose actual incidents, say what you first accepted or missed, and explain
   the rule or check you demanded afterwards. Candidates are the late-ACK
   resurrection fixed in [`92d706b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/92d706b),
   the lost rollback pointer fixed in [`a3d6cf6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/a3d6cf6),
   the phone-chat obstruction in [the comparison record](../evidence/perspectives-2026-11-08.json),
   or the café sign missed by green movement checks and fixed in
   [`37e055b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/37e055b).
   Which of these actually changed your practice, rather than merely the code?

3. **Which research claim can you personally defend, and against what?**
   The [root research draft](../../research-note.md) joins verification debt
   with the different roles of automatic and human judgement. Identify which
   linked sources you have read, one disagreement between them, and the best
   counterexample to this thesis. State what would make you narrow or reject
   the argument. Do the same for the Sloan/Harley design sources in README;
   a citation supplied by an agent is not a record of your reading.

4. **What did you actually hear?**
   Use [the listening handoff](../chorus-audio.md) and record named combinations,
   device/output, volume and a concrete verdict: seams, musical entry,
   balance, fatigue, preview masking or excessive density. Which audible
   problem led to which change, or which compromise do you accept? If you
   have not listened, say so; decoded buffers and measured headroom cannot
   stand in for your ear.

5. **What did unfamiliar friends discover without your explanation?**
   Run [the two-pair protocol](human-playtest.md). Supply the exact version,
   elapsed observations, assistance and each person's answer to “What changed
   because your friend did something?” Identify the resulting design change
   and repeat observation, if any. Separately state whether a real next-day
   return occurred. “Not run” is an honest answer; a scripted browser path,
   restart or planned invitation is not a substitute.

Use these answers to revise the root README, PROCESS and research note; see
[the precise editing notes](author-editing-notes.md). Preserve historical
reflections. Remove draft/input notices only after the corresponding claims
have actually been reviewed. The author must be able to explain the choices
and code; the [course integrity guidance](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/ai-use-and-integrity/)
permits assistance and rejects false process accounts.

Public release is a separate operational decision. Its current authorization
and checks are listed in the editing notes; this checklist does not authorize
a push, publication or database reset.
