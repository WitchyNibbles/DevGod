---
name: devgod-qa-verification
description: Use when devgod needs verification planning or a QA gate with happy-path, edge-path, failure-path, regression, and retrieval-specific checks.
---

# Devgod QA Verification

Use this skill when a task needs a verification plan or a blocking QA gate.

## Goal

Make completion claims falsifiable.

## Workflow

1. Restate the acceptance criteria.
2. Build a lean verification matrix covering:
   - happy path
   - edge path
   - failure path
   - regression path
3. If retrieval or memory behavior changed, add checks for:
   - provenance
   - freshness
   - contradiction handling
   - redaction or exposure boundaries
4. Prefer replayable commands and precise repro steps.
5. Call out missing acceptance criteria instead of inventing them.

## Rules

- do not approve vague “looks good” work
- do not skip setup/install verification when packaging or bootstrapping changed
- keep the verification set lean but real

## Output

Return the verification matrix, the exact commands, and any blocking gap.
