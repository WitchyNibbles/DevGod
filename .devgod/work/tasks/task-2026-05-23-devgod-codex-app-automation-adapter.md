# Task Packet

## Task ID

`2026-05-23-devgod-codex-app-automation-adapter`

## Owner role

`backend_engineer`

## Completion standard

`specialist_verified`

## Required specialist roles

- `solution_architect`
- `backend_engineer`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `reasoning_strict_required`
- `checkpoint_resume_required`
- `regression_safety_required`
- `product_acceptance`

## Goal

Translate provider-backed deferred continuation into durable Codex app automation request artifacts and stop the supervisor at a real app handoff boundary instead of looping through another continuation run.

## Inputs

- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-app-automation-adapter.md`
- `docs/codex-automation-surface-integration-plan.md`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/ops-recovery.test.ts`

## Dependencies

- `2026-05-23-devgod-codex-automation-runtime-envelope`

## Outputs

- durable app automation request artifacts for thread and standalone deferred continuation
- supervisor behavior that materializes app handoff files and stops without re-entering the continuation loop
- status/report visibility for app automation handoff artifacts and actions
- regression coverage for app handoff good paths and edge cases

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-app-automation-adapter.md`
- `.devgod/work/tasks/task-2026-05-23-devgod-codex-app-automation-adapter.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-app-automation-adapter.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-automation-runtime-envelope.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/ops-recovery.test.ts`

## Out of scope

- `.agents/`
- `.codex/`
- `.devgod/memory/`
- CLI scheduler job generation
- PR and CI repair beyond this slice

## Acceptance criteria

- app-thread continuation emits a durable heartbeat-style request artifact with explicit wake prompt and schedule
- app-standalone continuation emits a durable standalone request artifact with explicit execution-environment guidance
- supervisor records a materialized app automation action and stops without rerunning daemon continuation
- manual and CLI provider behaviors remain unchanged in this slice

## Verification steps

- `node --experimental-strip-types --test tests/admin.test.ts`
- `node --experimental-strip-types --test tests/status-report.test.ts`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts`

## Required reviews

- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Security checks

- confirm app handoff artifacts do not mark work complete or override runtime truth
- confirm blocked external states still do not generate automation requests
- confirm supervisor stops only after a materialized app handoff exists
