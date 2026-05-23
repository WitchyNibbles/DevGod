# Task Packet

## Task ID

`2026-05-23-devgod-codex-automation-rollout-verification`

## Owner role

`build_resolver`

## Completion standard

`specialist_verified`

## Required specialist roles

- `solution_architect`
- `backend_engineer`
- `build_resolver`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `reasoning_strict_required`
- `regression_safety_required`
- `product_acceptance`
- `release_readiness_required`

## Goal

Prove the full automation integration locally and in hosted CI, then publish the branch as a PR to `main` with any required code or pipeline fixes landed on the same branch.

## Inputs

- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `docs/codex-automation-surface-integration-plan.md`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/runtime-surface.test.ts`
- `tests/ops-recovery.test.ts`
- `tests/report-command.test.ts`
- `.github/workflows/ci.yml`

## Dependencies

- `2026-05-23-devgod-codex-cli-scheduler-adapter`

## Outputs

- broad local verification evidence for the automation integration
- PR to `main` from `codex/devgod-codex-automation-integration`
- CI repair commits if required
- final green hosted checks or explicit external blocker evidence

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `.devgod/work/tasks/task-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-cli-scheduler-adapter.md`
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
- `tests/report-command.test.ts`
- `.github/workflows/ci.yml`

## Out of scope

- `.agents/`
- `.codex/`
- `.devgod/memory/`
- unrelated product changes outside automation integration and CI repair

## Acceptance criteria

- broad local verification passes for the automation integration and adjacent runtime/reporting surfaces
- workflow/live verification for this task is healthy or any remaining issue is explicit and reproducible
- PR exists against `main`
- required CI checks are green after any necessary branch-local fixes

## Verification steps

- `node --experimental-strip-types --test tests/runtime-surface.test.ts`
- `node --experimental-strip-types --test tests/status-report.test.ts`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts`
- `node --experimental-strip-types --test tests/admin.test.ts`
- `node --experimental-strip-types --test tests/report-command.test.ts`
- `node --experimental-strip-types --test tests/hooks.test.ts`
- `git --git-dir=/home/eimi/projects/devgod/.git --work-tree=/home/eimi/projects/devgod diff --check`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-codex-automation-rollout-verification`

## Required reviews

- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Security checks

- confirm deferred automation artifacts never override runtime authority
- confirm app and CLI handoffs stay explicit about manual-review fallbacks
- confirm CI changes do not silently widen execution trust or bypass verification
