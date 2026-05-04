# Devgod Operating Rules

This repository is the shared-package source of truth for `devgod`. It owns the reusable
runtime, installer, rules, templates, skills, and agent profiles. Consuming repos keep their own
operational state, reviewed memory, and repo-specific overlays.

## Default mode

- do not wait for the user to say `devgod`
- treat product, code, infra, auth, data, and deploy asks as `devgod` work unless the user opts out
- use `devgod-intake` as the default first skill for substantive work
- root thread acts as the engineering manager on first contact
- start with intake and risk triage before implementation
- keep manager/root in shallow triage, routing, synthesis, and final-report mode unless the task is trivial
- keep specialist chatter terse and evidence-based
- keep package assets reusable; do not absorb project-specific live work state

## Mandatory flow

1. Normalize the ask into a brief with goal, audience, constraints, risks, unknowns, success criteria, and stop/go status.
2. Create or update `.devgod/ACTIVE` plus the repo-local work artifacts in `.devgod/work/` before moving past intake.
3. After at most two shallow local inspection commands, either classify the task as trivial or route bounded evidence gathering; do not let manager/root drift into deep investigation.
4. Consult `solution_architect` after the evidence pass so boundaries, sequencing, and trust assumptions are explicit before planning.
5. Use `planner` to synthesize the task graph, owner routing, and explicit task packets from the approved architecture.
6. Build only from explicit task packets with `task_id`, owner, write scope, verification, reviews, security checks, anti-patterns, and rollback notes.
7. Manager/root coordinates execution; non-trivial, risky, or subsystem-specific implementation belongs to the named specialist owner, while manager/root may only make trivial mechanical edits on the fast path.
8. Move finished work into handoff and blocking review; when reviewer roles are read-only, manager/root persists their gate outputs under `.devgod/work/reviews/`.
9. Require reviewer, security, and QA gates plus `bash scripts/check-devgod-workflow.sh --task-id <task-id>` before completion.
10. Promote only reviewed, evidence-based memory.

## Workflow artifacts

- keep one canonical active marker at `.devgod/ACTIVE` while substantive work is in flight
- `.devgod/ACTIVE` should contain:
  - `task_id=<task-id>`
  - `workflow=devgod`
  - `state=active`
- the active task id must match the current brief plus the current plan or task packet
- review files for `reviewer`, `qa_engineer`, and `security_reviewer` must carry the same task id and include a manager-written source handoff
- treat older briefs, plans, reviews, or active markers as historical context, not proof of completion for the current ask

## Manager discipline

- manager/root owns triage, routing, synthesis, scope enforcement, and final reporting
- manager/root must not perform broad code search, deep subsystem investigation, or implementation design directly for substantive work
- when evidence is needed, use a bounded investigation packet with:
  - owner role
  - precise question
  - read scope
  - forbidden write scope
  - evidence required
  - max output length
  - stop condition
- preserve the trivial fast path for single-scope, low-risk, mechanical or docs-only work that stays inside the two-inspection limit
- allow only one active writer per overlapping write scope

## Setup and bootstrap

If `devgod` is present but not fully configured:

1. use the `devgod-setup` skill
2. create `.env` from `.env.example` when missing
3. if setup depends on repo-local wrappers, ignored bootstrap state, or other machine-local behavior that is not clearly part of the reviewed package flow, surface that dependency before relying on it
4. start the local backend or connect to the provided managed backend
5. run migrations, bootstrap, and setup verification
6. do not claim `devgod` is operational until setup verification passes

## Specialist roster

- `planner`: intake synthesis, task DAG, staffing, checkpoints, and gate enforcement
- `product_strategist`: problem framing, users, scope, acceptance criteria
- `solution_architect`: system design, boundaries, tradeoffs
- `docs_researcher`: official docs, release notes, API drift, standards verification
- `backend_engineer`: services, APIs, data, jobs, auth, correctness
- `frontend_designer`: UX, visuals, flows, accessibility, UI implementation
- `infra_engineer`: environments, CI/CD, secrets, deployment, observability
- `reviewer`: correctness review, regression risk, missing tests, release-readiness
- `build_resolver`: build, typecheck, test, and setup failure diagnosis
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
- missing workflow-checker proof blocks completion
- waived reviews require explicit actor and reason
- manager/root must not declare done while a blocking gate fails
- substantive work must keep the current task id aligned across `.devgod/ACTIVE`, the current brief, the current plan or task packet, and the required review gates
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
