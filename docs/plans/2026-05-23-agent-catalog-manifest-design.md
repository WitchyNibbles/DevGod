# Devgod Agent Catalog Manifest Design

**Date:** 2026-05-23

## Goal

Replace duplicated hard-coded role definitions with a manifest-driven agent catalog that remains strictly controlled, keeps shipped agent artifacts explicit and reviewed, and improves continuation safety instead of increasing workflow self-stalls.

## Problem

The current repo defines the devgod team shape in multiple places:

- `.codex/agents/*.toml` ship the agent artifacts
- `src/domain/types.ts` hard-codes valid retrieval roles
- `src/core/policy.ts` separately hard-codes retrieval guidance
- tests assert selected role combinations directly
- docs and planning guidance describe the roster independently

This creates drift risk and makes every team-shape change a multi-file coordination task. The current control model is strong, but the source of truth is fragmented.

## Non-Goals

- runtime generation of agent files during normal command execution
- changing the universal blocking review trio
- making optional domain roles globally required
- widening continuation blockers beyond task-relevant roles and artifacts
- replacing reviewed shipped files with unreviewed runtime state

## Constraints

- `.codex/agents/*.toml` must remain explicit shipped artifacts
- strict control must not recreate prior self-stall failures
- queue continuation, supervisor flow, and recoverable blocker semantics must remain intact
- CI must catch catalog drift before merge
- runtime validation must only block on artifacts relevant to the current task

## Recommended Approach

Introduce a canonical agent catalog module as the single reviewed source of truth, then derive validation, retrieval guidance, drift checks, docs, and shipped roster expectations from that catalog.

The catalog should be code-backed rather than dynamically loaded from loose runtime files. That keeps the manifest reviewed, typed, and easy to exercise in tests.

## Alternatives Considered

### 1. Keep hand-maintained lists and patch them everywhere

Pros:

- lowest initial implementation cost
- minimal refactor risk

Cons:

- preserves duplication
- keeps future roster changes fragile
- makes drift more likely

Verdict:

Rejected because it does not materially improve the current architecture.

### 2. Central catalog with explicit shipped artifact verification

Pros:

- one source of truth
- preserves current explicit-control model
- enables stronger CI drift checks
- keeps runtime behavior narrow and predictable

Cons:

- requires a careful refactor across validation and docs surfaces
- adds a new maintenance abstraction

Verdict:

Recommended. Best balance of control, safety, and long-term maintainability.

### 3. Fully runtime-generated agent artifact system

Pros:

- maximum theoretical deduplication
- shipped artifacts can be recreated from metadata

Cons:

- weakens the current reviewed-artifact posture
- increases risk of accidental runtime drift
- more invasive than necessary for this branch

Verdict:

Rejected for now. A verifier-backed explicit artifact model is safer.

## Catalog Model

Each role entry should define:

- `id`
- `label`
- `class`
  - `manager`
  - `delivery`
  - `quality`
  - `knowledge`
  - `domain_specialist`
- `availability`
  - `core_required`
  - `core_optional`
  - `domain_optional`
- `shipsAgentArtifact`
- `canOwnTasks`
- `canSatisfySpecialistRequirement`
- `defaultSkillIds`
- `retrievalGuidance`
- `description`

This model supports both strict validation and nuanced runtime behavior.

## Runtime Safety Model

The new catalog must not increase self-stalling. To preserve that:

- the required review trio remains fixed as `reviewer`, `qa_engineer`, and `security_reviewer`
- optional roles are valid but non-blocking unless a task explicitly depends on them
- catalog drift is a verification and CI failure, not a runtime continuation deadlock
- continuation logic must not loop forever when a queued task uses a different valid optional role
- unknown roles must fail early and clearly at authoring or validation time
- recoverable blockers must remain recoverable with explicit next actions

## Shipped Day-One Team Shape

### Core existing roles

- `product_strategist`
- `solution_architect`
- `planner`
- `backend_engineer`
- `frontend_designer`
- `infra_engineer`
- `build_resolver`
- `reviewer`
- `qa_engineer`
- `security_reviewer`
- `tdd-guide`
- `e2e-runner`
- `release-readiness`
- `docs_researcher`
- `git_operator`
- `memory_curator`

### New core roles

- `eval_engineer`
- `technical_writer`
- `agent_runtime_engineer`

### Optional domain specialists

- `mobile_engineer`
- `ml_engineer`
- `data_engineer`
- `ux_researcher`
- `product_analyst`
- `compliance_reviewer`

## Skill Assignment Strategy

Skills should remain sparse and role-specific.

- every role gets one primary workflow skill or discipline pattern
- add at most one or two secondary skills for specialized contexts
- avoid large shared skill bundles that muddy role identity
- keep repo-wide policy in `AGENTS.md`, specialist workflows in skills, and role truth in the catalog

## File-Level Design

### New or heavily changed surfaces

- `src/devgod/agent-catalog.ts`
- `src/domain/types.ts`
- `src/core/policy.ts`
- validation and workflow command surfaces that currently hard-code role arrays
- `.codex/agents/*.toml`
- docs describing the team shape and role-to-skill matrix
- tests for validation, packaging, continuation, and drift detection

### Supporting verifier surface

Add a verifier that ensures:

- every catalog role expected to ship an agent artifact has a matching `.codex/agents/*.toml`
- no unexpected agent artifact exists outside the catalog
- required metadata in agent files matches catalog expectations
- package surfaces ship the expanded agent roster

## Testing Strategy

### Truth and drift tests

- catalog roles match shipped agent artifacts
- catalog role metadata matches exported docs
- package dry run includes the new role surfaces

### Runtime validation tests

- tasks using new valid optional roles pass validation
- unknown roles fail with precise errors
- retrieval guidance derives from the catalog for all valid roles

### Continuation and anti-stall tests

- next queued task can use a different valid role without deadlock
- catalog drift does not create runtime continuation loops
- advisory waits remain advisory
- recoverable blockers remain resumable

### Regression safety

- existing review-trio behavior stays unchanged
- workflow and daemon flows keep passing
- install, scaffold, and package verification remain green

## Success Criteria

- one canonical reviewed catalog defines the shipped team shape
- validation and retrieval guidance derive from that catalog
- shipped agent artifacts are verified against the catalog
- new core and optional specialist roles are available from day one
- CI proves the catalog model is stricter than the old model without introducing self-stalls

## Risks

### Risk: accidental runtime blockages

Mitigation:

- keep required reviews fixed
- make drift failures CI-oriented
- add explicit continuation regression tests

### Risk: catalog and shipped agents diverge

Mitigation:

- add catalog-to-artifact verifier
- cover with package and unit tests

### Risk: over-engineering the manifest

Mitigation:

- keep the catalog focused on role truth, not dynamic orchestration logic
- preserve existing explicit artifact review boundaries

## Rollout Plan

1. land the canonical catalog and derive validation/guidance from it
2. add verifier coverage for shipped agent artifacts
3. expand the shipped roster and docs
4. run full verification, release checks, PR, and CI repair until green
