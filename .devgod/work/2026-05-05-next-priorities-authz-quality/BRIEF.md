task_id: 2026-05-05-next-priorities-authz-quality
status: approved
goal: Implement the next devgod control-layer priorities end to end: bind review actions to authenticated actor identity, add waiver provenance and authority handling, and add missing TDD, E2E, and release-readiness capabilities.
audience: Devgod package maintainers and consuming repos relying on the shared control layer.
constraints:
- Keep changes package-scoped and reusable.
- Extend the existing gate-hardening slice without reverting or weakening it.
- Respect current protected control-layer surfaces and one-writer-per-scope discipline.
- Carry the work through runtime, schema, install surface, tests, and repo policy/docs.
risks:
- Authz and waiver changes may require schema and store migrations that interact with existing approval/review records.
- Capability additions can sprawl if not kept minimal and aligned to current agent/skill patterns.
- Dirty worktree overlap with the prior gate-hardening slice requires careful integration.
unknowns:
- Whether current action surfaces already have an actor identity field that can be elevated into review authz without broader API churn.
- Whether waiver authority should be represented on review records, approval records, or a new artifact path.
- Whether installer/package tests already encode the expected shipped skill/agent set.
success_criteria:
- Review actions no longer trust caller-asserted reviewer roles as authority.
- Waivers carry explicit actor provenance and authority semantics.
- Package ships usable TDD, E2E, and release-readiness capabilities aligned with current devgod patterns.
- Tests and docs enforce the new behavior.
stop_go: go
