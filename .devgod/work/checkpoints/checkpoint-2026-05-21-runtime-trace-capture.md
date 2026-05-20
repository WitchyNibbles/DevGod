# Checkpoint Summary

## Run ID

`2026-05-21-runtime-trace-capture`

## Checkpoint ID

`cp-2026-05-21-runtime-trace-capture-01`

## Phase

`runtime-tracing`

## Active targets

- `runtime:trace-registry/freshness-and-provenance`
- `runtime:service/trace-capture-import-flow`
- `report:operator/runtime-trace-summaries`
- `tests:trace-status-report-regressions`

## Recent evidence refs

- `src/core/service.ts`
- `src/runtime/runtime-trace-registry.ts`
- `src/admin/status.ts`
- `src/admin/report.ts`
- `tests/service.test.ts`
- `tests/status-report.test.ts`
- `tests/report-command.test.ts`
- `tests/admin.test.ts`

## Open gaps

- `gap:edge-case:missing-adversarial-orchestration-evals`
- `gap:verification:missing-installed-repo-bad-path-fixtures`

## Next actions

- switch active ownership to `2026-05-21-adversarial-orchestration-evals`
- generate reproducible contradictory, stale, partial, and interrupted orchestration combinations
- persist failing adversarial seeds or fixtures so regressions replay deterministically

## Compressed context ref

`memory://2026-05-21-runtime-trace-capture/cp-01`
