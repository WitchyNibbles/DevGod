# Product State

## Product Goal

Prevent control-layer stalls during autonomous continuation by making hook authority resolution explicit and by giving task packets a safe, typed way to hand off direct successor task files without broadening normal write scope.

## Global Acceptance Criteria

- hook context detects and surfaces runtime, queue, and `.devgod/ACTIVE` authority drift explicitly
- stop-hook behavior no longer depends only on parsing blocker prose when structured control-layer mismatch is already known
- active task packets can authorize exactly the successor task-packet writes needed for autonomous continuation without widening their normal edit scope
- focused hook regressions prove both the allowed handoff path and the denied out-of-scope path

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| authority mismatch detection in hook context | done | `plugins/devgod/scripts/hook-utils.mjs`, `tests/hooks.test.ts` |
| explicit stop-hook handling for structured control-layer mismatches | done | `plugins/devgod/scripts/hook-policy.mjs`, `tests/hooks.test.ts` |
| typed successor task-packet handoff scope | done | `plugins/devgod/scripts/hook-utils.mjs`, `plugins/devgod/scripts/hook-policy.mjs`, `tests/hooks.test.ts` |
| write-scope rule guidance for autonomous handoff packets | done | `.devgod/rules/write-scope.md`, `.devgod/work/tasks/task-2026-05-21-hook-autonomy-handoff-hardening.md` |

## Current Milestone

Hook autonomy handoff hardening

## Completed Milestones

- modernization mode rollout

## Current Task

`2026-05-21-hook-autonomy-handoff-hardening`

## Next Task

`none`

## Blockers

- none

## Reasoning Debt

- current task packets still need authors to declare successor handoff scope explicitly; this slice now enforces and documents that requirement instead of inferring arbitrary future scope
- stop-hook payloads still do not carry rich runtime state directly, so structured mismatch handling must come from locally readable workflow exports

## Verification Summary

- verified with `node --experimental-strip-types --test tests/hooks.test.ts`
- verified with `npm run typecheck`

## Review Summary

- focused hook regressions now cover queue-vs-ACTIVE mismatch visibility, structured stop-hook mismatch exits, and explicit successor task-packet handoff scope

## Last Updated

2026-05-21
