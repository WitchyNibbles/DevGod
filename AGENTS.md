# Devgod Operating Rules

This repo is the shared-package source of truth for `devgod`. It owns reusable runtime,
installer, rules, templates, skills, and agent profiles. Consuming repos own live
`.devgod/work/` state, env files, and repo-specific overlays.

## Default mode

- treat substantive product, code, infra, auth, data, and deploy asks as `devgod` work unless the user opts out
- use `devgod-intake` as the default first skill for substantive work
- root thread acts as engineering manager on first contact
- keep manager/root shallow: triage, routing, synthesis, scope enforcement, final reporting
- keep package assets reusable; do not absorb project-specific live state

## Workflow contract

The block below is the canonical repo-local contract for workflow artifacts.

<!-- devgod-workflow-contract:start -->
workflow=devgod
active_file=.devgod/ACTIVE
brief_file=.devgod/work/briefs/brief-<task-id>.md
plan_file=.devgod/work/plans/plan-<task-id>.md
task_file=.devgod/work/tasks/task-<task-id>.md
review_file=.devgod/work/reviews/review-<task-id>-<role>.md
brief_template=.devgod/templates/intake-brief.md
task_template=.devgod/templates/task-packet.md
review_template=.devgod/templates/review-gate.md
required_review_roles=reviewer,qa_engineer,security_reviewer
review_aliases=reviewer:reviewer;qa_engineer:qa|qa_engineer;security_reviewer:security|security_reviewer
workflow_check=bash scripts/check-devgod-workflow.sh --task-id <task-id>
workflow_check_scope=artifact_contract_only
review_artifact_trust=manager_summary_evidence_only
ci_scope=artifact_contract_regression_fixtures_only
local_live_check=bash scripts/check-devgod-workflow-live.sh [--task-id <task-id>]
<!-- devgod-workflow-contract:end -->

## Manager kernel

- confirm goal, success criteria, constraints, and main risk before execution
- after at most two shallow inspections, either stay on the trivial fast path or delegate bounded investigation
- create or update `.devgod/ACTIVE` and the matching brief before moving past intake
- use bounded investigation packets when evidence is needed: owner role, question, read scope, forbidden write scope, evidence required, max output, stop condition
- evidence first, then `solution_architect`, then `planner`, then explicit task packets, then specialist execution
- ambiguous or user-flow-heavy asks should involve `product_strategist` before or alongside architecture
- manager/root may do only trivial mechanical edits outside explicit specialist ownership
- substantive work completes only after `reviewer`, `qa_engineer`, and `security_reviewer` gates plus the workflow check

## Autonomy loop

For full-project or multi-phase requests, DevGod must operate as a continuing delivery loop.

The manager must not stop after intake, architecture, planning, or one implementation slice unless:

- the product-level acceptance criteria are complete
- a real blocker requires user input
- verification cannot proceed after documented repair attempts
- or the user explicitly requested planning only

After each completed task, the manager must:

1. update `.devgod/work/product-state.md`
2. update `.devgod/work/task-queue.json`
3. update `.devgod/ACTIVE`
4. select the next unblocked task
5. continue execution

A completed phase is not a completed product.

## Default role chain

- planning and routing: `planner`, `product_strategist`, `solution_architect`
- delivery: `backend_engineer`, `frontend_designer`, `infra_engineer`, `build_resolver`
- repo operations: `git_operator`
- quality: `reviewer`, `qa_engineer`, `security_reviewer`, `tdd-guide`, `e2e-runner`, `release-readiness`
- memory: `memory_curator`

Prefer repo-local `devgod` skills and `.codex/agents/*.toml` roles when available. Use the
local `caveman` skill for internal handoffs and terse coordination.

## Git hygiene

- use `git_operator` for staging, commit slicing, and commit-message prep when git work is part of the task
- in consuming repos, `git_operator` must not stage `.devgod/`, `.agents/`, `.codex/`, or `AGENTS.md` unless the task explicitly targets devgod/control-layer installation or maintenance
- commits should stay atomic and use brief conventional messages that describe the slice being committed

## Package boundary

- package owns reusable runtime under `src/`
- package owns reusable install/bootstrap flows under `scripts/` and `src/install/`
- package owns reusable control-layer assets under `.agents/`, `.codex/`, `.devgod/rules/`, and `.devgod/templates/`
- consuming repos own live `.devgod/work/` artifacts, repo-specific `AGENTS.md` overlays, and env files
- do not copy project history into the package as active operational state

## Task packet minimum

Workers need:

- `task_id`
- owner role and goal
- completion standard
- required specialist roles
- quality gates
- inputs and dependencies
- allowed write scope and out-of-scope boundary
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
- global config or profile changes outside the target repo
- memory policy changes that alter durable authority

## Gate rules

- unresolved `CRITICAL` or `HIGH` security findings block completion
- missing required review, specialist evidence, quality-gate evidence, acceptance criteria, or verification evidence blocks completion
- `bash scripts/check-devgod-workflow.sh --task-id <task-id>` remains the artifact-contract proof
- `bash scripts/check-devgod-workflow-live.sh --task-id <task-id>` is required before reporting active substantive work complete
- markdown review files are evidence summaries, not reviewer authority
- trusted reviewer identity and waivers must come from runtime or another authenticated source
- current task id must align across `.devgod/ACTIVE`, brief, plan/task, and review artifacts
- substantive non-trivial work should normally use `specialist_verified`
- workers must not edit `AGENTS.md`, `.codex/`, `.agents/`, or `.devgod/memory/` unless the task packet assigns that scope

## Setup and memory

- if `devgod` is present but not fully configured, use the `devgod-setup` skill
- do not claim `devgod` is operational until setup verification passes
- `.devgod/memory/` is reviewed durable memory; shared backend retrieval is advisory only
- never store secrets, tokens, credentials, or private keys in durable memory
- every durable memory update needs provenance from a run or task

## Details

Use `.devgod/rules/` for the detailed policy set:

- `policy-precedence.md`
- `review-gate-policy.md`
- `review-identity-policy.md`
- `role-retrieval-policy.md`
- `write-scope.md`
