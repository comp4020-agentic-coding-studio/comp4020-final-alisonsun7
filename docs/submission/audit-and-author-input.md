# Materials audit and author input

Initial snapshot: `7d40be6`, 2026-11-07, before the present Listening Green
work. The first table preserves that audit. The current-status section below
records what has since changed; neither is a novice or artistic verdict.

## Initial gaps that mattered

| Material | Actual contents at this snapshot | Required correction |
| --- | --- | --- |
| [Root README](../../README.md) | SoundGarden, a shared 6×6 grid; five pentatonic notes; three synthesised instruments; no rooms or chat; local independent loops | Replace with Little Chorus's intended friends, sound response loop, shared/local distinction, provenance, limits, and the actual playable route. Old grid timings do not describe the planet. |
| [Root PROCESS](../../PROCESS.md) | Crit 9 SoundGarden account, NoteGrid failure, 18 old checks and old browser results | Rewrite around the final product. Keep the early failure as one cited cause of a lasting harness rule, then show later rejected art/play attempts and the current scope correction. Old results stay historical. |
| [CLAUDE](../../CLAUDE.md) | Much closer to the current planet; accumulated rules and superseded priorities; says never draft the author's materials | Record the new brief's explicit limited drafting authorization, revised core outcome and priority among historical ADRs. Retain identity, history, operations, audio cancellation and deployment constraints. |
| [Little Chorus walkthrough](../little-chorus.md) | Accurate prior release: movement, local kangaroo, direct replies, nine venues and restored sea | Rewrite the beginning around the finished first three-minute experience. List new arrangement/object rules only after verification. Distinguish three developed areas from other scenery. |
| [Soundfolk walkthrough](../soundfolk-planet.md) | Earlier edition and its original source/verification claims | Preserve as history; add a clear pointer to the current decision rather than silently rewriting the past. |
| [Decisions](../decisions/) | ADR 001–025 describe changing products and rejected directions | Add one current decision that names which priorities it supersedes. Do not read the 6×6 conflict rule, withdrawn sound rules or cinematic fidelity target as current requirements. |
| [Evidence log](../evidence-log.md) and [structured records](../evidence/) | Detailed historical results, many build-specific limits and failure corrections | Keep them; add a compact current evidence entry and source/build scope. Do not sum historical checks and imply one final run. |
| [Reflections](../../reflections/README.md) | Exact `crit-8.md`, `crit-9.md`, `crit-10.md` exist. Crit 8 concerns DayDraw; later entries concern SoundGarden/Bloom. | Preserve historical context and dates. Ask the author about accuracy; do not retrospectively replace their accounts with Little Chorus claims. |
| Root `research-note.md` | Not found | The author must select and defend a field-level position. The working argument is a starting point, not evidence of their reading or belief. |

No `AGENTS.md` was found at the repository root, its project parent or the
workspace root during this audit. The current root `CLAUDE.md` is applicable.
The design pack's older instructions are navigated through current ADRs.

## Current material status

The root README and PROCESS have now adopted Little Chorus descriptions with
explicit **Author review draft** notices. Root `research-note.md` now exists
and combines the two requested research directions into one position about
verification capacity. These are agent-assisted drafts, not evidence of the
author’s reading, listening, beliefs or a completed friend study. Historical
reflections remain unchanged, and the old root documents remain in Git history
at `7d40be6`.

ADR026 / `5d696e5` records the current priority and drafting authority. The
shared-state projection is committed in `b3ad39c`, compatible score and audio
lifecycles in `8c96213`, and integrated activity camera, studio, source-derived
sculptures and journal corrections in `51cb210`. Current release evidence is
being consolidated in [the candidate record](../evidence/chorus-garden-2026-11-07.json).
The final three-area browser repeat, full specs, local preview promotion and
public deployment must each be reported from their own results, not inferred
from these commits.

## Current rules versus historical decisions

- **Retain:** browser-cookie identity, server-authored mutations, durable reply
  metadata, soft removal, idempotent operations, current databases and source
  coordinates, canonical shared state, explicit audio enablement, no main push
  or public deployment without authority.
- **Retain as a useful distinction:** sound preference, audition, camera and the
  kangaroo's following behaviour are local. A sound contribution and a reply
  are shared. A local companion cannot unlock a two-human result.
- **Superseded by the current brief:** nine equally shallow destinations as the
  main scope, cinematic/reference-image similarity as the acceptance target,
  and the blanket ban on preparing first-person material drafts. Drafts must
  still identify uncertainty and cannot invent feelings or first-hand events.
- **Now recorded in ADR026:** curated compatible musical parts and a shared
  server-time pulse extend prior playback assumptions. The
  [audio handoff](../chorus-audio.md) distinguishes original generated score,
  natural textures, short events and late entry. Old contributions and source
  coordinates remain meaningful; pleasantness still requires human listening.

## Author questions that cannot be answered from code

1. In your own words, why do you want friends to answer sounds rather than
   compose alone or exchange text? Which personal example, if any, is true?
2. Which two development failures actually changed how you directed the
   agent? The log offers candidates, but only you can describe your learning.
3. Which of Sloan, Harley, the field sources in the research draft, or your
   course readings have you personally read? What do you disagree with?
4. You selected both research directions: automation versus human judgement,
   and throughput creating verification debt. The working note now joins them
   as one position about verification capacity. Which part do you defend in
   your own terms, and what counter-example would make you narrow it?
5. After listening, which exact combinations are pleasant, tiring, muddy or
   too loud on headphones and speakers? Which trade-off do you accept?
6. Who actually tried the new candidate, when, on which devices, with what
   explanation? What did they do without prompting, and what changed after?
7. Has a real next-day return happened? Has the final candidate been deployed
   to the course Fly URL? Supply dates/commit links instead of inference.

The implementation can continue while these answers are pending. They block
personal claims and final document sign-off, not reversible technical work.

## Suggested final structures

| Document | Structure and approximate word budget |
| --- | --- |
| README, 500 words | 80: audience and pointed promise; 120: first joint action and recognizable result; 100: sources and rejected alternative; 100: enforced versus judged quality; 100: actual entry, shared/local rules, limits and attribution |
| PROCESS, 1,000 words | 100: current proposition; 180: evolution and rejection; 180: stack/state trade-offs; 220: two failures converted into rules/checks; 170: final verification with limits; 150: author judgement and remaining gaps |
| Research note, 700 words | 80: one contestable thesis; 160: compare primary literature; 160: explain different evidence strength/scope; 140: meet the best counter-case; 100: practical implication; 60: boundary/conclusion |
| Historical reflections | Preserve their original breakthrough/developer-identity answers. Any later correction must be dated and explicit. |

## Before author sign-off and submission

- Resolve each **AUTHOR INPUT**, **CANDIDATE EVIDENCE** and **NOT RUN** marker.
  A missing observation may be resolved honestly as unperformed; it must not
  be replaced by a success claim. Author review is still required even when
  the proposed statement follows the recorded brief.
- Add final implementation commit links and actual two-size screenshots.
- Read the root README through `/readme/`; a passing heading check does not
  prove that its product claims are current.
- Run `node scripts/check-evidence.ts`. It checks cited hashes and presence,
  not truth, source quality, music, or completeness of the research note.
- Review rendered GitHub images and links once publication is authorized.
- Do not push `main` merely to test the packet: the existing workflow deploys
  public-main pushes, and this turn has not authorized external publication.
