# devgod

`devgod` is a shared agent operating platform for Codex. This repository packages the reusable
runtime, installer, and local-control assets. Each consuming project keeps its own local policy,
reviewed memory, and live workflow artifacts in git, while a shared Node/Postgres core owns
orchestration state, retrieval, locks, reviews, and approvals.

## What it is now

This repository now contains the first runnable foundation for that model:

- a Node/TypeScript shared-core service skeleton in `src/`
- Postgres + `pgvector` schema/migrations in `src/sql/migrations/`
- contract tests for intake, task graphs, gates, locking, memory promotion, and retrieval
- reusable workflow assets under `.devgod/`, `.agents/`, and `.codex/`
- Codex agent/skill definitions aligned to the shared-core architecture

## Architecture

`devgod` is split into three layers:

1. **Codex interaction layer**
   The user works through the Codex VS Code extension. Requests are treated as customer or CEO asks by default, not only when they contain a magic keyword.

2. **Repo-local control layer**
   Each project keeps:
   - `AGENTS.md`
   - repo-specific `AGENTS.md` overlays
   - `.devgod/rules/`
   - `.devgod/work/`
   - `.devgod/memory/`
   - `.agents/skills/`

3. **Shared backend layer**
   The shared core stores:
   - workspaces and projects
   - runs and task graphs
   - handoffs, reviews, approvals, and locks
   - shared memory metadata and retrieval records
   - embeddings via `pgvector`

## Source of truth split

- **Repo markdown:** reviewed project policy, durable decisions, patterns, lessons
- **Postgres:** live operational state and audit trail
- **pgvector:** semantic retrieval over plans, handoffs, and memory

This package is the source of truth for the reusable bootstrap layer:

- installer behavior
- setup scripts
- reusable skills and agent profiles
- starter `.devgod/rules/`, `.devgod/templates/`, and `.devgod/work/` scaffolding

Consuming repos remain the source of truth for:

- live `.devgod/work/` tasks, plans, reviews, and release artifacts
- reviewed `.devgod/memory/` entries such as decisions, patterns, and lessons
- repo-specific `AGENTS.md` additions
- repo-local environment files such as `.env.devgod`

Policy precedence:

1. project `AGENTS.md`
2. `.devgod/rules/`
3. approved repo memory
4. shared backend retrieval hints
5. current run notes and handoffs

## Core workflow

1. A substantive request enters Codex.
2. `devgod` produces an intake brief with goal, constraints, risks, unknowns, and stop/go status.
3. `solution_architect` clarifies boundaries and sequencing before worker planning starts.
4. `planner` decomposes the request into strict task packets with owners, write scope, tests, and reviews.
5. Workers claim tasks only when dependencies and write locks allow it.
6. Handoffs move tasks into blocking review.
7. Security and QA gates decide approval or block completion.
8. Reviewed memory is promoted to the shared backend and, when durable, to repo markdown.

## Runtime entrypoints

The shared core currently exposes the first internal/admin commands:

```bash
npm run migrate
npm run health
npm run bootstrap
npm run verify:setup
npm test
```

## Install Into An Existing Project

To install `devgod` into another repo on the same machine, run:

```bash
bash scripts/install-devgod.sh /absolute/path/to/existing-project
```

Or on PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-devgod.ps1 -TargetPath C:\path\to\existing-project
```

The installer is merge-aware:

- appends a managed `devgod` block into an existing `AGENTS.md`
- appends the default department workflow for reusable devgod execution
- merges `.codex/config.toml` additively instead of replacing existing values
- installs namespaced local agent profiles as `.codex/agents/devgod-*.toml`
- adds `devgod` npm scripts and a local file dependency to this repo
- installs namespaced setup assets such as `.env.devgod.example`, `docker-compose.devgod.yml`, and `scripts/devgod-setup.*`
- seeds only starter `.devgod/work/**/README.md` and `.devgod/memory/README.md` scaffolding, not live work history or reviewed memory content
- backs up modified files into `.devgod/install-backups/`

After install, the target project should run:

```bash
npm install
npm run devgod:setup:local
```

Required environment:

- `DEVGOD_CORE_DATABASE_URL`
- `DEVGOD_WORKSPACE_SLUG`
- `DEVGOD_PROJECT_SLUG`
- optional `DEVGOD_WORKSPACE_NAME`
- optional `DEVGOD_PROJECT_NAME`
- optional `DEVGOD_PROJECT_REPO_PATH`

## Codex setup flow

If Codex needs to create and configure everything `devgod` requires, it should use the `devgod-setup` skill and follow this order:

1. create `.env` from `.env.example` if needed
2. set the repo path/project identity env vars
3. start the local Postgres + `pgvector` backend with Docker Compose, or use a managed Postgres backend if already provided
4. install dependencies
5. run migrations
6. bootstrap the workspace/project
7. verify setup

Ready-made setup commands:

```bash
npm run setup:local
```

```powershell
npm run setup:local
```

## Repo layout

```text
.codex/
  config.toml
  agents/
.agents/
  skills/
.devgod/
  memory/
  rules/
  templates/
  work/
src/
  core/
  domain/
  store/
  sql/migrations/
tests/
AGENTS.md
```

## Current limits

This is still a foundation release. It does not yet include:

- a packaged MCP transport around the shared-core actions
- automatic embedding generation jobs
- production deployment manifests for the shared service
- cross-project sync from repo markdown into the backend
- extra coordinator roles such as `scrum_master` or `test_director`
- a `devgod:codex` command wrapper

## Design rules

- no silent policy mutation
- no direct worker writes to shared state outside the service layer
- no completion without explicit review and verification
- no secrets in repo memory or checked-in workflow artifacts
