# Product State

## Product Goal

Keep `devgod` trustworthy in consuming repos by improving integration awareness, evidence-gathering skepticism, and installation reliability.

## Global Acceptance Criteria

- existing consuming-repo Grafana configuration is detectable by shared `devgod` behavior
- managed debugging and research behavior avoids premature “no evidence” conclusions when broader investigation is warranted
- packaged install and upgrade flows remain deterministic and replayable for consuming repos
- verification includes installed-repo-style evidence, not only source-repo unit coverage

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Repo-aware Grafana detection | in_progress | intake brief and pending implementation for shared repo signal detection |
| Skeptical research and debugging guidance | in_progress | managed kernel and skill/prompt surfaces under review |
| Reliable consuming-repo install verification | in_progress | install harness and Grafana-enabled verification path under review |

## Current Milestone

Implement and verify Grafana detection, skepticism hardening, and install-path reliability for consuming repos.

## Completed Milestones

- scoped intake and risk triage for the Grafana, research, and install reliability concerns
- approved design direction to fix owning layers in package code plus installed-repo verification

## Current Task

`none`

## Next Task

`none queued`

## Blockers

- maintainer-only tooling now has verified package/export boundaries, but `promptfoo` remains pinned until the repo runtime moves past the newer Node engine floor
- richer repo preference capture and remember/replace prompts are still follow-up work

## Reasoning Debt

- existing install tests suggest some reliability already exists, so implementation should focus on the real gap between packaged capability and operator-visible behavior
- Grafana detection must distinguish “repo is configured for Grafana” from “Grafana MCP is currently callable in this exact session”

## Verification Summary

- Grafana integration intake is approved for consuming-repo users who want DevGod to inspect Grafana-backed logs during debugging and research
- the planned first slice is an opt-in consuming-repo install flag plus a DevGod-shipped Grafana MCP server, keeping runtime workflow authority separate from external log evidence
- the Grafana slice is now implemented with opt-in installer wiring, `.env.devgod` Grafana settings, a Loki-only Grafana MCP server, and debugging/research guidance updates
- focused verification passed for `tests/grafana-config.test.ts`, `tests/grafana-mcp-tools.test.ts`, `tests/install.test.ts`, and `tests/happy-path.test.ts`
- runtime-authoritative workflow proof approved `2026-05-27-grafana-logs-mcp-integration`, and `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-27-grafana-logs-mcp-integration` passed
- maintainer-only quality tooling now exists as a package-side hardening lane only, with explicit directories, scripts, and CI job boundaries
- `src/install/maintainer-boundary.ts` plus focused unit/property tests now prove maintainer-only scripts, devDependencies, and published paths do not leak into target repos
- `npm run eval:promptfoo:maintainer-boundary` now passes with three repo-local boundary scenarios and no model-key requirement
- `npm run test:mutation:maintainer-boundary` now passes with an `88.89%` mutation score on the boundary helper, while CI uses the dry-run lane
- `npm run verify:release-overlay` passed after adding the maintainer-only tooling, including the package dry-run proof that the new files stay out of the tarball
- local authoritative workflow proof run `05028a18-ab7f-45e0-8cd4-128f0151c3e6` approved `2026-05-28-devgod-maintainer-only-quality-tooling`
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-28-devgod-maintainer-only-quality-tooling` passed
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-28-devgod-maintainer-only-quality-tooling` passed
- repo-context memory proposal concludes that DevGod should add a derived repo-context profile in runtime registration metadata plus reviewed slot-aware memory for durable preferences and conventions
- the recommended first slice avoids a schema migration and reuses `runtime_project_registrations.manifest`, `memory_entries.metadata`, existing retrieval freshness checks, and later optional Qdrant indexing for structured slots
- branch `codex/repo-context-memory-rollout` now includes queue repair tooling, `refresh-repo-context`, planning-context hydration, and setup/install wiring
- focused repo-context tests passed: `tests/repo-context-profile.test.ts` and `tests/plan-context-command.test.ts`
- install/setup regressions passed in the full `tests/install.test.ts` suite after wiring `devgod:refresh-repo-context`
- broader regression suites passed: `tests/admin.test.ts`, `tests/autopilot-status.test.ts`, and `tests/task-queue-repair.test.ts`
- runtime workflow proof run `24201843-9778-4504-a39d-25a952ef1808` approved `2026-05-28-repo-context-memory-rollout`
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-28-repo-context-memory-rollout` passed
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-28-repo-context-memory-rollout` passed
- workflow integrity hardening is now implemented across proof seeding, contradiction reporting, recovery auditability, live workflow gates, service-level failure handling, Postgres persistence, and in-memory store semantics
- focused workflow integrity regressions passed for admin, service, ops recovery, report, status, postgres-store, workflow-integrity, and workflow-check suites
- combined verification passed with `334` tests green across `tests/admin.test.ts`, `tests/service.test.ts`, `tests/postgres-store.test.ts`, `tests/status-report.test.ts`, `tests/report-command.test.ts`, `tests/ops-recovery.test.ts`, `tests/workflow-integrity.test.ts`, and `tests/workflow-check.test.ts`
- manager-thread workflow artifact discovery now has a local fallback for canonical `.devgod` workflow exports in `plan-context`, and `node --experimental-strip-types --test tests/plan-context-command.test.ts` passed with a regression covering the blind spot
- runtime orphan-lock recovery released the stale `2026-05-29-grafana-research-install-hardening` write-scope lock, `seed-workflow-proof` approved `2026-05-31-manager-workflow-artifact-discovery-fix` in authoritative run `86e773f3-a3ce-4f86-bb9d-7230bcf98ddb`, and `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-31-manager-workflow-artifact-discovery-fix` passed

## Review Summary

- no review artifacts yet for this active slice

## Last Updated

2026-05-31
