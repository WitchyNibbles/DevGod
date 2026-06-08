# Checkpoint

## Task

`2026-06-08-consuming-repo-skill-evolution-rfc`

## Status

`in_progress`

## Date

`2026-06-08`

## Completed in this slice

- activated the RFC task in `.devgod/ACTIVE`
- created the intake brief for consuming-repo skill evolution
- created the task packet with council review, strict reasoning, and scoped write boundaries
- created the DAC decision packet for architecture review
- authored the RFC in `docs/plans/2026-06-08-consuming-repo-skill-evolution-rfc.md`
- added the implementation-facing execution handoff in `.devgod/work/plans/plan-2026-06-08-consuming-repo-skill-evolution-rfc.md`
- updated `.devgod/work/task-queue.json` and `.devgod/work/product-state.md` to reflect the active proposal task
- passed `git diff --check` on all touched workflow and plan artifacts
- authored external runtime evidence design and a successor implementation task for the remaining authority blocker
- removed the circular activation dependency that had blocked the runtime-evidence successor slice
- added an explicit skill-evidence redaction policy and linked it from the RFC and slice-1 handoff artifacts

## Evidence

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-06-08-consuming-repo-skill-evolution-rfc.md`
- `.devgod/work/tasks/task-2026-06-08-consuming-repo-skill-evolution-rfc.md`
- `.devgod/work/council/dac-2026-06-08-consuming-repo-skill-evolution-rfc.md`
- `.devgod/work/plans/plan-2026-06-08-consuming-repo-skill-evolution-rfc.md`
- `.devgod/work/task-queue.json`
- `.devgod/work/product-state.md`
- `docs/plans/2026-06-08-consuming-repo-skill-evolution-rfc.md`
- `docs/plans/2026-06-08-external-runtime-evidence-design.md`

## Key decisions recorded

- canonical repo skills under `.agents/skills/` remain authoritative and committed
- learned or evolved repo-specific skills should land in `.devgod/skills/overlay/`, not in canonical skills
- promotion into canonical repo skills must happen through a human-reviewed patch flow
- the first implementation slice should stop at overlay storage, validation reuse, diff generation, and promotion packets
- no hosted dependency or hidden durable authority should be introduced

## Alternatives considered

- manual-only canonical skill authoring with no autonomous drafting
- direct autonomous mutation of canonical repo skills with rollback support

## Current recommendation

Adopt overlay-first skill evolution as the standard `devgod` pattern for consuming repos.

## Remaining work

- implement the external runtime evidence slice so authenticated reviews and council outcomes can become workflow-authoritative runtime records
- obtain runtime-authenticated DAC and review evidence for the already-recorded summary approvals after the runtime-evidence slice lands
- if approved, activate the pre-authored successor task `2026-06-08-consuming-repo-skill-evolution-slice-1` for implementation planning and execution

## Open questions

- whether overlay skills stay purely local or can be optionally shared before canonical promotion
- how far slice 2 should go on local replay evaluation before adding trace-mined evolution
- whether promotion should generate only patch artifacts or also pre-stage commit helpers
- whether council evidence should be stored as a dedicated runtime record type or a structured run event

## Next recommended action

Implement the external runtime evidence slice, then record runtime-authenticated approval evidence for the parent RFC task and activate the pre-authored slice-1 task.

## Notes

Design review outcomes are now recorded as summary artifacts, and the control-layer contradictions around activation order and redaction policy have been resolved. Completion still depends on runtime-authenticated review evidence under the workflow contract.
