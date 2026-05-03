# Decision Log

## 2026-04-24 - Start repo-scoped before global install

We kept the first version inside this repository instead of modifying the user-level Codex profile.

Why:

- safer while the workflow is still evolving
- easier to inspect and version
- avoids surprising changes across unrelated projects

Tradeoff:

- not yet auto-available in every repo

## 2026-04-24 - Use repo-local memory as primary memory layer

We use `.devgod/memory/` as the durable memory source.

Why:

- reviewable and portable
- works even when platform memory is disabled or unavailable
- keeps learning explicit instead of magical

Tradeoff:

- memory updates depend on workflow discipline

## 2026-04-25 - Split durable project memory from shared operational state

We now use a shared Postgres + pgvector core for operational state and retrieval, while keeping reviewed project memory in the repo.

Why:

- multiple projects can share orchestration state
- teams can inspect the same runs, tasks, and reviews
- repo markdown remains the reviewable policy layer

Tradeoff:

- the system now has a backend dependency for shared features
