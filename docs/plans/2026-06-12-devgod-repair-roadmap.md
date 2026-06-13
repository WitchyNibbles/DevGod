# Devgod Repair Roadmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair `devgod` into a coherent autonomous development-team package whose orchestrator, agents, review loops, runtime authority, exported artifacts, command surface, and release gates agree.

**Architecture:** Treat runtime state as the canonical authority and make markdown/workflow files generated or explicitly advisory. Keep `devgod` as a public package, but stabilize its public package API so autonomous orchestration, agent dispatch, review validation, hooks, skills, and installer/runtime behavior do not depend on accidental repository layout or legacy aliases.

**Tech Stack:** Node.js 22, TypeScript with `node --experimental-strip-types`, PostgreSQL runtime store, shell setup/check scripts, Node test runner, package install/upgrade harnesses.

---

## Current Evidence

This roadmap is based on the current worktree as of 2026-06-12.

- `npm test` passed with `703` passing, `0` failing, and `1` skipped test.
- `npm run typecheck` passed.
- `npm run check:quality` failed because branch coverage was below the required 80 percent threshold.
- `npm run check:workflow` failed because `.devgod/ACTIVE` is idle and no `--task-id` was supplied.
- `bash scripts/check-devgod-workflow-live.sh --repo-root .` reported idle runtime state.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-08-consuming-repo-skill-evolution-trace-mining` failed because the task packet lacks the stricter `specialist_verified` artifact requirements.
- `npm run verify:package-surface` passed.
- `npm run devgod -- status --format text` reported runtime-authoritative approval for run `cd1aadce-3755-4b24-8f99-1adbcdfe81cb`, no active task, local `.devgod/ACTIVE` idle, and graphify stale.

Key file evidence:

- `AGENTS.md` defines runtime-backed workflow authority and review gates.
- `README.md` and `docs/current-state.md` frame `devgod` as an installable workflow control layer and package source of truth.
- `package.json:150-175` ships raw `src/**` and multiple source directories as package files.
- `package.json:177-239` exposes overlapping maintainer, runtime, setup, Graphify, UI, and MCP scripts.
- `src/install/merge.ts:12-28` embeds the managed workflow contract as a large TS string and points installed workflow proof at `./node_modules/devgod/src/admin/devgod.ts`.
- `src/install/cli.ts:126-165` generates a downstream `devgod/review-identity-adapter.ts` that imports from `devgod/src/index.ts`.
- `scripts/check-devgod-happy-path.sh:136-146` expects installed `devgod:*` setup script names, while the source repo also exposes unprefixed maintainer variants.
- `.devgod/work/tasks/task-2026-06-08-consuming-repo-skill-evolution-trace-mining.md:22-26` lists only `council_review_required` and `regression_safety_required`, but current workflow checking requires stricter gates for `specialist_verified` work.

## Confirmed Product Definition

The maintainer clarified the product target on 2026-06-12.

`devgod` is a public package that makes Codex behave like a fully autonomous development team. A human prompt enters an orchestrator. The orchestrator researches the request, asks clarifying questions until the intended design is clear, selects and spawns the best-fit agents, and then runs validation loops where independent reviewer agents check functional completion, good practices, formatting, completeness, security, compliance, and other gates. Reviewers must push work back for repair until the task is actually complete. The core promise is not "the model answered"; it is that tasks are finished, verified, and runtime-authoritative by default.

Core surfaces:

- installer
- runtime
- review system
- skills
- agents
- hooks

Surfaces may change if a better architecture reaches the autonomous-team goal more reliably.

## Clarifying Answers Recorded

1. `devgod` v1 should optimize for a full autonomous execution system.
2. Runtime DB authority is the single source of truth; markdown files are generated/exported evidence or advisory views.
3. Downstream repos should be runtime-authoritative by default.
4. `devgod` should remain a public package, with a stable public API instead of accidental raw-path coupling.
5. Core surfaces are installer, runtime, review, skills, agents, and hooks. Other surfaces are optional unless they prove necessary for the autonomous-team goal.
6. Legacy script aliases can be removed.
7. Source-repo proof should claim both package readiness and downstream operational readiness, but only when runtime/install evidence actually proves both.

## Non-Negotiable Repair Principles

- Runtime authority must not contradict workflow artifacts.
- Operator status must not report idle/consistent while a known approved task fails required artifact checks.
- Markdown review files and task packets are either generated from runtime or explicitly advisory.
- Package consumers must import from stable public package surfaces; raw-path imports such as `devgod/src/index.ts` must either become deliberate public exports or be replaced.
- `check:quality` must exercise all release gates, not fail before reaching later checks because of avoidable coverage drift.
- Duplicated policy text must move toward canonical renderers or assets.
- Optional modules must not block the core install/runtime/proof path unless they directly serve the autonomous-team loop.
- Agent execution is incomplete until independent validation agents have verified function, completeness, maintainability, formatting, security, compliance, and task-specific acceptance criteria.
- Review loops must be able to send work back to implementers until the runtime can prove the task is actually complete.

## Roadmap Summary

1. Repair active quality and workflow red gates.
2. Resolve runtime-vs-markdown authority around runtime DB as canonical truth.
3. Define the autonomous orchestrator and agent validation loop as the core product contract.
4. Stabilize package public API and CLI entrypoint.
5. Consolidate install/setup/check scripts and remove legacy aliases.
6. Canonicalize policy, template, hook, skill, and agent surfaces.
7. Split core autonomous-team surfaces from optional modules.
8. Harden downstream runtime-authoritative install verification.
9. Reconcile docs, product state, and release-readiness proof.

## Phase 0: Decision Gate And Runtime Track Preparation

**Goal:** Capture the maintainer answers, prepare the new repair task, and prevent more work from landing under stale or idle authority before runtime registration exists.

**Files:**

- Modify: `.devgod/ACTIVE`
- Create: `.devgod/work/briefs/brief-2026-06-12-devgod-autonomous-team-repair.md`
- Create: `.devgod/work/plans/plan-2026-06-12-devgod-autonomous-team-repair.md`
- Create: `.devgod/work/proofs/progress-2026-06-12-devgod-autonomous-team-repair.json`
- Create: `.devgod/work/tasks/task-2026-06-12-devgod-autonomous-team-repair.md`
- Create: `.devgod/work/council/dac-2026-06-12-devgod-autonomous-team-repair.md`
- Create: `.devgod/work/reviews/review-2026-06-12-devgod-autonomous-team-repair-*.md`
- Modify: `.devgod/work/task-queue.json`
- Modify: `.devgod/work/product-state.md`

**Acceptance Criteria:**

- The prepared task id is `2026-06-12-devgod-autonomous-team-repair`.
- The brief records the maintainer's answers or explicitly marks unanswered items as blockers.
- The task packet includes `reasoning_strict_required`, `completion_audit_required`, and review trio requirements.
- The task packet allows its own council and review export paths.
- The local exports state clearly whether runtime registration exists.
- Work does not proceed to architecture rewrites until the runtime-vs-markdown source-of-truth decision is recorded.

**Verification:**

```bash
bash scripts/check-devgod-workflow-live.sh --repo-root .
bash scripts/check-devgod-workflow.sh --task-id 2026-06-12-devgod-autonomous-team-repair
```

Expected before runtime registration and final reviews: workflow checks should report missing runtime/review authority, not malformed task state.

**Rollback:**

- Restore the prior `.devgod/ACTIVE`, queue, and product-state exports if the maintainer chooses not to proceed.

## Phase 1: Immediate Gate Restoration

**Goal:** Make the current maintainer verification path truthful and runnable before broader refactors.

### Task 1.1: Fix Coverage Threshold Failure

**Files:**

- Inspect: `scripts/check-coverage.ts`
- Inspect: coverage output generated by `npm run check:coverage`
- Modify: targeted tests under `tests/*.test.ts`
- Avoid: lowering the 80 percent threshold unless the threshold itself is proven invalid.

**Steps:**

1. Run `npm run check:coverage`.
2. Identify the uncovered branch families from the coverage report.
3. Add the smallest meaningful tests for uncovered runtime/workflow branches.
4. Run the targeted tests.
5. Run `npm run check:coverage`.

**Acceptance Criteria:**

- Branch coverage is at least 80 percent.
- New tests assert behavior, not just line execution.

**Verification:**

```bash
npm run check:coverage
npm test
```

### Task 1.2: Make Idle Workflow Checks Intentional

**Files:**

- Modify: `scripts/check-devgod-workflow.sh`
- Modify: `scripts/check-devgod-workflow-live.sh`
- Modify: `tests/workflow-check.test.ts`
- Modify: `tests/workflow-scaffold.test.ts` if scaffold assumptions change

**Problem:**

Default `check:workflow` fails in an idle repo, while `check-devgod-workflow-live.sh` exits successfully for idle state. Both behaviors may be valid, but they must be explicit and documented.

**Decision Required:**

- Option A: `check:workflow` validates only active task artifacts and requires `--task-id` when idle.
- Option B: `check:workflow` mirrors live behavior and reports idle success when no active task exists.

**Recommended Choice:**

Option B for maintainer UX, plus an explicit `--task-id` mode for task proof.

**Acceptance Criteria:**

- `npm run check:workflow` has deterministic idle behavior.
- `check-devgod-workflow-live.sh --task-id <id>` still fails malformed task artifacts.
- Tests cover idle, active, completed, and explicit task-id cases.

**Verification:**

```bash
npm run check:workflow
bash scripts/check-devgod-workflow-live.sh --repo-root .
node --experimental-strip-types --test tests/workflow-check.test.ts tests/workflow-scaffold.test.ts
```

### Task 1.3: Rerun Full Quality Path

**Files:**

- Inspect: `scripts/check-quality.sh`
- Modify only if the gate sequence is wrong.

**Acceptance Criteria:**

- The script reaches all gates: typecheck, coverage, workflow schema, agent caveman, workflow fixtures, evals, drift check, audit, package surface, vendored skills, pack dry run.
- Any failure after coverage is recorded as its own repair task instead of hidden by the initial coverage failure.

**Verification:**

```bash
npm run check:quality
```

## Phase 2: Single Source Of Truth Repair

**Goal:** Remove the current authority split where runtime approval and exported workflow artifacts can disagree.

### Task 2.1: Define Runtime And Export Semantics

**Files:**

- Modify: `AGENTS.md`
- Modify: `.devgod/rules/review-gate-policy.md`
- Modify: `.devgod/rules/policy-precedence.md`
- Modify: `.devgod/templates/task-packet.md`
- Modify: `src/devgod/workflow-schema.ts`
- Test: `tests/control-layer-contract.test.ts`
- Test: `tests/workflow-integrity.test.ts`

**Recommended Contract:**

- Runtime task, review, approval, and council records are canonical.
- Markdown task packets, reviews, product state, and queue files are export artifacts.
- Export artifacts can block release if stale or malformed, but they cannot independently override authenticated runtime truth.
- If export artifacts are required for a task class, runtime must be able to generate or verify them from canonical records.

**Acceptance Criteria:**

- The contract says exactly when markdown is required, optional, generated, or advisory.
- `specialist_verified` requirements are defined once and rendered consistently.
- `product-state.md` is no longer treated as canonical unless runtime writes it.

**Verification:**

```bash
npm run verify:workflow-schema
node --experimental-strip-types --test tests/control-layer-contract.test.ts tests/workflow-integrity.test.ts
```

### Task 2.2: Make Status Surface Contradictions

**Files:**

- Modify: `src/admin/status.ts`
- Modify: `src/admin/ops.ts`
- Modify: `src/admin/devgod.ts` only if routing changes
- Test: `tests/status-report.test.ts`
- Test: `tests/ops-recovery.test.ts`
- Test: `tests/workflow-integrity.test.ts`

**Problem:**

Status can report runtime `approved`, local idle, and integrity `consistent` while explicit task artifact checks fail.

**Acceptance Criteria:**

- Status reports approved tasks with stale or invalid exported artifacts as a warning or contradiction.
- Ops gives a concrete repair action.
- Idle state remains valid only when no task-level proof obligations remain.

**Verification:**

```bash
node --experimental-strip-types --test tests/status-report.test.ts tests/ops-recovery.test.ts tests/workflow-integrity.test.ts
npm run devgod -- status --format text
```

### Task 2.3: Repair Or Regenerate Existing Approved Task Exports

**Files:**

- Modify or regenerate: `.devgod/work/tasks/task-2026-06-08-consuming-repo-skill-evolution-trace-mining.md`
- Create or regenerate: matching `.devgod/work/reviews/review-2026-06-08-consuming-repo-skill-evolution-trace-mining-*.md`
- Modify: runtime export command if exports are generated by code

**Acceptance Criteria:**

- Explicit workflow proof for `2026-06-08-consuming-repo-skill-evolution-trace-mining` passes, or the task is downgraded from artifact-required with a recorded runtime authority rationale.
- Review exports are either present and valid or explicitly runtime-optional.

**Verification:**

```bash
bash scripts/check-devgod-workflow.sh --task-id 2026-06-08-consuming-repo-skill-evolution-trace-mining
bash scripts/check-devgod-workflow-live.sh --repo-root . --task-id 2026-06-08-consuming-repo-skill-evolution-trace-mining
```

## Phase 3: Public Package Boundary Stabilization

**Goal:** Keep `devgod` as a public package while replacing accidental raw repo-layout coupling with deliberate public import and executable surfaces.

### Task 3.1: Define Public API And Bin Surface

**Files:**

- Modify: `package.json`
- Modify: `src/index.ts`
- Modify: `src/admin/devgod.ts`
- Modify: `src/admin.ts`
- Add if needed: `src/bin/devgod.ts`
- Test: `tests/types-modules.test.ts`
- Test: `tests/install.test.ts`

**Target Shape:**

- One public package import surface.
- One stable executable entrypoint.
- No generated downstream imports from `devgod/src/index.ts`.
- Raw `src/` paths are either promoted to deliberate public exports with tests or replaced with stable public imports.

**Acceptance Criteria:**

- Installed review identity adapter imports from `devgod` or a named public export, not `devgod/src/index.ts`.
- Package metadata defines stable `exports` and `bin` fields.
- Existing source-repo scripts use the canonical CLI entrypoint or documented maintainer shims.

**Verification:**

```bash
node --experimental-strip-types --test tests/types-modules.test.ts tests/install.test.ts
npm run verify:package-surface
npm pack --dry-run
```

### Task 3.2: Remove Raw Node Modules CLI Coupling

**Files:**

- Modify: `src/install/merge.ts`
- Modify: `.devgod/templates/workflow-schema.json`
- Modify: `tests/install.test.ts`
- Modify: `tests/control-layer-contract.test.ts`

**Problem:**

Generated workflow contract points to `./node_modules/devgod/src/admin/devgod.ts`.

**Acceptance Criteria:**

- Installed workflow checks call a stable package command or bin.
- No managed contract tells consumers to execute raw TS under `node_modules/devgod/src`.
- Compatibility for old installs is handled by upgrade code, not new templates.

**Verification:**

```bash
node --experimental-strip-types --test tests/install.test.ts tests/control-layer-contract.test.ts
npm run verify:package-surface
```

## Phase 4: Command And Setup Surface Consolidation

**Goal:** Replace script sprawl with a smaller command matrix and remove legacy aliases through explicit migrations.

### Task 4.1: Script Inventory And Classification

**Files:**

- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/current-state.md`
- Test: `tests/install.test.ts`
- Test: `tests/release-overlay.test.ts`

**Classification:**

- Core maintainer commands: test, typecheck, check:quality, install:project, devgod.
- Core installed commands: devgod:setup:local, devgod:doctor, devgod:verify:setup, devgod:status, devgod:workflow-proof.
- Optional module commands: Graphify, Grafana, UI, MCP, Playwright setup.
- Legacy aliases: removed when covered by migration tests or replaced with clear failure messages.

**Acceptance Criteria:**

- Source repo and installed repo script names are intentionally different or intentionally aligned.
- `scripts/check-devgod-happy-path.sh` checks the correct command set for the repo mode it is running in.
- Removed aliases have migration notes or clear operator-facing replacement messages.

**Verification:**

```bash
npm run check:happy-path
node --experimental-strip-types --test tests/install.test.ts tests/release-overlay.test.ts
```

### Task 4.2: Setup Flow Consolidation

**Files:**

- Modify: `src/install/setup-local.ts`
- Modify: `scripts/setup-devgod.sh`
- Modify: `scripts/setup-devgod.ps1`
- Modify: `scripts/install-devgod.sh`
- Modify: `src/install/cli.ts`
- Test: `tests/setup-powershell-smoke.test.ts`
- Test: `tests/install.test.ts`

**Acceptance Criteria:**

- Shell and PowerShell scripts are thin wrappers over the TS setup/install behavior where practical.
- Environment files are still treated as data and never overwritten unsafely.
- Docker-owned and managed-runtime modes keep their existing safety behavior.

**Verification:**

```bash
node --experimental-strip-types --test tests/install.test.ts tests/setup-powershell-smoke.test.ts
npm run check:happy-path
```

## Phase 5: Canonical Policy And Template Rendering

**Goal:** Replace copied policy text and hardcoded managed blocks with canonical sources.

### Task 5.1: Move Managed Text To Renderers Or Assets

**Files:**

- Modify: `src/install/merge.ts`
- Modify: `.devgod/templates/*`
- Modify: `.devgod/rules/*`
- Add if needed: `src/devgod/managed-policy-renderer.ts`
- Test: `tests/control-layer-contract.test.ts`
- Test: `tests/workflow-scaffold.test.ts`
- Test: `tests/install.test.ts`

**Acceptance Criteria:**

- Workflow contract prose is generated from one source.
- Managed `AGENTS.md` and `.agents.md` blocks do not drift from repo-local policy.
- Template rendering has snapshot or semantic tests.

**Verification:**

```bash
npm run verify:workflow-schema
node --experimental-strip-types --test tests/control-layer-contract.test.ts tests/workflow-scaffold.test.ts tests/install.test.ts
```

### Task 5.2: Skill And Agent Surface Deduplication

**Files:**

- Modify: `src/devgod/vendored-skills.ts`
- Modify: `src/devgod/repo-local-skill-surface.ts`
- Modify: `src/devgod/agent-catalog.ts`
- Modify: `.agents/skills/*` only through the vendored sync path
- Test: `tests/vendored-skills.test.ts`
- Test: `tests/skill-evolution.test.ts`

**Acceptance Criteria:**

- There is one canonical source for each vendored skill body.
- Repo-local wrappers are generated or verified, not hand-copied without drift detection.
- Optional plugin skills are clearly separated from core shipped skills.

**Verification:**

```bash
npm run verify:vendored-skills
node --experimental-strip-types --test tests/vendored-skills.test.ts tests/skill-evolution.test.ts
```

## Phase 6: Core Vs Optional Module Boundary

**Goal:** Keep the autonomous development-team loop coherent by separating core orchestration surfaces from optional support modules.

**Files:**

- Modify: `README.md`
- Modify: `docs/current-state.md`
- Modify: `package.json`
- Modify: `src/install/merge.ts`
- Modify: `src/install/cli.ts`
- Test: `tests/install.test.ts`
- Test: `tests/graphify-status.test.ts`
- Test: `tests/grafana-config.test.ts`
- Test: `tests/mcp-tools.test.ts`
- Test: `tests/ui-server.test.ts`

**Module Decisions:**

- Core: installer, runtime, orchestrator, agent catalog, skills, hooks, review identity, review loops, workflow proof, task queue, status/ops, package verification.
- Optional unless proven necessary for the autonomous-team goal: Graphify, Grafana, Playwright setup, MCP, UI, scheduler envelopes, modernization profile.

**Acceptance Criteria:**

- Optional modules can be installed, verified, skipped, or reported stale without breaking core autonomous-team verification.
- Core install implies runtime-authoritative autonomous-team readiness for the supported local environment, not optional service readiness.
- Documentation matches package behavior.

**Verification:**

```bash
node --experimental-strip-types --test tests/install.test.ts tests/graphify-status.test.ts tests/grafana-config.test.ts tests/mcp-tools.test.ts tests/ui-server.test.ts
npm run check:quality
```

## Phase 7: Downstream Install Contract Hardening

**Goal:** Prove installed repos receive a coherent overlay and clear runtime setup expectations.

**Files:**

- Modify: `tests/install.test.ts`
- Modify: `tests/happy-path.test.ts`
- Modify: `scripts/verify-installed-repo-harness.sh`
- Modify: `scripts/check-devgod-happy-path.sh`
- Modify: `src/install/cli.ts`
- Modify: `src/install/merge.ts`

**Acceptance Criteria:**

- Clean install fixture has required scripts, managed rules, skills, hooks, templates, Playwright config only when expected, and review identity fixture guidance.
- Upgrade fixture preserves unrelated local config.
- Legacy install fixture receives compatibility migration or clear failure messages.
- Downstream runtime-authority expectations are explicit.

**Verification:**

```bash
node --experimental-strip-types --test tests/install.test.ts tests/happy-path.test.ts
bash scripts/verify-installed-repo-harness.sh
npm run check:happy-path
```

## Phase 8: Release Readiness And Documentation Reconciliation

**Goal:** Publish a truthful state after repairs, with no overclaiming about downstream readiness.

**Files:**

- Modify: `README.md`
- Modify: `docs/current-state.md`
- Modify: `.devgod/work/product-state.md`
- Modify: `.devgod/work/task-queue.json`
- Create: `.devgod/work/proofs/progress-2026-06-12-devgod-repair-roadmap.json`
- Create: `.devgod/work/reviews/review-2026-06-12-devgod-repair-roadmap-reviewer.md`
- Create: `.devgod/work/reviews/review-2026-06-12-devgod-repair-roadmap-qa_engineer.md`
- Create: `.devgod/work/reviews/review-2026-06-12-devgod-repair-roadmap-security_reviewer.md`

**Acceptance Criteria:**

- Docs state what package proof proves and what it does not prove.
- Product state matches fresh command output.
- Queue state does not mark work done unless workflow proof and required reviews pass.
- Remaining optional-module risks are listed as follow-ups, not hidden under "green".

**Verification:**

```bash
npm run typecheck
npm test
npm run test:properties
npm run check:coverage
npm run verify:workflow-schema
npm run verify:agent-caveman
npm run verify:workflow
npm run verify:release-overlay
npm run verify:package-surface
npm run verify:vendored-skills
npm audit --omit=dev
npm pack --dry-run
npm run check:quality
bash scripts/check-devgod-workflow.sh --task-id 2026-06-12-devgod-repair-roadmap
bash scripts/check-devgod-workflow-live.sh --repo-root . --task-id 2026-06-12-devgod-repair-roadmap
```

## Orchestration Plan

Use manager-led subagent orchestration under the confirmed autonomous-team product direction.

- `product_strategist`: keep implementation aligned to the autonomous development-team promise and optional/core surface split.
- `solution_architect`: finalize runtime authority, package boundary, orchestrator loop, and review-loop architecture.
- `planner`: convert each phase into task packets with exact write scopes.
- `backend_engineer`: runtime/status/proof/export/orchestrator repairs.
- `infra_engineer`: package, install, setup, hook, shell/PowerShell, and CI-quality repairs.
- `qa_engineer`: verification matrix, coverage gap tests, downstream runtime-authoritative install harness.
- `security_reviewer`: review identity, auth context, script safety, symlink/path traversal, package exposure, and autonomous-agent authority boundaries.
- `reviewer`: correctness, maintainability, completeness, and loop-closure review after each implementation slice.

Recommended execution order:

1. Phase 0 with maintainer answers already recorded.
2. Phase 1 in one or two narrow patches.
3. Phase 2 as the first architecture-significant repair.
4. Phase 3 before deleting aliases or changing setup behavior.
5. Phases 4 and 5 in parallel only after public API decisions are stable.
6. Phase 6 and 7 after command/package boundaries are stable.
7. Phase 8 only after fresh verification passes.

## Stop Conditions

- Stop before Phase 2 only if runtime DB authority cannot be made canonical without data loss or unverifiable migration.
- Stop before Phase 3 only if preserving public package compatibility conflicts with removing accidental raw-path coupling.
- Stop before removing aliases only if an existing downstream install depends on them and no migration or clear replacement message exists.
- Stop any slice that weakens review identity, runtime proof, completion audit, or symlink/path safety to make tests pass.

## First Slice Recommendation

Start with Phase 1:

1. Fix branch coverage above 80 percent.
2. Make idle workflow checks intentional.
3. Rerun `npm run check:quality` and capture the next real failure, if any.

This gives a trustworthy baseline before the larger source-of-truth and package-boundary changes.
