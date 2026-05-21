# Large-Repo Modernization Mode

Status date: `2026-05-21`

Implementation progress:

- slice 1 complete: modernization profile and readiness gates
- slice 2 complete: repo cartography and ledger export surfacing
- slice 3 complete: invariant-aware runtime evidence and coverage/report verification
- slice 4 complete: duplicate-family runtime records, ledger export, and summary counts
- slice 5 complete: architecture decisions, migration ledgers, and parity-matrix runtime evidence
- slice 6 complete: installed-repo modernization harness proof using a self-contained installed-package runtime fixture

This document describes how DevGod should investigate and modernize large brownfield repositories without losing business-logic detail or claiming rewrite readiness too early.

## Why this is needed

The current repo already improved analysis depth, coverage ledgers, runtime traces, and orchestration honesty. That work materially raised the floor. But large-repo modernization still has a critical remaining gap:

- the current inventory generator in `src/runtime/repo-inventory.ts` is still mostly file- and heuristic-signal-driven
- that is good enough to seed coverage and expose ambiguity
- it is not yet strong enough to support migration-grade architecture redesign for large, interconnected codebases

For brownfield modernization, DevGod should not be allowed to jump from "core repo understood" to "safe redesign plan produced." It needs a stricter operating mode.

## Current repo gap

### What is already strong

- `docs/autonomous-execution-redesign.md` already defines coverage-ledger, trace, checkpoint, and continuation concepts
- `src/runtime/autonomous-execution.ts` already supports phase sequencing, thresholds, and "continue analysis" style fallback behavior
- `.devgod/rules/reasoning-quality.md` already requires explicit evidence, alternatives, and bounded skepticism

### What is still missing

- symbol-level and call-chain-level repo cartography
- explicit business-rule and invariant records
- duplicate behavior families and centralization candidates
- architecture-fit analysis driven by discovered bounded contexts and consistency needs
- typed database decomposition and migration ledgers
- product-level continuation that prioritizes remaining migration risk, not merely the next task card

## Source-backed findings

### 1. Modernization should be incremental, not big-bang

Martin Fowler's Strangler Fig pattern argues that important legacy systems are rarely safe to replace wholesale because existing behavior is harder to discover than it first appears, and gradual replacement lets investment and value arrive incrementally instead of on one risky cutover date.

Source:

- Martin Fowler, "Strangler Fig Application" — <https://martinfowler.com/bliki/StranglerFigApplication.html>

### 2. Large-scale replacement should use seams and abstractions

Fowler's Branch by Abstraction pattern fits centralization and subsystem replacement work especially well: create an abstraction, move callers to it, introduce the new implementation behind the same seam, compare behavior, then retire the legacy path.

Source:

- Martin Fowler, "Branch By Abstraction" — <https://martinfowler.com/bliki/BranchByAbstraction.html>

### 3. Architecture boundaries should come from domain boundaries, not technical folders

Microsoft's microservice/domain guidance says to start from bounded contexts and aggregates. That matters even if the target is not microservices, because it keeps decomposition aligned to business capabilities, persistence boundaries, and cohesion rather than to framework layers.

Sources:

- Microsoft Learn, "Identify microservice boundaries" — <https://learn.microsoft.com/en-us/azure/architecture/microservices/model/microservice-boundaries>
- Microsoft Learn, "Design a DDD-oriented microservice" — <https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice>

Inference:

For DevGod, "fit the architecture to the repo" should mean: discover bounded contexts first, then decide whether each one belongs in a modular monolith, extracted service, or hybrid seam.

### 4. Brownfield architecture decisions need an append-only decision trail

Microsoft's ADR guidance explicitly recommends starting ADRs for brownfield workloads, keeping them append-only, recording alternatives, tradeoffs, confidence, and superseding decisions rather than rewriting history.

Source:

- Microsoft Learn, "Maintain an architecture decision record" — <https://learn.microsoft.com/en-ie/azure/well-architected/architect-role/architecture-decision-record>

Inference:

Devgod should generate architecture decisions as first-class artifacts and keep them linked to the evidence that justified them.

### 5. Database decomposition requires CRUD and consistency analysis up front

AWS Prescriptive Guidance says database decomposition starts by working backward from organizational needs, then doing CRUD analysis, dependency mapping, consistency analysis, technical constraint review, risk review, and measurable success criteria before implementation planning.

Source:

- AWS Prescriptive Guidance, "Defining the scope and requirements for database decomposition" — <https://docs.aws.amazon.com/prescriptive-guidance/latest/database-decomposition/scope.html>

Inference:

A "new DB model plan" in DevGod should be blocked unless each affected model or table has ownership, readers/writers, consistency class, migration path, and rollback metadata.

### 6. Schema migration should be expand/migrate/contract

Prisma's production migration guidance recommends expand-and-contract migrations so schema changes stay non-breaking while data is backfilled and application reads/writes are moved safely.

Source:

- Prisma docs, "Expand-and-contract migrations" — <https://www.prisma.io/docs/guides/database/data-migration>

Inference:

Devgod should default DB modernization work to additive schema changes, backfill, dual-read/write or compatibility windows where needed, and only then contract the old shape.

### 7. Static analysis is necessary but insufficient

OpenTelemetry's instrumentation docs recommend both code-based and zero-code instrumentation, which is directly relevant to brownfield discovery because some runtime behavior is visible only through observation. CodeQL's JavaScript documentation also explicitly says static call graph construction is approximate and can be incomplete or imprecise.

Sources:

- OpenTelemetry, "Instrumentation" — <https://opentelemetry.io/docs/concepts/instrumentation/>
- CodeQL docs, "CodeQL library for JavaScript" — <https://codeql.github.com/docs/codeql-language-guides/codeql-library-for-javascript/>

Inference:

DevGod should record uncertainty classes for static maps and require runtime traces for high-risk or ambiguous flows.

## Recommended operating model

## 1. Add a dedicated modernization profile

Add a new profile, for example `modernization_program`, instead of stretching the current `legacy_rewrite` profile. Its purpose is explicit:

- understand the old system deeply enough to preserve behavior intentionally
- choose the target architecture from evidence, not fashion
- migrate incrementally
- centralize duplicated capabilities safely
- keep going until coverage, parity, and review gates say the program is done

Mandatory artifact classes:

- repo map
- symbol graph
- call graph
- dependency graph
- domain map
- invariants ledger
- duplicate families ledger
- architecture decisions
- DB migration ledger
- parity verification matrix

## 2. Gate the rewrite behind discovery subphases

Before architecture or migration sequencing unlocks, require these subphases:

1. repo cartography
2. dependency and call-path mapping
3. runtime evidence capture
4. business-rule and invariant extraction
5. duplicate and divergence analysis
6. architecture-fit analysis

If any critical subsystem is still only `discovered` or `partially_analyzed`, DevGod should refuse to enter modernization strategy.

## 3. Turn inventory into cartography

The current inventory model should grow from file discoveries into relationship-aware maps.

Suggested generated artifacts:

- `.devgod/work/coverage/symbol-graph.json`
- `.devgod/work/coverage/call-graph.json`
- `.devgod/work/coverage/dependency-graph.json`
- `.devgod/work/coverage/domain-map.json`
- `.devgod/work/coverage/invariants.ndjson`
- `.devgod/work/coverage/duplicate-families.ndjson`
- `.devgod/work/coverage/migration-ledger.ndjson`
- `.devgod/work/coverage/parity-matrix.ndjson`

Every generated record should include:

- item id
- bounded context
- source refs
- entry points
- dependencies and dependents
- read/write side effects
- confidence
- uncertainty class
- validation refs
- migration relevance

## 4. Model business logic explicitly

The system needs first-class records for business rules and invariants. Examples:

- "an invoice remains editable until payment intent creation succeeds"
- "role X may approve Y only when condition Z holds"
- "workflow A must emit event B before status C is visible"

These rules should attach to:

- code refs
- tests
- runtime traces
- schemas or DB objects
- impacted capabilities

Why this matters:

Without invariant records, DevGod can map structure and still miss the behavior that must survive a rewrite.

## 5. Add duplicate families, not just duplicate files

The user's concern about the same functionality appearing in multiple places in slightly different ways is correct. DevGod should represent that directly.

Each duplicate family should answer:

- what capability is this family implementing
- which implementations belong to it
- which differences are intentional variants
- which differences are accidental divergence
- what shared abstraction or module could centralize it
- what parity tests are required before consolidation

This avoids "centralize everything that looks similar" and instead centralizes safely.

## 6. Add architecture-fit analysis

Devgod should not assume microservices are the answer. It should compare at least:

- modular monolith by bounded context
- strangler modernization with seams around legacy modules
- selective service extraction for high-scale or high-isolation contexts
- hybrid target with extracted edges and a modular core

Decision inputs should include:

- discovered bounded contexts
- cohesion and coupling
- consistency boundaries
- security/trust boundaries
- deployment and team constraints
- scale hotspots
- operational complexity

This comparison should be recorded as ADRs with alternatives and confidence levels.

## 7. Add database decomposition and migration ledgers

For each model/table group, capture:

- owning bounded context
- readers and writers
- CRUD matrix by actor/capability
- consistency requirement
- migration type
- expand/contract steps
- backfill plan
- dual-read/write window if needed
- rollback plan
- cutover metrics and observability

No DB modernization slice should proceed without this metadata.

## 8. Force phased implementation patterns

Devgod should default to:

- strangler seams when replacing old module boundaries
- branch by abstraction when multiple callers depend on a legacy implementation
- feature flags or shadow execution for risky replacements
- parity checks before deprecating the old path

This lets the new architecture appear gradually while preserving behavior.

## 9. Make continuation product-level

Today the repo already has continuation concepts. Large-repo modernization mode should tighten the selector:

Priority formula should favor:

- critical business subsystems
- high uncertainty
- high fan-out
- high migration relevance
- unresolved invariants
- unresolved duplicate families
- DB blockers

Passing one slice does not end the run if coverage, migration, or parity debt remains.

## Recommended implementation order

1. Add modernization-mode profile and readiness gates.
2. Build symbol/call/dependency cartography.
3. Attach runtime trace evidence and freshness rules.
4. Add invariant and business-rule ledgers.
5. Add duplicate-family detection and reporting.
6. Add ADR-backed architecture-fit comparison.
7. Add DB decomposition and migration ledgers.
8. Add parity-matrix and phased retirement rules.
9. Prove the mode in an installed-repo brownfield fixture.

## What DevGod should refuse to do after this change

- propose a rewrite plan when critical bounded contexts lack dependency or invariant coverage
- centralize duplicate behavior without explicit divergence analysis
- propose DB migration without expand/contract or rollback planning
- declare completion when legacy paths remain unverified or parity gaps are open
- flatten uncertainty from static analysis into confident prose

## Outcome

If DevGod adopts this mode, it stops acting like a smart summarizer that sometimes overreaches and starts acting like a migration program manager with evidence-backed engineering discipline.
