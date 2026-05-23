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
- the branch lands as a PR to `main` with passing CI

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Canonical role catalog | complete | `src/devgod/agent-catalog.ts`, `src/domain/types.ts`, `src/core/policy.ts`, focused contracts/policy/admin/report tests passed |
| Catalog-derived validation and guidance | complete | retrieval guidance and role validation now derive from the catalog; focused tests passed |
| Catalog-to-artifact drift verification | complete | `src/devgod/agent-artifact-verifier.ts`, deterministic drift test in `tests/install.test.ts` passed |
| Expanded shipped day-one roster | complete | new `.codex/agents/*.toml`, `docs/devgod-agent-team.md`, package/install assertions passed |
| Anti-stall continuation proof | complete | optional-role handoff regression plus runtime/admin/status/ops suites passed |
| Release and PR CI proof | in_progress | full-suite, workflow proof, commit/push/PR, and CI pass still pending |

## Current Milestone

Release, PR, and CI proof

## Completed Milestones

- approved design and implementation plan
- clean branch-from-main baseline verification
- canonical catalog landed with derived validation and retrieval guidance
- catalog-to-artifact verifier landed with deterministic drift coverage
- expanded day-one agent roster shipped explicitly in package/docs surfaces
- anti-stall routing and runtime recovery regressions stayed green after the catalog rollout

## Current Task

`2026-05-23-devgod-agent-catalog-release-proof`

## Next Task

None until release proof closes.

## Blockers

- none

## Reasoning Debt

- final workflow-proof/live-proof compatibility still needs to be validated against the stricter branch-local task packet
- PR CI may still reveal packaging or branch-only regressions that local suites do not cover

## Verification Summary

- isolated branch `codex/devgod-agent-team-upgrade` created from `main`
- fresh worktree dependencies installed locally
- untouched branch baseline `npm test` passed with `597` passing and `0` failing tests
- approved design written to `docs/plans/2026-05-23-agent-catalog-manifest-design.md`
- implementation plan written to `docs/plans/2026-05-23-agent-catalog-manifest-implementation.md`
- `node --experimental-strip-types --test tests/contracts.test.ts tests/policy.test.ts` passed
- `node --experimental-strip-types --test tests/admin.test.ts tests/report-command.test.ts` passed
- `node --experimental-strip-types --test tests/install.test.ts` passed
- `node --experimental-strip-types --test tests/admin.test.ts tests/status-report.test.ts tests/runtime-surface.test.ts tests/ops-recovery.test.ts` passed

## Review Summary

- review summaries for the release-proof slice will be written after the final verification and publication pass

## Last Updated

2026-05-23
