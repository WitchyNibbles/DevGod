# Plan

## Task ID

`2026-05-05-trusted-review-context-resolution`

## Scope

- close the remaining external trust gap around trusted review-context resolution
- ship a reusable package contract/helper instead of relying on ad hoc consumer wiring
- document the consumer integration boundary without adding provider-specific auth code

## Approved assumptions

- the package should stay auth-provider agnostic
- the service-level `resolveReviewActionContext` boundary remains mandatory
- this slice can stay additive and avoid store, policy, or migration changes

## Blocked assumptions

- whether maintainers want installer/template generation for resolver stubs or README-only guidance
- whether consumers need multiple helper entry points beyond one standard principal-to-context path

## Task packets

### T1 Trusted resolver contract and helper

- owner: `backend_engineer`
- write scope:
  - `src/core/review-context.ts`
  - `src/core/service.ts`
  - `src/domain/types.ts`
  - `src/index.ts`
  - `tests/service.test.ts`
  - `tests/actions.test.ts`
- acceptance:
  - package exports a standard contract/helper for building `ResolveReviewActionContext`
  - helper requires authenticated or server-trusted input for authority-bearing fields
  - helper cannot be used to elevate reviewer role or waiver authority from arbitrary action payload claims
  - existing missing-resolver failure remains intact for callers that skip trusted wiring
- verification:
  - `npm run typecheck`
  - `node --experimental-strip-types --test tests/service.test.ts tests/actions.test.ts`
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - confirm the helper never trusts caller-supplied `review.reviewerRole`, `waiverAuthority`, or `actorRole`
  - confirm exported types do not imply the package authenticates principals on behalf of consumers
- rollback:
  - revert helper, service, export, and regression-test changes only

### T2 Consumer adoption surface

- owner: `backend_engineer`
- write scope:
  - `README.md`
  - `tests/actions.test.ts`
  - `tests/service.test.ts`
- acceptance:
  - README shows the intended consumer wiring from authenticated principal to the exported helper
  - docs state what the package resolves and what consuming repos must still prove
  - regression coverage demonstrates the documented path instead of bespoke in-test resolver wiring only
- verification:
  - `node --experimental-strip-types --test tests/service.test.ts tests/actions.test.ts`
  - `npm pack --dry-run`
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - confirm docs do not suggest trusting raw request-body actor claims
  - confirm examples never embed secrets, private tokens, or provider-specific credentials
- rollback:
  - revert docs and example/regression adjustments only

