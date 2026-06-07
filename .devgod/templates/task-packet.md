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
- `reasoning_dual_required`
- `reasoning_strict_required`

## Goal

## Inputs

## UI surface

Declare the touched UI shape for this task.

Declare one:

- `none`
- `visual_change`
- `interactive_flow`

## Playwright requirement

`true | false`

## Browser evidence expectations

State the browser evidence expectations for this task.

For UI surfaces other than `none`, QA reviews must cite Playwright evidence.

## Frontend workflow entrypoint

Required for substantive frontend work.

State the repo-local frontend routing skill or say `not_applicable`.

## Visual direction package

Required for substantive `visual_change` work and broad redesigns.

- inspiration sources and reference URLs
- visual exploration artifact refs
- reference translation brief
- design variants explored
- chosen direction
- rejected alternatives and why
- chosen direction artifact ref
- rejected direction artifact refs
- opposite-direction artifact ref
- named signature move
- named impressiveness hypothesis
- design-family reset
- repeated primitive ban
- media-first concept decision
- generated asset decision
- surface-language continuity plan
- semantic charm map
- asset strategy
- motion strategy
- idle/background motion rationale
- media strategy
- generated imagery or illustration rationale
- 3D or no-3D rationale
- technical-fit rationale
- reduced-motion fallback
- performance containment plan
- critical control inventory
- control visibility map
- inheritance cutoff
- legacy carryover ban
- remake-vs-edit decision
- functionality-preservation checks
- screenshot critique loop plan

## Dependencies

## Outputs

## Required runtime traces

## Progress proof

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

### Inheritance policy

For remake work, state which visible structures from the current surface are intentionally discarded and which functional elements must survive in a new form.

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

`legacy | dual | strict`

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

For broad frontend remakes, include one criterion that proves the result does not remain in the prior concept family.

## Verification steps

List the exact commands, checks, fixtures, runtime proofs, and review evidence required to defend completion.

## Required reviews

List the gate roles that must approve this task before completion.

Examples:

- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Security checks

## Rollback notes

Record the fastest safe way to revert or abandon the slice if verification fails or the task is superseded.

## Residual risk disposition

Record the remaining risks, owner, and whether they are accepted, deferred, or require a follow-on task.
