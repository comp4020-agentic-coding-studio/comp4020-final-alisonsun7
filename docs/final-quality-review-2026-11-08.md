# Final quality review — 2026-11-08

This is an agent-prepared technical and evidence audit, not Alison's personal
position, a marker's assessment, or a predicted grade. The reviewed candidate
is application `bdb59c6`, with evidence committed at `6f1cf29`. It predates the
3D improvements requested on 2026-11-08: reducing jagged edges and visual
stiffness, removing the artificial lock-test invitation, improving bathroom
fixtures and the café, and diagnosing conservatory flicker. Those requests
are new observations and requirements, not completed fixes in this audit.

Subsequent local refinement is recorded as application `37e055b` in
[the 3D verification index](evidence/lived-in-3d-2026-11-08.json). Its technical
and screenshot corrections do not complete the human-judgement, authorship or
course-deployment gaps identified below. The historical audit scope is retained.

The review read the root README, PROCESS, research note, current harness,
submission packet and release evidence, and consulted the official course
pages linked below. It did not run a new browser study, listen through
hardware, or modify application data.

## The proposition to carry through

The clearest product proposition in the current brief and implementation is:

> Friends answer one another through sounds, leaving a recognizable place
> that remembers what they made together.

The intended audience is two to six friends without musical training. A
sound, its answer, the resulting arrangement and the changing object should
make the same relationship understandable. A solo visitor can begin a work;
another real contributor should create a meaningful shared possibility.
Authorship, place and response history let the friends recognize and continue
it later.

Returning to 3D is compatible with that proposition. Presentation quality
matters where it helps players recognize people, hear spatial relationships,
understand consequences and enjoy returning. A café can support gathering and
contrasting sounds; residents can make those changes legible. Their value
should be assessed against this shared experience rather than the number of
independent activities they add.

## What the record supports

| Evidence | Supported conclusion | Limit |
| --- | --- | --- |
| [Core release](evidence/chorus-garden-2026-11-07.json) and [promise map](submission/promise-evidence-map.md) | Real source relationships, distinct browser identities, shared outcomes, durable provenance and removal semantics have explicit checks. | Scripted cooperation does not establish unprompted understanding or social value. |
| [Neighbours release](evidence/neighbours-2026-11-08.json) | Audio output, nearby interaction, authoritative private-room admission, phone controls and panel behaviour were inspected in bounded checks. | Sampled WebAudio output is not a listening verdict. The new 3D complaints still require investigation. |
| [Comparison release](evidence/perspectives-2026-11-08.json) | The final cross-view browser path passed 47 behaviour checks with two independent identities, actual audio-node starts, matching shared forms, chat, touch and private-room interactions. | These are developer-operated checks of the named candidate, not unfamiliar-player results or proof of every peripheral activity. |
| Source run recorded in the comparison release | 237 specifications passed against an isolated database. | This run preceded the final CSS and label corrections. It must not be presented as a fresh full-suite run after them. |
| Release promotion records | The application switch preserved every row in all twelve current tables; rollback retains the current database. | This is local release evidence, not proof of the course deployment or an actual next-day visit. |

The process contains useful examples of failures changing the harness:
[`92d706b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/92d706b)
made late acknowledgements receipts rather than sources of live state;
[`a3d6cf6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-alisonsun7/commit/a3d6cf6)
preserved the rollback pointer through an ordinary restart. The comparison
record also retains the failed phone-chat attempts and the real hit-target
correction. These support a discussion of directed verification and changing
assumptions; their mere count is not evidence of quality.

## What an HD claim would still need

COMP8020 weights are process 35%, deployed application 20%, response to the
brief 20%, and critical research note 25%. The course judges the deployed
application and the agreement between the README argument, harness rules and
checks; additional features do not earn credit simply by existing.
[Official final-project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)

The HD descriptors require corroborated direction and justified choices, an
application that withstands unexpected use, and one pointed idea carried
through. Both 1920×1080 and 390×844 are marking environments.
[Official assessment and band descriptors](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#band-descriptors)

The candidate has foundations relevant to those descriptors. It does not yet
justify an assurance of HD. The following priorities concern unresolved
claims, rather than a proposed score.

### 1. Establish whether the joint experience communicates its value

Human listening, unfamiliar-pair onboarding, voluntary recombination and an
actual next-day return remain explicitly unverified. The user's reports of
subtle changes and weak visual liveliness make these substantial questions,
not cosmetic acceptance details.

Use the prepared [two-pair URL-only protocol](submission/human-playtest.md).
Observe first sound, first response, first recognizable shared consequence,
and whether players try another combination without being asked. Ask each
person what their friend changed. Listen to named combinations on headphones
and speakers, then record the specific mix or interaction changes made.
The sixty-second and three-minute onboarding targets remain targets until
observed. A restart check must not be renamed a next-day visit.

### 2. Complete the author's arguments and align them with the release

The root README, PROCESS and research note are labelled **Author review
draft** and retain author-input requests. They now describe Little Chorus,
but have not become Alison's approved account. PROCESS cites an earlier
190-test/43-check candidate; the final account should identify which release
each selected result supports rather than replacing all historical numbers
with the latest total. README still links a localhost candidate.

The research draft has a contestable field-level claim about verification
capacity, compares practitioner accounts with empirical evidence and meets
the counterargument that agents can also expand verification. That is a
useful starting structure. It is not evidence that Alison has read the
sources or adopted the position. She should select and defend the argument,
correct personal claims, and explain the most consequential design and
workflow choices in her own terms. These materials concern 60% of the
COMP8020 weighting through process and research together.

### 3. Verify the actual submission deployment

The current release explicitly records no main-branch push or public
deployment. A browser tool could not access the derived course Fly URL during
this audit; that tool result does not establish that the site is down. No
claim is made here about its current contents or availability.

After authorized deployment, verify the exact submitted build from the course
URL and `/readme/`, using independent browser profiles at both marking sizes.
Check live changes without refresh, a late join, keyboard and mid-interaction
resize, slower loading, and persistent works after actual server recovery.
Record the build and conditions. Preserve current data and treat a true
next-day return as a separate observation. The course marks the deployed
artefact rather than a local candidate.
[Official marking environment](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#marking-environment)

## AI assistance and authorship

The final-project page advises students to draft the three arguments
themselves. This is not a blanket prohibition on AI drafting. The course's
integrity page permits agentic assistance and says the human remains
accountable; students must explain and defend the work. False process
accounts and misrepresentation breach that requirement.
[Official AI-use and integrity policy](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/ai-use-and-integrity/)

Accordingly, this audit does not supply personal memories, reading claims,
listening approval or invented participant findings. Existing draft notices
should remain until the author has reviewed the actual claims. This review
does not edit the root personal materials or historical reflections.

## Audit conclusion

Little Chorus has a distinctive, assessable proposition and traceable
engineering evidence. The next quality gain is to make the shared consequence
clear and enjoyable, obtain observations capable of contradicting that claim,
and submit an author-owned argument against a verified deployment. Further
3D repairs should be recorded as their own later work; this audit does not
pre-approve their visual, musical or usability outcome.
