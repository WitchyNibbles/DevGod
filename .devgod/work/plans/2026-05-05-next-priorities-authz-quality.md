# Plan

## Task ID

`2026-05-05-next-priorities-authz-quality`

## Scope

- bind review actions to trusted action context instead of free-form reviewer identity
- add waiver provenance and authority handling
- add shipped TDD, E2E, and release-readiness capabilities

## Task packets

### T1 Runtime and contracts

- owner: `backend_engineer`
- write scope:
  - `src/core/actions.ts`
  - `src/core/service.ts`
  - `src/core/policy.ts`
  - `src/domain/types.ts`
  - `src/domain/contracts.ts`
  - `tests/service.test.ts`
  - `tests/contracts.test.ts`
- acceptance:
  - review actor context is separate from target gate role
  - non-waived reviews require actor role to match target gate role
  - valid waivers carry authority and reason
  - invalid spoofed or unauthorized review actions are rejected
- verification:
  - `npm test -- --test tests/contracts.test.ts tests/service.test.ts`
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - preserve blocking semantics for unauthorized reviews
  - preserve mandatory triad review coverage
- rollback:
  - revert runtime and test changes only

### T2 Persistence and migration

- owner: `backend_engineer`
- write scope:
  - `src/store/types.ts`
  - `src/store/memory-store.ts`
  - `src/store/postgres-store.ts`
  - `src/sql/migrations/003_review_authz_and_waivers.sql`
  - `tests/postgres-store.test.ts`
- acceptance:
  - review and approval records persist actor provenance and waiver authority
  - migration upgrades existing databases without dropping data
- verification:
  - `npm test -- --test tests/postgres-store.test.ts tests/service.test.ts`
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - no null provenance for new review writes
  - no silent fallback to caller-asserted reviewer identity
- rollback:
  - revert store changes and migration

### T3 New capabilities

- owner: `planner`
- write scope:
  - `.agents/skills/devgod-tdd/SKILL.md`
  - `.agents/skills/devgod-e2e/SKILL.md`
  - `.agents/skills/devgod-release-readiness/SKILL.md`
  - `.codex/agents/tdd-guide.toml`
  - `.codex/agents/e2e-runner.toml`
  - `.codex/agents/release-readiness.toml`
- acceptance:
  - package ships the three new capabilities in the same style as current devgod assets
  - instructions are specific, scoped, and compatible with current workflow
- verification:
  - installer and pack tests cover new skill and agent files
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - capability docs must not weaken current review gates
- rollback:
  - revert new skill and agent files

### T4 Installer and policy alignment

- owner: `planner`
- write scope:
  - `AGENTS.md`
  - `src/install/merge.ts`
  - `tests/install.test.ts`
  - `.devgod/rules/review-gate-policy.md`
- acceptance:
  - shipped install surface reflects the new capabilities and authz semantics
  - docs stay aligned with runtime behavior
- verification:
  - `npm test -- --test tests/install.test.ts`
- required reviews:
  - `reviewer`
  - `security_reviewer`
  - `qa_engineer`
- security checks:
  - docs must not overclaim trust if caller auth is still external
- rollback:
  - revert installer and policy text updates
