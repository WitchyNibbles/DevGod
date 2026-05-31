# Product State

## Product Goal

Strengthen `devgod`'s design and architecture decision quality with a rotating, cross-functional council that prevents shallow design, reduces yes-man behavior, and keeps governance time-bounded.

## Global Acceptance Criteria

- substantive roadmap and plan work has a clear trigger path into council review
- council review requires explicit alternatives, documented dissent, and decision records
- trivial work is not blocked by council process
- the council can approve with conditions or bounded exceptions rather than blocking indefinitely
- council governance fits the existing `devgod` review and workflow contract

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Council governance policy | done | `AGENTS.md`, `src/install/merge.ts`, and `.devgod/rules/design-council-policy.md` |
| Council templates and decision packets | done | `.devgod/templates/dac-decision-packet.md`, `.devgod/templates/adr.md`, and updated workflow templates |
| Manager and role routing into council review | done | updated `.codex/agents/*.toml` guidance and `docs/devgod-agent-team.md` |
| Workflow-aware council quality gate | done | `src/domain/types.ts`, `scripts/check-devgod-workflow.sh`, and targeted tests |

## Current Milestone

Ship the `Design and Architecture Council` governance model for substantive `devgod` work.

## Completed Milestones

- clarified user goals, operator model, constraints, and acceptance bar for a `devgod` council
- completed a repo-backed and source-backed governance research pass
- produced a phased implementation plan for the `Design and Architecture Council`
- shipped DAC policy, templates, agent guidance, and workflow-check support in package-controlled repo surfaces

## Current Task

`none`

## Next Task

`none queued`

## Blockers

- none

## Reasoning Debt

- the exact boundary between advisory rollout and hard workflow enforcement should be validated with a pilot before runtime checks become strict
- the required-seat rules may need tuning once a few real `devgod` tasks run through the council

## Verification Summary

- current repo rules confirm that a council should be modeled as a quality gate and planning artifact, not as a replacement for authenticated completion authority
- prior `devgod` artifacts already show useful multi-role architecture synthesis, but without a reusable operating model
- external research supports a rotating cross-functional board, written decision records, explicit dissent, timeboxing, documented decisions, and expiring exceptions
- the recommended first slice is policy, templates, and routing guidance first; runtime hardening follows after a bounded pilot
- `node --experimental-strip-types --test tests/contracts.test.ts` passed
- `node --experimental-strip-types --test tests/control-layer-contract.test.ts` passed
- `node --experimental-strip-types --test tests/workflow-check.test.ts` passed, including the new missing-council-metadata rejection case
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-01-devgod-dac-rollout-execution` passed

## Review Summary

- reviewer, QA, and security summary reviews are recorded for `2026-06-01-devgod-dac-rollout-execution`

## Last Updated

2026-05-31
