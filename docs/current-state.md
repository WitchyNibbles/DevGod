# Devgod Current State

Status date: `2026-05-19`

This document is the plain-language snapshot of what `devgod` is today.
If another doc sounds bigger, older, or more visionary than this one, treat this file and the repo itself as the current truth.

## One-sentence definition

`devgod` is a manager-led workflow controller and shared runtime for Codex-based software work.

It installs into repositories, adds a reusable control layer, stores workflow/runtime state, and tries to move work from intake through verification without relying on vague chat summaries.

## Mission

The mission is to make AI-assisted engineering work:

- more inspectable
- more resumable
- more reviewable
- less likely to claim completion without evidence

Devgod is trying to close the gap between "an LLM answered" and "an engineering task was actually driven to a verifiable stop condition."

## What is shipped right now

### 1. Repo install and upgrade overlay

Shipped through:

- `src/install/cli.ts`
- `src/install/merge.ts`
- `scripts/install-devgod.sh`
- `scripts/setup-devgod.sh`

What it does:

- installs managed `AGENTS.md` guidance
- installs repo-local `.codex/agents/`
- installs repo-local `.agents/skills/devgod-*`
- copies `.devgod/rules/` and `.devgod/templates/`
- adds target-repo scripts like `devgod:doctor`, `devgod:ops`, and `devgod:setup:local`
- preserves unrelated local config where possible instead of brute-force replacing it

### 2. Runtime-backed workflow state

Shipped through:

- `src/admin.ts`
- `src/core/service.ts`
- `src/store/postgres-store.ts`
- `src/sql/migrations/`

What it currently tracks:

- projects and workspaces
- runs
- tasks and dependencies
- reviews and approvals
- checkpoints
- progress proof
- runtime project registrations
- memory entries and embedding jobs

This means devgod is not only a set of markdown templates anymore.
It has a real backing store and runtime authority model.

### 3. Autonomous execution surfaces

Shipped through:

- `src/admin/devgod.ts`
- `src/admin/runtime-surface.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/devgod/task-queue.ts`

Current capabilities:

- task queue inspection and advancement
- workflow proof checks
- daemon and supervisor surfaces
- bounded recovery helpers
- operator-facing status and report views
- continuation guidance driven by runtime state

This is the part of the project that is trying to turn "continue" into a structured loop instead of an open-ended conversational habit.

### 4. Retrieval and export

Shipped through:

- `src/runtime/repo-markdown-indexer.ts`
- `src/runtime/embedding-runner.ts`
- `src/store/qdrant-artifact-index.ts`
- `src/docs-export/`

Current capabilities:

- repo markdown indexing
- embedding job execution
- Qdrant-backed artifact indexing
- Obsidian-friendly doc export from runtime worklogs and natural-language export requests

### 5. Tooling surfaces

Shipped through:

- `src/mcp/server.ts`
- `src/ui/server.ts`

Current capabilities:

- MCP server exposure for status, ops, loop, report, and planning context surfaces
- a lightweight hosted operator UI for local inspection

## What this repo is for

This repository is the shared-package source of truth.

It owns:

- reusable runtime code under `src/`
- installer and setup flows under `scripts/` and `src/install/`
- reusable agent/skill/control assets under `.codex/`, `.agents/`, `.devgod/rules/`, and `.devgod/templates/`

It also currently contains package-maintainer workflow state under `.devgod/work/`, but that is package-maintainer state, not something intended to be copied wholesale into consuming repos.

## What a consuming repo gets

After installation, a target repo gets:

- the managed devgod guidance block in `AGENTS.md`
- repo-local devgod skills and agent profiles
- workflow templates and rules
- helper scripts and verification checks
- `devgod:*` package scripts
- the option to bootstrap a local runtime path

That target repo then owns its own:

- `.env.devgod`
- `.devgod/work/`
- runtime registration
- review identity adapter
- project-specific policy overlays

## Source repo command surface

In this package repo, common commands are:

```bash
npm run devgod -- help
npm run install:project -- init --apply --target /absolute/path/to/project
npm run setup:local
npm run doctor
npm run status
npm run ops
npm run mcp
npm run ui
```

## Installed repo command surface

In a consuming repo, the installed script names are usually:

```bash
npm run devgod:setup:git-guard
npm run devgod:verify:git-guard
npm run devgod:setup:local
npm run devgod:doctor
npm run devgod:verify:setup
npm run devgod:status
npm run devgod:ops
npm run devgod:export-docs -- "summarize what we worked on today"
```

## Important nuance: current truth vs roadmap

Some parts of the repo are clearly current and shipped.
Some parts are intentionally aspirational.

Current and shipped:

- installer overlay
- runtime-backed task/review/run storage
- workflow proof and review recording surfaces
- daemon/supervisor/operator surfaces
- retrieval refresh and docs export
- MCP server and hosted UI

Still evolving:

- exhaustive coverage-ledger enforcement everywhere
- the full redesign described in `docs/autonomous-execution-redesign.md`
- the long-term authority boundary between markdown artifacts and runtime state across every repo mode

## Working description

If someone asks, "What is devgod right now?", the most honest answer is:

> Devgod is a reusable package that tries to make Codex work like a small engineering organization instead of a single chat session. It installs workflow rules and operator tools into a repo, stores runtime state in a database, exposes status and recovery surfaces, and pushes work toward evidence-backed completion.
