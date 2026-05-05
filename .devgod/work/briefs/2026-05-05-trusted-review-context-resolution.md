# Brief

task_id: 2026-05-05-trusted-review-context-resolution
status: approved
goal: Ship a package-scoped, reusable contract/helper for trusted review-context resolution so consuming repos can satisfy `resolveReviewActionContext` safely.
audience: Devgod package maintainers and consuming repos integrating authenticated review actions.
constraints:
- Keep changes package-scoped and reusable.
- Preserve the current service boundary that blocks review writes without a trusted resolver.
- Do not encode any repo-specific auth provider, transport, or identity store.
- Prefer additive public API surface over breaking constructor or action-handler changes.
risks:
- A helper that accepts loose caller claims can recreate the same trust gap under a new name.
- A helper that is too opinionated can force consuming repos into auth models this package does not own.
- README-only guidance without runtime-tested helper behavior can leave consumers with unsafe resolver implementations.
unknowns:
- Whether the helper should center on an authenticated principal contract, a claims-normalization callback, or both.
- Whether the package should ship only docs or also a reusable template/snippet for consuming repos.
success_criteria:
- The package exports a standard resolver contract/helper for trusted review-context resolution.
- The helper makes authority-bearing fields come from authenticated principal input or explicit server-owned mapping, not arbitrary caller claims.
- Consumers have a documented package-native integration path that does not require reading internal service code.
stop_go: go

