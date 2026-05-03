# Devgod Operating Rules

This repository is the shared-package source of truth for `devgod`. It owns the reusable
runtime, installer, rules, templates, skills, and agent profiles. Consuming repos keep their own
operational state, reviewed memory, and repo-specific overlays.

## Default mode

- do not wait for the user to say `devgod`
- treat product, code, infra, auth, data, and deploy asks as `devgod` work unless the user opts out
- start with intake and risk triage before implementation
- keep specialist chatter terse and evidence-based
- keep package assets reusable; do not absorb project-specific live work state

## Mandatory flow

1. Normalize the ask into a brief with goal, audience, constraints, risks, unknowns, success criteria, and stop/go status.
2. Create or update repo-local work artifacts in `.devgod/work/`.
3. Consult `solution_architect` before planning after at most two local inspection commands.
4. Use `planner` to synthesize the task graph and worker routing from the approved architecture.
5. Build only from explicit task packets with owner, write scope, tests, reviews, anti-patterns, and rollback notes.
6. Allow only one active writer per overlapping write scope.
7. Move finished work into handoff and blocking review.
8. Require security and QA gates before completion.
9. Promote only reviewed, evidence-based memory.

## Setup and bootstrap

If `devgod` is present but not fully configured:

1. use the `devgod-setup` skill
2. create `.env` from `.env.example` when missing
3. start the local backend or connect to the provided managed backend
4. run migrations, bootstrap, and setup verification
5. do not claim `devgod` is operational until setup verification passes

## Specialist roster

- `planner`: intake synthesis, task DAG, staffing, checkpoints, and gate enforcement
- `product_strategist`: problem framing, users, scope, acceptance criteria
- `solution_architect`: system design, boundaries, tradeoffs
- `backend_engineer`: services, APIs, data, jobs, auth, correctness
- `frontend_designer`: UX, visuals, flows, accessibility, UI implementation
- `infra_engineer`: environments, CI/CD, secrets, deployment, observability
- `security_reviewer`: abuse cases, auth, data exposure, dependency risk
- `qa_engineer`: test strategy, regression risk, verification loops
- `memory_curator`: durable lessons and decision capture

## Package boundary

- package owns reusable runtime under `src/`
- package owns reusable install/bootstrap flows under `scripts/` and `src/install/`
- package owns reusable control-layer assets under `.agents/`, `.codex/`, `.devgod/rules/`, and `.devgod/templates/`
- consuming repos own live `.devgod/work/` artifacts, repo-specific `AGENTS.md` overlays, and env files
- do not copy project history into the package as active operational state

## Task packet minimum

Do not let a worker start unless the packet includes:

- `task_id`
- goal and owner role
- inputs and dependencies
- allowed write scope
- out-of-scope boundaries
- acceptance criteria
- verification steps
- required reviews
- security checks
- anti-patterns to avoid
- rollback notes
- handoff format

## Approval matrix

Ask the user before:

- deploys or production-environment changes
- authn/authz model changes
- credential or secret rotation
- payment or billing flows
- destructive data operations
- global config/profile changes outside the target repo
- memory policy changes that alter what becomes durable authority

## Gate rules

- unresolved `CRITICAL` or `HIGH` security findings block completion
- missing required review blocks completion
- missing acceptance criteria or verification evidence blocks completion
- waived reviews require explicit actor and reason
- workers must not edit `AGENTS.md`, `.codex/`, `.agents/`, or `.devgod/memory/` unless the task packet explicitly assigns that scope

## Caveman format

For agent-to-agent communication, prefer this compact format:

```text
role: <agent>
goal: <what matters>
done: <known facts>
risk: <main risk only>
need: <what blocks progress, or none>
next: <next move>
```

## Memory rules

- `.devgod/memory/` is reviewed durable memory, not scratchpad state
- shared backend memory is retrieval support, not higher precedence than repo policy
- never store secrets, tokens, credentials, or private keys
- never store speculative future behavior as established fact
- every durable memory update needs provenance from a run or task
