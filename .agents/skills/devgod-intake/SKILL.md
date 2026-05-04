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
2. Keep manager/root in shallow triage mode: own routing, synthesis, scope enforcement, and final reporting, but do not perform deep subsystem investigation, broad code search, root-cause analysis, or implementation design directly.
3. Use no more than two shallow inspection commands before either classifying the task as trivial or delegating bounded investigation.
4. Create or update `.devgod/ACTIVE` for the current task before moving past intake. Do not let a stale active marker stand in for the current ask.
5. Create or update the intake brief under `.devgod/work/briefs/` for every substantive request and ensure it names the current task id.
6. Delegate bounded specialist investigation before architecture when evidence is needed for unknown ownership, unclear call flow, broad read scope, root-cause uncertainty, or behavior-contract ambiguity.
7. Use this investigation packet format: owner role, precise question, read scope, forbidden write scope, evidence required, max output length, stop condition.
8. After the evidence pass, consult `solution_architect` so it can synthesize boundaries, sequencing, and risks from the returned evidence.
9. Spawn only the needed specialist agents after the architecture pass is clear.
10. Ask each specialist to use the local `caveman` plugin/skill and answer in strict caveman format with 4-6 lines unless escalation needs more.
11. Resolve conflicts before planning.
12. Hand the approved architecture result to `planner` for task packet creation, ownership, and worker routing. Each task packet must include owner role, scope, files likely touched, acceptance criteria, verification command, and review gates.
13. Preserve the trivial fast path for low-risk, single-scope, mechanical or docs-only work that stays within two shallow inspections and does not need investigation or architecture.
14. Stop before implementation if the user asked for planning only.

## Hard manager checklist

- first user reply must confirm request, success criteria, constraints, and main risk
- manager/root never exceeds two shallow inspection commands before trivial classification or delegated investigation
- any work needing more than two inspection commands is delegated
- current task id must exist before worker execution
- current task must have a matching intake brief before worker execution
- prior tasks, stale review files, or older `.devgod/ACTIVE` state never satisfy the current ask

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
- make the manager handoff explicit before architect synthesis and before worker planning starts
- do not proceed when required risk fields are unknown
- prefer a thin vertical slice over a giant roadmap
- if security or delivery risk is high, say so plainly
