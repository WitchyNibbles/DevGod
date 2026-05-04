# devgod

`devgod` is a witchy, manager-led operating layer for Codex that can be installed into a new or existing project, bringing along the rules, skills, setup scripts, and shared-core runtime it needs to work.

## Quick Start

This repo is the source of truth. Keep it cloned on the same machine as any project you want to bless with `devgod`.

Why: the current installer adds `devgod` to the target project as a local `file:` dependency. This is not a published npm package yet.

Minimum ingredients:

- Node.js `>=22`
- `npm`
- Docker for the shipped local setup path
- a clone of this repo in a stable local path

Fast path:

1. Clone this repo somewhere permanent.
2. Install `devgod` into the target project.
3. In the target project, run `npm install`.
4. In the target project, run `npm run devgod:setup:local`.
5. Let `npm run devgod:verify:setup` be the setup/database proof that the basic bootstrap path is working.

## Install Into An Existing Project

From this `devgod` source repo:

```bash
bash scripts/install-devgod.sh /absolute/path/to/existing-project
```

PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-devgod.ps1 -TargetPath C:\path\to\existing-project
```

Direct Node entrypoint:

```bash
npm run install:project -- --target /absolute/path/to/existing-project
```

Then move into the target repo and finish the setup:

```bash
cd /absolute/path/to/existing-project
npm install
npm run devgod:setup:local
```

## Install Into A New Project

Create the target repo first, then install `devgod` into it from this source repo.

```bash
mkdir -p /absolute/path/to/new-project
cd /absolute/path/to/new-project
git init
```

Now return to this `devgod` source repo and install into that new path:

```bash
bash scripts/install-devgod.sh /absolute/path/to/new-project
```

Or:

```bash
npm run install:project -- --target /absolute/path/to/new-project
```

Then finish setup inside the new project:

```bash
cd /absolute/path/to/new-project
npm install
npm run devgod:setup:local
```

## What The Installer Changes

The installer is merge-aware. It tries to graft `devgod` into a repo without flattening the local house.

It will:

- append or refresh a managed `devgod` block in `AGENTS.md`
- merge `.codex/config.toml` additively instead of replacing unrelated values
- install repo-local agent profiles under `.codex/agents/devgod-*.toml`
- install repo-local skills under `.agents/skills/devgod-*/SKILL.md`
- copy reusable `.devgod/rules/` and `.devgod/templates/`
- seed starter `.devgod/work/**/README.md` scaffolding
- seed `.devgod/memory/README.md` but not live reviewed memory entries
- install `.env.devgod.example`
- install `docker-compose.devgod.yml`
- install generated target-repo setup scripts at `scripts/devgod-setup.sh` and `scripts/devgod-setup.ps1`
- create `package.json` if missing, or merge `devgod` scripts into it if present
- add a local `file:` dev dependency pointing back to this source repo
- add `devgod` env ignore rules to `.gitignore`
- back up overwritten managed files into `.devgod/install-backups/`

It will not:

- publish anything to npm
- copy live `.devgod/work/` history from this source repo into the target repo
- copy reviewed durable memory content into the target repo
- invent project-specific policy for the target repo

## Setup After Install

Inside the target repo, `npm run devgod:setup:local` is the one command a Codex agent should prefer when the repo has been installed but not configured yet.

That command runs `src/install/setup-local.ts`, which dispatches to the generated target-repo setup script, and then does this:

1. creates `.env.devgod` from `.env.devgod.example` if needed
2. checks Docker availability
3. fills in sane defaults for the target repo path and project identity
4. starts `docker-compose.devgod.yml`
5. runs `npm install`
6. runs `npm run devgod:migrate`
7. runs `npm run devgod:bootstrap`
8. runs `npm run devgod:verify:setup`

The shipped `npm run devgod:setup:local` path is Docker-first and always starts `docker-compose.devgod.yml`.

If you need a managed database today, use a dedicated non-production database, set the target repo environment explicitly, and run the admin commands manually:

```bash
npm run devgod:migrate
npm run devgod:bootstrap
npm run devgod:verify:setup
```

Do not point this flow at a shared or production database unless that write path is explicitly intended and approved. `migrate` and `bootstrap` write schema and project state to `DEVGOD_CORE_DATABASE_URL`.

## Required Environment

The target repo uses `.env.devgod`, not this source repo's `.env`.

Required for the shipped `npm run devgod:setup:local` path:

- `DEVGOD_CORE_DATABASE_URL`

Required if you run the admin commands manually:

- `DEVGOD_CORE_DATABASE_URL`
- `DEVGOD_PROJECT_SLUG`

Usually useful:

- `DEVGOD_WORKSPACE_SLUG`
- `DEVGOD_WORKSPACE_NAME`
- `DEVGOD_PROJECT_NAME`
- `DEVGOD_PROJECT_REPO_PATH`
- `DEVGOD_POSTGRES_DB`
- `DEVGOD_POSTGRES_USER`
- `DEVGOD_POSTGRES_PASSWORD`
- `DEVGOD_POSTGRES_PORT`
- `DEVGOD_DOCKER_CONTAINER_NAME`

Defaults in the shipped target-repo example and setup path:

- `DEVGOD_WORKSPACE_SLUG` defaults to `default` in `.env.devgod.example`
- `DEVGOD_PROJECT_REPO_PATH` defaults to the current target repo path
- `DEVGOD_PROJECT_SLUG` defaults to the target repo directory name
- `DEVGOD_PROJECT_NAME` defaults to `DEVGOD_PROJECT_SLUG`
- `DEVGOD_DOCKER_CONTAINER_NAME` defaults to `devgod-postgres-${DEVGOD_PROJECT_SLUG}`

Credential note:

- the example `devgod` / `devgod` credentials are local Docker defaults only
- for any non-local database, use unique credentials and a dedicated database
- the default Docker compose path publishes Postgres on the host port; if the machine is shared or the port is reachable from outside your workstation, change the password and exposure before using it
- `.env.devgod` is meant to stay private and ignored by git

## Operate With Codex

If a target repo has `devgod` installed but not configured, a Codex agent should:

1. check for `.env.devgod`
2. run `npm install` if dependencies are missing
3. run `npm run devgod:setup:local`
4. use `npm run devgod:verify:setup` as the blocking setup/database proof

Once the repo is configured, the intended operating rhythm is:

- substantive requests become `devgod` work by default unless the user opts out
- the root thread acts as the manager on first contact
- active briefs, plans, tasks, and reviews live under `.devgod/work/`
- repo-local rules live under `.devgod/rules/`
- reviewed durable memory lives under `.devgod/memory/`
- repo-local skills live under `.agents/skills/devgod-*`
- QA and security gates block completion for substantive work

If Codex is deciding how to bootstrap a repo, the `devgod-setup` skill is the preferred setup path.

## Source Repo Setup

This section is for maintaining the `devgod` package itself, not for configuring a target repo.

From this source repo:

```bash
npm install
npm run setup:local
```

The source-repo setup path uses `.env`, `docker-compose.yml`, and the source-repo scripts. Do not confuse that with a target repo's `.env.devgod`, `docker-compose.devgod.yml`, and `npm run devgod:setup:local`.

Useful source-repo commands:

```bash
npm run db:start
npm run migrate
npm run health
npm run bootstrap
npm run verify:setup
npm test
npm run typecheck
```

## Architecture In Brief

The spellbook has three layers:

1. `Codex interaction layer`
   The user speaks to Codex. Requests are treated as real work by default, not as toy prompts waiting for a magic keyword.
2. `Repo-local control layer`
   Each consuming repo keeps its own `AGENTS.md`, `.devgod/rules/`, `.devgod/work/`, `.devgod/memory/`, and repo-local skills.
3. `Shared backend layer`
   The shared core stores runs, task graphs, locks, reviews, approvals, and retrieval metadata in Node/Postgres with `pgvector`.

Source-of-truth split:

- repo markdown: reviewed project policy, durable decisions, patterns, and lessons
- Postgres: live operational state and audit trail
- `pgvector`: semantic retrieval over memory plus indexed repo markdown chunks

This package owns the reusable bootstrap layer:

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

## Repo Layout

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
  install/
  sql/migrations/
  store/
tests/
AGENTS.md
README.md
docker-compose.yml
```

## Current Limits

This is still the foundation release. It does not yet include:

- a packaged MCP transport around the shared-core actions
- production deployment manifests for the shared service
- extra coordinator roles such as `scrum_master` or `test_director`
- a `devgod:codex` command wrapper

Repo markdown retrieval is now available through the admin surface:

- `node --experimental-strip-types src/admin.ts index-repo-markdown [repo-root]`
- `DEVGOD_REPO_MARKDOWN_INCLUDE=README.md,docs,.devgod` controls the allowlist
- `DEVGOD_EMBEDDING_MODEL` queues embedding jobs for indexed markdown chunks
- `node --experimental-strip-types src/admin.ts run-embedding-jobs [limit]` writes vectors for queued chunks

## Design Rules

- no silent policy mutation
- no direct worker writes to shared state outside the service layer
- no completion without explicit review and verification
- no secrets in repo memory or checked-in workflow artifacts
