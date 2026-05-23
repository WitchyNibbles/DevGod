# Product State

## Product Goal

Make the shared `devgod` package use Codex-native local automation and desktop/app capabilities in a local-first way, without cloud-only dependence, without the current continuation-loop failure mode, and without workflow self-stalls that force users to repair scope or handoff problems the system can handle safely itself.

## Global Acceptance Criteria

- delayed follow-up is modeled explicitly instead of being encoded as another immediate continuation
- local CLI operators can use Codex-native automation paths without requiring Codex Cloud
- desktop/app-capable operators can use native Codex automation surfaces through `devgod`
- stop conditions, blockers, and wake-up ownership remain runtime-authoritative and testable
- recoverable workflow blockers such as scope escalation or successor handoff do not masquerade as terminal dead ends

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Separate immediate continuation from delayed automation | done | continuation-intent and Stop-hook slice |
| Support local-first Codex automation execution providers | done | local adapter slice plus runtime proof run `8d6b5c1e-aaee-4977-9691-643f2f0525be` |
| Integrate optional Codex desktop/app-native automation surfaces | in_progress | desktop/app slice remains active while follow-on rollout verification remains open |
| Verify loop prevention and operator guidance across supported paths | planned | queued verification slice |
| Keep workflow continuity moving through recoverable scope and handoff blockers | done | hook, template, queue, workflow-proof, and installed-harness repairs are implemented with focused regression coverage plus live workflow proof |

## Current Milestone

Codex automation integration verification and rollout, with runtime, app, and CLI slices implemented

## Completed Milestones

- source repo remote sync and local setup replay
- continuation-intent and Stop-hook reform
- local-first Codex automation adapters

## Current Task

`2026-05-23-devgod-codex-automation-rollout-verification`

## Next Task

`none`

## Blockers

- no workflow-contract scope blocker remains inside the completed CI regression repair slice
- no blocking workflow or installed-harness issue remains inside the completed implementation scope
- the current automation integration sequence is active and the rollout verification slice is the final required implementation step

## Reasoning Debt

- desktop/app-native integration and final rollout verification remain open after the CLI-first local adapter baseline
- the current recoverable-blocker handling is improved, but a fuller manager-owned continuity lane and richer blocker state model are still future work

## Verification Summary

- source-backed Codex automation research now records that the app has native standalone and thread automations, local-project vs background-worktree execution, and background triage reporting
- source-backed Codex automation research now records that the CLI supports scheduled-job-friendly `codex exec`, JSONL event streams, structured final outputs, and resume for staged automation flows
- `docs/codex-automation-surface-integration-plan.md` now captures the implementation order needed to move delayed execution ownership off hooks and onto native app or CLI automation providers
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

2026-05-23
