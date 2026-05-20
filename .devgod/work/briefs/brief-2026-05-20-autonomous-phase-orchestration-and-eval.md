# Brief

## Task ID

`2026-05-20-autonomous-phase-orchestration-and-eval`

## Request

Original user ask:

continue until its complete

## Goal

Finish the broader autonomous-system redesign by hardening phase-readiness orchestration, interruption-safe checkpoint/resume behavior, and the orchestration evaluation harness so runtime continuation fails closed on shallow or stale completion paths.

## Intended outcome

- autonomous runtime phase readiness carries enough state to distinguish forward progress, backward transitions, stale checkpoints, and exhausted retry paths
- continuation and resume logic refuse stale checkpoint guidance when newer epochs or proofs already supersede it
- orchestration evals cover the long-horizon failure modes called out in the redesign instead of only the earlier lifecycle contract cases

## User

DevGod package maintainer continuing the reopened autonomous-system redesign to product completion.

## Problem

The current autonomous runtime exposes coverage, gaps, comprehension, proofs, and checkpoints, but the final redesign slice still lacks stronger phase-readiness semantics, interruption-epoch handling, and regression cases for shallow completion, stale resumes, and contradiction loops.

## Value

This closes the last gap between the reopened redesign document and the package runtime: DevGod can keep advancing from authoritative runtime state without mistaking stale checkpoints or partial readiness for real completion.

## Audience

- DevGod package maintainers
- runtime/orchestration implementers
- operators auditing autonomous continuation claims

## Constraints

- preserve runtime-authenticated workflow-proof authority as the final completion gate
- keep the slice focused on orchestration/readiness/eval behavior, not new external integrations
- prefer additive schema changes that remain compatible with existing runtime records
- keep the broader product queue and evidence artifacts aligned while the task is active

## Risks

- overcomplicating phase readiness so the runtime becomes harder to audit
- introducing epoch or checkpoint semantics that invalidate existing tests without real behavior gain
- extending eval coverage without anchoring it to the actual autonomous runtime decisions

## Unknowns

- how much checkpoint freshness should depend on explicit execution epochs versus phase ordering alone
- which phase blockers should recommend backward transitions versus a hold-in-place result
- how much of the final reporting surface should expose orchestration scoring details directly

## Facts

- `docs/autonomous-execution-redesign.md` defines a strict state machine, explicit backward transitions, checkpoint/resume expectations, and orchestration eval coverage for stale and shallow completion paths.
- `src/runtime/autonomous-execution.ts` currently returns only phase/readiness reasons and does not classify stale checkpoints or transition direction.
- `tests/orchestration-eval.test.ts` currently covers the earlier routing/lifecycle baseline but not the redesign’s long-horizon autonomous orchestration edge cases.

## Assumptions

- the smallest safe implementation is to extend the existing autonomous runtime state and eval harness instead of adding a second orchestration subsystem
- optional schema additions on checkpoint and phase-readiness records are sufficient for compatibility with existing fixtures

## Alternatives

- leave the final slice as documentation-only and mark the redesign complete
- push stale-checkpoint and contradiction handling into operator guidance only
- add a separate orchestration-eval module without reusing the runtime readiness logic

## Counter-evidence

- some continuation failures are already indirectly blocked by coverage/gap gates, so this slice should add only the missing orchestration semantics rather than duplicate existing blockers

## Confidence

High

## Research and debug budget

- repo-grounded implementation only, bounded to autonomous runtime state, service routing, operator reporting, and orchestration eval coverage

## Verification plan

- extend focused runtime/service tests for phase-readiness classification, stale checkpoint handling, and epoch-aware continuation
- extend orchestration eval coverage for shallow completion, backlog-not-exhausted false completion, contradiction loops, stale checkpoints, and interrupted resume
- run focused service/report/eval verification before workflow proof and live check

## Success Criteria

- phase readiness exposes transition direction, blocker class, next/fallback phase guidance, and continuation scoring
- stale checkpoints are detectable and do not override fresher proof or epoch state during continuation
- orchestration eval coverage explicitly proves the redesign’s long-horizon fail-closed behavior

## Completion bar

Code, tests, review artifacts, workflow proof, live proof, queue closeout, and git commits.

## Good-path outcomes

- the runtime can explain whether it should advance, hold, or fall back between autonomous phases
- continuation picks the freshest authoritative target instead of stale checkpoint residue
- the eval harness demonstrates that the package rejects shallow “done” claims even across longer-running autonomous flows

## Bad-path or edge-case outcomes

- contradiction loops force backward transitions instead of allowing modernization strategy to proceed
- checkpoint freshness drift or exhausted retry budget blocks continuation with explicit reasons

## Non-goals

- new external tracing backends
- replacing authenticated review authority
- unrelated docs or packaging changes

## Out of scope

- `.agents/`, `.codex/`, and `.devgod/memory/`
- new product areas outside autonomous execution closeout

## Trust boundaries

- runtime state remains the authority for orchestration readiness and checkpoint freshness
- exported markdown/json artifacts remain evidence, not the primary continuation authority

## Stop Go

`go`

## Next step

Implement the final orchestration/readiness/eval delta, then verify it through focused tests, workflow proof, live proof, and queue/product-state completion updates.
