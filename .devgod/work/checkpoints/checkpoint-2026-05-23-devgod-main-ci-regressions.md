# Checkpoint

## Task

`2026-05-23-devgod-main-ci-regressions`

## Status

`done`

## Date

`2026-05-23`

## Completed in this slice

- audited the hosted `main` failures down to the two real regressions left after the workflow remake
- verified that the current `src/admin/autonomous-summary.ts` worktree export surface already resolves the Linux `selectLocalContinuationProvider` import failure
- added a focused cross-platform regression assertion in `tests/setup-powershell-smoke.test.ts` so the PowerShell fallback database URL syntax is checked even on non-Windows runners
- fixed the PowerShell parser error in `scripts/setup-devgod.ps1` by bracing `postgresUser` inside the interpolated connection string
- passed the focused Linux admin/report/retrieval verification, passed the PowerShell smoke test, and seeded runtime proof run `44267093-be8c-4536-b292-e2cd868fb78e`

## Evidence

- `src/admin/autonomous-summary.ts`
- `scripts/setup-devgod.ps1`
- `tests/setup-powershell-smoke.test.ts`
- `gh run view 26330193347 --repo WitchyNibbles/DevGod --json conclusion,event,headBranch,headSha,jobs,name,url,workflowName`
- `node --experimental-strip-types --test tests/admin.test.ts tests/repo-markdown-indexer.test.ts tests/report-command.test.ts tests/retrieval-refresh.test.ts`
- `node --experimental-strip-types --test tests/setup-powershell-smoke.test.ts`
- `node --experimental-strip-types src/admin/devgod.ts seed-workflow-proof --workspace-slug default --project-slug devgod --task-id 2026-05-23-devgod-main-ci-regressions`

## Key decisions recorded

- treat the Linux failure as a verification-and-preserve path, not a second speculative code edit, because the current worktree already contains the needed export surface
- harden the Windows regression with a source-level assertion against the exact invalid `$postgresUser:` interpolation pattern
- keep this slice narrow to the two named hosted CI failures and avoid reopening the workflow YAML

## Remaining work

- rerun hosted CI on the rewritten workflow to observe the repaired Linux and Windows lanes on actual runners
- resume the queued `2026-05-23-devgod-codex-verification-and-rollout` follow-on slice when its write scope is activated

## Next recommended action

Advance from this repair slice into the queued rollout-verification task once the repo activates that task packet.

## Notes

The Linux import regression did not require a new production patch in this slice because the active local `src/admin/autonomous-summary.ts` diff already supplied the missing export. This task's contribution there was focused verification and workflow proof, while the only new source edit landed in the PowerShell setup path.
