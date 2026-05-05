# Plan

## Task ID

`2026-05-05-residual-risk-closure`

## Scope

- remove the direct service-level review authority trust gap
- distinguish authenticated review provenance from legacy backfill and enforce it in gate decisions
- add a live-Postgres migration replay path suitable for CI

## Task packets

### T1 Review boundary hardening

- owner: `backend_engineer`
- write scope:
  - `src/core/service.ts`
  - `src/core/actions.ts`
  - `src/domain/types.ts`
  - `tests/actions.test.ts`
  - `tests/service.test.ts`
- acceptance:
  - public review recording no longer accepts authority-bearing context directly from arbitrary callers
  - service-level review recording requires trusted resolver wiring
  - action handlers reuse the same service boundary instead of owning separate authz semantics
- verification:
  - `node --experimental-strip-types --test tests/actions.test.ts tests/service.test.ts`
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - caller-supplied reviewer role or waiver authority cannot grant approval power
  - missing resolver remains blocking
- rollback:
  - revert runtime and test changes only

### T2 Provenance assurance and legacy safety

- owner: `backend_engineer`
- write scope:
  - `src/domain/types.ts`
  - `src/domain/contracts.ts`
  - `src/core/policy.ts`
  - `src/store/types.ts`
  - `src/store/memory-store.ts`
  - `src/store/postgres-store.ts`
  - `src/sql/migrations/006_review_identity_assurance.sql`
  - `src/sql/migrations/007_reclose_approved_tasks_without_authenticated_reviews.sql`
  - `tests/contracts.test.ts`
  - `tests/postgres-store.test.ts`
  - `tests/service.test.ts`
- acceptance:
  - new review and approval writes persist authenticated identity assurance
  - legacy migrated rows are explicitly marked as backfilled provenance
  - required review gates only accept authenticated review records
  - approved tasks that only rely on legacy or unauthenticated gate records are reclosed
- verification:
  - `node --experimental-strip-types --test tests/contracts.test.ts tests/postgres-store.test.ts tests/service.test.ts`
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - no legacy backfill row can silently satisfy a required gate
  - waiver authorization still requires explicit authority and actor role
- rollback:
  - revert schema, store, policy, and tests

### T3 Live migration replay

- owner: `infra_engineer`
- write scope:
  - `src/admin.ts`
  - `package.json`
  - `.github/workflows/ci.yml`
  - `README.md`
- acceptance:
  - repo exposes a replayable live-Postgres migration verification command
  - CI runs migration replay against a real Postgres+pgvector instance
  - migration verification includes idempotent re-run and basic setup health
- verification:
  - `npm run typecheck`
  - `npm run verify:migrations:live` against the local devgod Postgres container
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - workflow must not hardcode secrets
  - migration verification must fail loudly on missing env or broken setup
- rollback:
  - revert workflow, admin command, docs, and package scripts
