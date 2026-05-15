# Plan

## Task ID

`2026-05-15-autonomous-execution-redesign`

## Scope

- implement the first autonomous-execution redesign slice in runtime and workflow enforcement code
- keep storage additive by using typed runtime metadata rather than a new persistence backend
- harden scaffolded and installed workflow artifacts around coverage manifests, progress proofs, and checkpoints

## Research summary

- the redesign spec already identifies schema/runtime state, workflow checks, and template changes as the recommended first slice
- current `project_runtime_state.metadata` is the least disruptive place to persist autonomous-execution state
- the workflow checker and scaffold generator are the highest-leverage repo surfaces for fail-closed enforcement

## Planned changes

1. Extend domain types with autonomous-execution state, coverage/gap/proof/checkpoint records, and new quality gates.
2. Add runtime helpers plus core-service persistence and completion blocking for autonomous execution state.
3. Extend workflow templates, quality-gate rules, checker enforcement, and fixture/scaffold generation for the new artifact contract.
4. Add targeted tests and task-local coverage/proof/checkpoint artifacts for this active slice.

## Verification

- `node --experimental-strip-types --test tests/service.test.ts`
- `node --experimental-strip-types --test tests/workflow-check.test.ts`
- `node --experimental-strip-types --test tests/workflow-scaffold.test.ts`
- `node --experimental-strip-types --test tests/control-layer-contract.test.ts`
