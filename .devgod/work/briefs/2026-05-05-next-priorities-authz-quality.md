task_id: 2026-05-05-next-priorities-authz-quality
goal: Implement authenticated review role binding, waiver provenance, and missing TDD/E2E/release-readiness capabilities in the shared devgod package.
audience: Devgod maintainers
constraints:
- Package-scoped only
- Must preserve strengthened review/QA gate behavior
- Must update tests, installer surface, and docs alongside runtime/schema changes
risks:
- Schema and action churn around review/authz data
- Over-scoping new capabilities into a broad workflow rewrite
unknowns:
- Best minimal authz shape for review actions
- Best minimal provenance model for waivers
- Exact shipped surface needed for new capabilities
success_criteria:
- Runtime enforces actor-bound review roles
- Waivers are explicit, auditable, and authority-aware
- TDD, E2E, and release-readiness capabilities ship and install cleanly
- Verification evidence is green
stop_go: go
