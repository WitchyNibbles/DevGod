# Product State

## Product Goal

Add a source-backed public frontier-model benchmark surface so `devgod` can compare its configured default model against the best available public agentic software-engineering scores without embedding benchmark answers.

## Global Acceptance Criteria

- `devgod` exposes a generated public benchmark report anchored on the best current public software-engineering benchmark fit
- the report compares the configured default model against current frontier peers with source URLs and dates
- benchmark contamination or memorization caveats are explicit
- committed benchmark markdown is generated and freshness-checked, not hand-maintained

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Public benchmark selection rationale | done | `docs/benchmarks/frontier-model-benchmark.md` |
| Configured default model detection | done | `src/evals/frontier-model-benchmark.ts` |
| Generated frontier comparison markdown | done | `docs/benchmarks/frontier-model-benchmark.md` |
| Benchmark freshness verification | done | `scripts/check-docs-runtime-drift.sh`, `tests/frontier-model-benchmark.test.ts`, and `tests/docs-runtime-drift-check.test.ts` |

## Current Milestone

Ship the public frontier-model benchmark comparison for `devgod`.

## Completed Milestones

- identified `SWE-Bench Pro (Public)` as the best current public benchmark fit for `devgod`'s agentic software-engineering comparison surface
- confirmed `SWE-Bench Verified` is no longer the right primary frontier benchmark because contamination risk is publicly documented
- confirmed the shipped default model is currently `gpt-5.4` via `.codex/config.toml`

## Current Task

`none`

## Next Task

`none queued`

## Blockers

- none

## Reasoning Debt

- some competitor scores may only be available through cross-vendor published comparison tables rather than each vendor's own release page
- the public split of `SWE-Bench Pro` is stronger than older public SWE-bench variants, but still not a clean-room benchmark

## Verification Summary

- source-backed research identified `SWE-Bench Pro (Public)` as the best public benchmark fit for repo-based software engineering comparison
- the repo already has a generated benchmark pattern and a docs/runtime drift check that can be extended for this benchmark
- `node --experimental-strip-types --test tests/frontier-model-benchmark.test.ts` passed
- `node --experimental-strip-types --test tests/docs-runtime-drift-check.test.ts` passed
- `bash scripts/check-docs-runtime-drift.sh` passed
- `npm run benchmark:frontier-models -- --format markdown` passed
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-31-public-frontier-model-benchmark` passed
- `npm run devgod:seed-workflow-proof -- --task-id 2026-05-31-public-frontier-model-benchmark` seeded authoritative runtime proof run `fd249dba-258b-42a6-9761-84c72e72ec0e`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-31-public-frontier-model-benchmark` passed
- `npm run typecheck` still fails on pre-existing repo issues outside this slice

## Review Summary

- runtime-authenticated reviewer, QA, and security approvals were seeded for `2026-05-31-public-frontier-model-benchmark`

## Last Updated

2026-05-31
