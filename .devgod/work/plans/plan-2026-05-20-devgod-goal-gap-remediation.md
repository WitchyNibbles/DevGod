# Plan

## Task ID

`2026-05-20-devgod-goal-gap-remediation`

## Goal

Close the remaining gap between DevGod's shipped runtime-backed workflow package and the broader autonomous execution goal in `docs/autonomous-execution-redesign.md` through small, dependency-ordered, research-backed, fully verified slices.

## Facts

- `docs/devgod-goal-gap-audit.md` identifies seven remaining gap classes: operator truth alignment, authoritative ledger export, automated code understanding, runtime trace capture, broader continuation actions, real compaction, and stronger evaluation/review controls.
- `.devgod/work/product-state.md` still declares the broader goal complete even though the audit and current docs say otherwise.
- the current runtime already has typed autonomy state and execution-plan machinery, so the remaining work should extend existing surfaces rather than replace them.
- `npm run check:coverage`, `npm run eval:orchestration`, and `npm run benchmark:orchestration -- --format markdown` currently pass and therefore can be used as starting verification anchors.

## Research basis

1. OpenAI agent evals and trace grading:
   use trace-backed, reproducible workflow evaluation and distinguish runtime traces from narrative summaries.
2. OpenAI Agents SDK:
   keep state, approvals, and orchestration explicit when the application owns workflow execution.
3. Anthropic eval guidance:
   evaluate the harness plus the model together using tasks, trials, graders, transcripts, and outcomes.
4. Anthropic context-engineering guidance:
   treat compaction and durable note-taking as operational systems, not only schema references.
5. LangGraph durable execution and human-in-the-loop guidance:
   persist checkpoints, resume safely, and gate sensitive actions with explicit interruption semantics.
6. SWE-bench official benchmark guidance:
   use reproducible, stateful coding-agent evaluation rather than repo-local self-scoring alone.

## Execution sequence

### 1. Operator truth alignment

Task: `2026-05-20-operator-truth-alignment`

Outputs:
- reopened `.devgod` queue and active markers
- product state aligned with the reopened goal
- status/report wording that distinguishes workflow-proof-only runs from autonomy-configured runs
- refreshed benchmark markdown reflecting the current evaluated baseline

Testing:
- focused status/report tests
- workflow queue validation
- benchmark regeneration smoke check

### 2. Authoritative coverage-ledger export

Task: `2026-05-20-authoritative-coverage-ledger-exports`

Depends on:
- `2026-05-20-operator-truth-alignment`

Outputs:
- exported coverage manifest plus item/gap/dependency/traces artifact set
- workflow check hardening so `coverage_ledger_required` enforces the fuller exported contract
- tests covering missing or malformed ledger artifacts

Testing:
- focused workflow-check, service, and ledger tests

### 3. Automated code-understanding inventory generation

Task: `2026-05-20-code-understanding-inventory`

Depends on:
- `2026-05-20-authoritative-coverage-ledger-exports`

Outputs:
- repo scanner(s) that generate initial coverage items and understanding maps from code
- operator/report visibility into generated inventory freshness and gaps

Testing:
- focused inventory/unit tests
- integration coverage for repo scan output and understanding-map ingestion

### 4. Runtime trace registry and capture

Task: `2026-05-20-runtime-trace-registry`

Depends on:
- `2026-05-20-code-understanding-inventory`

Outputs:
- trace registry module and exported trace artifacts
- runtime/admin surfaces for recording and inspecting risky-flow traces
- gap/report integration for missing trace evidence

Testing:
- focused runtime-trace validation and operator/report tests

### 5. Continuation-action and compaction hardening

Task: `2026-05-20-continuation-and-compaction-hardening`

Depends on:
- `2026-05-20-runtime-trace-registry`

Outputs:
- broader runtime-native continuation actions where support is safe
- automatic compressed-context artifact generation or normalization support
- improved resume/continuation reporting

Testing:
- focused loop/daemon/runtime-surface tests
- negative cases for unsupported or stale continuation state

### 6. External eval and sensitive-action review hardening

Task: `2026-05-20-external-eval-and-hitl-hardening`

Depends on:
- `2026-05-20-continuation-and-compaction-hardening`

Outputs:
- external-facing or semi-external eval harness layer for coding-agent behavior
- documented and tested sensitive-action review controls beyond end-of-task review only
- updated benchmark/eval docs with clear evidence labels

Testing:
- focused eval tests
- release/check-quality verification as appropriate

## Completion rule

The reopened product goal can only return to complete when:

- all queue tasks are `done`
- required focused tests and global checks pass
- product-state, task-queue, and docs no longer contradict the shipped reality
- the runtime and exported artifacts jointly support the broader autonomy claim without relying on stale narrative-only evidence

## Post-completion audit reopen

The 2026-05-20 completion audit found that the queue had been closed too early.

Contradictions closed on 2026-05-20:

- `docs/current-state.md` and `docs/autonomous-execution-redesign.md` now align with the shipped package-level redesign state
- the live `npm run status` surface now defaults to authoritative run `d141baef-0f7a-40df-9aec-ac60ad9235f7` with `autonomous.configured=true`
- the runtime directive model now includes the richer native action space required by the redesign in current package scope

The queue reopened, absorbed the final runtime slice under the active reopen task, and then closed again after authoritative verification.

### 7. Completion-proof truth alignment

Task: `2026-05-20-broader-autonomy-completion-reopen`

Outputs:
- workflow state reopened after the failed completion audit
- current-state and redesign docs aligned with shipped reality
- final runtime-native directive work absorbed under the active reopen task without further scope rollover

Testing:
- live status, eval, and benchmark command checks
- diff-hygiene check on workflow and docs artifacts

### 8. Runtime-native directive expansion and live autonomy proof

Task: `2026-05-20-runtime-native-directive-expansion`

Depends on:
- `2026-05-20-broader-autonomy-completion-reopen`

Outputs:
- richer runtime-native directive/action support aligned with the redesign
- native action coverage added from the redesign set:
  - `dispatch_subagents`
  - `trace_runtime`
  - `rebuild_inventory`
  - `checkpoint`
  - `replan_migration`
- a live autonomy-configured proof path now demonstrates the shipped package can exercise the broader continuation model
- operator/report surfaces and docs now reflect the stronger runtime authority

Testing:
- focused execution-plan, loop, daemon, and operator/report regressions
- status/eval coverage proving an authoritative run can surface `autonomous.configured=true`
- full coverage, typecheck, and status/eval verification

Implementation note:

- the active `2026-05-20-broader-autonomy-completion-reopen` task absorbed this slice directly to remove hook-managed scope friction; the queue entry remains as a completed audit-trail label
