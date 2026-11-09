# Agent autonomy needs evidence that can reject it

Useful agentic development requires verification capacity to grow with production capacity. Otherwise, it creates **verification debt**: consequential claims accepted without adequate observation. This is a proposed description, not a validated metric. Verification can be delegated; responsibility remains with the person deciding which claims matter, what evidence could defeat them, and whether release is justified.

## More output does not establish more value

[Lopopolo's OpenAI account](https://openai.com/index/harness-engineering/) describes human QA becoming a bottleneck as agent output increased. Isolated applications, browser control and runtime evidence expanded agents' checking capacity. This suggests that autonomy depends on environmental feedback as well as model capability. However, its estimate of building an internal product in one-tenth the usual time lacks a controlled counterfactual. A vendor's practitioner account offers mechanisms worth testing, not a transferable productivity result.

[Becker et al.'s randomized study](https://arxiv.org/abs/2507.09089v2) provides stronger causal evidence for a narrower setting. Sixteen experienced developers completed 246 tasks in repositories they knew well. With early-2025 AI tools, completion time increased by 19%, although participants believed the tools had helped. The important result is not that agents necessarily slow development. The study does not isolate verification debt, cover novices or evaluate later systems. It shows that perceived fluency and rapid production can diverge from measured completion.

The authors' [2026 follow-up](https://metr.org/blog/2026-02-24-uplift-update/) prevents a simple anti-agent conclusion. Developers increasingly avoided participation or withheld tasks where they expected high AI value; concurrent agents complicated time measurement. METR judged the later estimate unreliable while considering greater speedups plausible. The earlier experiment remains evidence about its period, not current productivity. Together, these sources shift the question from “Are agents faster?” to “Faster at producing what, accepted by which evidence?”

## Verification can be delegated, but standards cannot

The strongest objection to my position is that verification itself can be automated. Requiring people to repeat every action would recreate the bottleneck, while human review is neither free nor consistently correct. [Grace et al.](https://www.anthropic.com/research/demystifying-evals-for-ai-agents) distinguish an agent's transcript from the outcome it leaves in the environment, and describe code, model and human graders. An automated regression that fails faulty code is more independent than a person merely agreeing with a persuasive completion report. Independence should therefore mean that evidence can contradict the production claim, not that a human produced it.

Little Chorus made this distinction concrete. A delayed HTTP acknowledgement could revive a removed sound after two missed server events. Controller regressions failed against frozen faulty code; a separate browser fixture dropped both events, reconnected and released the acknowledgement. Another browser run passed twenty checks while phone cards covered the fish and frog. One failure needed an adversarial state test; the other needed inspection of the actual view. A passing summary could establish neither claim.

Yet a correct grader can still measure the wrong outcome. Little Chorus can verify that two distinct identities publish a reply, that the relationship persists, and that shared audio enters on a common beat. Those observations cannot establish that unfamiliar friends understand whose contribution changed the world, enjoy the mix, or want to return. Automated checks, screenshots, human listening and participant observation answer different questions. Anthropic's taxonomy helps select them, but it cannot prove that the selected proxy represents product value.

## A bounded acceptance practice

Before a consequential release decision, I propose recording three things: the claim, an observation capable of defeating it, and the evidence still missing. Delegate operational checks where success is precisely specified; where the promise concerns human experience, allow relevant participants to contradict it. If adequate observation is unavailable, narrow the promise rather than upgrading a proxy into proof.

This practice also needs a stopping rule. It should apply where a false claim would change a product or release decision, not to every cosmetic edit. Its own cost should be evaluated through time to an accepted outcome, escaped defects, checking overhead and relevant user observations. If the record grows without revealing consequential errors, simplify it. The literature supports distrusting output and confidence as proxies; it does not prove this workflow universally superior. Good autonomy expands the capacity to discover that work is wrong as well as the capacity to produce it.

## References

- Becker, J., Rush, N., Barnes, E., & Rein, D. (2025). [*Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity*](https://arxiv.org/abs/2507.09089v2). arXiv:2507.09089v2.
- Becker, J., Rush, N., Cunningham, T., Rein, D., & Mahamud, K. (2026, February 24). [*We are Changing our Developer Productivity Experiment Design*](https://metr.org/blog/2026-02-24-uplift-update/). METR.
- Grace, M., Hadfield, J., Olivares, R., & De Jonghe, J. (2026, January 9). [*Demystifying evals for AI agents*](https://www.anthropic.com/research/demystifying-evals-for-ai-agents). Anthropic.
- Lopopolo, R. (2026, February 11). [*Harness engineering: leveraging Codex in an agent-first world*](https://openai.com/index/harness-engineering/). OpenAI.
