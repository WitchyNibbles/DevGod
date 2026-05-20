# Checkpoint Summary

## Run ID

`2026-05-21-adversarial-orchestration-evals`

## Checkpoint ID

`cp-2026-05-21-adversarial-orchestration-evals-01`

## Phase

`verification`

## Active targets

- `eval:orchestration/generated-adversarial-cases`
- `eval:orchestration/replay-ids`
- `tests:orchestration-baseline-determinism`

## Recent evidence refs

- `src/evals/orchestration-baseline.ts`
- `tests/orchestration-eval.test.ts`

## Open gaps

- `gap:fixture:missing-installed-repo-bad-path-fixtures`
- `gap:verification:missing-installed-repo-harness`

## Next actions

- switch active ownership to `2026-05-21-installed-repo-bad-path-fixtures`
- exercise install-style failure modes for missing adapters, stale exports, and incomplete setup
- preserve deterministic fixture diagnostics so consuming-repo failures stay reproducible

## Compressed context ref

`memory://2026-05-21-adversarial-orchestration-evals/cp-01`
