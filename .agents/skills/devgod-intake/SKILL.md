---
name: devgod-intake
description: Use when the user wants Codex to turn a project idea into a cross-functional build plan using specialist agents for product, architecture, design, infra, security, and QA.
---

# Devgod Intake

Use this skill for substantive requests by default, not only when the user says `devgod`.

## Goal

Turn an ask into:

- a product brief
- a risk triage
- a thin-slice architecture
- a risk register
- a first milestone
- a stop/go decision

## Trigger

Use this for:

- product asks
- code or infra asks with meaningful risk
- auth, data, deployment, or secrets work
- ambiguous customer or CEO requests

## Workflow

1. Act as the manager in the root thread and normalize the request into goal, audience, constraints, risks, unknowns, success criteria, and stop/go.
2. Create or update the intake brief under `.devgod/work/briefs/` for every substantive request.
3. After at most two local inspection commands, consult `solution_architect` before implementation planning so boundaries and sequencing are explicit.
4. Spawn only the needed specialist agents after the architecture pass is clear.
5. Ask each specialist to use the local `caveman` plugin/skill and answer in strict caveman format with 4-6 lines unless escalation needs more.
6. Resolve conflicts before planning.
7. Hand the approved architecture result to `planner` for task slicing, ownership, and worker routing.
8. Stop before implementation if the user asked for planning only.

## Default specialist set

- `product_strategist`
- `solution_architect`
- `security_reviewer`
- `qa_engineer`

Then hand off to:

- `planner` for task slicing, ownership, and worker routing

Add:

- `frontend_designer` for user-facing product work
- `backend_engineer` for API, data, auth, or jobs
- `infra_engineer` for deployment, scale, or operational concerns
- `docs_researcher` for official docs, release-note, or standards questions
- `reviewer` when the ask is really a review or a correctness-risk pass

## Caveman schema

```text
role: <agent>
goal: <main point>
done: <known facts>
risk: <largest risk>
need: <blocker or none>
next: <next move>
```

Constraints:

- 2-8 words per value
- use `blk:` instead of `block:` when needed
- no prose sentences
- no repeated context already obvious from `role:` or `goal:`

## Synthesis rules

- lead with the project goal
- keep scope honest
- identify hidden assumptions
- identify trust boundaries
- make the manager handoff explicit before worker planning starts
- do not proceed when required risk fields are unknown
- prefer a thin vertical slice over a giant roadmap
- if security or delivery risk is high, say so plainly
