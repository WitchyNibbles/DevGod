# Maintainer Quality Tooling

This repo keeps its improvement and anti-regression tooling on the maintainer path only.

## Boundaries

- These tools live only in the `devgod` source repo.
- They are not added to target-repo install manifests.
- They are not added to `package.json.files`.
- They are exercised through maintainer-only scripts and CI jobs.

## Directories

- `evals/promptfoo/`
- `evals/promptfoo/providers/`
- `tests/properties/`
- `stryker-maintainer-boundary.config.json`

## Scripts

- `npm run test:properties`
- `npm run eval:promptfoo:maintainer-boundary`
- `npm run test:mutation:maintainer-boundary`
- `npm run test:mutation:maintainer-boundary:dry-run`

## CI jobs

- `property-regressions`
- `promptfoo-maintainer-boundary`
- `mutation-maintainer-boundary`

## Notes

- `promptfoo` is pinned to `0.120.19` because the repo currently runs on Node `22.16.0`, while newer promptfoo releases require `^20.20.0 || >=22.22.0`.
- The mutation lane is intentionally narrow and the CI job uses `--dry-run`; maintainers keep the deeper mutation command for local use.
