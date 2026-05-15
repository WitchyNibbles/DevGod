# Task Packet

## Task ID

`2026-05-15-autonomous-execution-redesign`

## Owner role

`solution_architect`

## Completion standard

`artifact_complete`

## Required specialist roles

- `solution_architect`
- `planner`

## Quality gates

- `product_acceptance`
- `regression_safety_required`
- `reasoning_strict_required`

## Goal

Specify the next-generation DevGod control model for autonomous execution, exhaustive analysis, measurable coverage, deep reverse engineering, and hard completion guarantees.

## Inputs

- user redesign requirements
- existing runtime/autopilot code in `src/core/`, `src/admin.ts`, `src/devgod/`
- workflow rules and templates under `.devgod/`

## Dependencies

- none

## Outputs

- authoritative redesign spec in `docs/autonomous-execution-redesign.md`
- aligned current-task workflow artifacts

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-15-autonomous-execution-redesign.md`
- `.devgod/work/plans/plan-2026-05-15-autonomous-execution-redesign.md`
- `.devgod/work/tasks/task-2026-05-15-autonomous-execution-redesign.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `docs/autonomous-execution-redesign.md`

## Out of scope

- runtime implementation
- schema migrations
- review-identity changes

## Assumptions

### Approved assumptions

- The task is design-first but must stay implementation-grade.
- Current runtime authority remains the foundation for future enforcement.

### Blocked assumptions

- Do not treat narrative completeness as execution completeness.
- Do not issue rewrite guidance without repo-understanding thresholds.

## Reasoning quality

### Claim

DevGod can be upgraded into a strict autonomous engineering system by adding a coverage-ledger authority, a deeper execution state machine, stronger orchestration contracts, and runtime-enforced gap blocking on top of the current workflow-proof foundation.

### Facts

- Current runtime supports queue advancement and execution directives.
- Current rules already enforce reasoning-quality structure.
- Current package lacks subsystem-level coverage accounting and rewrite-mode gating.

### Assumptions

- Markdown-ledger evidence should be mirrored by structured runtime state for authority.
- Large legacy-repo work needs runtime tracing and callsite analysis as first-class phases.

### Hypotheses and alternatives

- Best path: extend current runtime entities and workflow artifacts with coverage and gap state.
- Alternative path: build a separate orchestrator service. Rejected for now because it adds unnecessary architectural distance from the current package.

### Evidence refs

- `src/core/service.ts`
- `src/admin.ts`
- `src/devgod/task-queue.ts`
- `.devgod/rules/reasoning-quality.md`
- `.devgod/templates/task-packet.md`

### Counter-evidence

- Some continuation behavior already exists, so the redesign must preserve working runtime primitives instead of resetting the model.

### Confidence

`high`

### Open questions

- Should coverage authority be dual-written to runtime store and repo files from the first implementation slice, or staged?

### Verification plan

- validate that the spec covers all required systems and enforcement rules
- validate that every major proposal names a concrete insertion point

### Research and debug budgets

- repo inspections: 2
- design passes: 2
- verification passes: 1

## Reasoning policy

### Mode

`strict`

### Requirements

Explicit reasoning blocks, evidence refs, alternatives, verification plan, and a final supported verdict are required.

### Max attempts

`2`

## Reasoning attempts

### Attempt records

- id: `attempt-1`
- label: `runtime-foundation`
- hypothesis: current runtime is sufficient as the base authority layer for a stricter autonomous model
- alternatives: `replace the runtime model entirely`
- evidence refs: `src/core/service.ts`, `src/admin.ts`, `src/devgod/task-queue.ts`
- verification refs: `plan-2026-05-15-autonomous-execution-redesign`
- trace ref: `repo-inspection`
- outcome: `supported`
- summary: existing workflow-proof, queue, and execution-plan surfaces are strong enough foundations for incremental redesign

### Verification records

- id: `verification-1`
- kind: `tool_output`
- ref: `repo inspection`
- status: `passed`
- summary: required runtime, queue, and reasoning-quality surfaces exist and are inspectable

### Verdict

- status: `supported`
- summary: proceed with the redesign spec using the existing runtime model as the authority base
- supporting attempt ids: `attempt-1`
- blocking issues: `none`

## Behavior to preserve

- workflow-proof remains the completion authority
- authenticated review gates remain blocking
- current queue and product-state artifacts remain readable and compatible

## Acceptance criteria

- spec covers all user-mandated systems and phases
- spec defines enforceable coverage states, transitions, and evidence
- spec includes implementation points and example protocol formats

## Good-path checks

- every mandatory section is present
- every state machine phase has outputs and transition rules

## Bad-path or edge-case checks

- unresolved uncertainties are recorded explicitly
- anti-shallowness and fake-completeness prevention is operational, not merely advisory

## Verification steps

- run the `rg` checks listed in the task plan

## Residual risk disposition

If implementation ambiguities remain, record them as phased decisions rather than softening the guarantees.

## Required reviews

- `reviewer`
- `security_reviewer`
- `qa_engineer`

## Security checks

- no secret-bearing examples
- no authority downgrade in review/completion model

## Retrieval guidance

- prioritize current repo rules, templates, runtime types, and admin commands

## Anti-patterns to avoid

- prompt-only guarantees without runtime authority
- architecture conclusions before repo understanding
- selective coverage sampling presented as complete analysis

## Rollback notes

Revert only the new design artifacts if the direction changes.

## Handoff format

Summarize the produced spec, the workflow artifacts touched, unresolved implementation choices, and the recommended first implementation slices.
