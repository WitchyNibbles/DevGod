# Design and Architecture Council Decision Packet

## Task ID

`2026-06-12-devgod-autonomous-team-repair`

## Decision

`pending`

## Context

The maintainer clarified that `devgod` must be a public package that makes Codex behave like a fully autonomous development team. Runtime DB authority is canonical, downstream repos should be runtime-authoritative by default, and legacy aliases may be removed.

## Options

### Option A: Runtime-first autonomous team

Runtime state is canonical. The orchestrator, agents, review loops, hooks, skills, and installer all serve a runtime-proven autonomous-team loop.

### Option B: Install overlay first

Keep focusing on install/package coherence and defer autonomous-team loop semantics.

### Option C: Markdown workflow first

Keep markdown task/review artifacts as the main operational surface and sync runtime afterward.

## Preferred Option

`Option A`

## Rationale

Option A matches the maintainer's clarified direction and the existing repo contract that runtime authority is canonical.

## Dissent Owner

`reviewer`

## Conditions

- Do not claim runtime activation until a runtime run exists for this task.
- Do not treat markdown review files as trusted authority without runtime registration or explicit provenance limits.
- Do not weaken review identity, completion audit, or task proof gates to regain green status.
- Do not remove legacy aliases without migration tests or clear replacement messages.

## Open Findings

- Phase 0 review agents returned `changes_required`.
- Runtime run registration is missing for this new task.
- Phase 1 implementation has not started.
