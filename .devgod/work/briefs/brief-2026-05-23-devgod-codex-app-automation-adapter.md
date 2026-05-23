# Intake Brief

## Brief ID

`brief-2026-05-23-devgod-codex-app-automation-adapter`

## Task ID

`2026-05-23-devgod-codex-app-automation-adapter`

## Request

Original user ask:

`implement the codex automation integration plan end-to-end, test edge cases, commit each task on a branch from main, open a PR, and fix CI until green`

## Goal

Turn deferred app-owned continuation into a durable Codex app automation request so the supervisor can stop at a real handoff boundary instead of synthesizing another continuation loop.

## Intended outcome

- app-thread continuation emits a heartbeat-style automation request artifact
- app-standalone continuation emits a standalone automation request artifact with explicit execution guidance
- supervisor materializes app automation handoff files and stops cleanly instead of enqueueing another operator continuation
- status and report surfaces make the app automation handoff visible and inspectable

## User

DevGod package maintainer shipping the approved Codex automation roadmap end-to-end.

## Constraints

- preserve runtime authority: app automation requests are adapters, not truth sources
- keep app integration optional and local-first
- do not require the Codex app tool surface for package correctness
- preserve manual and CLI fallback paths for later slices

## Risks

- generating app requests without a durable prompt could create wake-ups that re-enter ambiguously
- making the supervisor rerun after app handoff would recreate the repetition loop in a different place
- mixing same-thread and fresh-run semantics could cause the wrong automation mode to be suggested

## Assumptions

### Approved assumptions

- app automation creation remains a suggested or operator-applied handoff, not an immediate package-side API call
- supervisor is the right place to stop after a successful app handoff is materialized
- Git-backed repos should default standalone app automations toward worktree execution guidance

### Blocked assumptions

- do not assume all cron-like schedules map 1:1 onto app heartbeat semantics
- do not assume the current thread id is available inside package runtime state

## Evidence

- `docs/codex-automation-surface-integration-plan.md`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/ops-recovery.test.ts`

## Reasoning quality

### Facts

- the runtime slice now writes `automation-envelope.json` for deferred continuation with app or CLI providers
- the daemon and supervisor already use file-based handoff artifacts as the local coordination contract
- the current supervisor still converts blocked continuation into another operator continuation action and reruns the daemon

### Hypotheses and alternatives

- preferred: materialize provider-specific app automation request artifacts and stop after handoff
- alternative: add only a manual command for request rendering and leave supervisor behavior unchanged
- alternative: defer all adapter work to the CLI slice and keep app providers advisory-only

### Counter-evidence

- a manual-only render command would preserve the loop unless operators remembered to use it every time

### Confidence

`high`

### Research and debug budget

- implementation design choice: settled
- code/test exploration: bounded to daemon, supervisor, status, ops, and report surfaces

## Success Criteria

- app-thread and app-standalone providers each produce a durable request artifact with prompt and schedule data
- supervisor records a materialized app automation action instead of enqueueing a continuation rerun
- focused tests cover same-thread and fresh-run app handoffs plus reporting visibility

## Stop Go

`go`

## Next step

Implement app automation request materialization and supervisor handoff behavior, then commit the slice on the feature branch.
