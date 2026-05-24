# Devgod Agent Catalog Manifest Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a manifest-driven agent catalog that becomes the source of truth for devgod roles, validation, guidance, shipped artifacts, and docs without increasing runtime self-stalls.

**Architecture:** Introduce a typed catalog module, derive role validation and retrieval guidance from it, verify shipped `.codex/agents/*.toml` against the catalog, then expand the shipped team and regression coverage in small slices. Keep reviewed agent files explicit and push strictness into CI and verification rather than unrelated runtime continuation paths.

**Tech Stack:** Node.js, TypeScript, Node test runner, TOML agent files, existing devgod workflow artifacts.

---

### Task 1: Catalog Foundation

**Files:**
- Create: `src/devgod/agent-catalog.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/core/policy.ts`
- Test: `tests/admin.test.ts`
- Test: `tests/report-command.test.ts`

**Step 1: Write the failing tests**

Add assertions that:

- the new catalog exports the expected day-one roles
- role validation derives from the catalog instead of the legacy hard-coded list
- retrieval guidance resolves for newly added roles

**Step 2: Run targeted tests to verify failure**

Run: `node --experimental-strip-types --test tests/admin.test.ts tests/report-command.test.ts`

Expected: failures referencing missing roles or missing catalog-driven behavior

**Step 3: Implement minimal catalog and derivation**

Add a typed catalog module and update validation/guidance surfaces to use it.

**Step 4: Run targeted tests to verify pass**

Run: `node --experimental-strip-types --test tests/admin.test.ts tests/report-command.test.ts`

Expected: PASS

### Task 2: Artifact Verifier

**Files:**
- Create: `src/devgod/agent-artifact-verifier.ts`
- Modify: `src/admin.ts`
- Test: `tests/install.test.ts`
- Test: `tests/workflow-check.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- missing shipped agent artifacts for catalog roles
- unexpected extra agent artifacts
- verifier integration into an existing verification surface

**Step 2: Run targeted tests to verify failure**

Run: `node --experimental-strip-types --test tests/install.test.ts tests/workflow-check.test.ts`

Expected: FAIL with missing verifier behavior

**Step 3: Implement minimal verifier**

Add a verifier that compares the catalog to `.codex/agents/*.toml` and reports deterministic drift.

**Step 4: Run targeted tests to verify pass**

Run: `node --experimental-strip-types --test tests/install.test.ts tests/workflow-check.test.ts`

Expected: PASS

### Task 3: Expanded Shipped Team

**Files:**
- Create: `.codex/agents/eval-engineer.toml`
- Create: `.codex/agents/technical-writer.toml`
- Create: `.codex/agents/agent-runtime-engineer.toml`
- Create: `.codex/agents/mobile-engineer.toml`
- Create: `.codex/agents/ml-engineer.toml`
- Create: `.codex/agents/data-engineer.toml`
- Create: `.codex/agents/ux-researcher.toml`
- Create: `.codex/agents/product-analyst.toml`
- Create: `.codex/agents/compliance-reviewer.toml`
- Modify: `package.json`
- Modify: docs describing the role matrix
- Test: `tests/install.test.ts`

**Step 1: Write the failing tests**

Add coverage for:

- package surfaces shipping the expanded roster
- catalog and docs agreeing on the roster

**Step 2: Run targeted tests to verify failure**

Run: `node --experimental-strip-types --test tests/install.test.ts`

Expected: FAIL on missing shipped artifacts or package expectations

**Step 3: Implement the shipped roster**

Add the new agent files and align package/docs expectations with the catalog.

**Step 4: Run targeted tests to verify pass**

Run: `node --experimental-strip-types --test tests/install.test.ts`

Expected: PASS

### Task 4: Anti-Stall Regression Hardening

**Files:**
- Modify: `tests/admin.test.ts`
- Modify: `tests/status-report.test.ts`
- Modify: `tests/runtime-surface.test.ts`
- Modify: `tests/ops-recovery.test.ts`
- Modify: continuation or validation surfaces only if tests prove they need adjustment

**Step 1: Write the failing tests**

Add coverage for:

- next queued task with a different valid optional role
- unknown-role validation failing early without continuation loops
- catalog drift surfacing as verification failure instead of runtime deadlock

**Step 2: Run targeted tests to verify failure**

Run: `node --experimental-strip-types --test tests/admin.test.ts tests/status-report.test.ts tests/runtime-surface.test.ts tests/ops-recovery.test.ts`

Expected: FAIL on at least one anti-stall case before fixes land

**Step 3: Implement the minimal hardening**

Only adjust runtime behavior if a test proves the catalog rollout creates a real continuation risk.

**Step 4: Run targeted tests to verify pass**

Run: `node --experimental-strip-types --test tests/admin.test.ts tests/status-report.test.ts tests/runtime-surface.test.ts tests/ops-recovery.test.ts`

Expected: PASS

### Task 5: Full Verification And Release Proof

**Files:**
- Modify: `.devgod/work/*` artifacts for this branch’s workflow state
- Possibly modify docs or tests only if verification reveals real drift

**Step 1: Run full suite**

Run: `npm test`

Expected: PASS

**Step 2: Run workflow verification**

Run: `bash scripts/check-devgod-workflow.sh --task-id 2026-05-23-devgod-agent-catalog-foundation`

Expected: PASS once workflow artifacts are aligned

**Step 3: Run release-sensitive checks**

Run: `git diff --check`

Expected: PASS

**Step 4: Inspect package surface**

Run: `node --experimental-strip-types --test tests/install.test.ts tests/release-overlay.test.ts`

Expected: PASS

**Step 5: Commit and publish**

Run:

```bash
git add <scoped files>
git commit -m "feat: add manifest-driven devgod agent catalog"
git push -u origin codex/devgod-agent-team-upgrade
```

Expected: branch pushed cleanly

**Step 6: Open PR and verify CI**

Use the GitHub flow to create the PR, inspect checks, and repair any real failures until green.
