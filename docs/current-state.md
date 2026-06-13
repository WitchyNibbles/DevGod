# Devgod Current State

Status date: `2026-06-13`

This is the plain-language snapshot of what `devgod` is today. If another document sounds broader, older, or more aspirational than this one, treat this file plus the repo itself as the current truth.

## One-sentence definition

`devgod` is a manager-led workflow controller and shared runtime for Codex-based software work.

It installs into repositories, adds a reusable control layer, stores workflow/runtime state, and pushes work toward evidence-backed completion instead of loose chat summaries.

For new substantive asks, the current control layer now prefers a short clarification step before planning so the final implementation tracks the user's intended direction instead of inferred defaults.

## Runtime-proven package status

The package is runtime-proven at the package level, and the current June 12 repair closeout proof is run `d5a2b9ac-aa2d-4412-8387-578f0b849102`.

That statement is about the package repo and its maintained verification state. It is not a blanket claim that every consuming repo is already operational or review-authoritative after installation.

## Release-readiness snapshot

Fresh package/install and runtime workflow evidence is green for the repaired core overlay:

- `node --experimental-strip-types --test tests/install.test.ts tests/happy-path.test.ts` passed `120/120`
- `bash scripts/verify-installed-repo-harness.sh` passed
- `npm run check:happy-path` passed
- `npm run check:quality` passed
- `git diff --check` passed
- the maintainer verification surface reported no `.only` tests
- runtime proof run `d5a2b9ac-aa2d-4412-8387-578f0b849102` approved `2026-06-12-devgod-autonomous-team-repair`
- `npm run devgod -- status --format text` reports `integrity.status` as `consistent`
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-12-devgod-autonomous-team-repair` passed
- `bash scripts/check-devgod-workflow-live.sh --repo-root . --task-id 2026-06-12-devgod-autonomous-team-repair` passed

So the current package proof proves the package boundary, installer overlay, focused installed-repo harness, and June 12 repair task workflow closeout in this checkout. It does not prove universal downstream readiness.

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
- treats managed `.codex/config.toml` preservation as semantic: unrelated user-owned TOML values survive merges, while formatting and comments may be rewritten when managed content changes

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
- coverage, gap, checkpoint, and resume summaries
- daemon, supervisor, and supervisor-history surfaces
- bounded recovery helpers
- operator-facing status and report views
- continuation guidance driven by runtime state
- MCP and UI inspection surfaces

### 4. Codex-native automation handoff surfaces

Shipped through:

- `src/admin.ts`
- `src/admin/autonomous-summary.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `plugins/devgod/scripts/hook-policy.mjs`

Current capabilities:

- explicit deferred-work intents instead of treating every delay as immediate continuation
- provider-backed automation envelopes for delayed follow-up
- Codex app thread-automation handoff materialization for same-thread wakeups
- Codex app standalone-automation handoff materialization for fresh-run wakeups
- CLI scheduler handoff artifacts for local-first scheduled `codex exec` flows
- explicit manual operator handoff when no safe automation surface is available

Operationally, DevGod now distinguishes between "continue now" and "wake this work back up later."

### 5. Modernization-mode autonomous profile

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

### 6. Control-layer hook hardening

Shipped through:

- `plugins/devgod/scripts/hook-utils.mjs`
- `plugins/devgod/scripts/hook-policy.mjs`

Current capabilities:

- queue-vs-`.devgod/ACTIVE` authority mismatch visibility
- explicit successor task-packet handoff scope
- stop-hook behavior that recognizes structured control-layer mismatch instead of only matching prose
- first-prompt steering that tells DevGod to ask up to four targeted clarification questions for substantive requests before planning

This closed the blocker that previously let stale scope and stale task authority stall autonomous continuation across slices.

### 7. Retrieval and export

Shipped through:

- `src/runtime/repo-markdown-indexer.ts`
- `src/runtime/embedding-runner.ts`
- `src/store/postgres-memory-search.ts`
- `src/docs-export/`

Current capabilities:

- repo markdown indexing
- embedding job execution
- lexical-first artifact indexing with pgvector semantic fallback
- Obsidian-friendly docs export from runtime worklogs and export requests

### 8. Repo-context profiling and queue repair

Shipped through:

- `src/runtime/repo-context-profile.ts`
- `src/admin.ts`
- `src/admin/planning-context.ts`
- `src/devgod/task-queue.ts`
- `src/install/merge.ts`
- `scripts/setup-devgod.sh`
- `scripts/setup-devgod.ps1`

Current capabilities:

- canonical alias handling for legacy task queue class values plus an explicit `repair-task-queue` rewrite command for already-installed consuming repos
- deterministic `repoContextProfile` capture in runtime registration metadata
- first-slot probing for virtualenv paths, `manage.py`, Django DB selector variables, and common package scripts
- planning-context hydration from repo context before falling back to repo rediscovery
- consuming-repo setup that refreshes repo context automatically alongside retrieval refresh

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

## Optional-module follow-ups

These should stay visible as follow-ups instead of being hidden under the core green package state:

- Graphify is optional and still needs repo-local setup, indexing freshness, and task-specific proof when enabled.
- Playwright is optional and only becomes part of a target repo's truth after that repo opts in and passes its own verification.
- Grafana is optional and advisory; MCP connectivity does not replace workflow proof, runtime-authoritative task state, or authenticated reviews.

## Command surface classification

This repo intentionally keeps the source-repo and installed-repo names different:

- source repo: short maintainer names for package work
- installed repo: namespaced `devgod:*` operator scripts

### Core maintainer commands

The primary maintainer commands in the package repo are:

```bash
npm test
npm run typecheck
npm run check:quality
npm run install:project -- init --apply --target /absolute/path/to/project
npm run devgod -- help
npm run devgod -- workflow-proof --run-id latest --task-id <task-id>
```

For admin flows such as `doctor`, `status`, `ops`, `report`, `coverage`, `gaps`, `checkpoint`, `resume`, `daemon`, and `supervisor`, the current canonical maintainer surface is `npm run devgod -- ...`.

### Core installed commands

A consuming repo gets operator scripts centered on:

```bash
npm run devgod:setup:local
npm run devgod:doctor
npm run devgod:verify:setup
npm run devgod:status
npm run devgod -- workflow-proof --run-id latest --task-id <task-id>
```

The repo-local package invocation is canonical for installed repos. The current `devgod:check-workflow` script is still shipped as a compatibility wrapper and migration note.

### Optional module commands

These stay outside the core matrix:

- source repo: `mcp`, `ui`, `setup:playwright`, `verify:playwright`, `setup:graphify`, `devgod:graphify:*`
- installed repo default: `devgod:mcp`, `devgod:ui`
- installed with `--with-graphify`: `devgod:setup:graphify`, `devgod:graphify:*`
- installed with `--with-playwright`: `devgod:setup:playwright`, `devgod:verify:playwright`
- installed-with-Grafana only: `devgod:grafana:mcp`

### Legacy aliases and migration notes

- source-repo shims such as `setup:local`, `doctor`, `status`, `verify:setup`, and `ops` still ship for operator continuity, but new docs should prefer `install:project` or `npm run devgod -- ...`
- installed-repo aliases such as `devgod:heal` and `devgod:focus` still ship as compatibility wrappers
- `devgod:check-workflow` remains the legacy shell wrapper while the runtime contract points at `npm run devgod -- workflow-proof --run-id latest --task-id <task-id>`

Other important source-repo scripts:

- `npm run install:project -- init --apply --target /absolute/path/to/project`
- `npm run scaffold:workflow`
- `npm run seed:happy-path-fixture`
- `npm run verify:setup`
- `npm run verify:workflow`
- `npm run verify:release-overlay`
- `npm run verify:migrations:live`

The installed surface is broader than the core matrix above. Notable additional scripts include:

- `devgod:checkpoint`
- `devgod:resume`
- `devgod:advance-active-task`
- `devgod:reconcile`
- `devgod:sync-runtime-exports`
- `devgod:plan-context`
- `devgod:refresh-retrieval`
- `devgod:refresh-retrieval:fast`
- `devgod:autopilot-status`
- `devgod:github-dispatch`
- `devgod:mcp`
- `devgod:ui`
- `devgod:record-review`
- `devgod:scaffold-workflow`
- `devgod:upgrade-reasoning-workflow`
- `devgod:seed-happy-path-fixture`
- `devgod:check:happy-path`
- `devgod:check-workflow`
- `devgod:verify:migrations:live`
- `devgod:export-docs`

The faster operator path is now:

- use `devgod:focus` for the compact deterministic `ops --format text` view
- use `devgod:refresh-retrieval:fast` when you need repo indexes fresh without blocking on embeddings
- let `plan-context` reuse stale derived state by default, and only opt into blocking refresh with `--auto-refresh-repo-context` and `--auto-refresh-retrieval`

## Important nuance: shipped truth vs consuming-repo truth

Current and shipped in this package:

- installer overlay
- runtime-backed task/review/run storage
- workflow proof and review recording surfaces
- runtime-proven package status at the package level, and authoritative completion proof is run `d141baef-0f7a-40df-9aec-ac60ad9235f7`
- daemon, supervisor, operator, MCP, and UI surfaces
- automation envelopes plus app and CLI delayed-work handoff surfaces
- modernization-mode readiness gates and installed-repo proof
- hook hardening for continuation handoff and authority mismatch

Still repo-specific after install:

- runtime registration in the target repo
- authenticated review identity wiring
- project-local workflow state and evidence
- target-repo rewrite readiness

## Working description

If someone asks, "What is DevGod right now?", the most honest answer is:

> DevGod is a reusable package that tries to make Codex work more like a small engineering organization than a single chat session. It installs workflow rules and operator tools into a repo, stores runtime state in a database, exposes status, recovery, and delayed-work handoff surfaces, and pushes work toward evidence-backed completion.
