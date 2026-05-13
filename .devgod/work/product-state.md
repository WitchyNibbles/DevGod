# Product State

## Product Goal

Enable DevGod to continue from requirements through planning, implementation, verification, repair, review, and next-task selection until the product-level goal is complete or a real blocker exists.

## Global Acceptance Criteria

- Product state is tracked separately from single-task completion.
- Unblocked tasks can be selected from a queue with dependency awareness.
- Failed verification paths enter a bounded repair loop instead of stopping at the first failed command.
- Completion claims require explicit verification evidence.

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Full-project autopilot skill | done | `.agents/skills/devgod-autopilot/SKILL.md` |
| Repair-loop skill | done | `.agents/skills/devgod-repair-loop/SKILL.md` |
| Product-state template | done | `.devgod/templates/product-state.md` |
| Task-queue template | done | `.devgod/templates/task-queue.json` |
| Queue validation and next-task helper | done | `src/devgod/task-queue.ts`, `src/devgod/autopilot-status.ts` |
| Queue validation tests | done | `tests/autopilot-status.test.ts` |

## Current Milestone

Autonomy loop rollout

## Completed Milestones

- Baseline autopilot control-layer scaffolding

## Current Task

None queued in `.devgod/work/task-queue.json`

## Next Task

Seed the live task queue from the active product roadmap in the consuming repo before running autopilot delivery.

## Blockers

None recorded.

## Verification Summary

- `node --experimental-strip-types --test tests/autopilot-status.test.ts` passed.
- `node --experimental-strip-types --test tests/install.test.ts` passed.
- `npm test` passed.
- `npm run devgod:autopilot-status` passed.
- `npm run doctor` passed with one advisory: `adapter module path does not exist`.

## Review Summary

Inline implementation only. No authenticated reviewer, QA, or security gate artifacts recorded in this package repo.

## Last Updated

2026-05-13
