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
| Reasoning-quality skepticism layer across prompts, workflow artifacts, and runtime reporting | done | `src/core/reasoning-quality.ts`, `src/core/service.ts`, `src/admin/report.ts`, `src/admin/ops.ts`, `.devgod/rules/reasoning-quality.md`, `tests/service.test.ts`, `tests/report-command.test.ts`, `tests/control-layer-contract.test.ts` |
| Reasoning-quality hardening with strict lifecycle enforcement and legacy upgrade tooling | done | `src/domain/types.ts`, `src/domain/contracts.ts`, `src/core/reasoning-quality.ts`, `src/install/cli.ts`, `scripts/check-devgod-workflow.sh`, `tests/install.test.ts`, `tests/workflow-check.test.ts` |
| Strict reasoning mode as the default for unspecified workflows | done | `src/core/reasoning-quality.ts`, `src/install/cli.ts`, `.devgod/templates/task-packet.md`, `.devgod/rules/reasoning-quality.md`, `tests/service.test.ts`, `tests/install.test.ts`, `tests/orchestration-eval.test.ts` |

## Current Milestone

Autonomy loop rollout

## Completed Milestones

- Baseline autopilot control-layer scaffolding
- Runtime execution-plan authority surfaced to CLI, runtime helpers, MCP, and installed scripts
- Local runtime proof bootstrap restored live workflow validation for package-maintainer work
- Reasoning-quality skepticism and evidence discipline standardized across prompts, workflow artifacts, runtime routing, and reporting
- Reasoning-quality hardening added strict/dual/legacy lifecycle enforcement, migration tooling, and completion blocking on insufficient evidence
- Strict reasoning is now the default for unspecified runtime, CLI, template, and planning flows, with dual and legacy retained only as explicit compatibility modes

## Current Task

The queue remains idle, and the active maintenance slice `2026-05-15-strict-default-reasoning` is fully verified. This task aligned the runtime fallback, upgrade CLI, planning guidance, templates, rules, and regression fixtures so unspecified reasoning work now defaults to `strict` instead of drifting into compatibility behavior.

## Next Task

None queued. The current control-layer backlog for this autonomy milestone is complete.

## Blockers

- None.

## Verification Summary

- `npm run verify:review-identity` passed on 2026-05-15 after adding a repo-owned local review-identity adapter, live bindings, live fixtures, and explicit backend selection.
- `npm run doctor` passed on 2026-05-15 with review identity reported as live-trust ready and no advisories.
- `npm run status` reported adapterConfigured=true, selectedBackend=`devgod_local_seed`, and liveTrustReady=true on 2026-05-15.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-15-devgod-local-review-identity-setup` passed on 2026-05-15.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-15-devgod-local-review-identity-setup` passed on 2026-05-15 after seeding authoritative runtime proof for the task.
- `npm run setup:local` passed on 2026-05-15 after aligning the source-repo `.env` to the updated runtime/Qdrant/review settings and replacing the blocked default local password.
- `npm run doctor` passed with host-backed runtime access on 2026-05-15 for the local docker setup path.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-15-devgod-upgrade-configure` passed on 2026-05-15.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-15-devgod-upgrade-configure` passed on 2026-05-15 after seeding authoritative runtime proof for the task.
- `npm run typecheck` passed on 2026-05-15 for `2026-05-15-reasoning-quality-layer`.
- `npm test` passed on 2026-05-15 for `2026-05-15-reasoning-quality-layer`, including reasoning-quality coverage for debugging, planning, code review, schema investigation, and weak-evidence paths.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-15-reasoning-quality-layer` passed on 2026-05-15.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-15-reasoning-quality-layer` passed on 2026-05-15 after seeding authoritative runtime proof run `cb527270-3b4c-446f-9b94-4ae86bd1c6d8`.
- `npm run typecheck` passed on 2026-05-15 for `2026-05-15-reasoning-quality-hardening`.
- `npm test` passed on 2026-05-15 for `2026-05-15-reasoning-quality-hardening`, including strict routing, strict terminal blocking, legacy upgrade tooling, and dual-mode workflow checks.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-15-reasoning-quality-hardening` passed on 2026-05-15.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-15-reasoning-quality-hardening` passed on 2026-05-15 after seeding authoritative runtime proof run `bc242568-80c2-4de6-8768-7a25597306e8`.
- `npm run typecheck` passed on 2026-05-15 for `2026-05-15-strict-default-reasoning`.
- `npm test` passed on 2026-05-15 for `2026-05-15-strict-default-reasoning`, including strict-default runtime routing, CLI default parsing, report semantics, and orchestration eval fixture coverage.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-15-strict-default-reasoning` passed on 2026-05-15.
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-15-strict-default-reasoning` passed on 2026-05-15 after seeding authoritative runtime proof run `411b83b2-4bda-4abe-a2e8-67d5528e21ad`.
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

Manager-written review summaries were recorded for `reviewer`, `qa_engineer`, and `security_reviewer` for `2026-05-15-devgod-local-review-identity-setup`, and authoritative local proof run `42fe51d6-4a67-4363-858d-633196eb7c62` approved the task on 2026-05-15.
Manager-written review summaries were recorded for `reviewer`, `qa_engineer`, and `security_reviewer` for `2026-05-15-devgod-upgrade-configure`, and an authoritative local proof run `9edb1449-4718-4e4e-8db8-24434910928a` approved the task on 2026-05-15.
Manager-written review summaries were recorded for `reviewer`, `qa_engineer`, and `security_reviewer` for `2026-05-15-reasoning-quality-layer`, and authoritative local proof run `cb527270-3b4c-446f-9b94-4ae86bd1c6d8` approved the task on 2026-05-15.
Manager-written review summaries were recorded for `reviewer`, `qa_engineer`, and `security_reviewer` for `2026-05-15-reasoning-quality-hardening`, and authoritative local proof run `bc242568-80c2-4de6-8768-7a25597306e8` approved the task on 2026-05-15.
Manager-written review summaries were recorded for `reviewer`, `qa_engineer`, and `security_reviewer` for `2026-05-15-strict-default-reasoning`, and authoritative local proof run `411b83b2-4bda-4abe-a2e8-67d5528e21ad` approved the task on 2026-05-15.
Manager-written review summaries were recorded for `reviewer`, `qa_engineer`, and `security_reviewer` for `2026-05-13-runtime-loop-surface`, `2026-05-13-runtime-proof-seed`, `2026-05-13-runtime-directive-executor`, `2026-05-14-runtime-loop-history`, `2026-05-14-verification-harness-compat`, and `2026-05-14-runtime-task-advance`. The original control-layer gap around runtime-approved queue advancement is now closed.

## Active Verification Blocker

Resolved. The restricted-environment harness issues were fixed and the previously blocked runtime-task-advance slice now has passing artifact and live workflow proof.

- child `node` CLI parse checks now use exported behavior surfaces where appropriate
- hosted UI and setup-script health checks no longer require forbidden loopback listeners during tests
- `npm pack --json --dry-run` now uses a writable temp cache and file-backed capture in the install suite

## Last Updated

2026-05-15
