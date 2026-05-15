# Task Packet

## Task ID

`2026-05-15-autonomous-execution-redesign`

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
- `checkpoint_resume_required`
- `reasoning_strict_required`

## Goal

Implement the first autonomous-execution redesign slice by adding typed runtime schema, completion blocking, workflow enforcement, and regression coverage for coverage manifests, progress proofs, and checkpoints.

## Inputs

- `docs/autonomous-execution-redesign.md`
- `src/core/service.ts`
- `src/domain/types.ts`
- `scripts/check-devgod-workflow.sh`
- existing workflow templates and install/scaffold surfaces

## Dependencies

- redesign spec is already authored and accepted as the direction for the first implementation slice

## Outputs

- typed autonomous-execution schema and helpers in runtime code
- runtime completion blocking for missing manifests, proofs, and checkpoints
- workflow templates and checks updated for the new artifacts
- regression tests for runtime state and workflow enforcement
- live task coverage/proof/checkpoint artifacts for this task

## Coverage impact

- extends runtime authority from task-only orchestration to coverage/proof/checkpoint-aware execution state
- hardens installed/scaffolded workflow artifacts so new tasks can satisfy the stronger contract

## Touched ledger items

- `service:core/devgod-core-service`
- `model:domain/autonomous-execution-types`
- `script:workflow-check`
- `template:task-packet`
- `template:coverage-manifest`
- `template:checkpoint-summary`
- `template:progress-proof`
- `test:service-autonomous-execution`
- `test:workflow-check-autonomous-artifacts`

## Required runtime traces

- not required for this package-maintainer slice because the change is control-layer schema and workflow enforcement, not user-flow runtime behavior
- proof is provided by targeted test execution and workflow artifact generation instead

## Progress proof

- `.devgod/work/proofs/progress-2026-05-15-autonomous-execution-redesign.json`
- code and test deltas must show measurable forward progress from design-only artifacts to enforceable runtime behavior

## Interrupt checkpoint policy

- checkpoint after code and test verification so the next slice can resume from the recorded schema/proof baseline
- persist next actions for CLI/reporting expansion instead of relying on conversation memory

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/rules/task-quality-matrix.md`
- `.devgod/templates/task-packet.md`
- `.devgod/templates/coverage-manifest.json`
- `.devgod/templates/checkpoint-summary.md`
- `.devgod/templates/progress-proof.json`
- `.devgod/work/briefs/brief-2026-05-15-autonomous-execution-redesign.md`
- `.devgod/work/plans/plan-2026-05-15-autonomous-execution-redesign.md`
- `.devgod/work/tasks/task-2026-05-15-autonomous-execution-redesign.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `.devgod/work/coverage/coverage-2026-05-15-autonomous-execution-redesign.json`
- `.devgod/work/proofs/progress-2026-05-15-autonomous-execution-redesign.json`
- `.devgod/work/checkpoints/checkpoint-2026-05-15-autonomous-execution-redesign.md`
- `docs/autonomous-execution-redesign.md`
- `scripts/check-devgod-workflow.sh`
- `scripts/verify-devgod-workflow-check.sh`
- `src/core/service.ts`
- `src/domain/types.ts`
- `src/install/cli.ts`
- `src/runtime/autonomous-execution.ts`
- `tests/control-layer-contract.test.ts`
- `tests/service.test.ts`
- `tests/workflow-check.test.ts`
- `tests/workflow-scaffold.test.ts`

## Out of scope

- new `devgod coverage`, `gaps`, `checkpoint`, or `resume` CLI commands
- runtime trace registry implementation
- gap-engine automation beyond typed state and completion blocking
- authenticated live review proof seeding for this slice

## Assumptions

### Approved assumptions

- the first implementation slice should prefer additive runtime metadata and workflow enforcement over invasive storage or CLI expansion
- existing runtime workflow-proof authority remains the final completion boundary

### Blocked assumptions

- do not treat the redesign spec as implemented until runtime and workflow checks enforce concrete parts of it
- do not fabricate reviewer authority or live proof just to satisfy artifact completion

## Reasoning quality

### Claim

The smallest safe execution slice is to thread autonomous-execution state through existing runtime status and completion planning, then make workflow artifacts and scaffolding carry the new contract.

### Facts

- current runtime state already persists `taskQueue`, `productState`, and free-form `metadata`
- completion previously ignored coverage manifests, checkpoints, and progress proofs
- the workflow checker and scaffold generator are existing enforcement points for installed repos

### Assumptions

- storing autonomous-execution state inside typed runtime metadata is sufficient for the first slice
- blocking final completion on missing coverage/proof/checkpoint evidence provides meaningful enforcement without yet expanding directive kinds

### Hypotheses and alternatives

- best path: add autonomous types plus runtime/workflow enforcement and regression tests in one vertical slice
- alternative: ship only templates and documentation changes first. Rejected because it would keep the redesign advisory-only

### Evidence refs

- `docs/autonomous-execution-redesign.md`
- `src/core/service.ts`
- `src/domain/types.ts`
- `scripts/check-devgod-workflow.sh`
- `src/install/cli.ts`

### Counter-evidence

- broader directive expansion (`continue_analysis`, `dispatch_subagents`, `trace_runtime`) is still deferred, so this slice improves completion truthfulness more than full autonomous behavior

### Confidence

`high`

### Open questions

- whether the next slice should expose standalone admin commands first or prioritize richer runtime gap/coverage reporting in existing status/report surfaces

### Verification plan

- run direct node tests for `tests/service.test.ts`, `tests/workflow-check.test.ts`, `tests/workflow-scaffold.test.ts`, and `tests/control-layer-contract.test.ts`
- ensure scaffolded workflows still block on pending reviews rather than on malformed starter artifacts
- ensure terminal runtime plans block when autonomous quality gates lack manifest/proof/checkpoint evidence

### Research and debug budgets

- repo inspections: 4
- design-to-code iterations: 2
- verification passes: 2
- tool retries: 2

## Reasoning policy

### Mode

`strict`

### Requirements

Explicit reasoning blocks, evidence refs, verification records, and a supported verdict are required because this slice changes completion semantics and workflow enforcement.

### Max attempts

`2`

## Reasoning attempts

### Attempt records

- id: `attempt-1`
- label: `thin-vertical-slice`
- hypothesis: typed autonomous runtime state plus workflow enforcement is the safest first implementation slice
- alternatives: `docs-only update`, `full directive-kind expansion`
- evidence refs: `docs/autonomous-execution-redesign.md`, `src/core/service.ts`, `scripts/check-devgod-workflow.sh`
- verification refs: `verification-1`, `verification-2`
- trace ref: `repo-inspection`
- outcome: `supported`
- summary: the current runtime metadata surface and checker/scaffold paths allow an additive, testable first slice

### Verification records

- id: `verification-1`
- kind: `test`
- ref: `node --experimental-strip-types --test tests/service.test.ts`
- status: `passed`
- summary: runtime autonomous-execution state and completion blocking behave as expected

- id: `verification-2`
- kind: `test`
- ref: `node --experimental-strip-types --test tests/workflow-check.test.ts tests/workflow-scaffold.test.ts tests/control-layer-contract.test.ts`
- status: `passed`
- summary: workflow templates, scaffold output, and autonomous artifact checks remain coherent

### Verdict

- status: `supported`
- summary: the first redesign slice is implemented and verified at the runtime/schema/workflow-enforcement layer
- supporting attempt ids: `attempt-1`
- blocking issues: `none`

## Behavior to preserve

- workflow-proof remains the final approval authority
- non-autonomous tasks continue to complete through the existing directive flow
- scaffolded workflows remain blocked on pending reviews rather than failing on malformed starter artifacts

## Acceptance criteria

- runtime status and execution plans surface autonomous-execution state and block terminal completion when required artifacts are missing
- workflow templates and quality-gate rules include coverage, progress-proof, and checkpoint concepts
- workflow-check and scaffold/install verification paths support the stronger contract without breaking existing starter flows

## Good-path checks

- autonomous tasks with manifest, progress proof, and checkpoint evidence can reach `complete`
- scaffolded starter workflows continue to fail for pending reviews instead of unrelated contract drift

## Bad-path or edge-case checks

- terminal autonomous tasks without manifest/proof/checkpoint evidence fail closed
- installed or synthetic workflow fixtures fail if autonomous quality gates reference missing artifacts

## Verification steps

- `node --experimental-strip-types --test tests/service.test.ts`
- `node --experimental-strip-types --test tests/workflow-check.test.ts`
- `node --experimental-strip-types --test tests/workflow-scaffold.test.ts`
- `node --experimental-strip-types --test tests/control-layer-contract.test.ts`

## Residual risk disposition

Reviewer, QA, security, and live workflow-proof gates are now recorded through authoritative run `4e634017-e28e-4a29-8f9d-e0fa3366ae7b`. Remaining work moves to the next feature slice rather than this task.

## Required reviews

- `reviewer`
- `security_reviewer`
- `qa_engineer`

## Security checks

- no secret-bearing examples or hardcoded credentials were added
- workflow-proof authority remains the final completion authority
- scaffold and verification changes do not bypass review-gate or runtime-proof boundaries

## Retrieval guidance

- prioritize runtime state, workflow checkers, install/scaffold surfaces, and the redesign spec

## Anti-patterns to avoid

- advisory-only redesign claims without runtime enforcement
- making autonomous gates mandatory for every scaffolded task by accident
- inventing authenticated reviewer authority in markdown-only summaries

## Rollback notes

Revert the autonomous-execution schema/helpers, workflow-check changes, scaffold adjustments, and the task-local coverage/proof/checkpoint artifacts together.

## Handoff format

Summarize code changes, direct test evidence, task-local coverage/proof/checkpoint artifacts, and the remaining review/live-proof gate work needed before formal completion.
