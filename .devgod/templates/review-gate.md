# Review Gate Template

## Task ID

## Reviewer role

## Review state

`pending | passed | blocked | waived`

In the current core runtime, `passed` satisfies a required gate only with authenticated actor provenance. `waived` satisfies a required gate only with authenticated, authorized, actor-tracked waiver provenance. `pending` and `blocked` remain blocking states.

## Severity

`low | medium | high | critical`

## Findings

## Residual risk

## Verification evidence

List exact commands, fixtures, or repro steps used for this gate.

## Waiver reason

Do not waive a required gate without actor, actor role, authority, and explicit reason. Unauthorized waivers remain blocking.

## Decision

`approved | blocked | waived`

## Source handoff

Manager-written summary of reviewer output:
