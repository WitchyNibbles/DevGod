task_id: 2026-05-05-residual-risk-closure
status: approved
goal: Close the remaining review-auth trust, provenance assurance, and live migration replay risks in the shared devgod package.
audience: Devgod package maintainers and consuming repos relying on shared review gates and database migrations.
constraints:
- Keep changes package-scoped and reusable.
- Preserve or strengthen current gate semantics; do not relax review enforcement.
- Use additive migrations and explicit rollback notes where schema changes land.
- Verify against the current dirty tree without reverting unrelated work.
risks:
- Tightening review identity assurance may invalidate legacy review records and reclose tasks that previously appeared approved.
- Constructor or API changes around review recording may ripple through tests and any external callers.
- Live migration replay may require CI/bootstrap surface that does not exist yet in the repo.
unknowns:
- Whether service-level review auth should be enforced by constructor-injected resolver, a branded trusted context, or a narrower public API.
- Whether legacy backfilled review provenance should remain readable but unsatisfying for gate approval.
- Whether the repo should add a GitHub Actions workflow, a local script, or both for live migration replay.
success_criteria:
- Direct service-level review recording no longer trusts arbitrary callers to supply authority-bearing review context.
- Persisted review provenance distinguishes authenticated writes from legacy backfill, and gate logic treats the distinction safely.
- The repo ships a replayable live-Postgres migration verification path suitable for CI.
stop_go: go
