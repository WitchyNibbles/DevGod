# Brief

task_id: 2026-05-05-review-identity-adapter-hardening
status: draft
goal: Reduce the remaining risk that consuming repos mis-handle authenticated principal extraction for review actions by shipping stronger package-owned adapter and verification surfaces.
audience: Devgod package maintainers and consuming repos integrating review recording.
constraints:
- Keep changes package-scoped and reusable.
- Preserve the current fail-closed review action boundary in the core service.
- Do not add provider-specific identity code.
- Prefer additive runtime, install, and verification surfaces over breaking API changes.
risks:
- Treating external authentication correctness as solvable purely inside the package when it is not.
- Adding adapter or verification surfaces that are easy to scaffold but easy to bypass.
- Expanding the package into transport-specific middleware that does not belong in the shared core.
unknowns:
- Whether the best mitigation is adapter scaffolding, runtime contracts, verification tooling, or a combination.
- How much of the consumer-side wiring can be made mandatory in setup or health verification.
- Whether the package should install a repo-local adapter stub and fixture surface by default.
success_criteria:
- The package ships a standard, reviewed integration surface for authenticated principal extraction, not just a low-level callback.
- Consuming repos get a package-provided verification path that exercises their adapter against deny/allow cases before review actions are trusted.
- The remaining residual risk is reduced to the external IdP/session truth itself rather than ad hoc repo-specific glue code.
stop_go: go
