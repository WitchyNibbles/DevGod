# 🧠 devgod

<p align="center">
  <strong>manager-led workflow control layer, shared runtime, and proof system for Codex-based software work</strong>
</p>

<p align="center">
  <img alt="node 22+" src="https://img.shields.io/badge/node-22%2B-2f6f3e?style=for-the-badge&logo=node.js&logoColor=white">
  <img alt="typescript runtime" src="https://img.shields.io/badge/typescript-runtime-1f6feb?style=for-the-badge&logo=typescript&logoColor=white">
  <img alt="workflow" src="https://img.shields.io/badge/workflow-intake%20to%20proof-f97316?style=for-the-badge">
  <img alt="runtime" src="https://img.shields.io/badge/runtime-postgres%20%2B%20qdrant-0f766e?style=for-the-badge">
  <img alt="automation" src="https://img.shields.io/badge/automation-codex%20app%20%2B%20cli-7c3aed?style=for-the-badge">
  <img alt="state date" src="https://img.shields.io/badge/docs-2026--05--24-111827?style=for-the-badge">
</p>

> `devgod` is an installable package that adds a reusable control layer, runtime-backed workflow state, operator tooling, and proof-oriented completion checks to Codex-driven repository work.
>
> It tries to make Codex behave less like a loose chat session and more like a small engineering org with scope, memory, review gates, and receipts.

```text
user ask
   ↓
clarify direction when needed
   ↓
intake → brief → plan → task packet → execution → reviews → workflow proof
   ↓
next task or real stop condition
```

## ✨ At A Glance

`opt-in overlay` `production-oriented package checks` `runtime-backed authority` `review gates` `autonomous continuation` `codex automation adapters` `MCP server` `operator UI` `docs export`

For new substantive asks, DevGod now prefers a short clarification pass before planning or implementation. The default target is up to four questions covering intended outcome, primary user or operator, constraints or non-goals, and concrete done criteria. If the request is already clear enough, DevGod records explicit operating assumptions instead of asking unnecessary questions.

## 📦 What It Is Right Now

As of `2026-05-20`, this repo is the package source of truth for DevGod and is runtime-proven at the package level.

The current package ships:

- a repo installer and upgrade overlay for consuming repositories
- reusable `AGENTS.md`, `.codex/agents/`, `.agents/skills/`, `.devgod/rules/`, and `.devgod/templates/`
- a TypeScript CLI and runtime service for task state, reviews, approvals, checkpoints, reports, and workflow proof
- autonomous execution surfaces including `status`, `coverage`, `gaps`, `checkpoint`, `resume`, `daemon`, `supervisor`, `supervisor-history`, `recover`, and `plan-context`
- Codex-native deferred-work handoffs for app automations and CLI scheduler flows
- installed-repo verification harnesses and a supported `seed-modernization-proof` path
- an MCP server and lightweight operator UI

> This repo proves the package behavior.
> It does not prove that every consuming repo is fully operational after install.

Installed repos still need their own runtime registration, review identity wiring, and repo-local evidence.

## 🎯 Mission

Devgod is trying to make AI coding work less hand-wavy.

It pushes a session away from:

- "the model said it was done"

and toward:

- explicit scope
- tracked artifacts
- review gates
- verification evidence
- persisted runtime state
- clear next actions when work is not actually complete

The big idea is simple: autonomy is only useful if it is inspectable, resumable, and skeptical of its own claims.

## 🗺️ Workflow Map

```mermaid
flowchart LR
    A[User ask] --> B{Direction clear?}
    B -- no --> C[Clarifying questions]
    B -- yes --> D[Intake]
    C --> D
    D --> E[Brief]
    E --> F[Plan]
    F --> G[Task packet]
    G --> H[Execution]
    H --> I[Reviews]
    I --> J[Workflow proof]
    J --> K{More work?}
    K -- yes --> F
    K -- no --> L[Real stop condition]
```

## 🏠 Where DevGod Lives

| Place | What it is | What it owns |
| --- | --- | --- |
| `this repo` | the package source of truth | reusable runtime, installer, MCP/UI, rules, templates, skills, agent profiles |
| `a consuming repo` | where real project work happens after install | `.env.devgod`, `.devgod/work/`, runtime registration, authenticated reviews, project-specific overlays |

Short version:

- this repo owns reusable package assets under `src/`, `scripts/`, `.agents/`, `.codex/`, `.devgod/templates/`, and `plugins/`
- consuming repos own their own local workflow state and runtime setup

Keep that boundary straight. Package verification here is evidence about the package. It is not blanket proof for target repos.

## 🧱 Shipped Surfaces

### 🛠️ Install and upgrade overlay

Shipped through:

- `src/install/cli.ts`
- `src/install/merge.ts`
- `scripts/install-devgod.sh`
- `scripts/setup-devgod.sh`

This layer installs or upgrades the managed DevGod overlay without flattening unrelated repo config.

### 🏦 Runtime and authority layer

Shipped through:

- `src/admin.ts`
- `src/core/service.ts`
- `src/store/postgres-store.ts`
- `src/sql/migrations/`

This layer tracks projects, runs, tasks, reviews, approvals, checkpoints, retrieval work, and runtime authority.

### 🤖 Automation-aware continuation

Shipped through:

- `src/admin.ts`
- `src/admin/autonomous-summary.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `plugins/devgod/scripts/hook-policy.mjs`

Current deferred-work behavior now distinguishes between immediate continuation and delayed follow-up:

- `defer_same_thread` can materialize a Codex app thread automation or a same-thread CLI resume handoff
- `defer_fresh_run` can materialize a Codex app standalone automation or a fresh-run CLI scheduler handoff
- unsupported automation cases fall back to explicit operator handoff instead of fake continuation prose

### 🧭 Operator and inspection layer

Shipped through:

- `src/admin/devgod.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/report.ts`
- `src/mcp/server.ts`
- `src/ui/server.ts`

This is how operators and tools inspect what the runtime currently considers true.

### 🗃️ Knowledge and export layer

Shipped through:

- `src/runtime/repo-markdown-indexer.ts`
- `src/docs-export/`
- `src/store/qdrant-artifact-index.ts`

This layer supports retrieval refresh, markdown indexing, artifact search, and Obsidian-oriented export.

## 🚀 Quick Start

### If you are working on `devgod` itself

Requirements:

- Node.js `>=22`
- `npm`
- Docker if you want the default local runtime path

Useful source-repo commands:

```bash
npm run devgod -- help
npm run setup:local
npm run doctor
npm run status
npm run ops
```

### If you want to install `devgod` into another repo

From this source repo:

```bash
npm run install:project -- init --apply --target /absolute/path/to/project
```

To add the optional Grafana log surface during install:

```bash
npm run install:project -- init --apply --target /absolute/path/to/project --with-grafana
```

Then inside the target repo:

```bash
npm install
npm run devgod:setup:git-guard
npm run devgod:verify:git-guard
npm run devgod:setup:local
npm run devgod:doctor
npm run devgod:verify:setup
```

Important:

- installed repos get the `devgod:*` script names
- this source repo uses shorter package-maintainer names like `setup:local`, `doctor`, and `status`
- `--with-grafana` adds Grafana MCP wiring only; it does not install Grafana

## 🧰 Command Surfaces

### Source repo commands

Common package-maintainer commands in this repo:

```bash
npm run devgod -- help
npm run setup:local
npm run doctor
npm run status
npm run ops
npm run devgod -- report --run-id latest
npm run devgod -- coverage --run-id latest --format text
npm run devgod -- gaps --run-id latest --format text
npm run devgod -- checkpoint --input /absolute/path/to/checkpoint.json
npm run devgod -- resume --run-id latest
npm run devgod -- workflow-proof --run-id latest --task-id <task-id>
npm run devgod -- daemon --format text
npm run devgod -- supervisor --format text
npm run devgod -- supervisor-history --format text
npm run devgod -- plan-context --query "what still matters here?"
npm run export:docs
npm run mcp
npm run ui
```

Common command families exposed through `npm run devgod -- ...` include `status`, `ops`, `report`, `coverage`, and `gaps`.

Other important source-repo scripts that really exist today:

- `npm run install:project -- init --apply --target /absolute/path/to/project`
- `npm run scaffold:workflow`
- `npm run seed:happy-path-fixture`
- `npm run test:properties`
- `npm run eval:promptfoo:maintainer-boundary`
- `npm run test:mutation:maintainer-boundary:dry-run`
- `npm run verify:setup`
- `npm run verify:workflow`
- `npm run verify:release-overlay`
- `npm run verify:migrations:live`

### Installed repo commands

After installation, a consuming repo gets repo-local `devgod:*` scripts. Common ones are:

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
npm run devgod:daemon
npm run devgod:supervisor
npm run devgod:supervisor-history
npm run devgod:recover
npm run devgod:seed-workflow-proof
npm run devgod:seed-modernization-proof
npm run devgod:verify:review-identity
npm run devgod:export-docs -- "summarize what we worked on today"
```

Installed repos also get:

- `devgod:checkpoint`
- `devgod:resume`
- `devgod:advance-active-task`
- `devgod:reconcile`
- `devgod:sync-runtime-exports`
- `devgod:plan-context`
- `devgod:refresh-retrieval`
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

### Optional Grafana log access

When a consuming repo is installed with `--with-grafana`, DevGod adds a local Grafana MCP server entry and a `devgod:grafana:mcp` script. The MCP server reads connection settings from `.env.devgod`.

Required connection settings:

- `DEVGOD_GRAFANA_URL`
- `DEVGOD_GRAFANA_LOGS_DATASOURCE_UID`
- one auth mode: `DEVGOD_GRAFANA_TOKEN` or `DEVGOD_GRAFANA_USERNAME` plus `DEVGOD_GRAFANA_PASSWORD`

Optional settings:

- `DEVGOD_GRAFANA_ORG_ID`
- `DEVGOD_GRAFANA_LOKI_TENANT_ID`
- `DEVGOD_GRAFANA_TIMEOUT_MS`

Installed repos can validate the wiring with:

```bash
npm run devgod:grafana:mcp
```

Grafana logs are advisory evidence for debugging and research. They do not replace runtime workflow proof, authenticated reviews, or repo-local verification.

## 💡 Why It Feels Different

Devgod is opinionated about a few things:

- the root thread should act like an engineering manager, not a solo autocomplete
- substantive work should leave artifacts behind
- review gates should exist even when one human is driving the session
- runtime state should outrank chat confidence
- "continue until complete" should mean bounded repair loops and explicit blockers, not infinite retries

## 🚧 Current Boundaries

Important boundaries that still apply:

- consuming repos still need their own runtime setup, review identity backend, and authenticated workflow proof
- runtime rows remain the authority boundary over markdown exports
- the package can ship modernization-mode logic and proofs, but rewrite readiness in a target repo still depends on that repo's own evidence
- redesign docs describe the operating model and roadmap, not a guarantee that every installed repo already satisfies it

## 🛡️ Release Posture

Devgod still ships a careful `repo-local release posture`.

Use these `production-oriented package checks` as evidence about the package itself:

- `npm run verify:release-overlay`
- `npm run verify:migrations:live`

Maintainer-only quality tooling stays in this source repo and does not ship into consuming repos:

- `npm run test:properties`
- `npm run eval:promptfoo:maintainer-boundary`
- `npm run test:mutation:maintainer-boundary:dry-run`

Do not treat those checks alone as `any claim that a consuming repo is fit for production use`.
That still depends on the target repo, its runtime wiring, its review identity setup, and its own operational decisions.

## 📚 Docs Map

- [docs/current-state.md](docs/current-state.md): plain-language snapshot of what DevGod is today
- [docs/global-setup.md](docs/global-setup.md): source repo versus consuming repo setup notes
- [docs/large-repo-modernization-mode.md](docs/large-repo-modernization-mode.md): modernization-mode design and shipped rollout status
- [docs/autonomous-execution-redesign.md](docs/autonomous-execution-redesign.md): broader redesign contract and architecture direction
- [docs/codex-automation-surface-integration-plan.md](docs/codex-automation-surface-integration-plan.md): automation-provider design that informed the shipped integration
- [docs/devgod-goal-gap-audit.md](docs/devgod-goal-gap-audit.md): historical gap audit context
- [docs/benchmarks/orchestration-benchmark.md](docs/benchmarks/orchestration-benchmark.md): orchestration benchmark notes
- [docs/maintainers/quality-tooling.md](docs/maintainers/quality-tooling.md): maintainer-only regression tooling boundaries

## 🗂️ Repo Layout

```text
src/         runtime, installer, MCP, UI, exports, store
scripts/     setup, install, verification, workflow checks
.agents/     devgod skills
.codex/      devgod agent profiles and config
.devgod/     rules, templates, memory docs, package-maintainer workflow state
docs/        current state, setup notes, redesign, modernization, benchmarks
tests/       package verification and regression coverage
plugins/     packaged hook/plugin surfaces
```

## 🧪 Honest Pitch

Devgod is trying to turn:

`AI coding assistant`

into:

`small engineering org with runtime state, process, and receipts`

Right now the honest description is:

- reusable package
- workflow controller
- runtime-backed evidence system
- Codex overlay for repository work

Not magic. Just stricter operating rules and better proof for model-driven work.
