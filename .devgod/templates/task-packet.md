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

## Allowed write scope

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
