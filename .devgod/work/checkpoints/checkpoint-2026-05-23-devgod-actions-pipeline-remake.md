# Checkpoint

## Task

`2026-05-23-devgod-actions-pipeline-remake`

## Status

`done`

## Date

`2026-05-23`

## Completed in this slice

- audited the existing `.github/workflows/ci.yml` against `verify:release-overlay`, `check:quality`, and the repo's workflow-coupled tests
- verified from recent remote runs that the failures on `main` come from real source regressions rather than obsolete `checkout` or `setup-node` actions
- rewrote CI around explicit `release-overlay`, `live-migrations`, and `windows-setup-smoke` jobs plus a final `required-checks` summary gate
- added `workflow_dispatch`, `merge_group`, and workflow-level concurrency with `cancel-in-progress: true`
- updated the `actions/setup-node` pin from `v6.3.0` to the current `v6.4.0` commit while retaining read-only workflow permissions
- updated `tests/install.test.ts` and `tests/release-overlay.test.ts` so the repo now asserts the new CI contract rather than the old redundant `check:coverage` pre-step
- passed the focused CI-contract verification surface and seeded runtime proof run `71a1760e-7ff0-4806-ac76-90f4439d69b4`

## Evidence

- `.github/workflows/ci.yml`
- `tests/install.test.ts`
- `tests/release-overlay.test.ts`
- `gh run view 26330193347 --repo WitchyNibbles/DevGod --json conclusion,event,headBranch,headSha,jobs,name,url,workflowName`
- `node --experimental-strip-types --test tests/release-overlay.test.ts tests/install.test.ts`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-actions-pipeline-remake`

## Key decisions recorded

- the repo's release posture should be expressed directly through `verify:release-overlay` rather than a generic `test` job plus a duplicated coverage pre-step
- CI should expose one final required status gate for simpler branch-protection wiring
- merge-queue compatibility and run-cancellation are worth carrying in the source-controlled workflow because they reduce stale or ambiguous CI results without widening privileges
- the pipeline should stay honest about underlying source regressions instead of weakening checks to make `main` appear green

## Remaining work

- fix the underlying Linux import regression in `src/admin.ts` / `src/admin/autonomous-summary.ts`
- fix the PowerShell parser error in `scripts/setup-devgod.ps1`
- wire repository branch-protection settings to require the new `required-checks` status if maintainers want the single-gate model enforced remotely

## Next recommended action

Open the follow-on repair slice for the two real CI failures so the improved workflow can go fully green on hosted runners.

## Notes

The CI remake is complete and runtime-approved. The remaining failures are product regressions outside this task's workflow-and-test scope, which is why they were recorded explicitly instead of folded into the YAML rewrite.
