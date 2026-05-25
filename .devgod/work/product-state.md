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

## Current Milestone

Codex automation integration verification and rollout, with runtime, app, and CLI slices implemented

## Completed Milestones

- approved design and implementation plan
- clean branch-from-main baseline verification
- canonical catalog landed with derived validation and retrieval guidance
- catalog-to-artifact verifier landed with deterministic drift coverage
- expanded day-one agent roster shipped explicitly in package/docs surfaces
- anti-stall routing and runtime recovery regressions stayed green after the catalog rollout
- release proof closed with local workflow proof, PR publication, and a green hosted CI workflow on the final branch tip

## Current Task

`none`

## Next Task

`none`

## Blockers

- no active blocker remains

## Reasoning Debt

- GitHub did not attach automatic `pull_request` status checks to PR #5 for this branch, so hosted verification was confirmed through the repo’s own `CI` workflow via `workflow_dispatch` on the exact PR head commit.

## Verification Summary

- source-backed Codex automation research now records that the app has native standalone and thread automations, local-project vs background-worktree execution, and background triage reporting
- source-backed Codex automation research now records that the CLI supports scheduled-job-friendly `codex exec`, JSONL event streams, structured final outputs, and resume for staged automation flows
- `docs/codex-automation-surface-integration-plan.md` now captures the implementation order needed to move delayed execution ownership off hooks and onto native app or CLI automation providers
- `.env` now persists `DEVGOD_RUNTIME_MODE=managed`, so plain `npm run setup:local` succeeds without ad hoc overrides in this source repo
- repo-local GitNexus wiring is present in `.codex/config.toml` and `package.json`, with `.gitnexus/` generated and `npm run devgod:gitnexus:status` green
- the installer contract now strips repo-local GitNexus MCP config from default consumer installs unless `withGitNexus` is explicitly requested, and `node --experimental-strip-types --test tests/install.test.ts` plus `npm test` passed after the repair
- branch `codex/devgod-automation-rollout-verification` is pushed through `b841326`
- the earlier PR-creation dead end is no longer gating completion because the user explicitly redirected the publish step to a direct merge into `main`
- `main` now points to `b96327a` after a direct fast-forward merge from `codex/devgod-automation-rollout-verification`
- hosted GitHub Actions `CI` run `26392030568` completed successfully for `main` on commit `b96327a381c6651eb4bb2911c1ff5f10700cc52c`
- `2026-05-23-devgod-postmerge-ci-repair` is complete and the workflow export state is now synced to `state=complete`
- local authoritative workflow proof run `edc6f8a1-cfc7-42d7-9ba5-23dc98acc476` approved `2026-05-23-devgod-postmerge-ci-repair`
- `bash scripts/check-docs-runtime-drift.sh` now passes after restoring the required runtime-proven package status wording and explicit `report` command-family coverage in the docs
- `.github/workflows/ci.yml` now provisions Qdrant for `live-migrations` via `DEVGOD_QDRANT_URL=http://127.0.0.1:6333` without relying on a container-local `curl` health probe
- `node --experimental-strip-types --test tests/release-overlay.test.ts tests/install.test.ts` passed after locking the Qdrant-backed workflow contract and refreshed README expectations
- `node --experimental-strip-types --test tests/setup-powershell-smoke.test.ts` passed after updating the harness to expect `run devgod:setup:git-guard`
- `npm run verify:migrations:live` passed after the workflow service repair
- `2026-05-23-devgod-main-ci-regressions` is complete and the workflow export state is now synced to `state=complete` with no active task id
- the hosted Linux `selectLocalContinuationProvider` failure is covered by the current `src/admin/autonomous-summary.ts` export surface and verified green locally without needing a second production edit in this slice
- the hosted Windows PowerShell parser failure is fixed in `scripts/setup-devgod.ps1` by bracing the interpolated `postgresUser` segment in the fallback database URL
- `node --experimental-strip-types --test tests/admin.test.ts tests/repo-markdown-indexer.test.ts tests/report-command.test.ts tests/retrieval-refresh.test.ts` passed with `79/79` tests green
- `node --experimental-strip-types --test tests/setup-powershell-smoke.test.ts` passed after adding the regression assertion for the invalid `$postgresUser:` interpolation form
- local authoritative workflow proof run `44267093-be8c-4536-b292-e2cd868fb78e` approved `2026-05-23-devgod-main-ci-regressions`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-main-ci-regressions` passed
- remote `main` run audit confirmed the recent CI failures are real repo regressions, not stale `actions/checkout` or `actions/setup-node` pins
- `.github/workflows/ci.yml` now runs `release-overlay`, `live-migrations`, and `windows-setup-smoke` under a single concurrency policy and a final `required-checks` summary gate
- `node --experimental-strip-types --test tests/release-overlay.test.ts tests/install.test.ts` passed after updating the workflow-coupled CI contract tests
- `git diff --check` passed for the workflow, tests, and active maintenance artifacts touched by this slice
- local authoritative workflow proof run `71a1760e-7ff0-4806-ac76-90f4439d69b4` approved `2026-05-23-devgod-actions-pipeline-remake`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-actions-pipeline-remake` passed
- prior maintenance slice completed and the repo returned to an idle workflow state before this roadmap intake began
- package-local Codex integration research identified the current continuation-loop mismatch and the relevant repo touchpoints
- the roadmap, checkpoint, and review summaries are now recorded for architecture, follow-on implementation, and verification work
- the active workflow has now been retargeted onto `2026-05-23-devgod-desktop-app-integration-surfaces`
- runtime proof run `0408ea18-9f03-4bea-8549-364fe1df6ff8` approved the roadmap task
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-codex-native-integration-roadmap` passed
- continuation-intent hook tests passed with explicit defer intent and task-packet parsing coverage
- runtime-surface continuation-intent tests passed for runtime-executable, checkpoint, and progress-proof classifications
- focused admin and ops-recovery verification passed after the continuation-intent change
- runtime proof run `950daa53-a8e1-44dc-8784-4de557dca376` approved the continuation-intent task
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-continuation-intent-and-stop-hook` passed
- focused admin, status-report, and ops-recovery provider tests passed after the local adapter change
- workflow-proof now advances the active runtime task into the next queued task automatically when continuation is available
- runtime proof run `8d6b5c1e-aaee-4977-9691-643f2f0525be` approved the local automation adapters task
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-local-automation-adapters` passed
- workflow diagnosis now cites the write-scope rule, hook policy, task template, queue semantics, and regression tests that explain the recurring self-blocking behavior
- the recommended architecture direction is a phased hybrid: coherence patch, recoverable blocker states, manager-owned continuity lane, then selective runtime-native envelopes
- managed-path read-only Bash inspection is now allowed while write-like managed-path commands remain denied outside explicit scope
- the task-packet template now exposes successor-task scope and scope-expansion protocol guidance
- recoverable scope-blocked current tasks now remain selectable instead of being dropped as dead-end blockers immediately
- workflow proof now advances the active runtime task into the next queued task and syncs workflow exports when authoritative approval is present
- `node --experimental-strip-types --test tests/hooks.test.ts` passed
- `node --experimental-strip-types --test tests/autopilot-status.test.ts` passed
- `node --experimental-strip-types --test tests/admin.test.ts` passed
- `node --experimental-strip-types --test tests/runtime-surface.test.ts` passed for the provider-backed runtime envelope slice
- `node --experimental-strip-types --test tests/status-report.test.ts` passed for the provider-backed runtime envelope slice
- `node --experimental-strip-types --test tests/ops-recovery.test.ts` passed for the provider-backed runtime envelope slice
- `node --experimental-strip-types --test tests/hooks.test.ts` passed for the provider-backed runtime envelope slice
- `git diff --check` passed for the provider-backed runtime envelope slice
- `node --experimental-strip-types --test tests/admin.test.ts` passed for the app automation handoff slice
- `node --experimental-strip-types --test tests/status-report.test.ts` passed for the app automation handoff slice
- `node --experimental-strip-types --test tests/ops-recovery.test.ts` passed for the app automation handoff slice
- `node --experimental-strip-types --test tests/report-command.test.ts` passed for the app automation handoff slice
- `node --experimental-strip-types --test tests/admin.test.ts` passed for the CLI scheduler handoff slice
- `node --experimental-strip-types --test tests/status-report.test.ts` passed for the CLI scheduler handoff slice
- `node --experimental-strip-types --test tests/ops-recovery.test.ts` passed for the CLI scheduler handoff slice
- `node --experimental-strip-types --test tests/report-command.test.ts` passed for the CLI scheduler handoff slice
- seeded authoritative workflow proof run `d088daef-60bb-493f-93f3-4c4d02d9fc0a` for `2026-05-23-devgod-desktop-app-integration-surfaces`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-desktop-app-integration-surfaces` now reaches authoritative workflow proof for this task
- `bash scripts/verify-installed-repo-harness.sh` passed after adding strip-types support to the harness inline module invocation
- `node --experimental-strip-types --test tests/happy-path.test.ts` passed

## Review Summary

- reviewer, QA, and security runtime-verified summaries are recorded for `2026-05-23-devgod-postmerge-ci-repair`
- runtime-authenticated workflow proof approved the post-merge CI repair slice
- reviewer, QA, and security runtime-verified summaries are recorded for `2026-05-23-devgod-main-ci-regressions`
- runtime-authenticated workflow proof approved the Linux/Windows CI regression repair slice
- reviewer, QA, and security markdown summaries are recorded for `2026-05-23-devgod-actions-pipeline-remake`
- runtime-authenticated workflow proof approved the CI maintenance slice
- the previous sync/setup slice is complete
- the roadmap slice for Codex-native local automation and desktop/app integration is complete
- reviewer, QA, and security planning summaries were recorded for the roadmap slice
- reviewer, QA, and security runtime-verified summaries were recorded for the continuation-intent slice
- reviewer, QA, and security runtime-verified summaries are recorded for the local automation adapters slice
- reviewer, QA, and security research summaries now record role-specific findings about the workflow self-blocking diagnosis and the recommended direction
- reviewer, QA, and security implementation summaries now record the landed workflow repair and passed verification state

## Last Updated

2026-05-25
