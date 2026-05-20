# Task Packet

## Task ID

`2026-05-20-autonomous-phase-orchestration-and-eval`

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

Finish the autonomous-system redesign by making phase-readiness orchestration and interruption-safe continuation authoritative in runtime state, then prove that behavior with explicit orchestration eval regressions.

## Inputs

- `docs/autonomous-execution-redesign.md`
- `.devgod/work/briefs/brief-2026-05-20-autonomous-phase-orchestration-and-eval.md`
- `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `src/domain/types.ts`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/admin/autonomous-summary.ts`
- `src/admin/report.ts`
- `src/evals/orchestration-baseline.ts`
- `tests/service.test.ts`
- `tests/orchestration-eval.test.ts`

## Dependencies

- `2026-05-20-autonomous-coverage-gap-proof-engine`
- `2026-05-20-autonomous-understanding-and-tracing`
- `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`

## Outputs

- executable brief/task artifacts for the final orchestration/eval slice
- richer phase-readiness records with transition, blocker-class, and continuation-score semantics
- checkpoint/resume freshness behavior that recognizes stale epochs and preserves the freshest continuation path
- operator/reporting surfaces that expose the stronger phase-readiness summary
- orchestration eval coverage for shallow completion, stale checkpoints, contradiction loops, interrupted resume, and false-done backlog scenarios
- coverage/progress artifacts and review summaries for this task

## Coverage impact

Closes the final redesign gap between comprehension authority and durable orchestration authority.

## Touched ledger items

- `runtime:autonomous-phase-readiness-state-machine`
- `runtime:checkpoint-epoch-freshness`
- `runtime:continuation-scoring`
- `reporting:autonomous-phase-guidance`
- `eval:long-horizon-orchestration-fail-closed`

## Required runtime traces

- not required beyond synthetic runtime state fixtures and test-backed continuation records for this slice

## Progress proof

Record a progress proof showing the final orchestration/eval authority delta landed and why the product can now close instead of routing to another autonomous target.

Release-readiness evidence: include explicit release-readiness confirmation in the verification evidence for this final redesign slice.

## Interrupt checkpoint policy

- if phase-readiness changes but verification fails, checkpoint the newest execution epoch before repair attempts
- if stale checkpoint handling blocks continuation, preserve the stale-checkpoint reason and fallback guidance in runtime state before any retry

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-05-20-autonomous-phase-orchestration-and-eval.md
plan=.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md
task=.devgod/work/tasks/task-2026-05-20-autonomous-phase-orchestration-and-eval.md
reviewer=.devgod/work/reviews/review-2026-05-20-autonomous-phase-orchestration-and-eval-reviewer.md
qa_engineer=.devgod/work/reviews/review-2026-05-20-autonomous-phase-orchestration-and-eval-qa_engineer.md
security_reviewer=.devgod/work/reviews/review-2026-05-20-autonomous-phase-orchestration-and-eval-security_reviewer.md
review_exports=runtime_optional

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-20-autonomous-phase-orchestration-and-eval.md`
- `.devgod/work/tasks/task-2026-05-20-autonomous-phase-orchestration-and-eval.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `.devgod/work/reviews/review-2026-05-20-autonomous-phase-orchestration-and-eval-reviewer.md`
- `.devgod/work/reviews/review-2026-05-20-autonomous-phase-orchestration-and-eval-qa_engineer.md`
- `.devgod/work/reviews/review-2026-05-20-autonomous-phase-orchestration-and-eval-security_reviewer.md`
- `.devgod/work/coverage/coverage-2026-05-20-autonomous-phase-orchestration-and-eval.json`
- `.devgod/work/proofs/progress-2026-05-20-autonomous-phase-orchestration-and-eval.json`
- `src/domain/types.ts`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/admin/autonomous-summary.ts`
- `src/admin/report.ts`
- `src/evals/orchestration-baseline.ts`
- `tests/service.test.ts`
- `tests/orchestration-eval.test.ts`
- `tests/status-report.test.ts`

## Out of scope

- `.agents/`
- `.codex/`
- `.devgod/memory/`
- new external tracing providers or non-autonomous product features

## Assumptions

### Approved assumptions

- optional schema additions on runtime checkpoint/readiness records are acceptable if existing fixtures still validate
- the orchestration eval harness should exercise the same runtime decisions that the daemon/report surfaces expose

### Blocked assumptions

- do not treat a stale checkpoint as authoritative just because it is the last written artifact
- do not allow the runtime to return `complete` while a ready queue task or actionable autonomous continuation still exists

## Reasoning quality

### Claim

The final safe step is to make phase-readiness orchestration and checkpoint freshness explicit in runtime state, then bind eval coverage directly to those runtime decisions so the redesign cannot regress into shallow completion.

### Facts

- the redesign document defines strict analysis phases, backward transitions, and interruption-safe checkpoint/resume expectations
- the current runtime has coverage/comprehension gates but does not classify transitions or stale checkpoints explicitly
- the current eval suite does not yet cover the final redesign’s stale and shallow long-horizon orchestration cases

### Assumptions

- continuation scoring can be derived from existing coverage/gap/proof/checkpoint signals instead of requiring a separate scoring subsystem
- stale checkpoint detection should prefer execution-epoch freshness first and phase ordering second

### Hypotheses and alternatives

- preferred: extend existing runtime readiness and target-selection logic with optional epoch-aware checkpoint semantics and transition guidance
- alternative: leave runtime decisions unchanged and add eval-only assertions
- alternative: add a separate orchestration planner state distinct from autonomous execution state

### Evidence refs

- `docs/autonomous-execution-redesign.md`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/evals/orchestration-baseline.ts`

### Counter-evidence

- some fail-closed behavior already exists via gap and proof gates, so the implementation should add only the missing orchestration semantics

### Confidence

High

### Open questions

- whether transition guidance should recommend a fallback phase for every blocker or only for the documented backward-transition states
- whether continuation scoring should remain derived-only or be persisted later as part of runtime reports

### Verification plan

- add unit/integration tests for phase-readiness classification, stale checkpoint filtering, and epoch-aware progress transitions
- extend orchestration eval cases to prove shallow completion, contradiction loops, interrupted resume, and backlog-not-exhausted false completion are rejected
- run focused service/report/eval verification and workflow proof/live proof for this task

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
- label: `runtime-orchestration-closeout`
- hypothesis: the cleanest closeout is to extend the current runtime readiness path rather than add a parallel orchestration abstraction
- alternatives: `eval-only-closeout`, `separate-orchestration-store`
- evidence refs: `src/runtime/autonomous-execution.ts`, `src/core/service.ts`, `docs/autonomous-execution-redesign.md`
- verification refs: `verification-1`
- trace ref: `repo-audit`
- outcome: `supported`
- summary: the runtime already owns coverage, comprehension, checkpoint, and proof authority, so the final orchestration semantics should land there too

### Verification records

- id: `verification-1`
- kind: `repo_audit`
- ref: `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md`
- status: `passed`
- summary: the reopened plan sequences orchestration/eval as the final slice after coverage and understanding authority

### Verdict

- status: `supported`
- summary: proceed with runtime phase-readiness/orchestration closeout and eval-backed fail-closed coverage
- supporting attempt ids: `attempt-1`
- blocking issues: `none`

## Behavior to preserve

- authenticated review plus runtime workflow proof remains the final completion authority
- existing coverage/gap/proof/comprehension blockers remain authoritative and are not downgraded by the new orchestration layer

## Acceptance criteria

- phase-readiness records classify the next transition, blocker kind, and continuation score for the current autonomous phase
- stale checkpoints are detectable and do not outrank fresher progress-proof or same-epoch continuation guidance
- orchestration eval coverage proves the final redesign’s shallow/false completion paths fail closed

## Good-path checks

- a fully satisfied final-verification run reports ready/advance guidance with no stale-checkpoint blocker
- a fresh checkpoint in the current execution epoch can still guide resume behavior when no newer proof exists
- a ready queue task still prevents false completion even if autonomous state alone looks terminal

## Verification steps

- run `node --experimental-strip-types --test tests/service.test.ts tests/orchestration-eval.test.ts`
- run `node --experimental-strip-types --test tests/status-report.test.ts`
- run `node --experimental-strip-types --test tests/report-command.test.ts`
- run `npm run typecheck`
- run `bash scripts/check-devgod-workflow.sh --task-id 2026-05-20-autonomous-phase-orchestration-and-eval`
- run `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-20-autonomous-phase-orchestration-and-eval`

## Required reviews

- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Security checks

- confirm stale checkpoints cannot override fresher execution-epoch or progress-proof guidance
- confirm backward-compatible schema widening still validates unsupported understanding-map kinds at runtime
- confirm report output stays derived from runtime-authoritative state and does not create an alternate completion authority

## Retrieval guidance

- prefer runtime/service/report/eval codepaths that already compute autonomous readiness before adding new orchestration state
- use `docs/autonomous-execution-redesign.md` only as the contract reference; implementation proof must come from repo code and tests

## Anti-patterns to avoid

- adding a second orchestration state machine outside the existing autonomous runtime
- treating stale checkpoint markdown or narrative summaries as stronger than runtime epoch/proof state
- marking the product complete while a ready queue task or actionable continuation target still exists

## Rollback notes

- revert the orchestration runtime/report/test changes and restore the previous autonomous phase-readiness semantics
- remove the final closeout evidence artifacts and return the queue to `ready` for this task if workflow proof fails after rollback

## Handoff format

- summary + blocker status + verification commands + changed files

## Bad-path or edge-case checks

- contradiction gaps force a backward transition from modernization or migration work
- stale checkpoints in older epochs are ignored for continuation selection and surfaced as readiness blockers
- exhausted retry budget blocks continuation with an explicit blocker classification
