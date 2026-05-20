# Task Packet

## Task ID

`2026-05-20-autonomous-understanding-and-tracing`

## Owner role

`backend_engineer`

## Completion standard

`specialist_verified`

## Required specialist roles

- `backend_engineer`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `product_acceptance`
- `tdd_required`
- `regression_safety_required`
- `coverage_ledger_required`
- `progress_proof_required`
- `release_readiness_required`
- `reasoning_strict_required`

## Goal

Add typed repo-understanding maps, runtime-trace records, and profile-driven rewrite-readiness thresholds to the autonomous runtime so modernization strategy work fails closed until comprehension evidence is sufficient.

## Inputs

- `docs/autonomous-execution-redesign.md`
- `.devgod/work/briefs/brief-2026-05-20-autonomous-understanding-and-tracing.md`
- `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `src/domain/types.ts`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/admin/autonomous-summary.ts`
- `src/admin/report.ts`
- `tests/service.test.ts`
- `tests/status-report.test.ts`
- `tests/admin.test.ts`

## Dependencies

- `2026-05-20-autonomous-coverage-gap-proof-engine`
- `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`

## Outputs

- executable brief/task artifacts for the understanding-and-tracing slice
- typed repo-understanding and runtime-trace validation in runtime state
- profile-driven comprehension summary and rewrite-readiness blocker logic
- reporting surfaces that expose comprehension metrics and missing evidence
- focused tests covering good-path and fail-closed behavior
- coverage/progress artifacts for this task

## Coverage impact

Closes the redesign gap between coverage-ledger authority and actual rewrite-readiness/comprehension authority.

## Touched ledger items

- `authority:repo-understanding`
- `authority:runtime-trace-registry`
- `authority:rewrite-readiness-thresholds`
- `runtime:autonomous-phase-readiness`
- `reporting:autonomous-comprehension-summary`

## Required runtime traces

- trace-backed registry support is required by the runtime model, but the slice may satisfy verification with synthetic trace records captured through tests and runtime state fixtures

## Progress proof

Record at least one progress proof for this task that shows measurable inventory/trace or blocker deltas and explains why the orchestration/eval slice becomes the next target.

Release-readiness evidence: the broader redesign still requires an explicit release-readiness citation in this packet’s verification evidence even though runtime proof remains the final authority.

## Interrupt checkpoint policy

- if verification fails after the new understanding records land, checkpoint the latest comprehension state before repair attempts
- if rewrite readiness stays blocked, preserve the missing-evidence list in runtime state and the progress proof before advancing

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-05-20-autonomous-understanding-and-tracing.md
plan=.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md
task=.devgod/work/tasks/task-2026-05-20-autonomous-understanding-and-tracing.md
reviewer=.devgod/work/reviews/review-2026-05-20-autonomous-understanding-and-tracing-reviewer.md
qa_engineer=.devgod/work/reviews/review-2026-05-20-autonomous-understanding-and-tracing-qa_engineer.md
security_reviewer=.devgod/work/reviews/review-2026-05-20-autonomous-understanding-and-tracing-security_reviewer.md
review_exports=runtime_optional

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-20-autonomous-understanding-and-tracing.md`
- `.devgod/work/tasks/task-2026-05-20-autonomous-understanding-and-tracing.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `.devgod/work/reviews/review-2026-05-20-autonomous-understanding-and-tracing-reviewer.md`
- `.devgod/work/reviews/review-2026-05-20-autonomous-understanding-and-tracing-qa_engineer.md`
- `.devgod/work/reviews/review-2026-05-20-autonomous-understanding-and-tracing-security_reviewer.md`
- `.devgod/work/coverage/coverage-2026-05-20-autonomous-understanding-and-tracing.json`
- `.devgod/work/proofs/progress-2026-05-20-autonomous-understanding-and-tracing.json`
- `src/domain/types.ts`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/admin/autonomous-summary.ts`
- `src/admin/report.ts`
- `tests/service.test.ts`
- `tests/status-report.test.ts`
- `tests/admin.test.ts`

## Out of scope

- `.agents/`
- `.codex/`
- `.devgod/memory/`
- phase-orchestration/eval behavior beyond the minimum hooks needed for later sequencing

## Assumptions

### Approved assumptions

- the first structured understanding model can be persisted inside autonomous runtime metadata without schema changes outside the existing runtime state envelope
- inventory completeness can be computed from required map kinds per run profile instead of introducing a separate scanner in this slice

### Blocked assumptions

- none

## Reasoning quality

### Claim

The smallest safe implementation is to extend the current autonomous runtime with typed understanding maps, runtime traces, and comprehension thresholds, then make rewrite-mode readiness explicitly fail closed from that structured state.

### Facts

- `docs/autonomous-execution-redesign.md` names explicit inventory outputs and the exact refusal line for rewrite recommendations below threshold.
- current runtime readiness logic only evaluates coverage thresholds, blocking gaps, progress proofs, and checkpoints.
- current autonomous reporting surfaces can expose additional structured fields without changing the workflow-proof authority model.

### Assumptions

- comprehension thresholds should live beside the coverage manifest because the redesign treats them as profile-driven runtime authority
- route/model/integration/auth/config/runtime-side-effect inventories can be modeled as typed map records before any repo scanner is introduced

### Hypotheses and alternatives

- preferred: add typed runtime understanding records and derive comprehension metrics directly from runtime state
- alternative: encode understanding only as coverage-item categories plus gap heuristics
- alternative: postpone structured reporting and block only inside phase-readiness logic

### Evidence refs

- `docs/autonomous-execution-redesign.md`
- `src/runtime/autonomous-execution.ts`
- `src/admin/autonomous-summary.ts`

### Counter-evidence

- some rewrite-readiness conditions are later-slice concerns, so this slice should block strategy readiness without prematurely implementing orchestration policy

### Confidence

High

### Open questions

- whether the first profile defaults should differ between `standard_delivery`, `legacy_rewrite`, and `debug_heavy` for required understanding maps

### Verification plan

- add unit/integration tests for understanding validation, summary computation, and rewrite refusal
- extend report/status coverage so the missing-evidence list reaches operator output
- run focused tests for touched runtime/admin surfaces

### Research and debug budgets

- research steps: 2
- debug steps: 3
- review passes: 2
- tool retries: 2

## Reasoning policy

### Mode

`strict`

### Requirements

Explicit reasoning blocks, attempts, verifications, and verdict are required. Critic verification remains unnecessary unless contradictions appear during implementation.

### Max attempts

`2`

## Reasoning attempts

### Attempt records

- id: `attempt-1`
- label: `runtime-understanding-state`
- hypothesis: the cleanest initial implementation is to extend `AutonomousExecutionState` with typed understanding-map and trace records, then derive comprehension metrics from that state
- alternatives: `coverage-only-heuristics`, `artifact-only-json-exports`
- evidence refs: `src/runtime/autonomous-execution.ts`, `src/core/service.ts`, `docs/autonomous-execution-redesign.md`
- verification refs: `verification-1`
- trace ref: `repo-audit`
- outcome: `supported`
- summary: existing autonomous runtime state already owns the adjacent coverage/gap/proof/checkpoint authority, so understanding/tracing belongs in the same authority layer first

### Verification records

- id: `verification-1`
- kind: `repo_audit`
- ref: `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`
- status: `passed`
- summary: the reopened plan sequences repo understanding and trace-backed comprehension immediately after the coverage/gap/proof authority slice

### Verdict

- status: `supported`
- summary: proceed with typed understanding/tracing runtime authority and explicit rewrite-readiness blockers
- supporting attempt ids: `attempt-1`
- blocking issues: `none`

## Behavior to preserve

- authenticated review plus runtime workflow proof remains the final completion authority
- existing coverage/gap/proof/checkpoint continuation behavior remains intact for non-rewrite profiles unless the new comprehension thresholds explicitly block progression

## Acceptance criteria

- autonomous runtime persists typed understanding-map and runtime-trace records with validation
- `legacy_rewrite` readiness blocks modernization strategy or later rewrite recommendations until inventory, business-rule, callsite, and trace thresholds are satisfied
- operator/report surfaces expose the comprehension summary and missing evidence cleanly

## Good-path checks

- a rewrite-profile run with full understanding maps and traces can report readiness with no missing evidence
- non-rewrite profiles continue to compute readiness without needing the full legacy-rewrite inventory set
- reporting shows the new comprehension summary without breaking existing autonomous coverage output

## Bad-path or edge-case checks

- missing required understanding maps block rewrite readiness
- contradiction gaps in rewrite mode block readiness even when coverage ratios look healthy
- runtime trace gaps for risky flows prevent later rewrite readiness
- invalid understanding or trace records fail closed instead of being silently accepted

## Verification steps

- `node --experimental-strip-types --test tests/service.test.ts tests/status-report.test.ts tests/admin.test.ts`
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-20-autonomous-understanding-and-tracing`
- `node --experimental-strip-types src/admin/devgod.ts seed-workflow-proof --task-id 2026-05-20-autonomous-understanding-and-tracing`
- `node --experimental-strip-types src/admin/devgod.ts workflow-proof --task-id 2026-05-20-autonomous-understanding-and-tracing --run-id <authoritative-run-id>`

## Residual risk disposition

Fix touched-scope defects before completion or record them as explicit blockers with owner and follow-up path.

## Required reviews

- `reviewer`
- `security_reviewer`
- `qa_engineer`

## Security checks

- reject malformed understanding and trace records at the runtime boundary
- keep evidence refs and source refs repo-local and non-secret
- preserve authenticated review authority as the only completion authority

## Retrieval guidance

- prefer repo-local runtime and redesign evidence over generic external architecture guidance

## Anti-patterns to avoid

- treating coverage-item presence as equivalent to rewrite comprehension
- inventing live trace integrations in this slice
- relaxing rewrite gating to preserve a shallow happy path

## Rollback notes

Revert the understanding/tracing runtime state additions and restore prior reporting fields if the new readiness model causes unbounded compatibility breakage.

## Handoff format

Include owner role, completion standard, changed files, execution evidence, quality-gate evidence, blocker status, and next-slice recommendation.
