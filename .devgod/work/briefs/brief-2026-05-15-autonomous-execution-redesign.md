# Intake Brief

## Brief ID

`brief-2026-05-15-autonomous-execution-redesign`

## Task ID

`2026-05-15-autonomous-execution-redesign`

## Request

Original user ask:

Redesign DevGod from a workflow/persona specification into a strict autonomous execution and audit system with exhaustive execution, measurable coverage, continuation loops, hard done criteria, gap detection, strong orchestration, deep repo understanding, reverse engineering support, failure recovery, and persistent task-state behavior.

## Goal

Produce a repo-grounded redesign specification that upgrades DevGod into an enforceable autonomous engineering system rather than a prompt-only assistant pattern.

## Intended outcome

One authoritative design spec defines the execution model, coverage ledger, state machine, subagent system, anti-shallowness enforcement, rewrite-mode guardrails, and concrete implementation insertion points for the current DevGod package.

## User

Devgod package maintainer.

## Problem

Current DevGod runtime and workflow artifacts already cover autopilot, queue advancement, reasoning quality, and workflow proof, but they still lack a strict coverage authority, a deep-analysis threshold before recommendations, a recursive gap engine, and a hard operational model for long-running legacy-repo transformations.

## Value

The package gets a concrete upgrade path from "advisory autonomy" to "auditable autonomous execution" with explicit guarantees, measurable coverage, and a design that can later be implemented and tested slice by slice.

## Audience

- DevGod package maintainers
- consuming-repo maintainers adopting DevGod for large transformations
- future implementers of runtime, CLI, MCP, and review-gate extensions

## Constraints

- Build on the current runtime, queue, reasoning-quality, workflow-proof, and artifact model.
- Keep this task scoped to specification and control-layer design, not full implementation.
- Avoid inventing a parallel workflow outside `.devgod/`, `src/`, and existing package surfaces.
- Recommendations must be concrete enough to implement and verify later.

## Risks

- The redesign could become a vague manifesto instead of an enforceable system.
- Overspecification could ignore current package boundaries and produce an impractical design.
- Underspecification could leave enforcement gaps around coverage, stopping conditions, and delegation authority.

## Unknowns

- Which new runtime entities belong in `src/domain/types.ts` versus markdown artifacts only.
- How much of gap detection should remain advisory versus blocking in the runtime execution plan.
- Whether coverage authority should live primarily in persisted runtime state, on-disk ledgers, or both.

## Clarifying questions

None required before design. Assumption: the user wants a complete redesign specification and concrete implementation path, not immediate runtime coding for all features in this turn.

## Assumptions

### Approved assumptions

- The redesign should integrate with the existing `src/core/service.ts`, `src/admin.ts`, `.devgod/templates/`, and `.devgod/rules/` surfaces.
- This task is successful if it produces an implementation-grade specification and workflow artifacts, even if later slices are needed to code the system.
- The spec should be optimized for large legacy-repo work, where repo understanding and runtime evidence must gate modernization recommendations.

### Blocked assumptions

- Do not assume existing reasoning-quality enforcement is sufficient for deep repo comprehension.
- Do not assume task-queue coverage equals codebase coverage.
- Do not assume static analysis alone is enough for high-risk rewrites or migrations.

## Evidence

- Existing runtime/autopilot surfaces in `src/core/service.ts`, `src/admin.ts`, `src/devgod/task-queue.ts`, and `src/admin/devgod.ts`.
- Existing reasoning-quality and task-packet contracts in `.devgod/rules/reasoning-quality.md` and `.devgod/templates/task-packet.md`.
- Current product-state and queue artifacts in `.devgod/work/product-state.md` and `.devgod/work/task-queue.json`.

## Reasoning quality

### Facts

- DevGod already enforces workflow-proof and authenticated review gates.
- DevGod already has runtime execution directives, queue advancement, and reasoning-quality blocking.
- DevGod does not yet maintain a mandatory subsystem coverage ledger or deep repo-understanding threshold.

### Hypotheses and alternatives

- A persistent coverage ledger plus a stricter execution state machine can turn advisory autonomy into measurable autonomous execution.
- A gap engine can act as both planning input and runtime blocker when critical unknowns remain.
- Alternative: keep the current queue model and layer only stronger prompts. Rejected because it would not create auditable operational guarantees.

### Counter-evidence

- Some current package behaviors already provide partial continuation and workflow proof, so the redesign must extend rather than replace them.

### Confidence

`high`

### Research and debug budget

- repo inspections: 2 shallow passes before writing the spec
- design iterations in this task: 2
- verification passes: 1 artifact and consistency pass

### Verification plan

- ensure the redesign maps every user-required system to concrete runtime/rule/template surfaces
- ensure all mandatory coverage states and execution phases are defined
- ensure stop conditions, retry conditions, escalation conditions, confidence thresholds, and evidence rules are explicit

## Success Criteria

- The spec covers all 15 requested subsystems and the mandatory execution model.
- The spec defines enforceable state transitions, evidence thresholds, and anti-shallowness rules.
- The spec includes concrete schema ideas, workflow artifact changes, command additions, and runtime insertion points.
- The spec includes a gold-standard operational prompt aligned to the new system.

## Completion bar

An implementation-grade design document exists in the repo, backed by current-task workflow artifacts and concrete extension guidance.

## Good-path outcomes

- Maintainers can sequence the redesign into implementation slices without re-deriving the system.
- The spec clearly distinguishes runtime authority, artifact evidence, and review gates.

## Bad-path or edge-case outcomes

- If some runtime choices remain uncertain, the spec records them explicitly as phased options with recommended defaults.
- If a requirement cannot be fully enforced in prompt space, the spec marks the required runtime or CLI authority needed.

## Non-goals

- Shipping the full runtime implementation in this turn.
- Replacing the current review-identity or workflow-proof authority model.

## Out of scope

- UI redesign work.
- deployment of new infra services
- backward-compatible migration tooling beyond what must be specified

## Trust boundaries

- Runtime state and authenticated review proof remain authority for completion.
- Markdown artifacts remain human-readable evidence and planning surfaces, not sole execution authority.
- Repo analysis findings require traceable evidence from code, runtime traces, tests, or validated artifacts.

## Stop Go

`go`

## Next step

Planner action required:
Write the autonomous execution redesign spec, tie it to concrete package extension points, and align active workflow artifacts to the new design slice.
