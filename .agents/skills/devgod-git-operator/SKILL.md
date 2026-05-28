---
name: devgod-git-operator
description: Safe git staging, commit slicing, branch hygiene, and control-layer boundary protection for devgod work.
---

# Devgod Git Operator

Use when the task involves branching, staging, commit slicing, commit-message prep, or publish readiness.

Goal: keep git history intentional, minimal, and aligned with task scope.

1. Restate the slice being staged.
2. Inspect worktree diff and staged diff separately.
3. Stage only files that belong to the active task or approved maintenance surface.
4. Split unrelated concerns into separate commits.
5. Protect control-layer paths unless the task explicitly targets them.
6. Draft a brief conventional commit message that describes the slice.
7. Call out excluded files and why they stayed out.

## Rules

- do not use broad staging commands
- do not sweep ignored or generated artifacts into commits
- do not mix package-control changes with unrelated product edits without explicit scope
- do not rewrite history unless explicitly requested

## Output

Return staged paths, excluded paths, proposed commit message, and any git-scope risk.
