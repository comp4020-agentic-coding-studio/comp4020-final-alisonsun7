# Two-pair, URL-only playtest

**Status: protocol prepared; no sessions or results recorded here.**

Purpose: discover whether two friends can begin, choose to respond, recognize
their common result and want to try another combination. This does not test
whether they can follow the developer's instructions.

## Preparation

- Recruit two pairs of friends who have not watched this version being built.
  Use labels Pair A / Pair B and A1/A2/B1/B2 in public notes. Obtain consent
  for any recording; do not commit full names, private chat or unredacted video.
- Each participant uses a separate Chrome profile or separate device with no
  shared cookies/storage. Confirm different server identities without teaching
  them the flow. Two ordinary tabs in the same profile are one identity.
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

Start timing when both have a usable page. For 5–10 minutes do not name the
correct control, location, recipe, expected object or next step. If someone
asks for help, record the question. Ask “What would you try?” once; if they
remain blocked or uncomfortable, help, timestamp it, and mark later steps
**assisted**. Do not leave a participant struggling to preserve a metric.

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

## Empty session record

| Field | Observation |
| --- | --- |
| Pair/date/commit/URL | NOT RUN |
| Viewports/device/browser/output | NOT RUN |
| Independent identities confirmed | NOT RUN |
| First preview / first own sound / first response | NOT RUN |
| First common change noticed by whom, when | NOT RUN |
| Unprompted second combination | NOT RUN |
| Exact quotes about friend's effect | NOT RUN |
| Assistance supplied and time | NOT RUN |
| Problem → design change → commit → repeat observation | NOT RUN |

Run Pair A first, address its most consequential barrier, and record the exact
change before Pair B. The different builds make this a formative iteration,
not a controlled comparison. If no change is justified, say why. Do not add
features merely because a participant suggests one.

A scratch restart can test stored state today. A real next-day return needs a
separate dated session using the same identity and world; until then, record
**next-day return not run**.
