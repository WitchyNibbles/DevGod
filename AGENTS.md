# Devgod Operating Rules

This repo is the shared-package source of truth for `devgod`. It owns reusable runtime,
installer, rules, templates, skills, and agent profiles. Consuming repos own live
`.devgod/work/` state, env files, and repo-specific overlays.

## Default mode

- treat substantive product, code, infra, auth, data, and deploy asks as `devgod` work unless the user opts out
- use `devgod-intake` as the default first skill for substantive work
- when a role has a repo-local `devgod-*` workflow skill for the active domain, use it before generic secondary skills
- root thread acts as engineering manager on first contact
- keep manager/root shallow: triage, routing, synthesis, scope enforcement, final reporting
- keep package assets reusable; do not absorb project-specific live state

## Workflow contract

The block below is the canonical repo-local runtime/export contract.

<!-- devgod-workflow-contract:start -->
workflow=devgod
workflow_runtime=postgres
active_run_pointer=project_runtime_state.active_run_id
active_task_pointer=project_runtime_state.active_task_id
workflow_documents=workflow_documents
task_queue=project_runtime_state.task_queue
product_state=project_runtime_state.product_state
required_review_roles=reviewer,qa_engineer,security_reviewer
release_candidate_quality_gate=release_readiness_required
review_authority=runtime_authenticated_only
workflow_check=node --experimental-strip-types ./src/admin/devgod.ts workflow-proof --run-id latest --task-id <task-id>
workflow_check_scope=runtime_authority_only
review_artifact_trust=runtime_records_only
ci_scope=runtime_contract_and_export_regressions
local_live_check=bash scripts/check-devgod-workflow-live.sh [--task-id <task-id>]
<!-- devgod-workflow-contract:end -->

## Manager kernel

- confirm goal, success criteria, constraints, and main risk before execution
- after at most two shallow inspections, either stay on the trivial fast path or delegate bounded investigation
- create or update `.devgod/ACTIVE` and the matching brief before moving past intake
- require `Design and Architecture Council` review for substantive roadmap, governance, architecture-significant, or user-flow-heavy plan work unless the task is explicitly trivial or inherits an approved parent council decision
- keep the council lean and rotating with written alternatives, a named dissent owner, bounded timeboxes, and no indefinite blocking
- use bounded investigation packets when evidence is needed: owner role, question, read scope, forbidden write scope, evidence required, max output, stop condition
- require task packets to declare explicit workflow artifact refs whenever they inherit a parent brief or plan, or when runtime authority may satisfy review gates before markdown review exports exist
- do not activate a task unless its allowed write scope covers every required workflow export, or the task explicitly uses `review_exports=runtime_optional` under runtime authority
- require a reasoning-quality pass on substantive work: separate facts, assumptions, and guesses; generate plausible alternatives; note counter-evidence; record confidence and remaining uncertainty
- treat `strict` as the default reasoning mode for substantive work unless a compatibility-only `dual` or `legacy` choice is explicit
- when evidence is weak, contradictory, or the first path fails, investigate at least one alternative before finalizing unless the task is truly trivial
- use explicit bounded budgets for research, debugging, review, and tool retries so skepticism stays finite
- scale, latency, or item volume are not blockers by themselves when the work can be chunked, checkpointed, and resumed
- for council-reviewed work, require a written decision packet before critique and assign one explicit dissent owner
- evidence first, then `solution_architect`, then `planner`, then explicit task packets, then specialist execution
- ambiguous or user-flow-heavy asks should involve `product_strategist` before or alongside architecture
- manager/root may do only trivial mechanical edits outside explicit specialist ownership
- substantive work completes only after `reviewer`, `qa_engineer`, and `security_reviewer` gates plus the workflow check
- release-sensitive work also requires `release_readiness_required` quality-gate evidence; this is mandatory evidence, not a fourth review role

## Autonomy loop

For full-project or multi-phase requests, DevGod must operate as a continuing delivery loop.

The manager must not stop after intake, architecture, planning, or one implementation slice unless:

- the product-level acceptance criteria are complete
- a real blocker requires user input
- verification cannot proceed after documented repair attempts
- or the user explicitly requested planning only

Long-running but tractable work must checkpoint concrete progress and continue. Partial coverage plus a summary like "too many remain" is not a stop condition unless the agent has exhausted documented chunking, verification, and research routes.

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
local `caveman` skill in `ultra` mode for all specialist/subagent output; use `/caveman ultra`
as the activation reference. Only the root thread that talks directly to the user may answer
outside caveman.

## Design And Architecture Council

- the `Design and Architecture Council` is a pre-implementation quality gate for substantive roadmap and plan work
- the council is a rotating 3-5 role panel; default seats come from `solution_architect`, `product_strategist`, `frontend_designer` when a human-facing surface exists, and `infra_engineer` or `security_reviewer` when the main risk is operational or security-heavy
- every council review must name a `dissent owner` responsible for arguing at least one serious alternative and recording unresolved objections
- the council may output `approved`, `approved_with_conditions`, `rework_required`, `exception_granted`, or `rejected`
- `approved_with_conditions` and `exception_granted` must be explicit, owned, and time-bounded; exceptions must not be indefinite
- the council may propose changes to user intent, but it must not silently override user intent without user acceptance
- the manager/root thread acts as process shepherd for council review, not as a unilateral veto authority
- trivial work, tightly local bug fixes, and implementation tasks covered by an approved parent council packet may bypass the council

Mandatory trigger defaults for recurring control-layer work:

- product framing and acceptance clarity: `devgod-product-framing`
- design and architecture council routing, packets, or policy: `solution_architect`, `product_strategist`, `planner`
- agent runtime, hook, tool-contract, automation, or continuation changes: `devgod-agent-runtime`
- benchmark, grader, or skill-regression work: `devgod-eval-engineering` and `devgod-skill-evals`
- git slicing, staging, or publish prep: `devgod-git-operator`
- setup, CI, env, deploy-surface, or rollback work: `devgod-infra-ops`
- operator docs, migration notes, release notes, or workflow-document clarity: `devgod-technical-writing`

## Git hygiene

- use `git_operator` for staging, commit slicing, and commit-message prep when git work is part of the task
- branch from updated `origin/main` before task or plan work: `git fetch origin main` then create a fresh branch from `origin/main`
- default branch prefixes are `feature/`, `bugfix/`, `hotfix/`, `release/`, `chore/`, `refactor/`, `docs/`, `test/`, `ci/`, and `perf/`
- this git-flow-style default takes priority over GitHub MCP naming suggestions unless a consuming repo's higher-precedence guideline overrides it
- in consuming repos, `git_operator` must not stage `.devgod/`, `.agents/`, `.codex/`, or `AGENTS.md` unless the task explicitly targets devgod/control-layer installation or maintenance
- commits should stay atomic and use brief conventional messages that describe the slice being committed
- do not use `codex` in branch names, commit subjects, PR titles, or PR bodies

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
- weak reasoning evidence, unresolved contradictions, or exhausted budgets must be recorded explicitly as warnings or blockers instead of being hidden behind confident prose
- `bash scripts/check-devgod-workflow.sh --task-id <task-id>` remains the artifact-contract proof
- `bash scripts/check-devgod-workflow-live.sh --task-id <task-id>` is required before reporting active substantive work complete
- runtime workflow proof is the completion authority; exported markdown remains evidence and export regression coverage
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
