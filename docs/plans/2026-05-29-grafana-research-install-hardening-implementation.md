# Grafana Detection, Skeptical Research, and Install Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make installed `devgod` consuming repos detect existing Grafana configuration, behave more skeptically during research/debugging, and prove the Codex-facing install path with replayable verification.

**Architecture:** Add a shared Grafana repo-detection surface, wire it into managed install/runtime-facing behavior, strengthen shipped guidance around broader investigation and counter-evidence, and extend installed-repo verification so the operator path is covered instead of only source-repo logic.

**Tech Stack:** TypeScript, Node.js, TOML config merging, shell verification harnesses, Node test runner

---

### Task 1: Add shared Grafana repo-detection coverage first

**Files:**
- Modify: `tests/grafana-config.test.ts`
- Modify: `src/grafana/config.ts`

**Step 1: Write the failing test**

Add tests that prove repo-local detection can distinguish:
- no Grafana evidence
- `.env.devgod` Grafana variables present
- `.codex/config.toml` Grafana MCP wiring present
- `package.json` managed Grafana script present
- partial Grafana config that should be reported as incomplete

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/grafana-config.test.ts`
Expected: FAIL because the repo-detection helper does not exist yet or does not expose the needed states.

**Step 3: Write minimal implementation**

Implement a shared helper in `src/grafana/config.ts` that inspects a target repo and returns structured detection metadata instead of only env-resolution results.

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/grafana-config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add tests/grafana-config.test.ts src/grafana/config.ts
git commit -m "feat: detect repo grafana configuration"
```

### Task 2: Use the shared detector in install behavior

**Files:**
- Modify: `src/install/cli.ts`
- Modify: `tests/install.test.ts`

**Step 1: Write the failing test**

Add install tests covering init/upgrade/verify behavior when a target repo already exposes Grafana signals through repo files, including partial config and managed wiring combinations.

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/install.test.ts`
Expected: FAIL because install detection still uses the old narrow boolean path.

**Step 3: Write minimal implementation**

Replace or route the existing Grafana-install detection logic through the shared helper so install, upgrade, and verify derive behavior from the same repo-aware signal set.

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/install.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/install/cli.ts tests/install.test.ts
git commit -m "fix: share grafana detection across install flows"
```

### Task 3: Harden shipped guidance for Grafana awareness and skeptical investigation

**Files:**
- Modify: `src/install/merge.ts`
- Modify: any targeted tests asserting managed kernel text in `tests/install.test.ts` or contract coverage if needed

**Step 1: Write the failing test**

Add or extend assertions that the managed installed guidance:
- recognizes repo-local Grafana configuration, not only explicit MCP availability
- requires broader evidence gathering or alternate hypotheses before strong negative claims in debugging/research

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/install.test.ts`
Expected: FAIL because the managed text still uses the narrower wording.

**Step 3: Write minimal implementation**

Update the managed kernel text in `src/install/merge.ts` so shipped consuming repos receive the stronger guidance.

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/install.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/install/merge.ts tests/install.test.ts
git commit -m "fix: strengthen shipped grafana and research guidance"
```

### Task 4: Verify the installed consuming-repo path

**Files:**
- Modify: `scripts/verify-installed-repo-harness.sh` if needed
- Modify: `tests/happy-path.test.ts` if needed

**Step 1: Write the failing test**

If the current harness does not exercise the needed path, add coverage for a Grafana-enabled installed repo and for reporting/behavior relevant to the new detection.

**Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/happy-path.test.ts`
Expected: FAIL if the harness does not yet verify the desired path.

**Step 3: Write minimal implementation**

Extend the harness or assertions only as far as needed to prove the packaged Codex-facing install path in an installed-repo-style environment.

**Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/happy-path.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/verify-installed-repo-harness.sh tests/happy-path.test.ts
git commit -m "test: verify grafana-aware installed repo path"
```

### Task 5: Run focused verification and workflow proof

**Files:**
- No code changes expected unless repairs are needed

**Step 1: Run focused tests**

Run:
- `node --experimental-strip-types --test tests/grafana-config.test.ts`
- `node --experimental-strip-types --test tests/install.test.ts`
- `node --experimental-strip-types --test tests/happy-path.test.ts`

Expected: PASS

**Step 2: Run installed-repo harness directly if needed**

Run: `bash scripts/verify-installed-repo-harness.sh --with-grafana --task-id 2026-05-29-grafana-research-install-hardening`
Expected: PASS

**Step 3: Run workflow proof checks**

Run:
- `bash scripts/check-devgod-workflow.sh --task-id 2026-05-29-grafana-research-install-hardening`
- `bash scripts/check-devgod-workflow-live.sh --task-id 2026-05-29-grafana-research-install-hardening`

Expected: PASS

**Step 4: Commit verification-safe slice(s)**

```bash
git add <relevant files>
git commit -m "fix: harden grafana awareness and install verification"
```
