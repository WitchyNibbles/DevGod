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

Desktop/app-native Codex integration surfaces, with workflow self-blocking repair completed and follow-on rollout verification queued

## Completed Milestones

- source repo remote sync and local setup replay
- continuation-intent and Stop-hook reform
- local-first Codex automation adapters

## Current Task

`none`

## Next Task

`2026-05-23-devgod-codex-verification-and-rollout`

## Blockers

- no workflow-contract scope blocker remains inside the active task packet
- no blocking workflow or installed-harness issue remains inside the completed implementation scope

## Reasoning Debt

- desktop/app-native integration and final rollout verification remain open after the CLI-first local adapter baseline
- the current recoverable-blocker handling is improved, but a fuller manager-owned continuity lane and richer blocker state model are still future work

## Verification Summary

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
- seeded authoritative workflow proof run `d088daef-60bb-493f-93f3-4c4d02d9fc0a` for `2026-05-23-devgod-desktop-app-integration-surfaces`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-desktop-app-integration-surfaces` now reaches authoritative workflow proof for this task
- `bash scripts/verify-installed-repo-harness.sh` passed after adding strip-types support to the harness inline module invocation
- `node --experimental-strip-types --test tests/happy-path.test.ts` passed

## Review Summary

- the previous sync/setup slice is complete
- the roadmap slice for Codex-native local automation and desktop/app integration is complete
- reviewer, QA, and security planning summaries were recorded for the roadmap slice
- reviewer, QA, and security runtime-verified summaries were recorded for the continuation-intent slice
- reviewer, QA, and security runtime-verified summaries are recorded for the local automation adapters slice
- reviewer, QA, and security research summaries now record role-specific findings about the workflow self-blocking diagnosis and the recommended direction
- reviewer, QA, and security implementation summaries now record the landed workflow repair and passed verification state

## Last Updated

2026-05-23
