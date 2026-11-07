# Author review draft — critical research note

Prepared with coding-agent assistance on 2026-11-07. The author requested both
arguments below: automated reliability checks need distinct human judgements,
and agent throughput can create verification debt. This draft combines them
into one contestable position. It does not assert that the author has read,
adopted or personally experienced its claims. The sources were opened and
checked; the author's reading and argument still require confirmation.

**AUTHOR INPUT:** Which part of this position do you defend, and what example
would make you narrow it? Add or substitute course literature you actually
engaged with. No listening, friend-playtest or next-day result is implied.

---

# Production is useful only as fast as its claims can be checked

I propose that good agentic development should expand verification capacity
alongside production capacity. When generated changes accumulate faster than
their consequential claims can be checked, a team acquires verification debt:
unresolved uncertainty about behaviour, maintenance and user value. More green
checks can reduce that debt, but cannot settle claims they never observe. This
position joins technical reliability with human judgement without making every
change wait for personal approval.

[Lopopolo's OpenAI account](https://openai.com/index/harness-engineering/)
offers a productive response to this bottleneck. Its agents receive isolated
applications, browser access and observable runtime state, making outcome
inspection part of their work. The report also describes human QA becoming a
constraint as code throughput grows. My inference is that autonomous production
requires investment in feedback infrastructure, rather than merely stronger
prompts. However, this is a vendor's report about its own internal product.
Its estimated acceleration lacks a randomized manual-development comparison;
the account supplies plausible mechanisms, not a general productivity law.

[Anthropic's evaluation guidance](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)
helps specify what that infrastructure should observe. It distinguishes a
reported action from the resulting environment state, and code, model and
human graders. A successful transcript is therefore weaker evidence than a
confirmed durable change. Yet even the latter is incomplete for an experiential
claim: a test can establish synchronized musical entry without establishing
that the result is pleasant. This practitioner taxonomy complements OpenAI's
engineering mechanisms, but neither vendor account establishes that its chosen
checks adequately represent every product's value.

[Becker and colleagues' 2025 randomized study](https://arxiv.org/abs/2507.09089)
provides a useful empirical challenge. Sixteen experienced open-source
developers completed 246 tasks in familiar mature repositories. Allowing the
studied early-2025 tools increased completion time by 19%, despite participants'
belief that assistance helped. Perceived fluency can therefore diverge from
measured productivity. This does not prove that verification debt caused the
slowdown, or that creative prototypes and current agents have the same result.
It instead challenges treating confidence, generated volume or subjective
speed as adequate measures of useful work.

Temporal scope matters. [METR's February 2026 follow-up](https://metr.org/blog/2026-02-24-uplift-update/)
reports selection effects and unreliable time accounting, particularly when
developers use concurrent agents. The authors consider their later experiment
an unreliable estimate of the current effect, while judging greater speedup
plausible. Quoting only the earlier slowdown would substitute a convenient
conclusion for their qualified evidence. Across these sources, the defensible
question is which workflow produces which verified outcome under stated
conditions, rather than whether AI simply makes development faster.

The strongest counterargument is that agents can expand verification too.
They can write adversarial checks, inspect screenshots and reproduce runtime
failures more cheaply than a person repeating every action. OpenAI's account
explicitly demonstrates this ambition. Requiring independent human inspection
of all output would preserve the bottleneck, and human review itself can be
inconsistent or inattentive. My claim therefore concerns the capacity to
contradict production claims, not a fixed ratio of reviewers to agents or a
presumption that human assessment is always superior.

The practical response is to divide acceptance by the claim. Give agents
authority to execute well-specified technical checks and repair failures.
Retain negative cases that can defeat their implementation, especially cases
found outside its initial assumptions. For unfamiliar-player comprehension,
musical pleasure or social meaning, obtain observations from relevant people
and name the question they judged. A second model repeating the first one's
success narrative supplies little independence; an actual environment state
or an uncoached participant may contradict it.

This is a limited recommendation, not evidence of a universal productivity
gain. It offers no numerical debt metric or mandatory review frequency.
Before accepting more production, identify the consequential unresolved claim,
the observer capable of rejecting it, and the evidence still missing. A useful
agent can increase both output and the ability to discover that output is
wrong. Autonomy becomes less dependable when only the first increase counts.

---

## References and evidence limits

- Lopopolo, R. (2026-02-11). *Harness engineering: leveraging Codex in an
  agent-first world*. OpenAI. First-hand practitioner report; commercial
  interest; mechanisms and reported experience, not controlled causal evidence.
- Anthropic (2026-01-09). *Demystifying evals for AI agents*. Practitioner
  account; commercial interest; useful distinctions rather than a universal
  validation result.
- Becker, J., Rush, N., Barnes, E., and Rein, D. (2025).
  *Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer
  Productivity*. arXiv:2507.09089v2. Randomized study; narrow participant,
  repository and tool-period scope. The debt explanation here is an argument,
  not a causal finding from this paper.
- Becker, J., Rush, N., Cunningham, T., Rein, D., and Mahamud, K. (2026-02-24).
  *We are Changing our Developer Productivity Experiment Design*. METR.
  Primary follow-up acknowledging limitations; it is not a clean current
  speedup estimate or a definitive statement about November 2026 tools.

Word count applies to the argument between the separators, excluding this
review notice and reference notes. The argument is intended for root
`research-note.md` after author review, not as a substitute for that review.
