# Task Packet

## Task ID

`2026-06-08-completion-audit-closeout-hardening`

## Owner role

`agent_runtime_engineer`

## Completion standard

`specialist_verified`

## Required specialist roles

- `agent_runtime_engineer`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `completion_audit_required`
- `regression_safety_required`
- `reasoning_strict_required`
- `progress_proof_required`

## Goal

Make `devgod` fail closed on false-complete task closure.

## Inputs

- user report of false completion
- current workflow checker, runtime proof, templates, and queue export behavior

## Dependencies

- none

## Outputs

- hardened workflow schema and templates
- hardened runtime/local proof enforcement
- queue truth fix for `approved` vs `done`
- focused regression coverage

## Progress proof

- `tests/admin.test.ts`
- `tests/workflow-check.test.ts`
- `tests/task-queue-repair.test.ts`

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-06-08-completion-audit-closeout-hardening.md
task=.devgod/work/tasks/task-2026-06-08-completion-audit-closeout-hardening.md
review_exports=required

## Allowed write scope

- `.devgod`
- `scripts`
- `src`
- `tests`

## Out of scope

- adding a fourth authenticated review role
- redesigning the entire runtime status model

## Acceptance criteria

- specialist-verified work now requires `completion_audit_required`
- reviewer and QA evidence must explicitly assert completion audit before workflow proof passes
- exported task queues keep `approved` separate from `done`

## Verification steps

- `npm run typecheck`
- `node --experimental-strip-types --test tests/admin.test.ts tests/workflow-check.test.ts tests/contracts.test.ts tests/task-queue-repair.test.ts`

## Required reviews

- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Security checks

- authenticated review authority remains unchanged
- no new waiver path bypasses completion audit

## Rollback notes

- revert the completion-audit gate and queue-status distinction together if downstream consumers cannot absorb the stricter contract
