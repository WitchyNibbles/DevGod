# Codex-Native Local Automation Roadmap

Status date: `2026-05-23`

## Purpose

This roadmap makes `devgod` use Codex-native local automation and Codex desktop/app features more directly, without relying on cloud-only capabilities and without reusing the current continuation-loop behavior as a fake scheduler.

## Problem summary

Today `devgod` already has strong runtime-backed continuation and blocker surfaces, but it still conflates at least two very different things:

- immediate continuation inside the current active Codex execution
- delayed follow-up that should wake up later through an automation or scheduler

That mismatch becomes especially visible in the `Stop` hook. A message that semantically means “pause and check later” can be interpreted as “continue execution now,” which creates noisy loops instead of a clean deferred handoff.

## Local-first principles

1. Runtime truth stays in `devgod`.
   `devgod` runtime state remains the authority for blockers, checkpoints, progress, and completion.

2. Execution surfaces are adapters.
   Codex CLI, Codex desktop/app automations, optional app-server control, and external local schedulers are execution providers, not truth sources.

3. No cloud-only dependence.
   Any first-wave architecture must work with local CLI automation alone.

4. Desktop/app support is first-class but optional.
   When Codex app features exist, `devgod` should use them natively; when they do not, the workflow should still function through CLI and local scheduling.

5. Delayed work is not immediate continuation.
   A scheduler wake-up must be represented differently from a same-turn retry.

## Current repo touchpoints

The roadmap centers on these package surfaces:

- `src/admin.ts`
- `src/admin/autonomous-summary.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/core/service.ts`
- `src/runtime/autonomous-execution.ts`
- `plugins/devgod/scripts/hook-policy.mjs`
- `plugins/devgod/scripts/hook-utils.mjs`
- `src/install/cli.ts`
- `docs/current-state.md`
- `tests/hooks.test.ts`
- `tests/ops-recovery.test.ts`
- `tests/status-report.test.ts`
- `tests/admin.test.ts`

## Target model

### 1. Continuation intent contract

`devgod` should represent at least four explicit continuation intents:

- `continue_now`
- `defer_same_thread`
- `defer_fresh_run`
- `blocked_external`

Meaning:

- `continue_now`: immediate same-session work is still valid
- `defer_same_thread`: preserve the current thread context and wake later
- `defer_fresh_run`: start a new independent run later from persisted state
- `blocked_external`: human action, scope expansion, auth, or another real blocker is required

### 2. Provider model

Each defer-later intent should resolve through a provider, not through stop-hook prose:

- `codex_app_thread_automation`
- `codex_app_project_automation`
- `codex_cli_exec_scheduler`
- `external_local_scheduler`
- `manual_operator_handoff`

This lets `devgod` choose the best available local surface without changing the core runtime contract.

### 3. Stop-hook reform

The `Stop` hook should only auto-continue when runtime intent is `continue_now`.

It should not infer scheduling from prose like “check later,” “sleep,” or “wait.” Instead, it should look for structured runtime state or a persisted handoff marker that explicitly says the next execution owner is:

- the current run
- a future automation
- a fresh scheduled run
- a human/operator

### 4. Desktop/app integration policy

When Codex desktop/app features are available, `devgod` should use them for:

- same-thread heartbeat follow-up loops
- delayed PR/review babysitting
- long-running local checks that should reopen the same conversation
- local operator notifications and check-ins

These should remain optional accelerators layered on top of the same runtime continuation-intent contract.

### 5. CLI-first fallback policy

When app features are unavailable, `devgod` should still support:

- `codex exec` for scripted non-interactive work
- JSONL output for machine-readable progress
- `--output-schema` for stable downstream parsing
- local scheduling through cron, systemd timers, CI, or similar local-first runners
- `notify` hooks for local awareness without changing truth authority

## Planned phases

### Phase 1. Continuation contract and hook reform

Goal:
Split immediate continuation from delayed execution and stop the loop class at the source.

Likely touchpoints:

- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/admin.ts`
- `src/admin/autonomous-summary.ts`
- `plugins/devgod/scripts/hook-policy.mjs`
- `plugins/devgod/scripts/hook-utils.mjs`

### Phase 2. Local automation adapters

Goal:
Add provider selection and handoff behavior for local-first deferred execution.

Likely touchpoints:

- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- new adapter/helper modules under `src/admin/` or `src/runtime/`

### Phase 3. Desktop/app-native integrations

Goal:
Use Codex app automations and desktop-oriented follow-up features when available, while preserving CLI fallback.

Likely touchpoints:

- `src/admin.ts`
- install/config guidance
- status/report surfaces
- operator handoff/reporting tests

### Phase 4. Install/config and operator surfaces

Goal:
Make packaged `devgod` installs expose the right local-first Codex behavior and discovery guidance.

Likely touchpoints:

- `src/install/cli.ts`
- docs and operator reports
- configuration merge logic

### Phase 5. Verification and rollout hardening

Goal:
Prove that delayed work no longer loops and that both CLI and app-capable environments behave correctly.

Likely touchpoints:

- `tests/hooks.test.ts`
- `tests/admin.test.ts`
- `tests/ops-recovery.test.ts`
- `tests/status-report.test.ts`
- new eval/fixture coverage where needed

## Acceptance model for the program

The broader Codex-native integration roadmap should not be considered done until:

- delayed follow-up is represented structurally, not inferred from prose
- the `Stop` hook no longer pushes deferred work into immediate continuation
- CLI-only environments have a complete supported path
- desktop/app-capable environments gain explicit native automation support
- verification covers both good-path and loop-prevention behavior

## Non-goals for the first wave

- mandatory Codex Cloud dependency
- consuming-repo rollout
- rewriting managed `.codex/` or `.agents/` assets as the first move
- replacing runtime workflow-proof authority with Codex-side state

## Recommended task sequence

1. `2026-05-23-devgod-codex-native-integration-roadmap`
2. `2026-05-23-devgod-continuation-intent-and-stop-hook`
3. `2026-05-23-devgod-local-automation-adapters`
4. `2026-05-23-devgod-desktop-app-integration-surfaces`
5. `2026-05-23-devgod-codex-verification-and-rollout`

## Notes

- Codex Cloud can remain an optional later enhancement, but it must not be required for correctness.
- Experimental Codex app-server surfaces should be treated as optional adapters until they prove stable enough for stronger package commitments.
