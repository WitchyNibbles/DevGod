---
name: devgod-debugging
description: Use when devgod needs systematic debugging or build-resolution work with reproducible repro steps, narrow fixes, and verification after each change.
---

# Devgod Debugging

Use this skill when a command, setup flow, build, typecheck, or test path is broken.

## Goal

Fix the real root cause with the smallest credible change.

## Workflow

1. Reproduce the failure and capture the exact command.
2. Narrow the failing boundary before editing.
3. Form one hypothesis at a time.
4. Make one scoped fix.
5. Re-run the relevant verification immediately.
6. Repeat only if the failure persists.

## Rules

- do not bundle multiple guesses in one patch
- do not disable checks to hide the symptom
- prefer root cause over surface cleanup
- record repro, root cause, fix, and verification in the handoff

## Output

Return repro, root cause, exact fix, and proof.
