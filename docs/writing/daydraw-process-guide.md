# PROCESS writing guide — preserve the student's current account

This guide belongs under docs/writing, not as a replacement root submission. First read Wen's existing PROCESS.md. If it is complete, revise only with new real evidence. Final account guidance is 900–1100 words, grown from current work and rewritten each crit rather than a pasted diary. Preserve the course template's required fields.

## Suggested argument structure

1. Scope and position (roughly 120–170 words): why a small outing group, why responsibility without restriction, why a saved idea was the first milestone. Use Wen's real explanation; no invented personal scenario.
2. Grounding (120–170): what Wen read, where the source helps and where it does not settle the design. Compare a plausible alternative and explain the accepted choice.
3. Stack/workflow (160–210): actual Node/SQLite/server rendering choice, constraints of one machine/volume, runtime limitations, feature branches and staged verification. Link accepted ADR and real commits.
4. Direction/correction (220–280): two consequential prompts and one actual correction/rejected attempt, with code AND harness/test evidence where applicable. A test text collision is a test defect; tmpfs data loss is an expected test-environment property. Neither should be mislabelled a product bug.
5. Verification (160–210): distinct API/browser/production evidence; realtime measurement; migration/return; limitations and actual peer findings or no peer review. Tests do not prove group enjoyment.
6. Current judgement (80–120): what good remains uncertain; trade-offs and next investigation, not a list of decorative features.

These ranges are aids, not mandatory quotas. If C8 account is shorter, do not pad it with future implementation. Rewrite as M1/M2/M3 produce actual work.

## Real evidence links

Retrieve actual remote and git hashes. Render single-commit links with hash as label, compare links for genuine before/after ranges. Include screenshots via relative paths beside their linked commit. Never leave invented hash-looking text. Never cite a candidate prompt as proof it executed; show the resulting implementation/test/history.

## Student notes Claude should ask for once

- A reason this product is worth doing to me.
- A reading position I hold, including a disagreement or limit.
- A design I chose/rejected and why.
- A real moment I changed my mind or corrected the agent.
- A check I personally inspected and what I learned.
- A result I still cannot honestly claim.

Claude may populate factual engineering material from observed history and results without asking permission for each fact. Wen supplies personal stance, judges the draft and owns the argument. No imagined sources/feedback/experiences.

## Final review

Root PROCESS must contain no unfilled scaffolding, fake completed stages or copied old deployment state. Each material factual claim should have evidence. A passing check:evidence is necessary but does not guarantee the prose is truthful or complete.
