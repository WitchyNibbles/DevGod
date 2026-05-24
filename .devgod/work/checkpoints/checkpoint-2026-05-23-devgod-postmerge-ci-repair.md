# Checkpoint

## Task

`2026-05-23-devgod-postmerge-ci-repair`

## Status

`done`

## Date

`2026-05-23`

## Completed in this slice

- reproduced the post-merge `release-overlay`, `live-migrations`, and Windows smoke failures from the user-provided logs and narrowed them to one docs contract miss, one workflow service gap, and one stale test expectation
- restored the docs/runtime drift contract by adding the required runtime-proven status wording and explicit `report` command-family coverage
- provisioned Qdrant for the `live-migrations` GitHub Actions lane and kept readiness checking at the existing application retry layer instead of a brittle container-local `curl` probe
- updated the PowerShell smoke harness to expect the intentional `run devgod:setup:git-guard` step
- passed the targeted docs, workflow-contract, PowerShell smoke, and live-migrations verifiers, then seeded runtime proof run `edc6f8a1-cfc7-42d7-9ba5-23dc98acc476`

## Evidence

- `README.md`
- `docs/current-state.md`
- `.github/workflows/ci.yml`
- `tests/setup-powershell-smoke-runner.ts`
- `tests/release-overlay.test.ts`
- `tests/install.test.ts`
- `bash scripts/check-docs-runtime-drift.sh`
- `node --experimental-strip-types --test tests/release-overlay.test.ts tests/install.test.ts`
- `node --experimental-strip-types --test tests/setup-powershell-smoke.test.ts`
- `npm run verify:migrations:live`
- `node --experimental-strip-types src/admin/devgod.ts seed-workflow-proof --workspace-slug default --project-slug devgod --task-id 2026-05-23-devgod-postmerge-ci-repair`

## Key decisions recorded

- keep the docs repair literal and minimal so the drift checker is satisfied without a broad README rewrite
- fix `live-migrations` in workflow wiring rather than runtime code because the local command already passed and the hosted failure was a missing service dependency
- prefer application-level readiness retries over a Qdrant container health command that may depend on tooling the image does not ship

## Remaining work

- observe the hosted rerun on the branch to confirm the repaired GitHub Actions lanes pass on actual runners
- resume the queued `2026-05-23-devgod-codex-verification-and-rollout` slice when its write scope is activated

## Next recommended action

Push this repair slice and rerun the branch PR so GitHub Actions can confirm the hosted lanes match the local verification.

## Notes

The docs drift repair surfaced incrementally, so the slice intentionally verified after each contract miss instead of assuming the first wording patch would satisfy the entire overlay check.
