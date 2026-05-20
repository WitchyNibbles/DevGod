# Intake Brief

## Brief ID

`brief-2026-05-20-broader-autonomy-completion-reopen`

## Task ID

`2026-05-20-broader-autonomy-completion-reopen`

## Goal

Reopen the broader autonomy remediation after the completion audit, absorb the final runtime-native directive and live-autonomy-proof work under the same active task, and close the broader redesign claim with authoritative runtime evidence.

## Verification plan

- align workflow state and shipped docs with the current repo/runtime truth
- record the specific unshipped redesign requirements that still block product-level completion
- verify the reopened status against live operator and eval commands

## Completion note

The reopened slice is now closed:

- `src/domain/types.ts` and `src/core/service.ts` ship the redesign-native runtime actions needed in current package scope, including `dispatch_subagents`, `trace_runtime`, `rebuild_inventory`, `checkpoint`, and `replan_migration`
- operator surfaces now expose those directives coherently
- the default authoritative run is now `d141baef-0f7a-40df-9aec-ac60ad9235f7` and reports `autonomous.configured=true`
- runtime reconciliation reports directive `complete` for that authoritative run

## Scope repair

The active task absorbed that runtime slice directly, removed the earlier scope blockage, and carried the product goal to completion.
