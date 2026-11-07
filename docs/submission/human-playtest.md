# Two-pair, ten-minute URL-only playtest

**Status: protocol prepared; no sessions or results recorded here.**

Purpose: discover whether two friends can begin, choose to respond, recognize
their common result and want to try another combination. This does not test
whether they can follow the developer's instructions.

## Preparation

- Recruit two pairs of friends who have not watched this version being built.
  Use labels Pair A / Pair B and A1/A2/B1/B2 in public notes. Obtain consent
  for any recording; do not commit full names, private chat or unredacted video.
- Each participant uses a separate Chrome profile or separate device with no
  shared cookies/storage. The observer confirms different server identities
  from approved local diagnostics/logs after joining, without teaching the
  flow. Record only pseudonymous IDs. Two ordinary tabs in the same profile
  are one identity; NPCs and the kangaroo do not supply the second person.
- Give both people **only the candidate URL**. Check the candidate commit and
  record it before starting. Use a separate playtest DB/world if experimental
  contributions must be kept out of the user's original world.
- Pair A: one 1920×1080, one 390×844 emulation. Pair B: swap which participant
  uses which viewport. If real phones are used, record actual device/browser
  and treat that as additional evidence, not an exact marking-viewport test.
- Standardize comfortable speaker/headphone levels. Participants may choose
  quiet browsing; observe what this does to comprehension. Do not turn on their
  audio for them or assume that output is pleasant because it decodes.

## Opening script

“Here is the URL. Please try it together as you normally would. You can speak
to each other. I will watch without explaining the interface. You can stop
whenever you want.”

Run the same ten-minute structure for each pair:

| Elapsed time | Observer action |
| --- | --- |
| 0:00–7:00 | Give only the URL and the opening sentence above. Let friends explore together. Do not name a control, location, recipe, expected object or next step. |
| 7:00–9:00 | Ask questions 1–3 below, separately enough that the second person can disagree. Ask the other questions only if time permits. |
| 9:00–10:00 | If a crucial risk was not encountered, give one bounded prompted task. Otherwise let them show what they would do next. Keep this phase separate from free exploration. |

Record page-open and usable-page times for each participant. Start the free
exploration clock when both have a usable page, while retaining individual
load waits. If someone asks for help, record the exact question. Ask “What
would you try?” once; if they remain blocked or uncomfortable, help, timestamp
it, and mark subsequent affected steps **assisted**. Do not leave a participant
struggling to preserve a metric. Stopping early is valid data.

## What to observe

| Event | Record, without inference |
| --- | --- |
| First discovery | What catches attention? Who/what do they think is theirs? |
| First sound | Time to audible private preview and time to confirmed contribution separately; quiet browsing chosen? |
| First response | Did they choose an existing author's sound? Who was the target? Was publication deliberate? |
| First common change | Which actual object/animation/sound changed? Did both notice without prompting? |
| Attribution | Can each identify their part, the friend's part and the relation? |
| Reattempt | Do they voluntarily try a different pairing, move, remove, or adjust? When and why? |
| Recovery | Any accidental cancellation, mute confusion, hidden controls, slow load, dropped connection or input problem? |

The product targets of first sound within 60s and a two-person response within
three minutes are **targets to evaluate**, not automatic pass/fail cutoffs or
statistical conclusions from four people. Distinguish page-load wait, preview
time and publication time. A musical loop sounding on entry is not the
participant's first contribution.

## Questions after free exploration

1. “What did you two make?”
2. “What changed because your friend did something?”
3. “Which part came from you? Which part came from your friend?”
4. “What did you expect the sound you chose to do? Did it do that?”
5. “Was there a moment you wanted to try something else? Show me.”
6. “If you came back tomorrow, what would you expect to find and do?”
7. “Which sounds were pleasant or unpleasant together, and at what moment?”

Only after these answers, give one bounded task if the free exploration missed
an essential risk: mute while the friend contributes, cancel a response, return
to the existing work, or complete the flow with keyboard/touch. Label this
phase **prompted tasks**; do not mix its success with unprompted discovery.

## Observation rules

Use timestamped actions and short verbatim quotes, with consent. “A1 selected
Listen at 0:42 and said ‘Is that mine?’” is an observation. “The interface was
intuitive” is an interpretation and needs its evidence. Do not infer that a
participant heard something from the Sound on label or a moving visual.
Record whether they actually describe or confirm hearing it.

Distinguish `unprompted`, `assisted`, `prompted task` and `not reached` for
each event. Never fill missing times from the script or application test log.
The desired observations may fail to occur; that is useful contrary evidence.

## Pair A — empty record

| Field | Observation |
| --- | --- |
| Pair/date/application commit/URL | NOT RUN |
| Viewports/device/browser/output | NOT RUN |
| Consent / actual session length | NOT RUN |
| Independent identities confirmed (pseudonymous IDs, not cookie values) | NOT RUN |
| Page-open / usable-page time, per participant | NOT RUN |
| First private preview / confirmed own source / first reply (elapsed, status) | NOT RUN |
| First common change noticed by whom, when | NOT RUN |
| Unprompted second combination | NOT RUN |
| A1 quote: what friend changed | NOT RUN |
| A2 quote: what friend changed | NOT RUN |
| Assistance supplied and time | NOT RUN |
| Prompted task and result, kept separate | NOT RUN |
| Strongest observed barrier / contrary evidence | NOT RUN |
| Problem → design change → commit → repeat observation | NOT RUN |

Timestamped free-exploration notes: **NOT RUN**.

Intervention decision after Pair A: **NOT RUN**. Select one consequential
observed barrier, describe the mechanism, make a bounded change and pin its
commit before Pair B. If no change is justified, record why. A requested
feature is not automatically a design requirement.

## Pair B — empty record

| Field | Observation |
| --- | --- |
| Pair/date/application commit/URL | NOT RUN |
| Viewports/device/browser/output (roles swapped from Pair A) | NOT RUN |
| Consent / actual session length | NOT RUN |
| Independent identities confirmed (pseudonymous IDs, not cookie values) | NOT RUN |
| Page-open / usable-page time, per participant | NOT RUN |
| First private preview / confirmed own source / first reply (elapsed, status) | NOT RUN |
| First common change noticed by whom, when | NOT RUN |
| Unprompted second combination | NOT RUN |
| B1 quote: what friend changed | NOT RUN |
| B2 quote: what friend changed | NOT RUN |
| Assistance supplied and time | NOT RUN |
| Prompted task and result, kept separate | NOT RUN |
| Did the specific Pair A barrier recur? What was observed? | NOT RUN |
| Further change justified / unresolved limitation | NOT RUN |

Timestamped free-exploration notes: **NOT RUN**.

Two pairs, potentially on different builds, are a formative iteration, not a
controlled comparison or a representative success rate. Record mixed results
and counterexamples. Do not claim improvement merely because the second pair
completed something faster. The developer may operate a separate browser
check afterwards; label it developer verification rather than a participant
result.

A scratch restart can test stored state today. A real next-day return needs a
separate dated session using the same identity and world; until then, record
**next-day return not run**.

## Separate listening record — also empty

Human musical judgement is a different activity from finding a button. Use
the named combinations/questions in [the audio handoff](../chorus-audio.md).

| Listener/date/build/output/volume | Combination and exact moment | Judgement and reason | Change/accepted compromise |
| --- | --- | --- | --- |
| NOT RUN | NOT RUN | NOT RUN | NOT RUN |

No hardware listening, unfamiliar-pair success or real next-day return is
claimed by this prepared protocol.
