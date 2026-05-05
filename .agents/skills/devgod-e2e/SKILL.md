---
name: devgod-e2e
description: Use when devgod needs end-to-end verification for critical user flows, setup flows, install flows, or upgrade journeys.
---

# Devgod E2E

Use this skill when unit and service tests are not enough to trust the full workflow.

## Goal

Prove the important journey works in a realistic environment.

## Workflow

1. Identify the critical journey and its trust boundaries.
2. Define happy path, edge path, failure path, and regression path.
3. Prefer replayable commands, stable fixtures, and environment notes over vague click-through claims.
4. For setup or installer changes, include bootstrap, upgrade, and rollback checks when feasible.
5. Record evidence that another maintainer can rerun without guessing.

## Rules

- do not approve a critical flow on unit tests alone
- keep the matrix lean but include at least one failure-path check
- call out missing harness or environment blockers instead of pretending coverage exists
- if no executable E2E harness exists, define the exact gap and the minimum harness slice needed

## Output

Return the verification matrix, commands or repro steps, and any blocking gap.
