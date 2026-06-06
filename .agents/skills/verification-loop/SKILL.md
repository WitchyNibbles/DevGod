---
name: verification-loop
description: Comprehensive verification system. Run after completing a feature, before creating a PR, or after refactoring to confirm quality gates pass.
---

# Verification Loop

## When to Use

- After completing a feature or significant code change
- Before creating a PR
- After refactoring
- When quality gates must pass before claiming completion

## Phase 1: Build

```bash
npm run build 2>&1 | tail -20
```

If build fails, STOP and fix before continuing.

## Phase 2: Type Check

```bash
npx tsc --noEmit 2>&1 | head -30
```

## Phase 3: Lint

```bash
npm run lint 2>&1 | head -30
```

## Phase 4: Tests

```bash
npm run test -- --coverage 2>&1 | tail -50
```

Target: 80% minimum coverage.

## Phase 5: Security Scan

```bash
grep -rn "sk-\|api_key\|password" --include="*.ts" src/ 2>/dev/null | head -10
```

## Phase 6: Diff Review

```bash
git diff --stat
git diff HEAD~1 --name-only
```

## Output Format

```
VERIFICATION REPORT
===================
Build:    [PASS/FAIL]
Types:    [PASS/FAIL] (X errors)
Lint:     [PASS/FAIL] (X warnings)
Tests:    [PASS/FAIL] (X/Y passed, Z% coverage)
Security: [PASS/FAIL]
Diff:     [X files changed]

Overall:  [READY / NOT READY] for PR
```
