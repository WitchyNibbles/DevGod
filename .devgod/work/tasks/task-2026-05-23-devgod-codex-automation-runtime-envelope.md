# Task Packet

## Task ID

`2026-05-23-devgod-codex-automation-runtime-envelope`

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

Add the first real automation ownership layer to `devgod` runtime/admin code so deferred continuation emits explicit provider and schedule state instead of CLI-only advisory metadata.

## Inputs

- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-runtime-envelope.md`
- `docs/codex-automation-surface-integration-plan.md`
- `src/admin/autonomous-summary.ts`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `plugins/devgod/scripts/hook-policy.mjs`
- `plugins/devgod/scripts/hook-utils.mjs`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/ops-recovery.test.ts`
- `tests/runtime-surface.test.ts`
- `tests/hooks.test.ts`

## Dependencies

- `2026-05-23-devgod-codex-automation-surfaces-plan`

## Outputs

- provider-backed continuation types that include app and CLI scheduler ownership
- a durable automation-envelope sidecar artifact for deferred continuation
- status and ops reporting for the new envelope
- regression coverage for current and new provider paths

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-runtime-envelope.md`
- `.devgod/work/tasks/task-2026-05-23-devgod-codex-automation-runtime-envelope.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-automation-runtime-envelope.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `docs/codex-automation-surface-integration-plan.md`
- `src/admin/autonomous-summary.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin.ts`
- `plugins/devgod/scripts/hook-policy.mjs`
- `plugins/devgod/scripts/hook-utils.mjs`
- `tests/runtime-surface.test.ts`
- `tests/status-report.test.ts`
- `tests/ops-recovery.test.ts`
- `tests/admin.test.ts`
- `tests/hooks.test.ts`

## Out of scope

- `.agents/`
- `.codex/`
- `.devgod/memory/`
- direct automation creation through external surfaces
- PR and CI repair work beyond this slice

## Acceptance criteria

- deferred continuation can resolve to `codex_app_thread_automation`, `codex_app_standalone_automation`, `codex_cli_exec_scheduler`, or `manual_operator_handoff`
- deferred continuation persists machine-readable automation envelope data when applicable
- `continue_now` and `blocked_external` do not incorrectly emit automation jobs
- existing CLI-only behavior remains covered and compatible

## Verification steps

- `node --experimental-strip-types --test tests/runtime-surface.test.ts`
- `node --experimental-strip-types --test tests/status-report.test.ts`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts`
- `node --experimental-strip-types --test tests/admin.test.ts`
- `node --experimental-strip-types --test tests/hooks.test.ts`

## Required reviews

- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Security checks

- confirm blocked external states do not auto-schedule work
- confirm provider selection is explicit and testable
- confirm envelope artifacts do not weaken runtime authority
