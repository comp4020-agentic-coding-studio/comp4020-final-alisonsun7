# DayDraw — process overview

Writing scaffold, not a finished submission. Preserve the original course template's required fields. Wen should replace the prompts below with a truthful current account and remove this note before shipping. Do not fill gaps with a plausible story. Rewrite the overview as the project develops; the Final version grows towards 900–1100 words, not imagined future work at C8.

## From brief to a deliberate scope

[In your own words, explain why a group-day planning problem matters, why responsibility cards help, and why C8 ends at a saved suggestion. Identify an alternative you actually considered and rejected. Link the real commit where the scoped brief/harness landed.]

## Reading and the definition of good

[Explain which parts of Sloan and Harley you read, what changed in your position, and where you disagree or adapt their ideas. Distinguish small-group usefulness from anonymity/security. Connect lightweight, visible and recoverable to actual UI decisions. Link README/CLAUDE changes using real commits.]

## Stack and workflow trade-offs

[State the stack actually chosen after template inspection. Compare with a credible alternative. Explain how the Fly machine/volume affects SQLite, and what single-machine storage costs. Link docs/decisions/001-stack.md only after its decision is accepted. Explain why vertical slices and meaningful checks suited this task.]

## Direction, grounding and correction

[Select 2–3 consequential actual prompts from docs/prompts or the conversation, not a transcript dump. Explain what constrained the agent, what evidence you checked, and which suggestion you rejected. For an actual failure, link the code correction AND harness/test correction. If no failure occurred, do not invent one: discuss an observed risk and its justified check.]

## Verification and its limits

[Use observed commands/results and real commit links. Cover DB restart and deployed return separately. Report both exact viewports, browser identity isolation and a failure state if actually inspected. Name unverified claims. Automated checks protect behaviour; actual newcomer clarity needs human review.]

## Current position

[What is now live? What remains deliberately unfinished? Explain one next investigation for C9 without claiming it is already implemented.]

## Evidence link forms

Replace with real URLs, never invented hash-shaped strings:
- Single change: `[actual-short-hash](https://github.com/ACTUAL-ORG/ACTUAL-REPO/commit/ACTUAL-FULL-HASH)`
- Before/after: `[actual-range](https://github.com/ACTUAL-ORG/ACTUAL-REPO/compare/ACTUAL-BASE...ACTUAL-HEAD)`
- Screenshot: `![what it evidences](docs/evidence/ACTUAL-FILENAME.png)` beside the relevant commit link.

Do not leave these forms or bracketed instructions in the submitted document. Commands passing do not certify that the writing is truthful.
