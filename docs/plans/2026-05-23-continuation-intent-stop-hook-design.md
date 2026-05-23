# Continuation Intent And Stop Hook Design

Date: `2026-05-23`

## Outcome

Implement the first continuation-intent slice for `devgod` so deferred work stops looping through immediate `Stop` hook continuation, while maintainers can still run the package locally without cloud-only dependencies.

## Chosen approach

Hybrid narrow contract.

- add a small structured continuation-intent concept
- let the `Stop` hook prefer that structured signal
- keep the current assistant-message heuristics only as a fallback when no structured signal exists
- avoid building full scheduler or app-provider adapters in this slice

## Continuation intents

- `continue_now`
- `defer_same_thread`
- `defer_fresh_run`
- `blocked_external`
- `unknown`

## First-slice source of truth

For this slice, the hook reads an explicit continuation-intent from the active task packet when present.

That keeps the change local and testable:

- `plugins/devgod/scripts/hook-utils.mjs` can parse the task packet without importing TypeScript runtime modules
- workflow tasks can declare defer-later behavior structurally instead of encoding it in prose
- later slices can make runtime-generated intent authoritative without changing the hook contract again

In parallel, the runtime/admin summary layer emits the same intent classification so later adapter work can converge on one model.

## Hook behavior

`evaluateStop(...)` should behave as follows when an active task exists:

- `continue_now`: block stop and require continued execution
- `defer_same_thread`: allow stop
- `defer_fresh_run`: allow stop
- `blocked_external`: allow stop
- `unknown`: fall back to `shouldHoldStop(lastAssistantMessage)`

## Runtime summary behavior

`buildAutonomousOperatorSummary(...)` should expose a derived continuation intent:

- runtime-executable continuation => `continue_now`
- checkpoint-based advisory continuation => `defer_same_thread`
- progress-proof-based advisory continuation => `defer_fresh_run`
- operator-required blocking-gap or execution-plan continuation => `blocked_external`
- no safe classification => `unknown`

This first mapping is intentionally narrow and may be refined by the later adapter slices.

## TDD plan

1. Add failing hook tests proving:
   - explicit `defer_same_thread` no longer blocks stop
   - explicit `defer_fresh_run` no longer blocks stop
   - explicit `continue_now` still blocks stop
   - hook context can parse a task packet `## Continuation intent` section
2. Add failing runtime-summary tests proving:
   - checkpoint/operator-required guidance maps to `defer_same_thread`
   - progress-proof/operator-required guidance maps to `defer_fresh_run`
   - runtime-executable workflow-proof guidance maps to `continue_now`
3. Implement the smallest hook and runtime changes to pass the tests.
4. Run focused verification, then workflow-proof and live workflow check for the task.

## Risks

- task-packet intent is only a first-slice structured source and not the final long-term authority
- over-broad `blocked_external` mapping could hide some future defer-later cases until adapter work lands
- any weakening of `continue_now` semantics would be a regression, so tests must keep current immediate-work protection intact
