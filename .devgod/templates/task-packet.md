# Task Packet Template

## Task ID

`<task-id>`

## Owner role

`<owner-role>`

## Completion standard

`artifact_complete | specialist_verified`

## Required specialist roles

List the specialist roles whose execution must be evidenced before completion.

## Quality gates

List the task-type gates that apply, for example:

Only assign file-backed gates when the task can actually produce or update the required artifacts inside its allowed write scope.

- `council_review_required`
- `product_acceptance`
- `frontend_acceptance`
- `accessibility_acceptance`
- `responsive_acceptance`
- `tdd_required`
- `e2e_required`
- `regression_safety_required`
- `release_readiness_required`
- `performance_check_required`
- `setup_replay_required`
- `coverage_ledger_required`
- `progress_proof_required`
- `checkpoint_resume_required`
- `memory_compaction_required`

## Goal

## Inputs

## Dependencies

## Outputs

## Coverage impact

## Touched ledger items

## Required runtime traces

## Progress proof

## Interrupt checkpoint policy

## Workflow artifact refs

Declare explicit workflow artifact ownership whenever the task inherits a parent brief or plan, or when authenticated runtime review authority is allowed to satisfy completion before markdown review exports exist.

Use repo-relative `key=value` lines:

brief=.devgod/work/briefs/brief-<task-id>.md
plan=.devgod/work/plans/plan-<task-id>.md
task=.devgod/work/tasks/task-<task-id>.md
reviewer=.devgod/work/reviews/review-<task-id>-reviewer.md
qa_engineer=.devgod/work/reviews/review-<task-id>-qa_engineer.md
security_reviewer=.devgod/work/reviews/review-<task-id>-security_reviewer.md
review_exports=required | runtime_optional

When `review_exports=runtime_optional`, the task must run under the runtime workflow contract and still cite release-readiness or other gate evidence in task verification artifacts or exported review summaries.

## Council review

Declare the council state for this task.

### Required

`true | false | inherited`

### Trigger rationale

State why the council is required, inherited from a parent decision, or intentionally bypassed as trivial/local work.

### Decision packet

Use a repo-relative path when a packet exists, for example:

- `.devgod/work/council/dac-<task-id>.md`
- `.devgod/work/council/adr-<task-id>.md`

### Council members

List the roles participating in the council review when required.

### Dissent owner

Name the role responsible for arguing at least one serious alternative and recording unresolved objections.

### Outcome

`pending | approved | approved_with_conditions | rework_required | exception_granted | rejected | inherited`

### Exception expiry

State `none` when no exception applies.

## Allowed write scope

## Allowed successor task scope

Declare zero or more pre-authorized follow-on task packet paths when the manager may need to prepare the next slice without reopening the full workflow contract.

Use repo-relative paths, for example:

- `.devgod/work/tasks/task-next-slice.md`

## Scope expansion protocol

If an otherwise valid implementation step falls outside the allowed write scope:

- stop immediately
- name the exact blocked paths
- record the minimum safe scope expansion using `blocked_paths`, `requested_write_scope`, and a short reason
- prefer narrow expansions or explicit follow-on slices over widening the entire task

## Out of scope

## Assumptions

### Approved assumptions

### Blocked assumptions

## Reasoning quality

### Claim

### Facts

### Assumptions

### Hypotheses and alternatives

### Evidence refs

### Counter-evidence

### Confidence

### Open questions

### Verification plan

### Research and debug budgets

## Reasoning policy

### Mode

`strict | dual | legacy`

Use `strict` by default. Use `dual` or `legacy` only when compatibility needs are explicit.

### Requirements

State whether this task requires explicit reasoning blocks, attempts, trace refs, verifications, critic verification, and a final verdict.

### Max attempts

Record the bounded attempt budget when strict or dual mode is used.

## Reasoning attempts

### Attempt records

List each bounded reasoning attempt with:

- id
- label
- hypothesis
- alternatives
- evidence refs
- verification refs
- trace ref
- outcome
- summary

### Verification records

List each verification record with:

- id
- kind
- ref
- status
- summary

### Verdict

Record the current verdict and why:

- status: `supported | insufficient_evidence | contradicted | budget_exhausted | needs_review`
- summary
- supporting attempt ids
- blocking issues

## Behavior to preserve

Required for refactors, migrations, command rewrites, and other behavior-preserving changes.

## Acceptance criteria

## Good-path checks

## Bad-path or edge-case checks

## UI surface

Declare one:

- `none`
- `visual_change`
- `interactive_flow`

If the value is `visual_change` or `interactive_flow`, the task must carry Playwright evidence before approval.

## Playwright requirement

State whether browser verification is required for this task.

- `true` for `visual_change`
- `true` for `interactive_flow`
- `false` for backend-only or non-UI work

When `true`, the task should define:

- desktop viewport check
- mobile viewport check
- one happy-path check
- one edge, failure, or regression-path check

## Browser evidence expectations

For `playwright_required = true` tasks:

- `frontend_designer` must perform a browser self-check before handoff
- `qa_engineer` must cite Playwright evidence refs in the runtime review
- screenshots, traces, and videos stay task-scoped artifacts and must not be promoted into durable memory

## Frontend direction package

Required for `ui_surface = visual_change` or `ui_surface = interactive_flow`.

### Redesign intent

Declare one:

- `preserve_and_polish`
- `refresh`
- `redesign`
- `reimagine`

### Current surface failures to correct

List the layout, hierarchy, content, or affordance issues that must materially improve.

### Intended visual direction

State the concept in one or two sentences:

- typography direction
- palette or surface mood
- density and spacing posture
- motion tone when motion exists

### Layout and hierarchy changes

State what must change structurally, not only cosmetically.

### Content and asset plan

State whether the surface uses or intentionally omits:

- imagery
- illustration or iconography
- empty-state graphics
- animation assets or GIF-like motion moments

Also state whether assets are generated, sourced, reused, deferred, or intentionally absent.

### Motion plan

State what motion clarifies:

- entry hierarchy
- state change
- interaction affordance

### Theme, palette, and contrast strategy

State the surface roles, accents, and contrast intent instead of relying on ad hoc component colors.

### Mobile composition notes

State how the mobile version is composed intentionally rather than as a compressed desktop layout.

### Browser evidence plan

Name the desktop viewport, mobile viewport, and the visible claims that browser evidence must prove.

## Verification steps

## Residual risk disposition

Fix touched-scope defects before completion or record them as explicit blockers with owner and follow-up path.

## Required reviews

Include all three blocking gates for substantive work:
- `reviewer`
- `security_reviewer`
- `qa_engineer`

## Security checks

## Retrieval guidance

## Anti-patterns to avoid

## Rollback notes

## Handoff format

Must include owner role, completion standard, specialist execution evidence, and quality gate evidence.
