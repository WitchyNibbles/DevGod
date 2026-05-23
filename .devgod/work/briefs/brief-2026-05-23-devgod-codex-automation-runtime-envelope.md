# Intake Brief

## Brief ID

`brief-2026-05-23-devgod-codex-automation-runtime-envelope`

## Task ID

`2026-05-23-devgod-codex-automation-runtime-envelope`

## Request

Original user ask:

`implement the codex automation integration plan end-to-end, test edge cases, commit each task on a branch from main, open a PR, and fix CI until green`

## Goal

Implement the first production slice of the Codex automation roadmap by replacing CLI-only advisory continuation metadata with a provider-backed runtime automation envelope that can describe app-thread, app-standalone, CLI-scheduled, or manual wake-up ownership.

## Intended outcome

- runtime continuation state includes explicit wake-up provider and schedule metadata
- blocked or deferred continuation writes a durable automation envelope artifact instead of relying on prose
- daemon, status, and operator reports expose the same automation ownership contract
- hooks can observe explicit automation ownership without becoming the scheduler

## User

DevGod package maintainer shipping the approved Codex automation roadmap end-to-end.

## Constraints

- preserve local-first correctness without requiring Codex Cloud
- keep hooks as policy/guard rails, not scheduling authorities
- do not break existing CLI-only continuation flows
- land the smallest useful vertical slice first and verify it thoroughly before expanding

## Risks

- adding provider metadata without schedule metadata would leave app and CLI integrations underspecified
- widening the provider contract incorrectly could regress existing daemon/status behavior
- encoding app-only assumptions into shared runtime state could break CLI-only installs

## Assumptions

### Approved assumptions

- the user’s prior “start implementing it” message is approval of the recorded plan/design
- the first useful implementation slice is the runtime envelope, not direct job creation
- app automation creation can remain an adapter concern after runtime state is explicit

### Blocked assumptions

- do not assume prose like “check later” is enough to derive schedule or provider
- do not assume experimental app-server or remote-control surfaces are part of correctness

## Evidence

- `docs/codex-automation-surface-integration-plan.md`
- `src/admin/autonomous-summary.ts`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `plugins/devgod/scripts/hook-policy.mjs`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/ops-recovery.test.ts`
- `tests/runtime-surface.test.ts`

## Reasoning quality

### Facts

- current provider selection only returns `codex_cli_exec` or `none`
- runtime continuation state currently lacks schedule metadata and durable automation-envelope artifacts
- hook stop behavior already respects structured defer intents, so the main remaining gap is durable wake-up ownership
- the daemon already persists other workflow sidecar artifacts such as continuation status, operator handoff, and scope expansion requests

### Hypotheses and alternatives

- preferred: add provider, schedule, and automation-envelope artifacts to the runtime first
- alternative: try to create app or CLI jobs immediately without a shared runtime envelope
- alternative: keep provider metadata advisory-only and push scheduling decisions into hooks or reports

### Counter-evidence

- direct job creation would feel more “complete” initially, but without a shared runtime envelope it would be fragile and hard to test across app and CLI paths

### Confidence

`high`

### Research and debug budget

- implementation design choice: settled
- code/test exploration: bounded to current continuation surfaces

## Success Criteria

- a new automation envelope contract is implemented in runtime/admin surfaces
- deferred continuation produces durable machine-readable automation state
- focused tests cover provider selection, schedule defaults, envelope creation, and no-envelope edge cases

## Stop Go

`go`

## Next step

Implement the runtime automation envelope with test-first coverage, then commit the slice on the feature branch.
