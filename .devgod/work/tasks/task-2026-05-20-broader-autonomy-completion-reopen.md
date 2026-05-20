# Task Packet

## Task ID

`2026-05-20-broader-autonomy-completion-reopen`

## Owner role

`planner`

## Completion standard

`specialist_verified`

## Required specialist roles

- `planner`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `product_acceptance`
- `reasoning_strict_required`

## Goal

Reopen the broader autonomy remediation after the completion audit, then carry the final runtime-native directive and live-autonomy-proof work under the same active task until the broader redesign claim is backed by authoritative runtime evidence.

## Inputs

- `docs/autonomous-execution-redesign.md`
- `docs/current-state.md`
- `docs/devgod-goal-gap-audit.md`
- `.devgod/work/plans/plan-2026-05-20-devgod-goal-gap-remediation.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `src/domain/types.ts`
- `src/core/service.ts`
- `src/admin/status.ts`

## Dependencies

- `2026-05-20-external-eval-and-hitl-hardening`

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-05-20-broader-autonomy-completion-reopen.md
plan=.devgod/work/plans/plan-2026-05-20-devgod-goal-gap-remediation.md
task=.devgod/work/tasks/task-2026-05-20-broader-autonomy-completion-reopen.md
review_exports=runtime_optional

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `.devgod/work/briefs/brief-2026-05-20-broader-autonomy-completion-reopen.md`
- `.devgod/work/plans/plan-2026-05-20-devgod-goal-gap-remediation.md`
- `.devgod/work/tasks/task-2026-05-20-broader-autonomy-completion-reopen.md`
- `docs/current-state.md`
- `docs/autonomous-execution-redesign.md`
- `src/domain/types.ts`
- `src/core/service.ts`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/report.ts`
- `tests/service.test.ts`
- `tests/status-report.test.ts`
- `tests/report-command.test.ts`
- `tests/runtime-surface.test.ts`
- `tests/ops-recovery.test.ts`

## Acceptance criteria

- workflow state and shipped docs align with the final completion-proof runtime state
- `docs/current-state.md` and `docs/autonomous-execution-redesign.md` describe the broader package-level redesign as shipped in this repo
- the active task scope no longer blocks runtime-native directive work and records that the absorbed slice is complete
- the runtime directive/action model matches the redesign-native action set required in current package scope
- a live autonomy-configured proof path is visible in the default authoritative operator surfaces

## Verification steps

- `npm run status`
- `npm run eval:orchestration`
- `npm run benchmark:orchestration -- --format markdown`
- `node --experimental-strip-types --test tests/service.test.ts tests/status-report.test.ts tests/report-command.test.ts tests/runtime-surface.test.ts tests/ops-recovery.test.ts`
- `npm run check:coverage`
- `npm run typecheck`
- `git diff --check -- .devgod/ACTIVE .devgod/work/product-state.md .devgod/work/task-queue.json .devgod/work/briefs/brief-2026-05-20-broader-autonomy-completion-reopen.md .devgod/work/plans/plan-2026-05-20-devgod-goal-gap-remediation.md .devgod/work/tasks/task-2026-05-20-broader-autonomy-completion-reopen.md docs/current-state.md docs/autonomous-execution-redesign.md src/domain/types.ts src/core/service.ts src/admin.ts src/admin/status.ts src/admin/report.ts tests/service.test.ts tests/status-report.test.ts tests/report-command.test.ts tests/runtime-surface.test.ts tests/ops-recovery.test.ts`

## Outcome

- workflow/product/docs state was reopened, repaired, and closed against live runtime evidence
- the native directive model now includes `dispatch_subagents`, `trace_runtime`, `rebuild_inventory`, `checkpoint`, and `replan_migration` in addition to the previously shipped directives
- the authoritative run `d141baef-0f7a-40df-9aec-ac60ad9235f7` is `approved`, reports `autonomous.configured=true`, and reconciles to directive `complete`
- the broader redesign claim is now supported by a live default operator run instead of narrative-only completion wording

## Current blocker

- none
