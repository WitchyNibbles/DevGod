# Devgod Design Council Governance Plan

## Decision

`devgod` should add a rotating `Design and Architecture Council` for substantive roadmap and plan work. The council should be a pre-implementation quality gate that forces written reasoning, alternative generation, and explicit dissent before implementation starts.

This should not be a meeting for everything. It should be a bounded, evidence-first approval layer for the work most likely to suffer from shallow design, role deference, or hidden architecture risk.

## Research findings

### Sourced facts

- AWS describes an architecture review board as a multi-disciplinary team inside the implementation process rather than a standalone body, and recommends defined stakeholders, documented decisions, exception handling with expiration dates, and automation where possible. It also explicitly recommends rotating stakeholders to distribute knowledge and workload. Source: AWS Architecture Blog, April 14, 2025. [Build and operate an effective architecture review board](https://aws.amazon.com/blogs/architecture/build-and-operate-an-effective-architecture-review-board/)
- AWS recommends that significant architectural choices use ADRs with clear context, decision, and consequences; proposed ADRs should be read first, discussed after silent review, and either accepted, kept proposed for rework, or rejected. Accepted ADRs become immutable and later changes should supersede them with a new ADR. Source: AWS Prescriptive Guidance ADR process. [ADR process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html)
- AWS ADR best-practice guidance recommends starting small with a pilot team, using clear templates and review cycles, and tracking measures such as time to decision, rework reduction, and collaboration quality. Source: AWS Architecture Blog, March 20, 2025. [Master architecture decision records (ADRs): Best practices for effective decision-making](https://aws.amazon.com/blogs/architecture/master-architecture-decision-records-adrs-best-practices-for-effective-decision-making/)
- Nielsen Norman Group’s critique guidance recommends a defined scope, agenda, timeboxing, and asking “why” when feedback is reactive so critique stays tied to goals, personas, scenarios, or use cases rather than taste. Source: NN/g UX critique cheat sheet. [UX Design Critiques: Cheat Sheet](https://media.nngroup.com/media/articles/attachments/NNg_UXCritiqueCheatsheet.pdf)
- AWS Well-Architected guidance recommends continuous review by the builders themselves instead of relying only on formal review meetings. Source: AWS Well-Architected Framework. [The review process](https://docs.aws.amazon.com/wellarchitected/2022-03-31/framework/the-review-process.html)
- AWS leadership guidance on disagreement frames dissent as a responsibility: make a cogent case, use data where possible, then commit once a decision is made. Source: AWS Executive in Residence Blog, July 28, 2020. [Having Backbone – Disagreeing and Committing](https://aws.amazon.com/blogs/enterprise-strategy/guts-part-three-having-backbone-disagreeing-and-committing/)

### Inference for `devgod`

The best fit for `devgod` is not a heavyweight permanent board. It is a rotating critique council with:

- lean cross-functional membership
- written inputs before live discussion
- one explicit dissent seat
- bounded review cycles
- documented outcomes with expiry on exceptions
- continuous self-review in parallel with formal council checks

## Current `devgod` fit

`devgod` already has some of the machinery this council needs:

- strong role model in `.codex/agents/`
- required reasoning quality in [.devgod/rules/reasoning-quality.md](/home/eimi/projects/devgod/.devgod/rules/reasoning-quality.md)
- review and quality gate distinctions in [.devgod/rules/review-gate-policy.md](/home/eimi/projects/devgod/.devgod/rules/review-gate-policy.md) and [.devgod/rules/task-quality-matrix.md](/home/eimi/projects/devgod/.devgod/rules/task-quality-matrix.md)
- precedent for multi-role architecture synthesis in [.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-desktop-app-integration-surfaces.md](/home/eimi/projects/devgod/.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-desktop-app-integration-surfaces.md)

What is missing is a reusable operating model that tells the manager when critique is mandatory, who participates, what artifact is required, how disagreement is made explicit, and how decisions avoid stalling forever.

## Recommended council model

### Name

`Design and Architecture Council`, abbreviated `DAC`.

### Purpose

Improve the quality of substantive design and architecture decisions before implementation by forcing:

- clear problem framing
- alternatives, not single-path pitches
- evidence and counter-evidence
- cross-role critique
- explicit dissent
- documented decisions and follow-ups

### What it is not

- not a council for trivial work
- not a permanent veto committee for every change
- not a substitute for user intent
- not a replacement for `reviewer`, `qa_engineer`, or `security_reviewer`
- not a taste panel

### When DAC is required

Require DAC for tasks that meet any of these conditions:

- roadmap or plan tasks with architecture-significant changes
- user-facing design changes with broad workflow or interaction impact
- multi-role changes crossing product, architecture, UX, and operational boundaries
- proposals that introduce new control-layer patterns, governance, or reusable framework behavior
- decisions where the manager identifies high ambiguity, high rework risk, or likely role deference

DAC is not required for:

- trivial mechanical edits
- bug fixes with clearly local scope and no decision ambiguity
- implementation work already governed by an approved parent DAC decision

### Membership

Use a rotating panel of 3 to 5 members:

- required seat: `solution_architect`
- required seat: `product_strategist` for user/problem/value framing
- required seat: `frontend_designer` when a human-facing design surface exists
- required seat: `infra_engineer` or `security_reviewer` when the main risk is operational or security-heavy
- rotating seat: `reviewer` or `qa_engineer`

The manager/root thread acts as `shepherd`, not sole judge. The shepherd enforces the process, scope, timebox, and documentation.

### Dissent mechanism

Every DAC review must assign one `dissent owner`.

The dissent owner is required to:

- argue for at least one serious alternative
- identify the strongest failure mode in the leading proposal
- challenge unsupported optimism, hidden coupling, and aesthetic-only rationale
- record whether their objections were resolved, accepted as risk, or left open

This is the main anti-yes-man mechanism. Dissent becomes a job, not a personality accident.

### Required inputs

Before a DAC review starts, the owner must provide a short decision packet:

- problem, user, value, and urgency
- proposal summary
- at least 2 alternatives, including one conservative option
- architecture or design consequences
- evidence refs
- counter-evidence and unresolved uncertainty
- rollback or reversal path
- user-intent notes
- explicit question for the council

For architecture-significant work, this packet should be an ADR-style artifact.
For user-flow-heavy work, it should include a design-critique brief tied to goals and scenarios rather than visual preference.

### Review flow

1. Async read phase.
2. Silent comment phase on the packet.
3. Short synthesis discussion only if comments do not converge.
4. DAC outcome recorded in the task packet and decision log.

Default time limits:

- async read/comment window: 24 hours
- synchronous review if needed: 30 to 45 minutes
- rework cycle: maximum 2 rounds before escalation

### Allowed outcomes

- `approved`
- `approved_with_conditions`
- `rework_required`
- `exception_granted`
- `rejected`

`approved_with_conditions` is important. It avoids turning the council into a stop-everything board. Conditions must be concrete, owned, and time-bounded.

`exception_granted` should require:

- reason
- owner
- expiry date
- follow-up path

That follows the AWS recommendation to avoid indefinite exceptions.

### Escalation rule

If DAC completes two rework rounds without convergence:

- the manager writes a synthesis of the disagreement
- the user is presented with the recommendation and tradeoffs if product intent could change
- the manager chooses a bounded direction when user intent is already clear and the disagreement is implementation-level

This is how DAC stays real without blocking forever.

### Relationship to existing `devgod` review gates

DAC should be a pre-implementation quality gate, not a replacement for the existing review trio.

Recommended rule:

- DAC governs decision quality before implementation
- `reviewer`, `security_reviewer`, and `qa_engineer` still govern correctness, security, and verification before completion

That means DAC is best modeled as a new quality gate such as `council_review_required`, not as a fourth mandatory review role.

## Repo changes to introduce DAC

### Policy and rules

Add:

- `.devgod/rules/design-council-policy.md`
- DAC section in `.devgod/rules/task-quality-matrix.md`
- DAC interaction note in `.devgod/rules/review-gate-policy.md`
- DAC reasoning expectations in `.devgod/rules/reasoning-quality.md`

Policy content should define:

- trigger conditions
- membership rules
- dissent-owner requirement
- allowed outcomes
- timeboxes
- exception-expiry rule
- escalation rule

### Templates

Update or add:

- `.devgod/templates/task-packet.md`
- `.devgod/templates/intake-brief.md`
- `.devgod/templates/review-gate.md`
- `.devgod/templates/handoff.md`
- new `.devgod/templates/dac-decision-packet.md`
- new `.devgod/templates/adr.md`

New task-packet fields:

- `dac_required: true | false`
- `dac_owner`
- `dac_members`
- `dac_dissent_owner`
- `dac_decision_ref`
- `dac_outcome`
- `dac_expiry` for exception cases

### Agent and role guidance

Update manager/root and relevant roles so they know:

- when to route into DAC
- how to prepare the packet
- how to critique without taste-only feedback
- how to separate disagreement from final commitment

Roles most likely to need explicit DAC instructions:

- `planner`
- `solution_architect`
- `product_strategist`
- `frontend_designer`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

### Workflow/runtime follow-up

Do not start with deep runtime enforcement. Start with planning and artifact-level enforcement, then add runtime checks later.

Second-phase runtime work can add:

- workflow-check validation that DAC artifacts exist when `dac_required=true`
- report surfaces showing DAC state and unresolved conditions
- exception-expiry alerts

## Implementation plan

### Phase 1: Governance and artifact scaffolding

Owner roles:

- `technical_writer`
- `planner`
- `solution_architect`

Scope:

- write DAC policy
- add templates
- document trigger rules and outcomes
- define the dissent-owner mechanism

Acceptance criteria:

- DAC policy exists and is internally consistent with current review authority
- templates support DAC decisions without runtime changes
- trivial-work bypass is explicit

Verification:

- policy review against `AGENTS.md`
- template completeness review
- one sample DAC packet filled for a realistic `devgod` task

### Phase 2: Routing and role behavior

Owner roles:

- `product_strategist`
- `solution_architect`
- `planner`

Scope:

- update manager and role prompts/skills
- teach the manager to trigger DAC for the right tasks
- define how `frontend_designer` and `solution_architect` critique differs

Acceptance criteria:

- managers can classify DAC-required versus trivial tasks consistently
- dissent is explicit in handoffs and syntheses
- council feedback is tied to goals, constraints, and alternatives

Verification:

- dry-run three historical `devgod` tasks through the new trigger rules
- confirm at least one would bypass DAC and at least one would require it

### Phase 3: Quality-gate integration

Owner roles:

- `solution_architect`
- `backend_engineer`
- `qa_engineer`

Scope:

- add `council_review_required` to the task quality matrix
- add workflow-check logic for DAC artifacts on qualifying tasks
- surface DAC status in task reporting

Acceptance criteria:

- workflow artifacts can prove whether DAC was required and whether it happened
- DAC remains a quality gate, not an uncontrolled new review authority
- implementation tasks under an approved parent packet can bypass redundant DAC

Verification:

- add workflow-check fixture coverage
- add one positive and one negative validation case

### Phase 4: Pilot and calibration

Owner roles:

- `manager`
- `reviewer`
- `memory_curator`

Scope:

- run DAC on 2 to 4 substantive `devgod` tasks
- record cycle time, rework saved, and friction points
- refine trigger thresholds and packet size

Acceptance criteria:

- DAC catches at least one meaningful shallow-design or hidden-risk issue
- average time to DAC outcome stays bounded
- no trivial task is incorrectly forced into DAC

Verification:

- pilot retrospective
- update decision log and memory patterns

## Task packets for the first implementation slices

### Task 1

- `task_id`: `2026-06-01-devgod-dac-policy-and-templates`
- `owner role`: `technical_writer`
- `goal`: add policy, templates, and documented DAC operating model
- `quality gates`: `product_acceptance`, `reasoning_strict_required`
- `acceptance criteria`: policy + templates + sample packet land without changing runtime logic
- `verification`: template review, policy consistency pass, sample packet exercise

### Task 2

- `task_id`: `2026-06-01-devgod-dac-routing-and-role-guidance`
- `owner role`: `planner`
- `goal`: add manager and role guidance so DAC triggers consistently
- `quality gates`: `product_acceptance`, `reasoning_strict_required`, `regression_safety_required`
- `acceptance criteria`: routing guidance and role prompts make DAC activation criteria explicit
- `verification`: historical-task trigger exercise, critic pass

### Task 3

- `task_id`: `2026-06-01-devgod-dac-quality-gate-integration`
- `owner role`: `backend_engineer`
- `goal`: integrate DAC into workflow quality checks
- `quality gates`: `reasoning_strict_required`, `regression_safety_required`, `product_acceptance`
- `acceptance criteria`: tasks can declare DAC requirement and workflow checks validate required artifacts
- `verification`: tests for required/missing DAC artifacts and allowed bypass cases

## Metrics

Track:

- time to DAC outcome
- percent of DAC reviews ending in `approved_with_conditions`
- percent ending in rework
- rework discovered before implementation versus after implementation
- number of tasks bypassing DAC correctly
- participant confidence / usefulness score after pilot

## Risks and mitigations

### Risk: DAC becomes a bottleneck

Mitigation:

- narrow triggers
- async-first review
- explicit timeboxes
- `approved_with_conditions`
- max two rework cycles

### Risk: DAC becomes performative and agreeable

Mitigation:

- mandatory dissent owner
- alternatives required in the packet
- counter-evidence field required
- critique tied to goals and scenarios, not taste

### Risk: DAC duplicates later reviews

Mitigation:

- keep DAC focused on decision quality before implementation
- keep reviewer/security/QA focused on correctness and release readiness later

### Risk: DAC overrides user intent

Mitigation:

- policy must state that DAC can propose changes, not silently replace user direction
- user approval is required when DAC recommends a material intent change

## Recommendation

Start with Phase 1 and Phase 2 only. That gives `devgod` a real council shape quickly, with low workflow risk, while preserving room to add stronger enforcement after the pilot proves the process is useful and not bloated.
