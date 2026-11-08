# Autonomy needs evidence that can say no



I argue that useful agentic development requires verification capacity to grow
with production capacity. Otherwise, rapid generation accumulates verification
debt: consequential claims about behaviour and value that nobody has adequately
tested. The remedy is not human approval of every generated line. It is a
workflow in which each important claim has an observer capable of rejecting
it, while the person directing the work remains responsible for choosing and
revising the standard of good.

[Ryan Lopopolo's OpenAI account](https://openai.com/index/harness-engineering/)
describes human QA becoming a bottleneck as agent output increased. Isolated
applications, browser control and accessible runtime evidence then made more
checking available to agents. This suggests that autonomy depends partly on
environment design, not simply model capability. However, a vendor's account
of its own internal beta is not a controlled productivity comparison. Its
estimated acceleration offers a plausible mechanism and an engineering agenda,
not a general causal result.

[Grace and colleagues' evaluation guidance](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)
helps distinguish a reported action from its outcome in the environment. It
also distinguishes code, model and human graders. This improves on evaluating
an agent's persuasive completion message. Nevertheless, checking a durable
database change only settles the relevant state claim. It cannot alone establish
that a collaborative interaction is understandable. The two practitioner
accounts therefore support better observation, but leave the adequacy of the
chosen observations open. Both also have commercial interests in agent adoption.

[Becker, Rush, Barnes and Rein's randomized study](https://arxiv.org/abs/2507.09089v2)
offers a stronger causal design with a narrower target. Sixteen experienced
developers completed 246 tasks in familiar open-source repositories. With the
studied early-2025 tools, tasks took 19% longer, although participants estimated
that assistance had helped. Perceived fluency was a poor substitute for measured
completion in that setting. The result does not establish verification debt as
the cause, nor describe every novice, prototype or subsequent model. It does
undermine an inference from impressive production to useful productivity.

The authors' [February 2026 follow-up](https://metr.org/blog/2026-02-24-uplift-update/)
complicates any convenient anti-agent conclusion. Participation and task
selection increasingly favoured avoiding the no-AI condition; concurrent agents
also made time accounting unreliable. The researchers judged their later
estimate unreliable and considered larger speedups plausible. Their caution
matters: the earlier randomized finding remains evidence about its period,
while the follow-up cannot supply a clean estimate for current tools. Neither
justifies a universal claim that agents accelerate or delay development.

The strongest counterargument to my position is that verification can itself
be automated. Agents can generate adversarial cases, inspect real screenshots
and reproduce failures more cheaply than people repeating every action.
Mandatory human review could become expensive ceremony, and human judgement
is also inconsistent. I accept this objection. Independence should mean that
evidence can contradict the production claim, not that a different species
produced it. A regression check that fails frozen faulty code is often more
informative than a person approving a confident summary.

What remains human responsibility is the choice of what deserves acceptance.
For an audio product, synchronized entry is an engineering claim; pleasantness
for its intended listeners is another claim with different evidence. A model
may assist both, but a technical metric cannot silently replace the second.
Likewise, a completed scripted response does not demonstrate that unfamiliar
friends discover the invitation. Relevant participants must be allowed to
contradict that claim. Responsibility includes withdrawing an attractive
promise when adequate observation is unavailable.

Beyond one project, I propose recording three things before consequential
acceptance: the claim, an observation that could defeat it, and the evidence
still missing. This need not become a checklist for every cosmetic edit.
Apply it where a wrong claim would change a release or product decision.
Its cost should also be tested: compare time to an accepted outcome, escaped
defects and relevant user observations, including checking overhead. If the
practice adds ceremony without revealing consequential errors, revise it.

This is a bounded proposal, not a validated debt metric. The literature
supports questioning output and confidence as proxies; it does not prove my
workflow universally superior. Good autonomy expands the capacity to find
that the work is wrong, as well as the capacity to produce more work.

## References

- Lopopolo, Ryan. 11 February 2026. [*Harness engineering: leveraging Codex in an agent-first world*](https://openai.com/index/harness-engineering/). OpenAI. Primary practitioner account.
- Grace, Mikaela; Hadfield, Jeremy; Olivares, Rodrigo; and De Jonghe, Jiri. 9 January 2026. [*Demystifying evals for AI agents*](https://www.anthropic.com/research/demystifying-evals-for-ai-agents). Anthropic. Primary practitioner guidance.
- Becker, Joel; Rush, Nate; Barnes, Elizabeth; and Rein, David. 2025. [*Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity*](https://arxiv.org/abs/2507.09089v2). arXiv:2507.09089v2, revised 25 July 2025. Randomized study.
- Becker, Joel; Rush, Nate; Cunningham, Tom; Rein, David; and Mahamud, Khalid. 24 February 2026. [*We are Changing our Developer Productivity Experiment Design*](https://metr.org/blog/2026-02-24-uplift-update/). METR. Primary methodological follow-up.
