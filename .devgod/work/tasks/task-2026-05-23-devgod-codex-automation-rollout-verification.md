# Task Packet

## Task ID

`2026-05-23-devgod-codex-automation-rollout-verification`

## Owner role

`build_resolver`

## Completion standard

`specialist_verified`

## Required specialist roles

- `solution_architect`
- `backend_engineer`
- `build_resolver`
- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Quality gates

- `reasoning_strict_required`
- `regression_safety_required`
- `product_acceptance`
- `release_readiness_required`
- `progress_proof_required`

## Goal

Prove the full automation integration locally and in hosted CI, then publish the branch as a PR to `main` with any required code or pipeline fixes landed on the same branch.

## Inputs

- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `docs/codex-automation-surface-integration-plan.md`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `src/install/cli.ts`
- `src/install/merge.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/runtime-surface.test.ts`
- `tests/ops-recovery.test.ts`
- `tests/report-command.test.ts`
- `tests/install.test.ts`
- `.github/workflows/ci.yml`

## Dependencies

- `2026-05-23-devgod-codex-cli-scheduler-adapter`

## Outputs

- broad local verification evidence for the automation integration
- PR to `main` from `codex/devgod-codex-automation-integration`
- CI repair commits if required
- final green hosted checks or explicit external blocker evidence

## Coverage impact

Extends the automation integration slice from local implementation into workflow-proof, publish, and hosted-CI completion evidence.

## Touched ledger items

- `runtime:codex-automation-envelope`
- `reporting:automation-handoff-artifacts`
- `ci:automation-aware-verification`

## Required runtime traces

- `trace://workflow-proof/live-check`
- `trace://github/pr-checks`

## Progress proof

Record the broad local verification bundle, the workflow-proof/live-check evidence, the PR link, and the final hosted CI state with any corrective branch-local commits.

## Interrupt checkpoint policy

- checkpoint immediately after any reproducible workflow-proof or hosted-CI blocker
- checkpoint after each CI repair commit if a second hosted verification pass is required

## Workflow artifact refs

brief=.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-rollout-verification.md
task=.devgod/work/tasks/task-2026-05-23-devgod-codex-automation-rollout-verification.md
checkpoint=.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-automation-rollout-verification.md
reviewer=.devgod/work/reviews/review-2026-05-23-devgod-codex-automation-rollout-verification-reviewer.md
qa_engineer=.devgod/work/reviews/review-2026-05-23-devgod-codex-automation-rollout-verification-qa_engineer.md
security_reviewer=.devgod/work/reviews/review-2026-05-23-devgod-codex-automation-rollout-verification-security_reviewer.md
review_exports=required

## Allowed write scope

- `.devgod/ACTIVE`
- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `.devgod/work/tasks/task-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `.devgod/work/proofs/progress-2026-05-23-devgod-codex-automation-rollout-verification.json`
- `.devgod/work/reviews/review-2026-05-23-devgod-codex-automation-rollout-verification-reviewer.md`
- `.devgod/work/reviews/review-2026-05-23-devgod-codex-automation-rollout-verification-qa_engineer.md`
- `.devgod/work/reviews/review-2026-05-23-devgod-codex-automation-rollout-verification-security_reviewer.md`
- `.devgod/work/checkpoints/checkpoint-2026-05-23-devgod-codex-cli-scheduler-adapter.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `src/install/cli.ts`
- `src/install/merge.ts`
- `tests/admin.test.ts`
- `tests/status-report.test.ts`
- `tests/runtime-surface.test.ts`
- `tests/ops-recovery.test.ts`
- `tests/report-command.test.ts`
- `tests/install.test.ts`
- `.github/workflows/ci.yml`
- `.env`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `.codex/config.toml`
- `.gitnexus/`

## Allowed successor task scope

- `.devgod/work/tasks/task-2026-05-23-devgod-codex-automation-post-merge-followup.md`

## Scope expansion protocol

If a workflow, review, or CI fix requires touching paths outside the allowed scope:

- stop immediately
- record the blocked paths and the minimum safe requested write expansion
- prefer a narrow CI-focused follow-on slice over broadening product scope

### Approved expansion

- the user approved widening this verification slice so repo-local runtime persistence and optional integration wiring can be completed in-place
- the minimum approved expansion is `src/install/cli.ts`, `src/install/merge.ts`, `tests/install.test.ts`, `.env`, `.gitignore`, `package.json`, `package-lock.json`, `.codex/config.toml`, and `.gitnexus/`
- use the expanded paths only for configuration required to make the source repo's local DevGod setup durable and to enable supported optional integrations that this repo already documents

## Out of scope

- `.agents/`
- `.devgod/memory/`
- unrelated product changes outside automation integration and CI repair

## Assumptions

### Approved assumptions

- the existing automation implementation commits are the intended feature scope for this rollout task
- hosted CI status on the PR is the source of truth for final branch health
- pipeline fixes belong on this branch when they are necessary to verify the new automation surfaces correctly

### Blocked assumptions

- do not assume a passing local suite proves hosted runners are healthy
- do not assume every hosted failure belongs to product code rather than pipeline configuration
- do not stage unrelated workspace noise such as the installer mode-bit change

## Reasoning quality

### Claim

The correct next step is a verification-and-publish slice that repairs workflow or CI gaps directly on the branch instead of reshaping the automation feature to stale tooling assumptions.

### Facts

- runtime, app, and CLI automation slices are already implemented on this branch with focused passing local tests
- the active blocker is a workflow live-check failure caused by an incomplete rollout verification task packet
- the user explicitly asked for a PR to `main` and for CI to be fixed until green, including pipeline updates when appropriate
- the user explicitly approved widening scope to persist the working managed runtime mode and configure repo-local optional integrations in this source repo

### Assumptions

- a template-complete task packet is sufficient to clear the current workflow live-check blocker
- any remaining hosted failures can be reproduced or diagnosed from GitHub check details without widening the feature scope

### Hypotheses and alternatives

- preferred: repair workflow artifacts first, rerun local verification, publish the branch, and iterate on hosted CI until green
- alternative: publish immediately and let hosted CI surface both workflow and product issues
- alternative: stop after local verification and report the branch as ready without hosted proof

### Evidence refs

- `.devgod/work/briefs/brief-2026-05-23-devgod-codex-automation-rollout-verification.md`
- `docs/codex-automation-surface-integration-plan.md`
- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `.github/workflows/ci.yml`

### Counter-evidence

- hosted CI might still uncover environment-specific issues even after the local verification bundle passes, so rollout is not complete until the PR checks are green

### Confidence

- `high`

### Open questions

- whether hosted CI requires workflow changes or only product/test adjustments
- whether any required review export files need to be generated before final completion reporting
- whether GitNexus in this source repo requires only repo-local Codex config or also a package-level dependency/script change
- whether the installer contract should treat source-repo GitNexus enablement as implicit drift or preserve GitNexus as opt-in for consuming repos

### Verification plan

- repair the rollout task packet until `check-devgod-workflow-live.sh` passes
- verify the expanded scope is recognized by the control-layer guard before touching repo-local config paths
- persist the working runtime mode in `.env` so `npm run setup:local` succeeds without an ad hoc override
- wire any documented repo-local optional integrations needed for this source repo, including GitNexus if the repo-local surface is incomplete
- repair installer/upgrade contract drift introduced by the repo-local GitNexus enablement and rerun the failing install verification slice
- rerun the broad local regression bundle and `git diff --check`
- publish the branch to GitHub and open a PR to `main`
- inspect required checks and repair product or pipeline issues until the PR is green

### Research and debug budgets

- researchSteps=1 debugSteps=3 reviewPasses=2 toolRetries=2

## Reasoning policy

### Mode

`strict`

### Requirements

- distinguish workflow-artifact failures from product-code failures
- prefer direct evidence from local verification and hosted check output over inference
- record any CI blocker that cannot be repaired inside the allowed scope

### Max attempts

- 3

## Reasoning attempts

### Attempt records

- attempt-1: complete the rollout verification packet so the workflow live check can proceed to runtime-backed evidence
- attempt-2: expand the task scope to include the minimum repo-local configuration paths required for durable setup and optional integration wiring after direct user approval

### Verification records

- verification-1: focused automation slice tests passed before the rollout task activated
- verification-2: runtime workflow-proof seed run `0cae7150-eb1b-4a3d-9dfb-f7e47ac4aceb` exists for this task, pending a clean live check

### Verdict

- status: `supported`
- summary: proceed with workflow repair, broad verification, PR publication, and hosted-CI closure
- supporting attempt ids: `attempt-1`
- blocking issues: current task packet is incomplete for the live workflow checker

## Behavior to preserve

- automation defer intent must keep producing explicit app or CLI handoff artifacts instead of immediate same-turn repetition
- runtime workflow proof must remain the completion authority
- CI must continue validating existing admin, reporting, and hook behaviors alongside the new automation surfaces

## Acceptance criteria

- broad local verification passes for the automation integration and adjacent runtime/reporting surfaces
- workflow/live verification for this task is healthy or any remaining issue is explicit and reproducible
- PR exists against `main`
- required CI checks are green after any necessary branch-local fixes

## Good-path checks

- the rollout task passes the live workflow check after the packet repair
- the broad local suite passes without touching unrelated files
- the PR opens against `main` from `codex/devgod-codex-automation-integration`
- hosted required checks finish green after zero or more branch-local repair commits

## Bad-path or edge-case checks

- if hosted CI lacks a session or environment assumption needed by the new automation surfaces, fix the pipeline rather than weakening feature behavior
- if same-thread CLI continuation cannot resume due to missing session metadata, keep the manual-review fallback behavior intact
- if workflow proof fails again, capture the exact missing artifact or heading before broadening edits

## Verification steps

- `node --experimental-strip-types --test tests/runtime-surface.test.ts`
- `node --experimental-strip-types --test tests/status-report.test.ts`
- `node --experimental-strip-types --test tests/ops-recovery.test.ts`
- `node --experimental-strip-types --test tests/admin.test.ts`
- `node --experimental-strip-types --test tests/report-command.test.ts`
- `node --experimental-strip-types --test tests/hooks.test.ts`
- `git --git-dir=/home/eimi/projects/devgod/.git --work-tree=/home/eimi/projects/devgod diff --check`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-23-devgod-codex-automation-rollout-verification`

## Residual risk disposition

Any remaining hosted-only failure after the first repair pass must be treated as an explicit blocker or follow-on fix, not hidden behind local green results.

## Required reviews

- `reviewer`
- `qa_engineer`
- `security_reviewer`

## Security checks

- confirm deferred automation artifacts never override runtime authority
- confirm app and CLI handoffs stay explicit about manual-review fallbacks
- confirm CI changes do not silently widen execution trust or bypass verification

## Retrieval guidance

- prioritize the rollout brief, the automation integration plan, the current branch diff, and hosted CI logs for any regression analysis

## Anti-patterns to avoid

- weakening automation behavior to satisfy outdated CI assumptions
- staging unrelated files or mode-bit noise into the rollout branch
- declaring completion from local test results alone

## Rollback notes

- revert any workflow-only or CI-only repair separately from product changes where possible so hosted regressions can be isolated quickly

## Handoff format

- include branch name, latest commit(s), workflow-proof/live-check evidence, broad local verification evidence, PR URL, and final hosted CI status
