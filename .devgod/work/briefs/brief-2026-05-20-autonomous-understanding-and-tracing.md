# Brief

## Task ID

`2026-05-20-autonomous-understanding-and-tracing`

## Request

Original user ask:

continue until its complete

## Goal

Add the repo-understanding and trace-backed comprehension substrate required by the broader autonomous-execution redesign, then keep the rewrite path fail-closed until those thresholds are met.

## Intended outcome

- runtime autonomous state carries explicit inventory/map and runtime-trace records instead of inferring rewrite readiness from coverage items alone
- rewrite-mode readiness is blocked by concrete comprehension thresholds and produces the documented refusal message when evidence is insufficient
- status/reporting surfaces expose the new comprehension summary so later orchestration work can consume one authoritative view

## User

DevGod package maintainer continuing the reopened autonomous-system redesign.

## Problem

The reopened plan now expects repo inventory, route/model/integration/auth maps, runtime side-effect traces, and profile-driven comprehension thresholds, but the current runtime only understands coverage items, gaps, checkpoints, and progress proofs.

## Value

This closes the redesign gap between task-level coverage and actual rewrite-readiness, so later orchestration and evaluation work can refuse shallow modernization conclusions with concrete missing evidence.

## Audience

- DevGod package maintainers
- runtime/workflow-check implementers
- operators reviewing rewrite-readiness claims

## Constraints

- preserve authenticated runtime review/workflow-proof authority
- keep the slice bounded to repo-understanding records, runtime traces, comprehension metrics, and rewrite-mode gating
- keep downstream orchestration/eval work out of this slice
- keep artifact expectations compatible with the current workflow-check contract

## Risks

- overfitting the comprehension model to this repo instead of keeping it reusable for installed repos
- blocking too early or too late if threshold defaults drift from the redesign document
- introducing reporting churn without enough runtime validation coverage

## Unknowns

- how much of the redesign’s recommended inventory surface should be represented as structured runtime records in the first pass
- whether rewrite-mode refusal should surface only in autonomous blockers or also in operator summaries
- how much threshold logic can be derived from existing coverage items versus requiring dedicated understanding records

## Facts

- `docs/autonomous-execution-redesign.md` defines explicit understanding outputs and says rewrite recommendations must be blocked until critical thresholds are met.
- `src/runtime/autonomous-execution.ts` currently computes readiness only from coverage, gap, proof, and checkpoint data.
- `src/admin/autonomous-summary.ts` and `src/admin/report.ts` already expose autonomous summaries that can carry comprehension output with low surface-area change.

## Assumptions

- the first implementation can represent understanding artifacts as structured runtime records without adding new top-level CLI commands
- later orchestration/eval work can consume the new runtime state and reporting surfaces without another schema redesign

## Alternatives

- defer runtime state changes and keep the understanding slice documentation-only
- use free-form evidence refs instead of typed understanding/tracing records
- add artifact-only JSON exports before the runtime understands them

## Counter-evidence

- some inventory signals can already be derived from coverage items, so the smallest useful implementation should reuse those where possible instead of duplicating them

## Confidence

High

## Research and debug budget

- repo-grounded implementation only, bounded to autonomous runtime state, service wiring, and reporting/tests

## Verification plan

- add focused runtime tests for understanding metrics, threshold blocking, and rewrite refusal behavior
- extend reporting tests so operator summaries expose the new comprehension status
- run focused runtime/admin/report verification for the touched surfaces

## Success Criteria

- runtime autonomous state stores understanding-map and trace records with validation
- rewrite-mode readiness uses explicit comprehension thresholds and blocks with the required refusal language when unmet
- operator/report surfaces expose comprehension metrics and missing evidence cleanly

## Completion bar

Code, tests, runtime evidence, and workflow-state updates with focused verification.

## Good-path outcomes

- rewrite-mode runs can prove when inventory, business-rule coverage, callsite coverage, and traces are sufficient
- later slices can sequence architecture and migration work from one authoritative comprehension summary

## Bad-path or edge-case outcomes

- incomplete inventories, contradiction gaps, or missing risky traces fail closed instead of permitting modernization recommendations

## Non-goals

- full orchestration state-machine redesign
- new external tracing integrations
- release-process changes unrelated to comprehension authority

## Out of scope

- `.agents/`, `.codex/`, and `.devgod/memory/`
- non-autonomous product work

## Trust boundaries

- runtime state remains authoritative for comprehension gating
- exported markdown/json artifacts remain evidence, not sole authority

## Stop Go

`go`

## Next step

Implement typed repo-understanding and trace-backed rewrite gating in the autonomous runtime, then update queue/product state with the resulting verification evidence.
