# Review Gate

## Task ID

`2026-05-05-trusted-review-context-resolution`

## Reviewer role

`security_reviewer`

## Review state

`passed`

## Severity

`low`

## Findings

The package now ships a fail-closed, provider-agnostic review identity resolver and reviewed binding template, which removes the prior gap where consuming repos had to invent their own actor-to-principal authz pattern.

## Residual risk

External identity systems can still authenticate the wrong human if the embedding repo misconfigures its own session or principal lookup, but that risk is outside the package boundary and is now isolated to the caller-owned adapter.

## Verification evidence

`npm test`, `npm run typecheck`, `git diff --check`, `npm pack --dry-run`, and targeted inspection of `src/core/review-context.ts`, `src/core/service.ts`, `.devgod/rules/review-identity-policy.md`, and `.devgod/templates/review-identity-bindings.json`.

## Waiver reason

None.

## Decision

`approved`

## Source handoff

Security review confirmed unverified principals fail closed, unbound actors fail closed, unauthorized reviewer-role requests fail closed, manager waiver derivation still follows the existing waiver matrix, and consuming repos are explicitly told not to trust request-body actor claims.
