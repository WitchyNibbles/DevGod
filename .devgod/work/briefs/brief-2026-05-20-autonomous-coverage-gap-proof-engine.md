# Brief

## Task ID

`2026-05-20-autonomous-coverage-gap-proof-engine`

## Request

Original user ask:

execute task_id=2026-05-20-autonomous-coverage-gap-proof-engine

## Goal

Add the first authoritative coverage-ledger, gap, and progress-proof contract needed by the broader autonomous-system redesign, then continue implementation from that new slice without losing runtime-backed completion semantics.

## Intended outcome

- the execution handoff blocker is removed by creating a real task packet and brief for the coverage/gap slice
- runtime state carries typed coverage items, typed gaps, and measurable progress-proof deltas that can block or guide continuation
- workflow checks fail closed when required coverage/proof artifacts are missing or when critical gaps remain open at completion time

## User

DevGod package maintainer continuing the reopened autonomous-system redesign.

## Problem

The broader redesign queue already points at a coverage-ledger slice, but the repo lacks its task artifacts and still relies on a shallow manifest/proof existence model instead of stronger typed gap and progress-proof authority.

## Value

This turns the next autonomy slice from a queued idea into an executable contract and raises the runtime/workflow bar closer to what `docs/autonomous-execution-redesign.md` describes.

## Audience

- DevGod package maintainers
- runtime/workflow-check implementers
- reviewers validating autonomous completion claims

## Constraints

- preserve authenticated runtime review/workflow-proof authority
- keep the slice bounded to coverage ledger, gap records, progress proofs, and the related workflow/runtime checks
- implement tests first for new behavior where practical
- keep downstream repo-understanding and orchestration work out of this slice

## Risks

- over-tightening the workflow checks could break existing autonomous fixtures that only rely on shallow artifact presence
- under-specifying progress-proof deltas would keep continuation logic narrative-heavy instead of evidence-backed
- gap severity/blocking rules could drift between runtime state and workflow artifacts if implemented in only one layer

## Unknowns

- whether the first gap/proof contract should enforce typed artifact contents only in runtime tests or also in artifact workflow checks immediately
- how much reporting surface needs to change in this slice versus the later orchestration/eval slice

## Clarifying questions

None. The user asked to fix the blockage and continue directly.

## Assumptions

### Approved assumptions

- the closeout plan in `.devgod/work/plans/plan-2026-05-20-autonomous-system-closeout-plan.md` remains the governing roadmap for this slice
- the existing manifest/proof/checkpoint runtime APIs are the right extension point instead of introducing a parallel subsystem
- runtime-optional review exports are still appropriate for this release-candidate slice under runtime authority

### Blocked assumptions

- a coverage manifest file existing on disk is enough to prove meaningful coverage authority
- progress proofs may remain narrative-only without explicit measurable deltas
- critical open gaps can coexist with successful completion claims

## Evidence

- `docs/autonomous-execution-redesign.md`
- `src/runtime/autonomous-execution.ts`
- `src/domain/types.ts`
- `src/core/service.ts`
- `tests/service.test.ts`
- `tests/workflow-check.test.ts`

## Reasoning quality

### Facts

- the redesign doc explicitly calls for persistent coverage items, gap records, and progress proofs with typed states and evidence refs
- the current runtime already stores coverage items, gaps, and progress proofs, but the workflow checks currently only require artifact presence for autonomous gates
- the current queue defines this slice’s acceptance in terms of typed records and fail-closed completion when critical gaps or required proofs remain unresolved

### Hypotheses and alternatives

- preferred: strengthen the existing runtime and workflow-check surfaces with typed validations and measurable proof/gap semantics
- alternative: defer workflow-check hardening and only improve runtime state now
- alternative: add artifact templates first and postpone runtime semantics

### Counter-evidence

- some typed runtime structures already exist, so the real missing piece may be validation and blocking semantics rather than a large schema expansion

### Confidence

High

### Research and debug budget

- repo-grounded implementation only, bounded to the named runtime, workflow, and reporting files

### Verification plan

- add targeted tests for typed gap and progress-proof behavior
- extend workflow-check tests for missing or insufficient coverage/proof artifacts
- run focused runtime/workflow/admin verification for the touched surfaces

## Success Criteria

- the task packet and brief exist and the slice is executable
- runtime/autonomous checks enforce typed coverage/gap/proof behavior beyond file presence
- workflow checks fail when required coverage/proof authority is missing or when critical gaps remain open for completion

## Completion bar

Code, tests, and workflow-state updates with focused verification evidence.

## Good-path outcomes

- autonomous continuation has stronger evidence-backed next-target selection and completion blocking
- reviewers can inspect typed gap/proof semantics instead of only artifact existence

## Bad-path or edge-case outcomes

- if fixture compatibility breaks, the workflow tests should pinpoint the exact missing coverage/proof requirement rather than failing opaquely

## Non-goals

- full repo-understanding inventory and tracing
- orchestration state-machine redesign
- release-process changes unrelated to coverage/gap/proof authority

## Out of scope

- `.agents/`, `.codex/`, and other managed control-layer changes outside the named packet scope
- non-autonomous product work

## Trust boundaries

- runtime state remains authoritative for completion and continuation
- exported markdown/json artifacts remain evidence and workflow inputs, not sole authority

## Stop Go

`go`

## Next step

Implement the coverage-ledger, gap, and progress-proof authority slice with tests first, then update the product/task state with the resulting verification evidence.
