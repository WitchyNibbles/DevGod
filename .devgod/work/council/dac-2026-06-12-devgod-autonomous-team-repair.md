# Design and Architecture Council Decision Packet

## Task ID

`2026-06-12-devgod-autonomous-team-repair`

## Decision

`approved`

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

Option A matches the maintainer's clarified direction and the existing repo contract that runtime authority is canonical. The final repair track keeps runtime workflow proof as the authoritative closeout gate and treats this council packet as local architecture/product/security/QA planning evidence.

## Dissent Owner

`reviewer`

## Conditions

- Runtime proof run `d5a2b9ac-aa2d-4412-8387-578f0b849102` must remain resolvable for this task.
- Do not treat markdown review files as trusted authority without runtime registration or explicit provenance limits.
- Do not weaken review identity, completion audit, or task proof gates to regain green status.
- Do not remove legacy aliases without migration tests or clear replacement messages.
- Keep optional Graphify, Playwright, Grafana, and full JS build-pipeline work in separate task packets.

## Open Findings

- none

## Closeout Evidence

- `npm run verify:release-overlay` passed after final documentation and export repair.
- `npm run devgod -- status --format text` reports `integrity.status` as `consistent`.
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-12-devgod-autonomous-team-repair` passed.
- `bash scripts/check-devgod-workflow-live.sh --repo-root . --task-id 2026-06-12-devgod-autonomous-team-repair` passed.
- Runtime proof: `d5a2b9ac-aa2d-4412-8387-578f0b849102`.

## Runtime Council Scope

The final runtime proof was seeded from a runtime task packet that does not include `council_review_required`; an attempted runtime council record was correctly rejected with `Task 2026-06-12-devgod-autonomous-team-repair does not require council review`. This packet therefore records local advisory design-council approval only, not a separate runtime council approval claim.
