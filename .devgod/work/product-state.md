# Product State

## Product Goal

Enable DevGod to continue from requirements through planning, implementation, verification, repair, review, and next-task selection until the product-level goal is complete or a real blocker exists.

## Global Acceptance Criteria

- Product state is tracked separately from single-task completion.
- Unblocked tasks can be selected from a queue with dependency awareness.
- Failed verification paths enter a bounded repair loop instead of stopping at the first failed command.
- Completion claims require explicit verification evidence.

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Full-project autopilot skill | done | `.agents/skills/devgod-autopilot/SKILL.md` |
| Repair-loop skill | done | `.agents/skills/devgod-repair-loop/SKILL.md` |
| Product-state template | done | `.devgod/templates/product-state.md` |
| Task-queue template | done | `.devgod/templates/task-queue.json` |
| Queue validation and next-task helper | done | `src/devgod/task-queue.ts`, `src/devgod/autopilot-status.ts` |
| Queue validation tests | done | `tests/autopilot-status.test.ts` |
| Runtime execution-plan engine | done | `src/core/service.ts`, `tests/service.test.ts`, `tests/actions.test.ts` |
| Admin/runtime loop surface | done | `src/admin.ts`, `src/admin/runtime-surface.ts`, `tests/ops-recovery.test.ts`, `tests/runtime-surface.test.ts` |
| MCP and install exposure for loop surface | done | `src/mcp/tools.ts`, `src/mcp/server.ts`, `src/install/merge.ts`, `tests/mcp-tools.test.ts`, `tests/install.test.ts` |
| Local runtime workflow-proof seeding | done | `src/admin.ts`, `src/install/merge.ts`, `tests/admin.test.ts`, `tests/install.test.ts` |
| Runtime directive execution beyond safe recovery | done | `src/core/service.ts`, `src/admin.ts`, `src/admin/runtime-surface.ts`, `tests/service.test.ts`, `tests/ops-recovery.test.ts`, `tests/runtime-surface.test.ts` |
| Persisted runtime loop execution history | done | `src/core/service.ts`, `src/admin/report.ts`, `src/admin.ts`, `src/admin/runtime-surface.ts`, `tests/service.test.ts`, `tests/admin.test.ts` |
| Runtime-approved task advancement into queue state | done | `src/admin.ts`, `src/devgod/task-queue.ts`, `tests/admin.test.ts`, `tests/autopilot-status.test.ts` |
| Verification harness compatibility under restricted/sandboxed execution | done | `src/install/cli.ts`, `tests/install.test.ts`, `tests/workflow-check.test.ts`, `tests/workflow-scaffold.test.ts`, `tests/orchestration-benchmark.test.ts`, `tests/orchestration-eval.test.ts`, `tests/ui-server.test.ts` |

## Current Milestone

Autonomy loop rollout

## Completed Milestones

- Baseline autopilot control-layer scaffolding
- Runtime execution-plan authority surfaced to CLI, runtime helpers, MCP, and installed scripts
- Local runtime proof bootstrap restored live workflow validation for package-maintainer work

## Current Task

No active implementation slice remains in the current queue. The runtime-task-advance slice was completed through the runtime-gated advancement command, which left `.devgod/ACTIVE` idle and `task-queue.json` with no remaining current task.

## Next Task

None queued. The current control-layer backlog for this autonomy milestone is complete.

## Blockers

- None.

## Verification Summary

- `node --experimental-strip-types --test tests/ops-recovery.test.ts tests/runtime-surface.test.ts tests/service.test.ts tests/admin.test.ts` passed.
- `npm test` passed.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-13-runtime-loop-surface` passed.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-13-runtime-loop-surface` passed on 2026-05-14.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-13-runtime-proof-seed` passed.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-13-runtime-proof-seed` passed on 2026-05-14.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-13-runtime-directive-executor` passed.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-13-runtime-directive-executor` passed on 2026-05-14.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-14-runtime-loop-history` passed.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-14-runtime-loop-history` passed on 2026-05-14.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-14-verification-harness-compat` passed.
- `DEVGOD_WORKSPACE_SLUG=default DEVGOD_PROJECT_SLUG=devgod bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-14-verification-harness-compat` passed on 2026-05-14.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-14-runtime-task-advance` passed.
- `DEVGOD_WORKSPACE_SLUG=default DEVGOD_PROJECT_SLUG=devgod bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-14-runtime-task-advance` passed on 2026-05-14.
- `node --experimental-strip-types src/admin/devgod.ts workflow-proof --workspace-slug default --project-slug devgod --run-id latest --task-id 2026-05-13-runtime-proof-seed` passed.
- `node --experimental-strip-types src/admin/devgod.ts workflow-proof --workspace-slug default --project-slug devgod --run-id latest --task-id 2026-05-13-runtime-loop-surface` passed.
- `node --experimental-strip-types src/admin/devgod.ts workflow-proof --workspace-slug default --project-slug devgod --run-id latest --task-id 2026-05-13-runtime-directive-executor` passed.
- `node --experimental-strip-types src/admin/devgod.ts workflow-proof --workspace-slug default --project-slug devgod --run-id latest --task-id 2026-05-14-runtime-loop-history` passed.
- `node --experimental-strip-types src/admin/devgod.ts workflow-proof --workspace-slug default --project-slug devgod --run-id latest --task-id 2026-05-14-verification-harness-compat` passed.
- `node --experimental-strip-types src/admin/devgod.ts workflow-proof --workspace-slug default --project-slug devgod --run-id latest --task-id 2026-05-14-runtime-task-advance` passed.
- `node --experimental-strip-types src/admin.ts advance-active-task --run-id 88ddf654-297a-4c5c-986e-255f09d22ae5 --apply` advanced the final queued slice and left the queue idle.

## Review Summary

Manager-written review summaries were recorded for `reviewer`, `qa_engineer`, and `security_reviewer` for `2026-05-13-runtime-loop-surface`, `2026-05-13-runtime-proof-seed`, `2026-05-13-runtime-directive-executor`, `2026-05-14-runtime-loop-history`, `2026-05-14-verification-harness-compat`, and `2026-05-14-runtime-task-advance`. The original control-layer gap around runtime-approved queue advancement is now closed.

## Active Verification Blocker

Resolved. The restricted-environment harness issues were fixed and the previously blocked runtime-task-advance slice now has passing artifact and live workflow proof.

- child `node` CLI parse checks now use exported behavior surfaces where appropriate
- hosted UI and setup-script health checks no longer require forbidden loopback listeners during tests
- `npm pack --json --dry-run` now uses a writable temp cache and file-backed capture in the install suite

## Last Updated

2026-05-14
