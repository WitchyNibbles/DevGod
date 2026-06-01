# Task Packet

## Task ID

`2026-06-01-devgod-git-flow-defaults`

## Owner role

`agent_runtime_engineer`

## Completion standard

`specialist_verified`

## Required specialist roles

- `solution_architect`
- `agent_runtime_engineer`
- `technical_writer`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `council_review_required`
- `reasoning_strict_required`
- `regression_safety_required`
- `product_acceptance`

## Goal

Ship reusable git-flow branch defaults, no-`codex` git metadata policy, and local git guardrails without breaking install/setup expectations.

## Inputs

- `.devgod/work/briefs/brief-2026-06-01-devgod-git-flow-defaults.md`
- `.devgod/work/plans/plan-2026-06-01-devgod-git-flow-defaults.md`
- `.devgod/work/council/dac-2026-06-01-devgod-git-flow-defaults.md`
- `AGENTS.md`
- `.devgod/rules/policy-precedence.md`
- `src/install/merge.ts`
- `src/install/git-guard.ts`
- `src/install/setup-git-guard.ts`
- `src/install/verify-git-guard.ts`
- `.githooks/pre-commit`
- `.githooks/commit-msg`
- `scripts/check-devgod-commit-msg.sh`
- `scripts/check-devgod-git-guard.sh`
- `tests/install.test.ts`

## Dependencies

- none

## Outputs

- updated reusable git workflow policy text
- branch and commit guardrail coverage
- docs or rules updates that describe the override policy accurately
- focused regression tests

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-06-01-devgod-git-flow-defaults.md
plan=.devgod/work/plans/plan-2026-06-01-devgod-git-flow-defaults.md
task=.devgod/work/tasks/task-2026-06-01-devgod-git-flow-defaults.md
reviewer=.devgod/work/reviews/review-2026-06-01-devgod-git-flow-defaults-reviewer.md
qa_engineer=.devgod/work/reviews/review-2026-06-01-devgod-git-flow-defaults-qa_engineer.md
security_reviewer=.devgod/work/reviews/review-2026-06-01-devgod-git-flow-defaults-security_reviewer.md
review_exports=required

## Council review

### Required

`true`

### Trigger rationale

Shared git workflow governance, shipped control-layer guidance, and local guardrail behavior are all changing across consuming repos.

### Decision packet

- `.devgod/work/council/dac-2026-06-01-devgod-git-flow-defaults.md`

### Council members

- `solution_architect`
- `product_strategist`
- `security_reviewer`

### Dissent owner

`product_strategist`

### Outcome

`approved_with_conditions`

### Exception expiry

`none`

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-06-01-devgod-git-flow-defaults.md`
- `.devgod/work/council/dac-2026-06-01-devgod-git-flow-defaults.md`
- `.devgod/work/plans/plan-2026-06-01-devgod-git-flow-defaults.md`
- `.devgod/work/tasks/task-2026-06-01-devgod-git-flow-defaults.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `AGENTS.md`
- `.devgod/rules/policy-precedence.md`
- `.devgod/rules/README.md`
- `.devgod/rules/git-conventions.md`
- `src/install/merge.ts`
- `src/install/git-guard.ts`
- `src/install/setup-git-guard.ts`
- `src/install/verify-git-guard.ts`
- `.githooks/pre-commit`
- `.githooks/commit-msg`
- `scripts/check-devgod-branch-name.sh`
- `scripts/check-devgod-commit-msg.sh`
- `tests/install.test.ts`

## Allowed successor task scope

- none

## Scope expansion protocol

If additional prompt, hook, or docs surfaces outside this list are required, stop and request the narrowest expansion rather than widening the task implicitly.

## Out of scope

- `.devgod/memory/`
- GitHub API or app integrations
- release automation changes unrelated to git metadata defaults
- historical branch or PR cleanup

## Assumptions

### Approved assumptions

- branch-name validation belongs in the existing git-guard setup surface
- PR title/body guidance can remain in shipped policy text for this slice

### Blocked assumptions

- do not assume authenticated runtime review artifacts can be created locally in this turn

## Reasoning quality

### Claim

Pairing reusable policy updates with deterministic branch/commit guardrails is the smallest safe slice that materially changes default git behavior.

### Facts

- shipped AGENTS text is generated in part by `src/install/merge.ts`
- install tests already verify git-guard setup and managed AGENTS content
- current guard scripts do not validate branch names or reject `codex` in commit subjects

### Assumptions

- a new branch-name script plus updated tests is sufficient for the first enforcement layer

### Hypotheses and alternatives

- preferred: update policy plus local guardrails
- alternative: docs-only update
- alternative: commit-only enforcement

### Evidence refs

- brief
- plan
- council packet
- source files listed above

### Counter-evidence

- PR fields remain unenforced locally without a remote integration surface

### Confidence

`high`

### Open questions

- whether the maintenance bypass should share the existing `DEVGOD_ALLOW_MANAGED_COMMITS` escape hatch

### Verification plan

- update tests before or alongside implementation
- run focused install tests
- run broader suite if focused changes pass

### Research and debug budgets

- one implementation loop
- one focused repair loop if tests fail

## Reasoning policy

### Mode

`strict`

### Requirements

Explicit facts, alternatives, verification refs, and a final verdict are required.

### Max attempts

`2`

## Reasoning attempts

### Attempt records

- id: `attempt-1`
- label: `policy-plus-guardrails`
- hypothesis: managed policy text plus local branch/commit validation is enough for a strong first slice
- alternatives: docs-only, commit-only, GitHub API validation
- evidence refs: brief, council packet, source files
- verification refs: install tests, full test suite
- trace ref: `local branch feature/git-flow-defaults from origin/main@558ed5b`
- outcome: `selected`
- summary: chosen as the smallest reversible slice that changes behavior materially

### Verification records

- id: `verify-baseline-npm-test`
- kind: `command`
- ref: `npm test`
- status: `baseline_running`
- summary: clean worktree baseline started after branching from updated `origin/main`

### Verdict

- status: `supported`
- summary: proceed with the selected slice and validate with install and full test coverage
- supporting attempt ids: `attempt-1`
- blocking issues: `runtime-authenticated review/export evidence remains separate from local implementation`

## Behavior to preserve

- existing managed-path git guard behavior
- existing conventional commit requirements
- consuming repo policy precedence
- install/setup git-guard wiring

## Acceptance criteria

- shared policy text defines the allowed default prefixes: `feature/`, `bugfix/`, `hotfix/`, `release/`, `chore/`, `refactor/`, `docs/`, `test/`, `ci/`, `perf/`
- shared policy text requires new task or plan work to branch from updated `origin/main`
- shared policy text says consuming repo-specific guidance can override the default
- local guardrails reject invalid branch names or `codex`-containing commit subjects
- tests reflect the new policy and guard behavior

## Good-path checks

- valid names such as `feature/user-authentication` and `bugfix/login-validation` pass
- conventional commit subjects without `codex` continue to pass

## Bad-path or edge-case checks

- direct work on `main` is rejected unless an explicit maintenance escape hatch applies
- `codex/*` branch names are rejected
- commit subjects containing `codex` are rejected
