# Review Gate

## Task ID

`2026-05-05-review-identity-adapter-hardening`

## Reviewer role

`security_reviewer`

## Review state

`passed`

## Severity

`low`

## Findings

The package now ships a fail-closed adapter and verifier path that forces consuming repos to prove allow and deny cases against reviewed bindings before trusting review actions.

## Residual risk

If a consuming repo’s external IdP or server-side session layer lies, the package still has to trust the resulting authenticated principal; the new verifier narrows risk to that boundary instead of repo-specific authz glue.

## Verification evidence

`npm run typecheck`, `node --experimental-strip-types --test tests/review-context.test.ts tests/install.test.ts tests/admin.test.ts`, `npm test`, and targeted inspection of `src/core/review-context.ts`, `src/admin.ts`, `src/install/cli.ts`, and `.devgod/rules/review-identity-policy.md`.

## Waiver reason

None.

## Decision

`approved`

## Source handoff

Security review confirmed unverified principals fail closed, bindings and fixtures are reviewed files, the generated adapter stub fails closed until implemented, and the verifier checks actor mismatch, role mismatch, and denied-path behavior instead of only checking file presence.
