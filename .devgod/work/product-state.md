# Product State

## Product Goal

Make devgod’s shipped team shape manifest-driven through a canonical agent catalog that expands the day-one role roster, keeps explicit shipped artifacts, and proves stronger control without reintroducing continuation stalls, wait loops, or scope-stranding behavior.

## Global Acceptance Criteria

- one reviewed catalog defines the shipped role roster
- role validation and retrieval guidance derive from that catalog
- shipped `.codex/agents/*.toml` are verified against the catalog
- the day-one roster includes new core roles and optional domain specialists
- stricter control remains CI- and verification-oriented rather than creating unrelated runtime blockers
- continuation and recoverable-blocker regressions remain green
- the verified branch lands on `main` with passing CI

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Canonical role catalog | complete | `src/devgod/agent-catalog.ts`, `src/domain/types.ts`, `src/core/policy.ts`, focused contracts/policy/admin/report tests passed |
| Catalog-derived validation and guidance | complete | retrieval guidance and role validation now derive from the catalog; focused tests passed |
| Catalog-to-artifact drift verification | complete | `src/devgod/agent-artifact-verifier.ts`, deterministic drift test in `tests/install.test.ts` passed |
| Expanded shipped day-one roster | complete | new `.codex/agents/*.toml`, `docs/devgod-agent-team.md`, package/install assertions passed |
| Anti-stall continuation proof | complete | optional-role handoff regression plus runtime/admin/status/ops suites passed |
| Release and PR CI proof | complete | local workflow proof/live proof passed for `2026-05-23-devgod-codex-automation-rollout-verification`, `main` was fast-forwarded to `b96327a`, and hosted `CI` run `26392030568` completed successfully on the merged commit |
| Maintainer-only regression tooling boundary | complete | package/export boundary helper, promptfoo/property/mutation lanes, and release-overlay proof passed without shipping maintainer-only tooling to consuming repos |

## Current Milestone

Optional Grafana log-query integration and maintainer-only package-quality hardening are complete; a repo-context memory proposal is now prepared for the next consuming-repo intelligence slice

## Completed Milestones

- approved design and implementation plan
- clean branch-from-main baseline verification
- canonical catalog landed with derived validation and retrieval guidance
- catalog-to-artifact verifier landed with deterministic drift coverage
- expanded shipped day-one agent roster shipped explicitly in package/docs surfaces
- anti-stall routing and runtime recovery regressions stayed green after the catalog rollout
- release proof closed with local workflow proof, PR publication, and a green hosted CI workflow on the final branch tip
- maintainer-only regression tooling boundary for promptfoo, property tests, and mutation testing
- research and proposal for smarter consuming-repo repo-context memory

## Current Task

`2026-05-28-repo-context-memory-rollout`

## Next Task

`slice 1: queue compatibility repair and consuming-repo cleanup tool`

## Blockers

- no active blocker yet; current risk is choosing a Grafana query surface that stays aligned with the documented auth and Loki access model
- maintainer-only tooling now has verified package/export boundaries, but `promptfoo` remains pinned until the repo runtime moves past the newer Node engine floor
- smarter consuming-repo memory is still design-only; implementation, tests, and evals remain open
- active rollout risk: queue compatibility repair must stay strict enough to reject unknown task classes while still cleaning the known legacy alias

## Reasoning Debt

- GitHub did not attach automatic `pull_request` status checks to PR #5 for this branch, so hosted verification was confirmed through the repo’s own `CI` workflow via `workflow_dispatch` on the exact PR head commit.
- maintainer-only quality tooling now has boundary proof, but broader mutation and eval coverage can still expand incrementally from this baseline
- the repo-context memory slice currently has only a design artifact; no implementation or eval evidence exists yet

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
- implementation rollout opened on branch `codex/repo-context-memory-rollout` with slice order: queue repair, repo-context profiling, hydration/setup wiring, then regression and publish

## Review Summary

- reviewer, QA, and security runtime-authenticated approvals now exist for `2026-05-27-grafana-logs-mcp-integration`
- reviewer, QA, and security runtime-verified summaries are recorded for `2026-05-28-devgod-maintainer-only-quality-tooling`
- runtime-authenticated workflow proof approved the maintainer-only quality-tooling slice

## Last Updated

2026-05-28
