# Devgod Current State

Status date: `2026-05-21`

This is the plain-language snapshot of what `devgod` is today. If another document sounds broader, older, or more aspirational than this one, treat this file plus the repo itself as the current truth.

## One-sentence definition

`devgod` is a manager-led workflow controller and shared runtime for Codex-based software work.

It installs into repositories, adds a reusable control layer, stores workflow/runtime state, and pushes work toward evidence-backed completion instead of loose chat summaries.

For new substantive asks, the current control layer now prefers a short clarification step before planning so the final implementation tracks the user’s intended direction instead of inferred defaults.

## Mission

The mission is to make AI-assisted engineering work:

- more inspectable
- more resumable
- more reviewable
- less likely to claim completion without evidence

The core gap DevGod is trying to close is the one between "the model answered" and "the engineering work actually reached a verifiable stop condition."

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
- installs `.devgod/rules/` and `.devgod/templates/`
- writes target-repo `devgod:*` scripts
- preserves unrelated local config where possible instead of brute-force replacement

### 2. Runtime-backed workflow state

Shipped through:

- `src/admin.ts`
- `src/core/service.ts`
- `src/store/postgres-store.ts`
- `src/sql/migrations/`

What it currently tracks:

- projects and workspaces
- runs
- intake summaries, including clarifying questions and explicit assumptions when they exist
- tasks and dependencies
- reviews and approvals
- checkpoints and resumable state
- runtime project registrations
- memory entries and embedding jobs

This means DevGod is no longer just a set of markdown templates. It has a real backing store and runtime authority model.

### 3. Autonomous execution and operator surfaces

Shipped through:

- `src/admin/devgod.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `src/devgod/task-queue.ts`
- `src/ui/server.ts`
- `src/mcp/server.ts`

Current capabilities:

- task queue inspection and advancement
- workflow proof checks
- daemon and supervisor surfaces
- bounded recovery helpers
- operator-facing status and report views
- continuation guidance driven by runtime state
- MCP and UI inspection surfaces

### 4. Modernization-mode autonomous profile

Shipped through:

- `src/runtime/autonomous-execution.ts`
- `src/runtime/coverage-ledger.ts`
- `src/core/service.ts`
- `src/admin.ts`

Current capabilities:

- `modernization_program` profile with stricter rewrite readiness gates
- explicit cartography, invariant, duplicate-family, architecture-decision, migration-ledger, and parity evidence classes
- installed-repo proof through `seed-modernization-proof` and the installed modernization harness

This is the current package answer to large brownfield rewrite work: do not claim modernization readiness until the required evidence classes are present.

### 5. Control-layer hook hardening

Shipped through:

- `plugins/devgod/scripts/hook-utils.mjs`
- `plugins/devgod/scripts/hook-policy.mjs`

Current capabilities:

- queue-vs-`.devgod/ACTIVE` authority mismatch visibility
- explicit successor task-packet handoff scope
- stop-hook behavior that recognizes structured control-layer mismatch instead of only matching prose
- first-prompt steering that tells DevGod to ask up to four targeted clarification questions for substantive requests before planning

This closed the blocker that previously let stale scope and stale task authority stall autonomous continuation across slices.

### 6. Retrieval and export

Shipped through:

- `src/runtime/repo-markdown-indexer.ts`
- `src/runtime/embedding-runner.ts`
- `src/store/qdrant-artifact-index.ts`
- `src/docs-export/`

Current capabilities:

- repo markdown indexing
- embedding job execution
- Qdrant-backed artifact indexing
- Obsidian-friendly docs export from runtime worklogs and export requests

## What this repo is for

This repository is the shared-package source of truth.

It owns:

- reusable runtime code under `src/`
- installer and setup flows under `scripts/` and `src/install/`
- reusable agent, skill, rule, template, and hook assets under `.codex/`, `.agents/`, `.devgod/rules/`, `.devgod/templates/`, and `plugins/`

Installed consuming repos own their own:

- `.env.devgod`
- `.devgod/work/`
- runtime registration
- review identity adapter
- project-specific policy overlays

## Source repo command surface

Common commands in this package repo are:

```bash
npm run devgod -- help
npm run setup:local
npm run doctor
npm run status
npm run ops
npm run devgod -- report --run-id latest
npm run devgod -- coverage --run-id latest --format text
npm run devgod -- gaps --run-id latest --format text
npm run devgod -- workflow-proof --run-id latest --task-id <task-id>
npm run devgod -- serve-ui
npm run mcp
```

Other important source-repo scripts:

- `npm run install:project -- init --apply --target /absolute/path/to/project`
- `npm run scaffold:workflow`
- `npm run seed:happy-path-fixture`
- `npm run verify:setup`
- `npm run verify:workflow`
- `npm run verify:release-overlay`
- `npm run verify:migrations:live`
- `npm run export:docs`

## Installed repo command surface

A consuming repo gets repo-local `devgod:*` scripts such as:

```bash
npm run devgod:setup:git-guard
npm run devgod:verify:git-guard
npm run devgod:setup:local
npm run devgod:doctor
npm run devgod:verify:setup
npm run devgod:status
npm run devgod:coverage
npm run devgod:gaps
npm run devgod:ops
npm run devgod:report
npm run devgod:loop
npm run devgod:supervisor
npm run devgod:seed-workflow-proof
npm run devgod:seed-modernization-proof
npm run devgod:verify:review-identity
```

The installed surface is broader than the sample above. Notable additional scripts include:

- `devgod:checkpoint`
- `devgod:resume`
- `devgod:advance-active-task`
- `devgod:reconcile`
- `devgod:sync-runtime-exports`
- `devgod:refresh-retrieval`
- `devgod:autopilot-status`
- `devgod:mcp`
- `devgod:ui`
- `devgod:record-review`
- `devgod:scaffold-workflow`
- `devgod:upgrade-reasoning-workflow`
- `devgod:seed-happy-path-fixture`

## Important nuance: shipped truth vs consuming-repo truth

Current and shipped in this package:

- installer overlay
- runtime-backed task/review/run storage
- workflow proof and review recording surfaces
- daemon, supervisor, operator, MCP, and UI surfaces
- modernization-mode readiness gates and installed-repo proof
- hook hardening for continuation handoff and authority mismatch

Still repo-specific after install:

- runtime registration in the target repo
- authenticated review identity wiring
- project-local workflow state and evidence
- target-repo rewrite readiness

## Working description

If someone asks, "What is DevGod right now?", the most honest answer is:

> DevGod is a reusable package that tries to make Codex work more like a small engineering organization than a single chat session. It installs workflow rules and operator tools into a repo, stores runtime state in a database, exposes status and recovery surfaces, and pushes work toward evidence-backed completion.
