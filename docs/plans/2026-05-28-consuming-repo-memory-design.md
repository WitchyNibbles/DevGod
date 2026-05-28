# Consuming-Repo Memory Design

## Goal

Make DevGod materially smarter inside consumed repos by reusing stable repo-local operational context and recurring operator preferences without repeatedly asking the user or re-exploring the filesystem.

## Why current DevGod still forgets

Current DevGod already has strong memory primitives, but they are not shaped for this specific job:

- reviewed repo memory in `.devgod/memory/` is durable and inspectable, but it is optimized for reviewed lessons and policy, not for machine-usable operational defaults such as virtualenv paths
- `memory_entries` supports project-scoped retrieval, metadata, and embeddings, but it does not yet model stable repo-context slots with replacement semantics
- `runtime_project_registrations.manifest` already stores derived runtime metadata such as retrieval freshness, but it is not yet used as a reusable repo-context profile
- Qdrant currently accelerates artifact retrieval, but it is not yet used to retrieve structured repo-context facts

The result is that DevGod has memory infrastructure, but no first-class repo-context layer. So it keeps re-discovering things such as:

- "use this branch and PR workflow in this repo"
- "use this environment variable to decide which Django DB to target"
- "the virtualenv lives here"
- "use this recurring command for this repo"

## Current repo facts

These are based on the current source tree:

- reviewed repo memory is explicitly primary over shared backend retrieval in [.devgod/memory/README.md](/home/gii/apps/lexer/DevGod/.devgod/memory/README.md:1) and [.devgod/rules/memory-promotion.md](/home/gii/apps/lexer/DevGod/.devgod/rules/memory-promotion.md:1)
- project memory already lives in PostgreSQL `memory_entries` with `metadata jsonb`, embeddings, and project scope in [src/sql/migrations/001_initial_schema.sql](/home/gii/apps/lexer/DevGod/src/sql/migrations/001_initial_schema.sql:134)
- runtime registrations already carry a mutable `manifest jsonb` and provenance in [src/sql/migrations/010_runtime_registration_and_migration_journals.sql](/home/gii/apps/lexer/DevGod/src/sql/migrations/010_runtime_registration_and_migration_journals.sql:1)
- retrieval already combines PostgreSQL search with Qdrant artifact matches in [src/store/postgres-store.ts](/home/gii/apps/lexer/DevGod/src/store/postgres-store.ts:1109) and [src/store/postgres-memory-search.ts](/home/gii/apps/lexer/DevGod/src/store/postgres-memory-search.ts:79)
- Qdrant points already support payload filters such as `projectId`, roles, and tags in [src/store/qdrant-artifact-index.ts](/home/gii/apps/lexer/DevGod/src/store/qdrant-artifact-index.ts:1)

## Source-backed findings

### 1. Use both a profile and a collection

LangChain's current memory guidance distinguishes:

- a continuously updated profile for well-scoped facts
- a collection of memories for higher recall and narrower facts

Source: [LangChain memory overview](https://docs.langchain.com/oss/python/concepts/memory) and [long-term memory](https://docs.langchain.com/oss/python/langchain/long-term-memory).

Fit for DevGod:

- repo operational facts should be a profile
- recurring preferences, lessons, and conventions should stay a collection

### 2. Keep structured memory in JSONB and use atomic replacement

PostgreSQL's current docs recommend `jsonb` when efficient processing and indexing matter, and `INSERT ... ON CONFLICT DO UPDATE` gives an atomic upsert path.

Sources:

- [PostgreSQL JSON types](https://www.postgresql.org/docs/16/datatype-json.html)
- [PostgreSQL INSERT / ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html)

Fit for DevGod:

- a repo-context profile can live safely in `runtime_project_registrations.manifest`
- later slot-specific tables, if needed, should use atomic upserts rather than append-only duplication

### 3. Use Qdrant for filtered retrieval, not raw semantic guessing

Qdrant's current docs emphasize payload indexes and full-text indexes for combining vector search with structured filters and efficient query planning.

Sources:

- [Qdrant indexing](https://qdrant.tech/documentation/manage-data/indexing/)
- [Qdrant text search](https://qdrant.tech/documentation/search/text-search/)
- [Qdrant filtering](https://qdrant.tech/documentation/search/filtering/)

Fit for DevGod:

- if DevGod indexes repo-context facts in Qdrant, it should do so with explicit payload fields such as `projectId`, `slotKey`, `contextKind`, `freshness`, and `sourceKind`
- Qdrant should accelerate retrieval after DevGod already has structured slot semantics, not replace them

## Proposal

### Layer 1: Repo Context Profile

Add a machine-readable, repo-scoped `repoContextProfile` under `runtime_project_registrations.manifest`.

This profile is:

- derived
- rebuildable
- freshness-checked
- repo-scoped only
- not canonical policy by itself

It should hold deterministic, high-signal operational defaults such as:

- `python.virtualenvPath`
- `python.packageManager`
- `django.managePyPath`
- `django.dbEnvSelectorVariable`
- `git.publishWorkflow.sourceBranchPolicy`
- `git.publishWorkflow.targetBranches`
- `git.publishWorkflow.createDraftPr`
- `git.publishWorkflow.prBodyStyle`
- `commands.test`
- `commands.lint`

Each slot should store:

- `value`
- `sourceKind`: `derived_file`, `user_confirmed`, or `reviewed_memory`
- `sourceRefs`
- `capturedAt`
- `lastValidatedAt`
- `staleAfterDays`
- `confidence`
- `replacementPolicy`

This solves the recurring-path problem without pretending that runtime metadata is policy.

### Layer 2: Reviewed Durable Memory Collection

Keep durable preferences, lessons, and reusable conventions in reviewed repo memory plus `memory_entries`.

Use metadata conventions, not a new table in slice one:

- `memoryClass`: `semantic_preference`, `workflow_convention`, `lesson`, `decision`
- `slotKey`: for memories that refine or override a specific repo-context slot
- `supersedes`
- `contradicts`
- `retrievalRoles`
- `staleAfterDays`

Examples:

- "When publishing from this repo, push once and open PRs to `main` and `release` from the same dev branch."
- "Do not create PRs as drafts in this repo."
- "Do not mention Codex in PR copy for this repo."

This layer remains inspectable and reviewable, which matches current DevGod policy.

### Layer 3: Startup Hydration

Before planning, execution, or asking clarifying questions about repo mechanics, DevGod should auto-hydrate fresh repo context.

Order:

1. load `repoContextProfile`
2. load reviewed memory entries that refine matching slots
3. fall back to filesystem probing only for missing, stale, or contradicted slots
4. ask the user only if the ambiguity remains after the first three steps

This is the behavior change the user actually wants. The key gain is not “more memory exists,” but “the agent stops re-discovering already-known repo facts.”

### Layer 4: Capture Policy

DevGod should auto-identify high-signal things to remember, but only under bounded rules.

#### Auto-capture

Auto-capture only when one of these is true:

- deterministic repo probe found it
- the same correction was provided repeatedly across runs
- the user explicitly said to remember it

High-signal auto-capture targets:

- environment selectors
- executable paths
- recurring commands
- git/PR publishing conventions
- stable repo-specific workflow caveats

Do not auto-capture:

- one-off debugging steps
- speculative future plans
- transient branch names
- secrets
- task-local scratch context

### Layer 5: Replace-versus-task-only flow

When the user says "remember this" and DevGod detects an existing slot or close match, DevGod should ask one narrow question:

- is this only for the current task
- or should it replace the repo default

If there is no existing slot and the instruction is clearly repo-scoped, DevGod can store it directly and report what it stored.

## Retrieval behavior

### How retrieval should change

Current retrieval already ranks project-scoped results well, but the missing piece is query intent.

DevGod should first classify the need:

- deterministic repo context request
- durable preference request
- general semantic recall

Then:

- deterministic repo context requests should query the profile first
- preference requests should query reviewed memory with slot-aware metadata filters
- general semantic recall can continue using the current PostgreSQL plus Qdrant path

### How Qdrant should be used later

After the profile exists, Qdrant can index repo-context fact documents with payload indexes on:

- `projectId`
- `slotKey`
- `contextKind`
- `freshnessStatus`
- `sourceKind`
- `tags`

That allows semantic queries such as "which env variable switches Django to prod DB" without scanning every artifact.

## Proposed first slice

Do not start with a new table.

Start with:

1. extend `runtime_project_registrations.manifest` with `repoContextProfile`
2. add a deterministic `refresh-repo-context` step or fold it into retrieval refresh
3. add startup hydration before planning/execution
4. allow reviewed memory entries to refine specific `slotKey`s
5. add the minimal explicit remember/replace flow

This slice is small, reversible, and fits the current trust model.

## Deterministic probes for slice one

Focus on a bounded set of signals:

- `.venv`, `venv`, `pyvenv.cfg`, Poetry, Pipenv, Hatch, tox
- `manage.py`, Django settings modules, env-loading helpers, `os.getenv(...)`, `env(...)`, `decouple`, `django-environ`
- `Makefile`, `package.json`, `justfile`, `Taskfile.yml`, CI commands
- local workflow docs and reviewed memory for branch/PR conventions

The first slice should not try to infer everything from arbitrary chat transcripts.

## Suggested user-visible behavior

Examples of the resulting behavior:

- If DevGod already knows `DJANGO_DB_ENV` selects the target DB, it should use that fact on the next Django task instead of rediscovering it.
- If DevGod already knows the repo uses `/opt/project/.venv`, it should use that path immediately unless the profile is stale.
- If the user once confirms "open non-draft PRs to `main` and `release` and do not mention Codex," DevGod should reuse that convention for later publish requests in the same repo.

## Acceptance criteria for implementation

- DevGod stops re-discovering stable repo context on repeated tasks in the same repo.
- Repo-context facts are freshness-checked and provenance-bearing.
- Reviewed repo memory still outranks runtime-derived hints.
- Explicit user remember/replace requests are handled safely.
- Unrelated cross-repo memory is not stored.

## Implementation status on 2026-05-28

The first runtime slice from this design is now implemented in the package repo.

Shipped pieces:

- `repair-task-queue` rewrites the known legacy `implementation_slice` alias in already-installed consuming repos
- `refresh-repo-context` stores a derived `repoContextProfile` in `runtime_project_registrations.manifest`
- the initial deterministic slots cover virtualenv path, `manage.py`, Django DB selector variable, and common package scripts
- planning context now hydrates repo context and auto-refreshes it when the stored profile is stale
- installed setup scripts now refresh repo context before retrieval refresh

Still pending relative to the full design:

- reviewed memory entries refining specific `slotKey`s
- explicit replace-versus-task-only remember flow
- richer git/PR convention capture
- optional Qdrant indexing for structured repo-context facts

## Risks and mitigations

### Risk: stale repo context

Mitigation:

- store per-slot freshness and source refs
- invalidate or degrade confidence when repo fingerprints change

### Risk: hidden authority drift

Mitigation:

- keep runtime profile explicitly derived
- let reviewed memory override it
- show provenance in any planning-context report

### Risk: over-capturing noisy instructions

Mitigation:

- require deterministic evidence, repetition, or explicit user intent
- default one-off instructions to task scope

## Rollout sequence

### Phase 1

Derived repo-context profile plus startup hydration.

### Phase 2

Explicit remember/replace flow plus recurrence detector for repeated user corrections.

### Phase 3

Qdrant indexing and ranking improvements for structured repo-context recall.

### Phase 4

Evaluation coverage for freshness, replacement behavior, and repeated-task latency reduction.

## Recommendation

Implement the profile-plus-reviewed-memory split first. It directly addresses the user's examples, reuses current PostgreSQL and retrieval surfaces, keeps Qdrant in the right role, and does not require a core DevGod authority redesign.
