# Task Packet

task_id: 2026-05-05-review-identity-adapter-hardening
owner: backend_engineer
goal: Ship a package-owned review identity adapter and verifier surface so consuming repos can validate their authenticated-principal wiring against reviewed bindings before trusting review actions.
inputs:
- .devgod/work/briefs/2026-05-05-review-identity-adapter-hardening.md
- src/core/review-context.ts
- src/admin.ts
- src/install/cli.ts
- src/install/merge.ts
dependencies: []
allowed_write_scope:
- src/core/review-context.ts
- src/admin.ts
- src/index.ts
- src/install/cli.ts
- src/install/merge.ts
- .env.example
- README.md
- .devgod/rules/
- .devgod/templates/
- tests/review-context.test.ts
- tests/install.test.ts
out_of_scope:
- provider-specific identity code
- HTTP or framework middleware
- changing DevgodCoreService constructor shape
- database schema changes
acceptance_criteria:
- package exports a provider-agnostic review principal adapter helper and review identity verifier
- verifier can execute allow and deny fixtures against repo-owned bindings and adapter output
- installer ships reviewed binding and fixture templates into target repos
- target package scripts include a review-identity verification command
- docs explain the trust boundary and verifier workflow
verification_steps:
- node --experimental-strip-types --test tests/review-context.test.ts tests/install.test.ts tests/actions.test.ts tests/service.test.ts
- npm test
- npm run typecheck
- npm pack --dry-run
- git diff --check
required_reviews:
- reviewer
- security_reviewer
- qa_engineer
security_checks:
- fail closed on unverified principals
- fail closed on actor mismatch, role mismatch, and waiver mismatch
- do not trust request body identity claims
- do not ship secrets in bindings or fixtures
anti_patterns:
- adding provider-specific auth logic
- bypassing the existing trusted resolver requirement
- making the verifier depend on HTTP transport details
- silently accepting malformed fixture data
rollback_notes: revert helper/verifier/template/install-script changes together so the shipped package does not advertise a verification path it cannot execute.
handoff_format: summary + changed files + verification commands + residual risk
