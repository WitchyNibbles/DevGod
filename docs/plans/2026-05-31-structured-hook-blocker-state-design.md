# Structured Hook Blocker State Design

## Goal

Stop repeated Codex continuation loops when Bash failures already provide a trusted blocker signal.

## Chosen approach

Use a dedicated hook blocker state file.

- `PostToolUse` classifies non-zero Bash exits into a structured blocker record.
- The record is written under `.devgod/work/daemon/`.
- `Stop` reads that record before falling back to transcript heuristics.
- If the same blocker is still active after a stop-driven continuation, `Stop` must not ask Codex to continue again.

## Why this approach

- It covers the real incident class: Bash/tool-response failures such as missing Docker.
- It does not depend on assistant phrasing.
- It reuses the existing trusted daemon work area without requiring a broader runtime rewrite.
- It is easier to test and roll back than widening regex heuristics.

## Data model

Persist one repo-local JSON file for the latest active hook blocker observation.

Suggested fields:

- `version`
- `activeTaskId`
- `queueCurrentTaskId`
- `turnId`
- `toolName`
- `command`
- `commandFingerprint`
- `exitCode`
- `blockerKind`
- `summary`
- `details`
- `recordedAt`

`blockerKind` for the first slice is intentionally broad but still typed:

- `command_not_found`
- `environment_missing`
- `runtime_preflight`
- `connection_refused`
- `permission_denied`
- `generic_nonzero_bash`

## Classification rules

Only classify `Bash` tool calls with non-zero exit codes.

Rules for the first slice:

- `command not found`, `not found`, `ENOENT`, missing executable paths: `command_not_found`
- `docker` missing/unavailable and similar environment bootstrapping failures: `environment_missing`
- explicit runtime preflight phrasing: `runtime_preflight`
- connection refused / daemon unavailable patterns: `connection_refused`
- permission denied patterns: `permission_denied`
- everything else: `generic_nonzero_bash`

The first slice should keep the summary deterministic and compact. It should derive from tool output, not the model transcript.

## Stop behavior

`Stop` should:

1. ignore blocker-state suppression when authority mismatch already exists
2. honor existing structured continuation-intent allow-stop cases first
3. load the persisted hook blocker state
4. verify the record matches the active task or queue-selected task
5. if no matching blocker state exists, fall back to current heuristic behavior
6. if matching blocker state exists and `stop_hook_active` is not yet true, allow one continuation block with a reason grounded in the structured blocker summary
7. if matching blocker state exists and `stop_hook_active` is already true, do not continue again

This yields a bounded behavior:

- one continuation is still possible when the system wants the model to react to the blocker
- infinite repetition for the same blocker is suppressed

## Lifecycle rules

- overwrite the blocker state with the latest matching non-zero Bash failure
- clear the blocker state on successful Bash execution for the same task
- clear or ignore stale blocker state when task identity no longer matches

## Risks and controls

- stale state risk: require active-task match before using the record
- over-broad suppression risk: only suppress repeat continuation when `stop_hook_active` is already true
- false classification risk: keep blocker kinds coarse and deterministic in the first slice

## Tests

Red-first tests should cover:

- `PostToolUse` records structured blocker state for a non-zero Bash failure
- successful Bash execution clears matching blocker state
- `Stop` blocks once with a structured blocker reason when a matching blocker file exists
- `Stop` does not continue again when `stop_hook_active` is true for the same blocker
- `Stop` still falls back to existing heuristics when no trusted blocker state exists
