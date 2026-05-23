# Task Packet

## Task ID

`2026-05-23-devgod-codex-cli-scheduler-adapter`

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

Translate CLI-scheduler deferred continuation into a durable scheduled-exec handoff with prompt, schema, and launcher guidance so CLI-only environments can defer work without re-entering the continuation loop.

## Inputs

- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-cli-scheduler-adapter.md`
- `docs/codex-automation-surface-integration-plan.md`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/runtime-surface.test.ts`
- `tests/ops-recovery.test.ts`

## Dependencies

- `2026-05-23-devgod-codex-app-automation-adapter`

## Outputs

- durable CLI scheduler request artifacts with prompt, output schema, and launcher guidance
- supervisor behavior that materializes CLI handoff files and stops without rerunning daemon continuation
- status/report visibility for CLI scheduler handoff artifacts and actions
- regression coverage for CLI handoff good paths and manual fallback edges

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-cli-scheduler-adapter.md`
- `.devgod/work/tasks/task-2026-05-23-devgod-codex-cli-scheduler-adapter.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-cli-scheduler-adapter.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-app-automation-adapter.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/runtime-surface.test.ts`
- `tests/ops-recovery.test.ts`

## Out of scope

- `.agents/`
- `.codex/`
- `.devgod/memory/`
- direct scheduler installation or service ownership
- PR and CI repair beyond this slice

## Acceptance criteria

- CLI-owned deferred continuation emits a durable handoff artifact that includes `codex exec` invocation details, output-schema guidance, and launcher hints
- same-thread CLI fallback records explicit resume guidance when session context exists and explicit limits when it does not
- supervisor records a materialized CLI scheduler action and stops without rerunning daemon continuation
- app and manual provider behaviors remain unchanged in this slice

## Verification steps

- `node --experimental-strip-types --test tests/admin.test.ts`
- `node --experimental-strip-types --test tests/status-report.test.ts`
- `node --experimental-strip-types --test tests/runtime-surface.test.ts`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts`

## Required reviews

- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Security checks

- confirm CLI handoff artifacts do not mark work complete or override runtime truth
- confirm unsupported scheduler conditions fall back to explicit manual handoff rather than silent execution
- confirm supervisor stops only after a durable CLI scheduler request exists
