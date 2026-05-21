# Product State

## Product Goal

Add a modernization-grade DevGod execution mode for large brownfield repositories so the system can:

- map how critical repo pieces actually connect before rewrite claims
- reconstruct business rules and invariants explicitly
- identify duplicate capability families and centralization candidates
- choose architecture from bounded-context and consistency evidence
- sequence DB migration with expand/contract discipline
- execute incrementally with parity verification and continuation until the program is complete or explicitly stopped

## Global Acceptance Criteria

- rewrite and modernization recommendations are blocked until modernization-grade understanding thresholds are satisfied
- runtime state can carry cartography, invariants, duplicate-family, architecture-decision, migration-ledger, and parity evidence
- continuation prioritizes unresolved modernization risk rather than stopping after individual task completion
- installed-repo verification proves the modernization mode works in a consuming brownfield-style repo

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| modernization profile and readiness gates | done | `src/domain/types.ts`, `src/runtime/autonomous-execution.ts`, `tests/status-report.test.ts`, `tests/service.test.ts`, `tests/report-command.test.ts` |
| cartography artifacts beyond heuristic file inventory | done | `src/runtime/repo-inventory.ts`, `src/runtime/coverage-ledger.ts`, `tests/service.test.ts`, `tests/status-report.test.ts`, `tests/report-command.test.ts`, `tests/coverage-ledger.test.ts` |
| invariant and business-rule ledgers | done | `src/domain/types.ts`, `src/runtime/autonomous-execution.ts`, `src/runtime/coverage-ledger.ts`, `tests/service.test.ts`, `tests/status-report.test.ts`, `tests/report-command.test.ts` |
| duplicate-family detection and reporting | done | `src/domain/types.ts`, `src/runtime/autonomous-execution.ts`, `src/runtime/coverage-ledger.ts`, `src/core/service.ts`, `tests/service.test.ts`, `tests/status-report.test.ts`, `tests/report-command.test.ts` |
| architecture-fit comparison and ADR support | done | `src/domain/types.ts`, `src/runtime/autonomous-execution.ts`, `src/runtime/coverage-ledger.ts`, `src/core/service.ts`, `tests/service.test.ts`, `tests/status-report.test.ts`, `tests/report-command.test.ts` |
| DB migration ledger and parity sequencing | done | `src/domain/types.ts`, `src/runtime/autonomous-execution.ts`, `src/runtime/coverage-ledger.ts`, `src/core/service.ts`, `tests/service.test.ts`, `tests/status-report.test.ts`, `tests/report-command.test.ts` |
| installed-repo modernization harness coverage | done | `src/admin.ts`, `scripts/verify-installed-repo-harness.sh`, `tests/admin.test.ts`, `tests/happy-path.test.ts`, `tests/install.test.ts` |

## Current Milestone

Modernization mode rollout

## Completed Milestones

- four-pillar analysis-depth, verification, and autonomy-honesty hardening

## Current Task

`2026-05-21-modernization-mode-slice-06-installed-repo-harness`

## Next Task

`none`

## Blockers

- none; the modernization-mode rollout is complete in this repo

## Reasoning Debt

- first release is expected to optimize for TypeScript/JavaScript targets
- static call/dependency mapping must expose uncertainty instead of claiming exactness in dynamic code paths
- installed-repo proof currently uses a self-contained in-memory runtime harness instead of depending on local Postgres availability

## Verification Summary

- research/design captured in `docs/large-repo-modernization-mode.md`
- intake brief captured in `.devgod/work/briefs/brief-2026-05-21-large-repo-modernization-mode.md`
- roadmap captured in `.devgod/work/plans/plan-2026-05-21-large-repo-modernization-mode.md`
- slice 1 verified with `npm run typecheck`
- slice 1 verified with `node --experimental-strip-types --test tests/status-report.test.ts tests/service.test.ts tests/report-command.test.ts`
- slice 2 verified with `npm run typecheck`
- slice 2 verified with `node --experimental-strip-types --test tests/service.test.ts tests/status-report.test.ts tests/report-command.test.ts tests/coverage-ledger.test.ts`
- slice 3 verified with `npm run typecheck`
- slice 3 verified with `node --experimental-strip-types --test tests/service.test.ts tests/status-report.test.ts tests/report-command.test.ts`
- slice 4 verified with `npm run typecheck`
- slice 4 verified with `node --experimental-strip-types --test tests/service.test.ts tests/status-report.test.ts tests/report-command.test.ts`
- slice 5 verified with `npm run typecheck`
- slice 5 verified with `node --experimental-strip-types --test tests/service.test.ts tests/status-report.test.ts tests/report-command.test.ts`
- slice 6 verified with `npm run typecheck`
- slice 6 verified with `node --experimental-strip-types --test tests/admin.test.ts tests/happy-path.test.ts tests/install.test.ts`
- slice 6 verified with `bash scripts/verify-installed-repo-harness.sh`

## Review Summary

- slice 3 verification proved invariant-only evidence satisfies modernization comprehension and coverage ledger export paths
- slice 4 verification proved duplicate capability families, centralization candidates, and parity requirements persist in runtime and exported ledger state
- slice 5 verification proved architecture decisions, migration ledgers, and parity matrices persist in runtime state and exported ledger artifacts
- slice 6 verification proved a fresh installed repo can seed modernization_program evidence and surface ready rewrite-readiness without leaking package-repo runtime state

## Last Updated

2026-05-21
