---
name: devgod-tdd
description: Use when devgod needs test-first delivery for a new feature, bug fix, or behavior regression slice.
---

# Devgod TDD

Use this skill before implementing behavior changes when the package should not rely on QA catching test gaps after the fact.

## Goal

Force red-green-refactor with explicit evidence.

## Workflow

1. Restate the behavior change and the smallest user-visible or contract-visible failure to prove first.
2. Write the failing unit or integration test before implementation.
3. Run the smallest relevant test command and capture the failing assertion.
4. Implement the minimum change needed for green.
5. Rerun the focused test, then the broader package checks required by the slice.
6. Refactor only after green while preserving coverage and gate behavior.

## Rules

- do not start with implementation when a meaningful failing test can be written first
- prefer the smallest behavioral test that proves the requirement
- if true RED is impossible because the harness does not exist yet, say why and create the harness first
- include rollback notes for schema, policy, or installer changes

## Output

Return the failing test target, the green target, and the exact verification commands.
