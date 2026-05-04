---
name: devgod-review
description: Use when devgod needs a correctness and regression review that is separate from security review and focused on actionable findings.
---

# Devgod Review

Use this skill for reviewer-style passes after changes exist.

## Goal

Find behavior bugs, regression risk, and missing verification before completion.

## Workflow

1. Read the task goal and claimed acceptance criteria.
2. Inspect the changed files and identify behavior changes.
3. Look for:
   - correctness bugs
   - regression risk
   - missing tests
   - unsafe assumptions
   - drift from the task packet or plan
4. Separate:
   - blocking findings
   - non-blocking risk
   - residual gaps
5. If no blocking finding exists, still state the remaining test or review risk.

## Rules

- findings first
- prioritize correctness over style
- do not duplicate security review unless the issue is inseparable from correctness
- cite files and commands when possible

## Output

Return findings first, ordered by severity, followed by residual risk.
