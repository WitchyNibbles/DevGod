# Intake Brief

## Brief ID

`brief-2026-05-23-devgod-codex-automation-rollout-verification`

## Task ID

`2026-05-23-devgod-codex-automation-rollout-verification`

## Request

Original user ask:

`implement the codex automation integration plan end-to-end, test edge cases, commit each task on a branch from main, open a PR, and fix CI until green`

Updated user instruction:

`do not make a PR to devgod, directly merge and commit the branch directly as eimi`

## Goal

Verify the end-to-end automation integration, merge the verified branch directly into `main` as `Eimi`, and repair any CI or workflow regressions until `main` is green.

## Intended outcome

- the local automation integration passes a broad regression sweep
- workflow and live checks remain healthy for the active verification task
- the verified feature branch is merged directly into `main`
- CI failures are investigated and fixed on the merged branch or `main`, including pipeline changes when the new automation features require them

## User

DevGod package maintainer shipping the approved Codex automation roadmap end-to-end.

## Constraints

- preserve branch-local history with task-scoped commits
- fix pipelines when they lag the new feature instead of weakening the feature to fit stale CI assumptions
- keep the branch based on `main` until the final direct merge
- do not absorb unrelated repo noise into the verification branch

## Risks

- broad verification may uncover dormant workflow/reporting regressions outside the adapter seams
- CI may fail on runner-specific assumptions that local tests do not exercise
- GitHub PR metadata may be unavailable under the current account, requiring a direct-merge path instead

## Assumptions

### Approved assumptions

- broad verification should happen after the runtime, app, and CLI slices are all committed
- GitHub CI results are the authority for hosted pipeline health
- pipeline edits are acceptable when they are the correct fix for automation-aware behavior

### Blocked assumptions

- do not assume local green equals hosted green
- do not assume every CI failure belongs to product code rather than workflow configuration

## Evidence

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

## Reasoning quality

### Facts

- runtime, app, and CLI slices now each have focused passing regression evidence
- the user explicitly redirected the publish step from PR creation to a direct merge into `main`
- this repo already has workflow and live-check scripts for workflow contract validation

### Hypotheses and alternatives

- preferred: run a broad local verification sweep, merge the verified branch into `main`, then repair any hosted CI regressions on the merged branch if required
- alternative: open the PR before broader local verification
- alternative: treat local passing tests as sufficient and skip hosted CI repair

### Counter-evidence

- skipping broader local verification would likely shift avoidable failures into CI and slow down the final loop

### Confidence

`high`

### Research and debug budget

- verification scope: broad regression bundle plus workflow checks
- CI repair loop: bounded to branch-local fixes until required checks pass

## Success Criteria

- broad local verification passes for the automation integration
- workflow proof/live checks for the verification slice are healthy or any blockers are explicit
- the verified branch is merged into `main` and required CI is green after any necessary fixes

## Stop Go

`go`

## Next step

Run the broad verification bundle, merge the branch directly into `main`, and repair CI until all required checks succeed.
