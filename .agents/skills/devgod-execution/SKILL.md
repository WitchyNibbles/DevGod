---
name: devgod-execution
description: Use when the user wants devgod to move from planning into implementation with specialist agents, review loops, and token-efficient coordination.
---

# Devgod Execution

Use this skill after planning is good enough to build from explicit task packets.

## Goal

Ship the smallest clean, secure, working increment without bypassing gates.

## Workflow

1. Restate the current milestone, active task packet, and done criteria.
2. Confirm the active task packet came from an architect-approved plan and a planner-owned decomposition handoff.
3. Enforce allowed write scope before implementation.
4. Spawn only the agents needed for the active slice.
5. Implement locally in the main thread unless a bounded read-only subtask can run in parallel.
6. Move completed work into handoff for blocking `qa_engineer` and `security_reviewer` review.
7. Promote only reviewed durable memory.

## Agent routing

- architecture and sequencing handoff: `solution_architect`
- decomposition, dependencies, and worker routing: `planner`
- UI, flow, accessibility: `frontend_designer`
- server logic, API, auth, data: `backend_engineer`
- deploy, env, secrets, monitoring: `infra_engineer`
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
- required reviews passed or were explicitly waived with reason
- major security concerns were checked
- verification evidence exists
- write locks were released
- memory was updated with anything worth keeping
