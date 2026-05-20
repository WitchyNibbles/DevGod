# Task Packet

## Task ID

`2026-05-20-autonomous-coverage-gap-proof-engine`

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

Raise the autonomous execution contract from shallow manifest/proof existence checks to typed coverage-ledger, gap, and measurable progress-proof authority.

## Inputs

- `docs/autonomous-execution-redesign.md`
- `.devgod/work/briefs/brief-2026-05-20-autonomous-coverage-gap-proof-engine.md`
- `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `src/domain/types.ts`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/admin.ts`
- `tests/service.test.ts`
- `tests/workflow-check.test.ts`
- `tests/admin.test.ts`

## Dependencies

- `2026-05-20-autonomous-authority-and-artifact-contract`
- `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`

## Outputs

- executable task artifacts for the coverage/gap/proof slice
- typed coverage-ledger and gap/progress-proof validations in runtime state
- stronger workflow-check enforcement for autonomous coverage/proof quality gates
- focused tests covering good-path and fail-closed behavior
- coverage/progress artifacts for this task

## Coverage impact

Closes the first major autonomy gap between runtime proof of task approval and proof of meaningful analysis coverage/completion.

## Touched ledger items

- `authority:coverage-ledger`
- `authority:gap-engine`
- `authority:progress-proof`
- `artifact:workflow-check-autonomous-gates`
- `runtime:autonomous-next-target-selection`

## Required runtime traces

- not required for the implementation itself; this slice strengthens the typed runtime state and artifact contract that later tracing slices will feed

## Progress proof

Record at least one progress proof for this task that shows measurable coverage or gap deltas and explains the next target using evidence-backed rationale.

Release-readiness evidence: the workflow-check contract still enforces explicit release-readiness citations for release-candidate tasks, even when review exports are runtime-optional.

## Interrupt checkpoint policy

If the runtime and workflow-check layers disagree on gap or proof blocking semantics, stop and record that contradiction explicitly before widening the implementation.

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-05-20-autonomous-coverage-gap-proof-engine.md
plan=.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md
task=.devgod/work/tasks/task-2026-05-20-autonomous-coverage-gap-proof-engine.md
review_exports=runtime_optional

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-20-autonomous-coverage-gap-proof-engine.md`
- `.devgod/work/tasks/task-2026-05-20-autonomous-coverage-gap-proof-engine.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `.devgod/work/coverage/coverage-2026-05-20-autonomous-coverage-gap-proof-engine.json`
- `.devgod/work/proofs/progress-2026-05-20-autonomous-coverage-gap-proof-engine.json`
- `scripts/check-devgod-workflow.sh`
- `src/domain/types.ts`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/admin.ts`
- `tests/coverage-ledger.test.ts`
- `tests/gap-engine.test.ts`
- `tests/progress-proof.test.ts`
- `tests/workflow-check.test.ts`
- `tests/service.test.ts`
- `tests/admin.test.ts`

## Out of scope

- repo-understanding inventory/tracing implementation
- orchestration checkpoint-resume state-machine changes
- new managed control-layer assets outside the listed scope

## Assumptions

### Approved assumptions

- the existing autonomous execution state in `src/runtime/autonomous-execution.ts` is the correct place to enforce typed coverage/gap/proof semantics
- workflow checks should begin enforcing stronger artifact semantics for this slice rather than waiting for later orchestration work
- progress-proof deltas can be validated meaningfully with aggregate state transitions already present in the runtime model

### Blocked assumptions

- a proof without measurable deltas or explicit next-target rationale is sufficient
- a critical open gap can be treated as non-blocking during completion
- extending these checks should silently weaken existing release-candidate behavior

## Reasoning quality

### Claim

The smallest honest way to continue the redesign is to validate and enforce typed coverage/gap/proof authority in the existing runtime and workflow-check surfaces before adding deeper tracing or orchestration layers.

### Facts

- current runtime state already stores coverage items, gaps, and progress proofs
- current workflow checks only require the presence of coverage/proof files for autonomous quality gates
- the redesign doc requires typed states, severities, evidence refs, and measurable deltas

### Assumptions

- existing tests and service APIs can be extended incrementally without a full runtime-schema rewrite

### Hypotheses and alternatives

- preferred: add focused typed validations and blocker semantics now, then rely on them in later slices
- alternative: defer workflow checks and rely on runtime-only validation
- alternative: add new artifact templates without runtime blocking semantics

### Evidence refs

- `docs/autonomous-execution-redesign.md`
- `src/runtime/autonomous-execution.ts`
- `src/domain/types.ts`
- `src/core/service.ts`
- `tests/service.test.ts`
- `tests/workflow-check.test.ts`

### Counter-evidence

- some of the required typed structures already exist, so the real implementation risk is overfitting validation rules to the current tests instead of the broader redesign contract

### Confidence

High

### Open questions

- whether workflow checks should validate full JSON structure immediately or start with targeted required-field checks for the first slice

### Verification plan

- add failing tests for typed gap/progress-proof semantics and autonomous workflow-check rejection cases
- implement the smallest runtime/workflow changes that satisfy those tests
- run focused `service`, `workflow-check`, and `admin` tests

### Research and debug budgets

- research passes: 2
- implementation attempts: 2
- verification passes: 3

## Reasoning policy

### Mode

`strict`

### Requirements

Separate facts from assumptions, keep alternatives explicit, and fail closed on unsupported completion claims.

### Max attempts

`2`

## Reasoning attempts

### Attempt records

- id: `attempt-1`
- label: `handoff-unblock-and-contract-scope`
- hypothesis: the safest next move is to create the queued slice’s task artifacts and enforce typed coverage/gap/proof semantics in the existing runtime surfaces
- alternatives: `runtime-only-validation`, `artifact-template-first`
- evidence refs: `.devgod/work/task-queue.json`, `docs/autonomous-execution-redesign.md`, `src/runtime/autonomous-execution.ts`
- verification refs: `verification-1`
- trace ref: `repo-audit`
- outcome: `supported`
- summary: the queued slice already defines typed authority outcomes, and the current blocker is missing executable task artifacts plus shallow validation semantics

### Verification records

- id: `verification-1`
- kind: `repo-audit`
- ref: `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`
- status: `passed`
- summary: the reopened plan sequences coverage/gap/proof authority immediately after the contract-alignment slice

### Verdict

- status: `supported`
- summary: proceed with typed coverage/gap/proof enforcement in runtime and workflow-check layers
- supporting attempt ids: `attempt-1`
- blocking issues: `none`

## Behavior to preserve

- authenticated review plus runtime workflow proof remains the final completion authority
- existing continuation fallback order of blocking gap, then progress proof, then checkpoint remains intact unless stronger typed validation explicitly disqualifies stale entries

## Acceptance criteria

- coverage items, gap records, and progress proofs are persisted with typed states, severities, and evidence refs
- runtime and workflow checks block completion when critical gaps remain open or required proofs are missing
- progress proofs require measurable deltas and next-target rationale rather than narrative-only summaries

## Good-path checks

- autonomous execution status reports coverage/gap/proof summaries using valid typed records
- a valid progress proof can still drive next-target selection when no blocking gap remains
- a task with the required autonomous gates and valid coverage/proof artifacts can pass workflow checks

## Bad-path or edge-case checks

- a progress proof with no measurable delta fails
- a critical gap marked open blocks completion
- a required coverage/proof artifact that lacks the minimum typed fields fails workflow checks
- stale or contradictory gap/proof inputs do not silently permit completion

## Verification steps

- `node --experimental-strip-types --test tests/coverage-ledger.test.ts tests/gap-engine.test.ts tests/progress-proof.test.ts`
- `node --experimental-strip-types --test tests/workflow-check.test.ts tests/service.test.ts tests/admin.test.ts`
- release-readiness evidence: `bash scripts/check-devgod-workflow.sh --task-id 2026-05-20-autonomous-coverage-gap-proof-engine`
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-20-autonomous-coverage-gap-proof-engine`

## Residual risk disposition

If the first slice only reaches targeted artifact-field validation rather than full exhaustive schema validation, record that explicitly as remaining scope for later autonomy slices instead of claiming the redesign is complete.

## Required reviews

- `reviewer`
- `security_reviewer`
- `qa_engineer`

## Security checks

- keep runtime workflow proof as the final completion authority
- ensure fail-closed behavior when coverage/proof evidence is missing or contradictory
- do not weaken release-candidate gate evidence while adding autonomous coverage semantics

## Retrieval guidance

- prefer repo-local runtime, workflow-check, and redesign-doc evidence over generic design patterns

## Anti-patterns to avoid

- counting artifact existence as equivalent to validated coverage authority
- allowing narrative-only progress proofs
- treating critical open gaps as advisory

## Rollback notes

Revert the new typed validation paths and new workflow-check requirements together if compatibility breaks existing authoritative runtime fixtures.

## Handoff format

Summarize runtime/workflow changes, changed files, targeted verification evidence, recorded progress proof, and any residual typed-validation gap left for later slices.
