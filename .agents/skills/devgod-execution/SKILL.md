---
name: devgod-execution
description: Move planned devgod work into implementation.
---

# Devgod Execution

Use after planning is good enough to build from explicit task packets.

Goal: ship the smallest clean increment without bypassing gates.

1. Restate milestone, active packet, completion standard, and roles.
2. Confirm the packet came from architect + planner handoff.
3. Enforce write scope, completion standard, required roles, and quality gates.
4. Spawn only the agents needed for the active slice.
5. Manager coordinates; non-trivial work stays with the named specialist owner.
6. Move completed work into `reviewer`, `qa_engineer`, and `security_reviewer` handoff.
7. Capture owner role, completion standard, specialist evidence, and quality-gate evidence.
10. The manager persists the review gate files under `.devgod/work/reviews/` when the reviewer roles are read-only.
11. Run `bash scripts/check-devgod-workflow.sh --task-id <task-id>` before claiming the substantive slice is complete.
12. Promote only reviewed durable memory.

## Agent routing

- architecture and sequencing handoff: `solution_architect`
- decomposition, dependencies, and worker routing: `planner`
- documentation, release-note, and standards verification: `docs_researcher`
- UI, flow, accessibility: `frontend_designer`
- server logic, API, auth, data: `backend_engineer`
- deploy, env, secrets, monitoring: `infra_engineer`
- build, test, typecheck, or setup failure resolution: `build_resolver`
- correctness and regression review: `reviewer`
- threat review and abuse cases: `security_reviewer`
- tests and regressions: `qa_engineer`

## Token discipline

- subagents use the local `caveman` plugin/skill and answer in caveman format
- target 4-6 lines per handoff and 8 lines max for review gates
- target 2-8 words per value
- prefer `blk:` over `block:`
- no broad status essays
- summarize only what changes a decision
- keep evidence concrete: file, risk, behavior, test

## Done bar

Do not call the slice done unless:

- the code works or the exact blocker is known
- the architect-to-planner and worker-to-review handoffs are explicit
- specialist ownership matched the task packet unless the task qualified for the trivial fast path
- specialist-verified tasks include concrete execution evidence and quality gate evidence
- required reviews (`reviewer`, `qa_engineer`, `security_reviewer`) passed when applicable; the manager cannot declare done while a blocking gate fails
- major security concerns were checked
- verification evidence exists
- the workflow checker passes for the current task id
- write locks were released
- memory was updated with anything worth keeping
