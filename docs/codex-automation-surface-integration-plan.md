# Codex Automation Surface Integration Plan

Status date: `2026-05-23`

## Purpose

This plan converts current Codex app and CLI automation capabilities into a concrete `devgod` integration model that stops using hooks as a delayed-execution surrogate.

The core rule is simple:

- hooks may validate, block, or summarize
- hooks must not decide that "check back later" means "continue right now"

## What Codex ships today

### Codex app / desktop

Current official docs plus the live desktop automation surface in this environment show that the app includes native recurring automations and multiple execution modes:

- standalone automations start fresh background runs on a schedule and report findings in Triage
- thread automations are heartbeat-style wake-ups that return to the same thread on a schedule
- automations can run in the local project or in a dedicated background worktree for Git repositories
- automations inherit default sandbox settings, so unattended runs already have an explicit safety model
- the live app automation surface exposes both recurring project automations and thread-targeted heartbeat automations
- the app also supports worktree handoff between foreground and background task contexts

Operationally, this means the app already provides the missing wake-up primitive that `devgod` tried to fake through continuation prose.

### Codex CLI

Current official docs and local CLI help show that the CLI includes the primitives needed for local-first automation:

- `codex exec` is intended for pipelines, CI, and scheduled jobs
- `codex exec --json` emits JSONL events with turn, item, command, file-change, tool, and error records
- `codex exec --output-schema` constrains the final response to a JSON Schema for downstream parsing
- `codex exec resume` supports multi-stage or follow-up workflows that continue an earlier run
- `codex app-server` exists for richer client integrations but is not the recommended automation surface for jobs
- `codex remote-control` exists, but remains an optional operational surface rather than a core scheduler

Operationally, this gives `devgod` a stable non-app automation contract: launch `codex exec`, capture JSONL, parse a structured final result, and write authoritative state back into the runtime.

## Capability inventory mapped to `devgod`

| `devgod` intent | Preferred owner | Fallback owner | Why |
|---|---|---|---|
| `continue_now` | current run | none | no scheduler should be involved |
| `defer_same_thread` | Codex app thread automation | operator reminder / manual handoff | preserves the same thread and context |
| `defer_fresh_run` | Codex app standalone automation | CLI scheduled `codex exec` run | fresh runs should not reuse the existing thread by default |
| `blocked_external` | human/operator | none | scheduler must not paper over a real blocker |

## The architecture change `devgod` needs

### 1. Add wake-up ownership to runtime state

`devgod` should persist:

- `continuation_intent`
- `wake_provider`
- `wake_target`
- `wake_schedule`
- `wake_owner`
- `wake_job_id`
- `wake_thread_mode`

Example provider values:

- `codex_app_thread_automation`
- `codex_app_standalone_automation`
- `codex_cli_exec_scheduler`
- `manual_operator_handoff`

This keeps truth in runtime state and makes hooks consumers of authority instead of hidden decision-makers.

### 2. Split provider selection from provider execution

Provider selection should happen in `devgod` runtime/admin code.

Provider execution should happen in adapters:

- app automation adapter
- CLI scheduler adapter
- manual handoff adapter

That separation matters because the selection logic is stable policy, while the execution API surface may evolve.

### 3. Demote hooks to guard rails

After integration:

- `Stop` hook only checks whether runtime intent is `continue_now`, `defer_*`, or `blocked_external`
- `Stop` hook must never infer scheduling from free-form text like "check later" or "sleep"
- hook output may explain the existing wake owner, but must not manufacture a new one
- hook failures should block unsafe operations, not create synthetic continuation work

This is the main change that stops the repetition loop.

## Integration plan

### Phase 1. Capability envelope and state contract

Goal:
Persist enough state for `devgod` to know whether a wake-up belongs to the app, the CLI, or a human.

Deliverables:

- runtime schema for provider-backed wake-up ownership
- status/report surfaces that display current wake owner and schedule
- hook reads updated to consume this state instead of prose heuristics

Primary touchpoints:

- `src/admin.ts`
- `src/admin/autonomous-summary.ts`
- `src/core/service.ts`
- `src/runtime/autonomous-execution.ts`
- `plugins/devgod/scripts/hook-policy.mjs`
- `plugins/devgod/scripts/hook-utils.mjs`

### Phase 2. Codex app automation adapter

Goal:
When the app surface is available, translate `defer_same_thread` and `defer_fresh_run` into native app automations.

Behavior:

- `defer_same_thread` creates or updates a thread automation
- `defer_fresh_run` creates or updates a standalone automation
- Git repos default to worktree mode for unattended write-capable runs
- local project mode stays opt-in for operators who explicitly want foreground checkout mutation

Important rule:
the adapter should pass a durable prompt that tells Codex what to do each wake-up, when to report, and when to stop.

### Phase 3. CLI scheduler adapter

Goal:
Provide a fully supported path when the app is unavailable.

Behavior:

- schedule `codex exec` with a local scheduler chosen by environment
- use `--json` for event capture
- use `--output-schema` for stable final-result parsing
- use `resume` only for intentional multi-stage pipelines, not as a generic "keep going forever" loop

Recommended first wave:

- keep scheduler ownership external and simple at first
- let `devgod` emit the command, schedule metadata, and expected schema
- support cron/systemd/CI/operator-managed launchers before trying to internalize a scheduler daemon

This keeps the package local-first and avoids reinventing an app scheduler inside `devgod`.

### Phase 4. Optional deeper control-plane integrations

Goal:
Use `app-server` and `remote-control` only where they clearly improve UX without becoming correctness dependencies.

Good uses:

- richer operator visibility into running background tasks
- approvals and notifications on remote/mobile surfaces
- future host-level automation administration

Not good as a first-wave dependency:

- core deferred execution correctness
- the only way to create or maintain automation jobs

## Default provider policy

Use this precedence order:

1. If Codex app automation capability is available and the intent is `defer_same_thread`, use app thread automation.
2. If Codex app automation capability is available and the intent is `defer_fresh_run`, use app standalone automation.
3. If the app capability is unavailable but CLI automation is available, emit a CLI scheduled exec handoff.
4. If neither automation surface is available, record `manual_operator_handoff`.
5. If the state is a real blocker, record `blocked_external` and stop.

## How this removes the repetition problem

Today, the loop exists because delayed work is still represented as an active conversational obligation.

After this plan:

- same-turn obligation stays only in `continue_now`
- deferred work gets a concrete external wake owner
- hooks observe the owner instead of inventing one
- future runs re-enter from explicit scheduler state, not from a repeated assistant message pattern

That means "wait 10 minutes and check again" becomes a scheduled thread automation or a scheduled CLI run, not another stop-hook nudge to keep talking.

## Verification requirements

- a deferred follow-up no longer triggers immediate continuation in hook tests
- app-capable environments create the correct automation type for each continuation intent
- CLI-only environments emit a valid scheduled-exec handoff with JSONL and schema expectations
- runtime status surfaces always show one explicit wake owner
- blocked tasks never create automation jobs

## Recommended next implementation slice

Implement the provider-backed runtime envelope first, then land the app automation adapter, then the CLI scheduler adapter. That order keeps the architectural authority correct before wiring in individual execution surfaces.

## Sources

- [Codex app automations](https://developers.openai.com/codex/app/automations)
- [Codex app worktrees](https://developers.openai.com/codex/app/worktrees)
- [Codex CLI non-interactive mode](https://developers.openai.com/codex/noninteractive)
- [Codex app server](https://developers.openai.com/codex/app-server)
- [Codex remote connections](https://developers.openai.com/codex/remote-connections)
- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
