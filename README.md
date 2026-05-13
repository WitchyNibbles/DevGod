# devgod

`devgod` is a witchy, manager-led operating layer for Codex that can be installed into a new or existing project, bringing along the rules, skills, setup scripts, and shared-core runtime it needs to work.

## Quick Start

This repo is the source of truth. Keep it cloned on the same machine as any project you want to bless with `devgod`.
The shipped posture is an opt-in overlay with production-oriented package checks.

Phase 5 install contract:

- the supported installer is host-run from a checked-out `devgod` repo or unpacked package copy
- the installer merges files and prints next steps; it does not run `npm install`, Docker, migrations, or bootstrap side effects
- the target project gets a local `file:` dev dependency pointing back to the source path you ran from
- the direct Node CLI has an explicit `init --apply` mutating path and `init --dry-run` no-write path
- the legacy direct CLI form without `init` is dry-run-only compatibility; it must not write
- the package remains `private`; use `npm pack --dry-run` as the packaging smoke check for this phase, not npm publish

Host prerequisites:

- Node.js `>=22`
- `npm`
- Bash for `scripts/install-devgod.sh`, or PowerShell for `scripts/install-devgod.ps1`
- Docker only if you later choose the shipped local setup path
- a clone of this repo in a stable local path, or an unpacked package copy with the same installer assets

Supported CLI inventory:

- `npm run install:project -- init --apply --target /absolute/path/to/project`
- `node --experimental-strip-types src/install/cli.ts init --apply --target /absolute/path/to/project`
- `node --experimental-strip-types src/install/cli.ts init --dry-run --target /absolute/path/to/project`
- `node --experimental-strip-types src/install/cli.ts --dry-run --target /absolute/path/to/project`
- `npm run doctor`

Legacy note:

- bare direct invocation without `init`, such as `node --experimental-strip-types src/install/cli.ts --target /absolute/path/to/project`, is rejected for writes
- `init --apply` is the only mutating direct CLI path

Fast path:

1. Clone this repo somewhere permanent.
2. Install `devgod` into the target project.
3. In the target project, run `npm install`.
4. If you want the shipped local Docker bootstrap path, run `npm run devgod:setup:local`.
5. Use `npm run devgod:doctor` and `npm run devgod:verify:setup` as the blocking runtime proof after you intentionally run the setup/bootstrap path. `doctor` now works before the repo has any run history; review-identity findings stay advisory until you wire a live adapter.

## Install Into An Existing Project

Direct Node entrypoint:

```bash
npm run install:project -- init --apply --target /absolute/path/to/existing-project
```

No-write report:

```bash
node --experimental-strip-types src/install/cli.ts init --dry-run --target /absolute/path/to/existing-project
```

Then move into the target repo and finish the setup:

```bash
cd /absolute/path/to/existing-project
npm install
```

Optional local bootstrap path:

```bash
npm run devgod:setup:local
npm run devgod:doctor
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
npm run install:project -- init --apply --target /absolute/path/to/new-project
```

Then finish setup inside the new project:

```bash
cd /absolute/path/to/new-project
npm install
```

Optional local bootstrap path:

```bash
npm run devgod:setup:local
npm run devgod:doctor
```

## What The Installer Changes

The installer is merge-aware. It tries to graft `devgod` into a repo without flattening the local house.

It will:

- append or refresh a managed `devgod` block in `AGENTS.md`
- merge `.codex/config.toml` additively instead of replacing unrelated values
- install repo-local agent profiles under `.codex/agents/devgod-*.toml`
- install repo-local skills under `.agents/skills/devgod-*/SKILL.md`
- install repo-local `.githooks/` and hook guard scripts for managed-control commit protection
- copy reusable `.devgod/rules/` and `.devgod/templates/`
- seed starter `.devgod/work/**/README.md` scaffolding
- seed `.devgod/memory/README.md` but not live reviewed memory entries
- install `.env.devgod.example`
- install `docker-compose.devgod.yml`
- install generated target-repo setup scripts at `scripts/devgod-setup.sh` and `scripts/devgod-setup.ps1`
- install the workflow gate checker at `scripts/check-devgod-workflow.sh`
- create `package.json` if missing, or merge `devgod` scripts into it if present
- add a local `file:` dev dependency pointing back to this source repo
- add `devgod` env ignore rules to `.gitignore`
- back up overwritten managed files into `.devgod/install-backups/`
- print a structured install report; in `--dry-run` mode that report is no-write

It will not:

- claim that package install also means host setup, Docker bootstrap, or review-trust wiring is complete
- run `npm install`, Docker, migrations, or bootstrap for you
- copy live `.devgod/work/` history from this source repo into the target repo
- copy reviewed durable memory content into the target repo
- invent project-specific policy for the target repo

## Setup After Install

Inside the target repo, `npm run devgod:setup:local` is the optional local bootstrap wrapper after install when you intentionally want the shipped Docker-first setup path. That path now provisions the local Postgres and Qdrant runtime services before it runs the repo bootstrap commands.

That command runs `src/install/setup-local.ts`, which dispatches to the generated target-repo setup script, and then does this:

1. creates `.env.devgod` from `.env.devgod.example` if needed
2. checks Docker availability
3. fills in sane defaults for the target repo path and project identity
4. starts `docker-compose.devgod.yml`
5. runs `npm install`
6. runs `npm run devgod:setup:git-guard` when the repo has an installed `devgod` manifest and git metadata
7. runs `npm run devgod:migrate`
8. runs `npm run devgod:bootstrap`
9. runs `npm run devgod:verify:setup`
10. leaves `npm run devgod:doctor` available for explicit runtime registration, data-root, Qdrant, and review-identity health checks

The shipped `npm run devgod:setup:local` path is Docker-first and always starts `docker-compose.devgod.yml` with the local Postgres and Qdrant services. That behavior is separate from the installer itself.

If you want the repo-local commit guard without the Docker/bootstrap path, run `npm run devgod:setup:git-guard` and then `npm run devgod:verify:git-guard`.

If you need a managed database today, use a dedicated non-production database, set the target repo environment explicitly, and run the admin commands manually:

```bash
npm run devgod:migrate
npm run devgod:bootstrap
npm run devgod:doctor
npm run devgod:verify:setup
npm run devgod:verify:migrations:live
```

Do not point this flow at a shared or production database unless that write path is explicitly intended and approved. `migrate` and `bootstrap` write schema and project state to `DEVGOD_CORE_DATABASE_URL`.

For intentional devgod overlay maintenance in a consuming repo, the git guard can be overridden for one commit with `DEVGOD_ALLOW_MANAGED_COMMITS=1 git commit ...`. Normal product commits should not need that escape hatch.

## Required Environment

The target repo uses `.env.devgod`, not this source repo's `.env`.

Required for the shipped `npm run devgod:setup:local` path:

- `DEVGOD_CORE_DATABASE_URL`
- `DEVGOD_QDRANT_URL`

Required if you run the admin commands manually:

- `DEVGOD_CORE_DATABASE_URL`
- `DEVGOD_PROJECT_SLUG`

Usually useful:

- `DEVGOD_WORKSPACE_SLUG`
- `DEVGOD_WORKSPACE_NAME`
- `DEVGOD_PROJECT_NAME`
- `DEVGOD_PROJECT_REPO_PATH`
- `DEVGOD_RUNTIME_PROFILE`
- `DEVGOD_RUNTIME_DATA_ROOT`
- `DEVGOD_POSTGRES_DB`
- `DEVGOD_POSTGRES_USER`
- `DEVGOD_POSTGRES_PASSWORD`
- `DEVGOD_POSTGRES_PORT`
- `DEVGOD_DOCKER_CONTAINER_NAME`
- `DEVGOD_QDRANT_COLLECTION`
- `DEVGOD_QDRANT_PORT`
- `DEVGOD_QDRANT_GRPC_PORT`
- `DEVGOD_QDRANT_CONTAINER_NAME`

Defaults in the shipped target-repo example and setup path:

- `DEVGOD_WORKSPACE_SLUG` defaults to `default` in `.env.devgod.example`
- `DEVGOD_PROJECT_REPO_PATH` defaults to the current target repo path
- `DEVGOD_PROJECT_SLUG` defaults to the target repo directory name
- `DEVGOD_PROJECT_NAME` defaults to `DEVGOD_PROJECT_SLUG`
- `DEVGOD_DOCKER_CONTAINER_NAME` defaults to `devgod-postgres-${DEVGOD_PROJECT_SLUG}`
- `DEVGOD_QDRANT_URL` defaults to `http://127.0.0.1:6333`
- `DEVGOD_QDRANT_COLLECTION` defaults to `devgod-memory`
- `DEVGOD_QDRANT_CONTAINER_NAME` defaults to `devgod-qdrant-${DEVGOD_PROJECT_SLUG}`

Credential note:

- `.env.devgod.example` now defaults to a loopback-only local password and loopback-bound ports for the shipped Docker path
- for any non-local database, use unique credentials and a dedicated database
- the shipped Docker compose path binds Postgres and Qdrant REST to `127.0.0.1` and does not publish Qdrant gRPC by default
- `DEVGOD_POSTGRES_PASSWORD` must not be left at the legacy `devgod` value when you run the local setup wrapper
- `.env.devgod` is meant to stay private and ignored by git

## Operate With Codex

If a target repo has `devgod` installed but not configured, a Codex agent should:

1. check for `.env.devgod`
2. run `npm install` if dependencies are missing
3. run `npm run devgod:setup:local`
4. use `npm run devgod:doctor` and `npm run devgod:verify:setup` as the blocking runtime proof
5. treat `devgod:doctor` review-identity warnings as advisory until the repo replaces the shipped adapter stub

Once the repo is configured, the intended operating rhythm is:

- substantive requests become `devgod` work by default unless the user opts out
- the root thread acts as the manager on first contact
- `.devgod/ACTIVE` is the canonical current-task marker during substantive work
- active briefs, plans, tasks, and reviews live under `.devgod/work/`
- repo-local rules live under `.devgod/rules/`
- reviewed durable memory lives under `.devgod/memory/`
- repo-local skills live under `.agents/skills/devgod-*`
- reviewer, QA, and security gates block completion for substantive work
- `bash scripts/check-devgod-workflow.sh --task-id <task-id>` is the workflow-integrity proof before a substantive completion claim

If Codex is deciding how to bootstrap a repo, the `devgod-setup` skill is the preferred setup path.

## Trusted Review Identity Resolution

The package now ships a provider-agnostic trust kit for review and waiver authz. Use it instead of trusting raw request-body actor claims.

The package-owned pieces are:

- `createReviewPrincipalAdapter(...)`
- `createReviewActionContextResolver(...)`
- `loadReviewIdentityBindings(...)`
- `loadReviewIdentityFixtures(...)`
- `verifyReviewIdentityAdapter(...)`
- `validateReviewIdentityBindings(...)`
- `validateReviewIdentityFixtures(...)`
- `.devgod/rules/review-identity-policy.md`
- `.devgod/templates/review-identity-bindings.json`
- `.devgod/templates/review-identity-adapter.fixture.json`

The consuming repo still owns principal authentication. The package owns how an authenticated principal maps to allowed `devgod` review actors, review roles, and waiver authorities.

Minimal server-side pattern:

```ts
import {
  DevgodCoreService,
  createReviewPrincipalAdapter,
  createReviewActionContextResolver,
  loadReviewIdentityBindings
} from "devgod/src/index.ts";

const reviewIdentityBindings = await loadReviewIdentityBindings(
  ".devgod/review-identity-bindings.json"
);

const reviewIdentityAdapter = createReviewPrincipalAdapter(async ({ authContext }) => {
  const session = authContext as {
    provider?: string;
    userId?: string;
    verified?: boolean;
    email?: string;
  };

  if (session.verified !== true || !session.provider || !session.userId) {
    throw new Error("missing verified server-side session");
  }

  return {
    provider: session.provider,
    subject: session.userId,
    verified: true,
    email: session.email
  };
});

const service = new DevgodCoreService(store, {
  resolveReviewActionContext: createReviewActionContextResolver({
    bindings: reviewIdentityBindings,
    async resolveAuthenticatedPrincipal(input) {
      return reviewIdentityAdapter({
        ...input,
        authContext: await requireTrustedSessionForRequest()
      });
    }
  })
});
```

Binding file shape:

```json
{
  "bindings": [
    {
      "principal": {
        "provider": "github",
        "subject": "alice"
      },
      "actors": [
        {
          "actor": "alice-reviewer",
          "roles": ["reviewer"]
        },
        {
          "actor": "alice-release-manager",
          "roles": ["qa_engineer"],
          "waiverAuthorities": ["manager"]
        }
      ]
    }
  ]
}
```

Trust-boundary rules:

- authenticate the principal before calling `recordReview`
- keep authenticated-principal extraction in a repo-owned adapter module, not in request-body parsing
- keep the binding file server-owned and reviewed in git
- keep review-identity fixtures reviewed in git and replay them through the package verifier
- never derive review authority from raw request body fields alone
- fail closed when the principal is unverified, unbound, or requests an unauthorized role
- treat waiver authority as explicit policy, not as an implication of a broad admin role

Installed target repos also get:

- `npm run devgod -- status` as the single default runtime entrypoint
- `npm run devgod:status -- --run-id <run-id>`
- `npm run devgod:ops -- --run-id <run-id>` or `npm run devgod:ops -- --run-id latest --format text`
- `npm run devgod:recover -- --run-id <run-id>` for advisory recovery inspection
- `npm run devgod:report -- --run-id <run-id>` for an evidence-first run report
- `npm run devgod:plan-context -- --query "<topic>"` for planner-facing retrieval summaries
- `npm run devgod:github-dispatch -- --input .devgod/github-event.json` for GitHub-originated intake
- `npm run devgod:mcp` for a packaged stdio MCP server exposing devgod runtime tools
- `npm run devgod:ui` for a local hosted operator UI over the same runtime surfaces
- `npm run devgod:seed-happy-path-fixture -- --task-id fixture-<name>`
- `.devgod/review-identity-bindings.json`
- `.devgod/review-identity-adapter.fixture.json`
- `devgod/review-identity-adapter.ts`
- `npm run devgod:verify:review-identity`
- `npm run devgod:record-review`

The installed adapter stub fails closed until you replace it with real server-side principal lookup. It now supports multiple named backends through `reviewIdentityAdapters` plus `DEVGOD_REVIEW_IDENTITY_BACKEND`, so consuming repos can keep one reviewed adapter module while selecting different authenticated principal sources in different environments. The verifier command loads your adapter, reviewed bindings, and reviewed fixtures, then exits nonzero if an allow/deny case is bypassed.

Live review recording uses `record-review`, not the verifier path. It requires a real `DEVGOD_REVIEW_IDENTITY_ADAPTER_MODULE`, a reviewed `.devgod/review-identity-bindings.json`, and a JSON input payload such as:

```json
{
  "runId": "run-123",
  "taskId": "task-abc",
  "actor": "alice-reviewer",
  "review": {
    "reviewerRole": "reviewer",
    "state": "passed",
    "severity": "low",
    "findings": []
  },
  "authContext": {
    "provider": "github",
    "subject": "alice",
    "verified": true
  }
}
```

The live command rejects the shipped template bindings and copied placeholder bindings. Verification fixtures are for policy replay only; they never satisfy live review authority.

The shipped templates are starting points, not live policy. Review the bindings and fixtures, implement the adapter, and keep all three under normal repo review.

`status` prints a single operator report with explicit authority labels. Runtime rows and active locks are marked `runtime_authoritative`; freshness, blockers, next-task suggestions, and review-identity posture are marked `derived_only`. If the reviewed bindings file is malformed, `status` degrades to a derived warning instead of failing closed. `ops` builds on top of that with routing, recovery, alerts, and next actions in one text-first operator dashboard. `recover` inspects stale tasks, stale review queues, stale approvals, and orphan locks; `--apply-safe` only performs fail-closed state repairs such as lock release, stale-task reset, and stale-approval reblocking.

`devgod` is now the packaged default command surface for installed repos. Use `npm run devgod -- <command>` when you want one stable entrypoint that routes between runtime and install flows. The wrapper loads `.env.devgod` automatically for runtime commands when the file is present, keeps the devgod workflow implicit by default, and only yields control when the user explicitly chooses another tool or mode.

The operator surface now includes:

- `report` for a timeline-oriented evidence bundle across run status, routing, recovery, handoffs, reviews, and approvals
- `plan-context` for retrieval-backed planning context with authority, freshness, and citation labels
- `github-dispatch` for turning GitHub issue or PR payloads into canonical `.devgod/work` artifacts without granting GitHub workflow authority

The transport surface now also includes:

- `mcp` for a packaged stdio MCP server built on `@modelcontextprotocol/sdk`
- `serve-ui` for a local hosted operator UI with `/api/status`, `/api/ops`, and `/api/report` endpoints plus a static dashboard

The first MCP slice is intentionally read-only. It exposes runtime status, ops, report, and planning-context tools without widening workflow authority or introducing generic command execution.

GitNexus can be layered on top as optional repo intelligence. `status` and `ops` now surface GitNexus readiness and freshness as derived advisory state only; they do not give GitNexus any workflow, review, or completion authority. If you use GitNexus with a `devgod` repo, prefer `npx gitnexus analyze --skip-agents-md` so the index refresh does not rewrite managed `AGENTS.md` content.

Optional GitNexus setup for installed repos:

```bash
node --experimental-strip-types src/install/cli.ts init --apply --with-gitnexus --target /path/to/repo
cd /path/to/repo
npm install
npm run devgod:gitnexus:analyze
```

The opt-in installer path adds a project-local GitNexus package pin, a `.codex/config.toml` MCP block that runs `npx --no-install gitnexus mcp`, `.gitnexus/` ignore rules, and helper scripts without granting GitNexus any review or workflow authority.

`devgod` also ships a publishable benchmark/report path:

- `npm run eval:orchestration` for runtime baseline cases
- `npm run benchmark:orchestration` for the scored comparison report
- [docs/benchmarks/orchestration-benchmark.md](/home/eimi/projects/devgod/docs/benchmarks/orchestration-benchmark.md) for the checked-in markdown snapshot

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
npm run verify:release-overlay
npm run verify:workflow
npm run verify:migrations:live
npm run mcp
npm run ui
npm test
npm run typecheck
```

## Production Overlay Release Posture

This roadmap now concludes at a repo-local release posture. `devgod` is an opt-in overlay for consuming repos, and this source repo only proves production-oriented package checks plus trusted review/auth contract checks. It does not claim live production readiness for a downstream deployment.

The repo-local release overlay proof is:

- `npm run verify:release-overlay`
- CI `test` on Ubuntu
- CI `migration-replay` against a dedicated CI database
- CI `windows-setup-smoke` for the generated PowerShell bootstrap path

`npm run verify:release-overlay` runs tests, typecheck, workflow-fixture validation, `npm audit --omit=dev`, `npm pack --dry-run`, and review-identity verification. The CI `test` job adds `npm run check:coverage` ahead of that helper so pull requests still block on aggregate coverage regressions at the repo's 80% floor. `npm run verify:migrations:live` remains the separate live-database replay proof and should use a dedicated local or CI database, not a shared or production instance.

Operator approvals and downstream repo choices still own:

- installing the overlay into a target repo
- target-repo environment files and secrets
- database targets and bootstrap intent
- deploy pipelines and runtime hosting
- any claim that a consuming repo is fit for production use

Release path assumptions:

- this repo is still installed as a local `file:` dependency from a checked-out source clone
- CI hardens the verify path with pinned Actions, read-only workflow tokens, `npm ci`, and production-oriented package checks via `npm pack --dry-run`
- if a future publish workflow is added, it should use trusted publishing/provenance with job-scoped write permissions only for the publish step

`npm run verify:migrations:live` is the live-database replay proof. It reruns migrations for idempotence, checks database health, bootstraps a project, and re-verifies the required schema surface. Use a dedicated local or CI database for that command, not a shared or production instance.

## Architecture In Brief

The spellbook has three layers:

1. `Codex interaction layer`
   The user speaks to Codex. Requests are treated as real work by default, not as toy prompts waiting for a magic keyword.
2. `Repo-local control layer`
   Each consuming repo keeps its own `AGENTS.md`, `.devgod/rules/`, `.devgod/work/`, `.devgod/memory/`, and repo-local skills.
3. `Shared backend layer`
   The shared core stores runs, task graphs, locks, reviews, approvals, retrieval metadata, and runtime registration state in Node/Postgres with `pgvector`, while the local runtime keeps Qdrant configuration machine-local and replayable.

Source-of-truth split:

- repo markdown: reviewed project policy, durable decisions, patterns, and lessons
- Postgres: live operational state, audit trail, and runtime registration state
- Qdrant: local vector retrieval collections and runtime-managed collection configuration
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

This is the Phase 5 opt-in overlay. It now includes a packaged `devgod` wrapper, operator evidence reporting, retrieval-backed planning context, advisory GitHub intake scaffolding, a packaged stdio MCP server, and a minimal hosted operator UI. It does not yet include:

- production deployment manifests for the shared service
- a remote or authenticated Streamable HTTP MCP deployment surface
- a multi-user hosted operator product with auth, persistence, and richer UX flows
- extra coordinator roles such as `scrum_master` or `test_director`

Repo markdown retrieval is now available through the admin surface:

- `node --experimental-strip-types src/admin.ts index-repo-markdown [repo-root]`
- `DEVGOD_REPO_MARKDOWN_INCLUDE=README.md,AGENTS.md,docs,.devgod,.agents/skills` controls the allowlist
- `DEVGOD_EMBEDDING_MODEL=devgod-local-hash-1536` enables the shipped local deterministic embedding path
- `node --experimental-strip-types src/admin.ts run-embedding-jobs [limit]` writes vectors for queued chunks and syncs artifact vectors into Qdrant
- `node --experimental-strip-types src/admin.ts plan-context --query "<topic>"` now derives a query embedding when `DEVGOD_EMBEDDING_MODEL` is configured, then uses Qdrant-backed artifact recall plus canonical Postgres hydration

GitHub intake templates now ship in `.devgod/templates/`:

- `github-dispatch-event.example.json` for local dry runs
- `github-dispatch-workflow.yml` as a starter GitHub Actions workflow that persists the event payload and hands it to `devgod:github-dispatch`

## Design Rules

- no silent policy mutation
- no direct worker writes to shared state outside the service layer
- no completion without explicit review and verification
- no secrets in repo memory or checked-in workflow artifacts
