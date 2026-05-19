# DevGod Autonomous Execution Redesign

> Status on `2026-05-19`: this is a redesign and roadmap document, not a claim that every subsystem below is fully shipped today. Implemented slices already exist around runtime execution plans, queue advancement, daemon/supervisor/loop surfaces, workflow-proof seeding, and operator reporting. The exhaustive coverage-ledger model and the full 15-part redesign described here remain partially implemented.

## Purpose

This document redesigns DevGod from a workflow/persona overlay into a strict autonomous execution and audit system.

The target behavior is not "helpful chat that sometimes continues." The target behavior is a persistent engineering organization that:

- executes until required coverage is complete or a real blocker exists
- maintains measurable repo-understanding coverage
- refuses shallow conclusions
- blocks rewrite recommendations until understanding thresholds are met
- keeps live state, proofs, checkpoints, and resumable execution authority

The redesign extends the current runtime foundation in:

- [src/core/service.ts](/home/gii/apps/lexer/DevGod/src/core/service.ts)
- [src/admin.ts](/home/gii/apps/lexer/DevGod/src/admin.ts)
- [src/admin/devgod.ts](/home/gii/apps/lexer/DevGod/src/admin/devgod.ts)
- [src/devgod/task-queue.ts](/home/gii/apps/lexer/DevGod/src/devgod/task-queue.ts)
- [src/domain/types.ts](/home/gii/apps/lexer/DevGod/src/domain/types.ts)
- [.devgod/templates/task-packet.md](/home/gii/apps/lexer/DevGod/.devgod/templates/task-packet.md)
- [.devgod/rules/reasoning-quality.md](/home/gii/apps/lexer/DevGod/.devgod/rules/reasoning-quality.md)

## Operational Principles

1. Runtime authority beats narrative confidence. Completion, progress, and coverage claims must be backed by persisted structured state plus evidence refs.
2. Coverage is first-class. Task completion is insufficient if critical repo surfaces remain unanalyzed.
3. Unknowns are tracked, scored, and investigated. Uncertainty is not allowed to disappear into summaries.
4. Recommendations are gated by comprehension. Architecture advice requires explicit repo-understanding thresholds.
5. Static analysis is insufficient for high-risk work. Runtime tracing, test observation, logs, and behavior proofs are mandatory when hidden coupling risk is material.
6. Continuation is default. The system selects the next highest-risk uncovered target automatically.
7. Bounded skepticism is mandatory. When confidence is low or evidence conflicts, the system branches, verifies, and escalates instead of bluffing.
8. Progress must be provable. Every major state transition emits artifacts, structured evidence, and deltas against prior state.
9. Interruptions are cheap. All long-running work must checkpoint into resumable runtime state and compressed memory.
10. Prompt rules are advisory unless backed by runtime gates, validators, contract tests, or workflow checks.

## Hard Authority Model

DevGod should use four authority layers:

1. Runtime state authority
   - persisted run state, coverage ledger state, dependency graph state, gap records, review state
   - source of truth for continuation and blocking
2. Evidence authority
   - tests, traces, logs, code refs, schema refs, commands, review proof, metrics
   - source of truth for whether a claim is supported
3. Workflow artifact authority
   - briefs, plans, task packets, coverage reports, architecture reports
   - human-readable projections of runtime state and reasoning
4. Completion authority
   - existing authenticated review plus workflow-proof model
   - remains the final completion gate

Narrative output is never authority on its own.

## System Overview

The redesign adds 15 tightly connected systems.

## Current Gaps Confirmed By Repo Audit

The redesign is based on current package gaps, not generic assumptions.

- `TaskQueue.evidence` is present but not authoritative enough for coverage claims, and runtime queue rebuilding does not preserve a deep coverage model. See [src/devgod/task-queue.ts](/home/gii/apps/lexer/DevGod/src/devgod/task-queue.ts) and [src/core/service.ts](/home/gii/apps/lexer/DevGod/src/core/service.ts).
- `workflow-proof` is intentionally narrow: it proves task approval with authenticated reviews, not product-level exhaustive completion. See [src/admin.ts](/home/gii/apps/lexer/DevGod/src/admin.ts).
- repo indexing is currently markdown-oriented rather than code-symbol- and execution-path-oriented. See [src/runtime/repo-markdown-indexer.ts](/home/gii/apps/lexer/DevGod/src/runtime/repo-markdown-indexer.ts).
- loop history is closer to reportable memory than structured execution tracing. See [src/core/service.ts](/home/gii/apps/lexer/DevGod/src/core/service.ts).
- `productState` and `metadata` are still flexible bags, which is useful for iteration but too weak for durable autonomous guarantees without typed checkpoint and ledger records. See [src/domain/types.ts](/home/gii/apps/lexer/DevGod/src/domain/types.ts).
- current template and workflow checks enforce reasoning structure and review proof well, but they do not yet require coverage ledgers, progress proofs, interruption checkpoints, or memory compaction contracts. See [.devgod/templates/task-packet.md](/home/gii/apps/lexer/DevGod/.devgod/templates/task-packet.md), [.devgod/rules/reasoning-quality.md](/home/gii/apps/lexer/DevGod/.devgod/rules/reasoning-quality.md), and [tests/workflow-check.test.ts](/home/gii/apps/lexer/DevGod/tests/workflow-check.test.ts).

### 1. EXHAUSTIVE EXECUTION MODE

Exhaustive execution mode changes the default success condition from "produced a reasonable answer" to "covered the required analysis and execution surface."

Rules:

- every run declares a `coverage_target_profile`
- every profile names required artifact classes, runtime evidence classes, subsystem categories, and minimum coverage thresholds
- the run cannot enter `modernization_strategy`, `migration_sequencing`, `implementation`, or `final_verification` until upstream understanding gates are satisfied
- every continuation cycle must select the next uncovered or weakly-supported target automatically
- a completed task does not terminate the run if required coverage remains below threshold

Enforcement:

- extend `RunExecutionPlan` in [src/domain/types.ts](/home/gii/apps/lexer/DevGod/src/domain/types.ts) with coverage, gap, and comprehension status
- extend execution directives in [src/core/service.ts](/home/gii/apps/lexer/DevGod/src/core/service.ts) with:
  - `continue_analysis`
  - `dispatch_subagents`
  - `trace_runtime`
  - `rebuild_inventory`
  - `checkpoint`
  - `replan_migration`
- add workflow check failures for "run stopped with uncovered critical subsystems"

### 2. COVERAGE LEDGER SYSTEM

Coverage must be tracked separately from code test coverage.

Add a persistent ledger:

- `.devgod/work/coverage/coverage-manifest.json`
- `.devgod/work/coverage/items.ndjson`
- `.devgod/work/coverage/dependency-graph.json`
- `.devgod/work/coverage/gaps.ndjson`
- `.devgod/work/coverage/traces/`

Each ledger item represents one analyzable object.

Required categories:

- models/entities
- services
- APIs
- routes
- controllers/views
- serializers/forms
- database access
- queries
- background jobs
- async tasks
- frontend components
- state management
- authentication
- authorization
- permissions
- caching
- feature flags
- external integrations
- infrastructure
- deployment
- CI/CD
- tests
- migrations
- dead code
- duplicated logic
- configuration
- environment coupling
- runtime side effects

Allowed states:

- `undiscovered`
- `discovered`
- `partially_analyzed`
- `fully_analyzed`
- `validated`
- `migrated`
- `deprecated`
- `blocked`

Evidence requirements by state:

| State | Entry rule | Required evidence |
|---|---|---|
| `undiscovered` | category declared but item not yet enumerated | none |
| `discovered` | item identified by scan, route map, schema map, AST index, runtime trace, or inventory pass | item id, source ref, category, discovery method |
| `partially_analyzed` | some behavior understood but dependencies, callsites, or side effects remain incomplete | code refs, notes, open questions, confidence < high or unresolved gaps |
| `fully_analyzed` | item behavior, dependencies, consumers, invariants, and risks mapped to threshold | required fields complete, callsite analysis complete, gap count below threshold |
| `validated` | behavior corroborated by tests, runtime traces, docs, schemas, or live observations | one or more verification records |
| `migrated` | replacement or rewrite landed and mapped to preserved behavior | migration refs, parity checks, verification refs |
| `deprecated` | item proven unused or intentionally retired | dead-code proof or deprecation decision |
| `blocked` | analysis or migration cannot continue due to real blocker | blocker record with owner, cause, retry path |

Mandatory ledger fields:

```json
{
  "id": "service:billing/invoice-service",
  "category": "services",
  "state": "partially_analyzed",
  "criticality": "high",
  "owner_agent": "repo_cartographer",
  "sources": ["src/billing/invoice-service.ts:1"],
  "entry_points": ["route:POST /billing/invoices"],
  "dependencies": ["model:billing/invoice", "integration:stripe"],
  "dependents": ["job:invoice-retry"],
  "callsite_count": 7,
  "callsites_analyzed": 4,
  "runtime_traced": false,
  "behavior_summary": "Creates draft invoices and dispatches payment intents.",
  "business_rules": ["invoice must remain editable until payment intent created"],
  "side_effects": ["writes invoices", "calls stripe", "emits email event"],
  "open_questions": ["who cancels stale payment intents?"],
  "evidence_refs": ["src/billing/invoice-service.ts:1", "trace://run-123/invoice-create"],
  "verification_refs": ["test://billing/invoice-service/create-draft"],
  "confidence": 0.62,
  "gap_score": 0.41,
  "last_updated_at": "2026-05-15T12:00:00.000Z"
}
```

Transition rules:

- `undiscovered -> discovered`
  - triggered by scanners, agent findings, route extraction, schema parsing, trace ingestion
- `discovered -> partially_analyzed`
  - triggered when an agent records behavior, dependencies, or business rules, but comprehension is incomplete
- `partially_analyzed -> fully_analyzed`
  - only if mandatory analysis checklist passes for that category
- `fully_analyzed -> validated`
  - only if corroborated by at least one validation class appropriate to risk
- `validated -> migrated`
  - only after implementation plus parity checks
- `any -> blocked`
  - only if a blocker record exists
- `validated -> deprecated`
  - only if dead-code or retirement proof is recorded

### 3. AUTONOMOUS CONTINUATION LOOP

The continuation loop is the runtime heart of the redesign.

Loop:

1. inspect current run state
2. compute coverage deficits
3. compute risk-weighted unknowns
4. select highest-value next target
5. choose execution mode: analyze, trace, implement, validate, recover, or escalate
6. dispatch bounded work
7. ingest evidence
8. update ledgers, dependency graph, and gap records
9. re-score readiness for architecture, migration, implementation, or final verification
10. repeat automatically

Stop only when:

- required coverage thresholds are met and completion gates pass
- or a real blocker exists with no legal/technical next move under budget

Never stop because:

- one command passed
- one task completed
- a plausible insight was found
- the current agent has a good summary

Selection heuristic:

`priority = criticality * uncertainty * fanout * runtime_risk * migration_relevance * blocker_pressure`

Where:

- `criticality`: business impact if misunderstood
- `uncertainty`: inverse of confidence
- `fanout`: number of dependents and callsites
- `runtime_risk`: hidden side effects, external writes, auth, payments, migrations
- `migration_relevance`: importance to the current objective
- `blocker_pressure`: how many downstream tasks depend on it

### 4. HARD DEFINITION OF DONE

Add a new completion contract distinct from chat completion and single-task completion.

A run is done only when all are true:

- required coverage profile thresholds are satisfied
- no critical or high gaps remain unresolved in scope
- required categories for the run are at least `fully_analyzed`, and critical ones are `validated`
- implementation slices have passed required verification
- regression detection is complete for touched behavior
- review gates pass
- workflow-proof passes
- final report includes evidence-backed progress proof

A task is done only when all are true:

- acceptance criteria pass
- touched-scope coverage delta is recorded
- touched critical ledger items are at least `validated` or explicitly blocked
- implementation validation succeeded
- residual risks are either fixed or promoted as blockers

Add a workflow-check failure class:

- `coverage_incomplete`
- `critical_gap_open`
- `rewrite_without_comprehension`
- `missing_runtime_trace_for_high_risk_flow`
- `missing_progress_proof`

### 5. GAP DETECTION ENGINE

The gap engine finds what the system still does not know.

Gap types:

- missing inventory
- missing callsite coverage
- missing dependency edge
- missing runtime trace
- missing validation
- contradicting evidence
- hidden write side effect
- orphaned config coupling
- dead-code suspicion
- duplicate-logic suspicion
- architecture recommendation before threshold

Each gap record should include:

```json
{
  "id": "gap:service:billing/invoice-service:missing-runtime-trace",
  "target_id": "service:billing/invoice-service",
  "kind": "missing_runtime_trace",
  "severity": "high",
  "description": "Critical payment flow has no trace-backed behavior proof.",
  "blocking": true,
  "evidence_refs": ["src/billing/invoice-service.ts:1"],
  "created_by": "gap_engine",
  "suggested_next_actions": ["trace runtime under invoice create path"],
  "status": "open"
}
```

Gap rules:

- every partially analyzed critical item must have an explicit gap set
- every architecture proposal must list which critical gaps were closed and which remain
- open blocking gaps prevent state advancement

Recommended implementation:

- new `src/runtime/gap-engine.ts`
- new CLI command `devgod gaps --run-id <id>`
- new admin output section in `ops`, `report`, and `loop`

### 6. SUBAGENT ORCHESTRATION

Subagents must be treated as bounded workers, not inspirational assistants.

Required specialist subagents:

| Agent | Responsibility | Inputs | Outputs | Escalates when |
|---|---|---|---|---|
| `repo_cartographer` | enumerate files, modules, boundaries, entry points | repo path, target scope | inventory records, subsystem map | inventory confidence < threshold |
| `dependency_mapper` | build static dependency graph and fanout map | inventory, code refs | graph edges, hotspot list | hidden indirection or generated code blocks certainty |
| `runtime_tracer` | obtain runtime behavior evidence | commands, env, target flows | traces, side effects, call sequences | trace cannot be reproduced safely |
| `schema_analyst` | map DB schemas, migrations, queries, ORM models | schema files, query code | schema graph, risky migrations, invariants | schema drift or unknown data shape |
| `business_rule_extractor` | isolate implicit domain rules | code refs, traces, tests | rule ledger entries, invariants, exceptions | rules conflict or remain implicit |
| `integration_validator` | analyze external integrations and failure modes | integration code, configs, traces | contract map, retry semantics, auth assumptions | live dependency unavailable or unsafe |
| `frontend_ux_auditor` | analyze flows, state, and UI coupling | route/component tree | UX flow map, state edges, risky assumptions | user flow cannot be inferred statically |
| `infra_investigator` | map deploy, env, CI/CD, ops dependencies | configs, scripts, workflow files | infra inventory, environment coupling, rollout risks | deploy authority required |
| `dead_code_hunter` | find unused code and stale paths | graph, tests, traces | deprecation candidates with proof level | uncertainty remains high |
| `performance_analyst` | detect scale and latency risks | hotspots, traces, profiling | bottleneck hypotheses, validation plan | runtime measurement missing |
| `security_auditor` | audit auth, trust boundaries, secrets, unsafe flows | auth code, integrations, configs | threat findings, required mitigations | active exploit risk |
| `migration_planner` | convert understanding into safe migration phases | validated ledgers, gap status | phase plan, cut lines, rollback strategy | comprehension threshold unmet |

Coordination rules:

- each subagent gets a bounded scope, explicit write boundary, and evidence output schema
- overlapping ownership is prohibited unless conflict-review mode is explicit
- every subagent result is ingested into the same ledger and graph
- conflicting results create a gap instead of a silent overwrite
- workers cannot close their own critical blockers without corroboration

Conflict resolution:

1. mark conflicting claims
2. open contradiction gap
3. dispatch validating agent or runtime trace
4. keep lower-confidence conclusion non-authoritative until resolved

### 7. ARCHITECTURE REASONING PIPELINE

Architecture recommendations must be generated through a gated pipeline.

Stages:

1. define current-system objective and rewrite scope
2. verify required repo-understanding thresholds
3. summarize validated current architecture
4. separate business-critical behavior from accidental complexity
5. identify invariants and hidden workflow constraints
6. identify rewrite traps and coupling risks
7. generate candidate architectures
8. compare candidates against preserved behavior and constraints
9. generate migration phases with fallback paths
10. produce parity-validation strategy

Hard gate:

No rewrite recommendation is allowed unless:

- critical categories reach required coverage thresholds
- core models/services/auth/integrations are at least `fully_analyzed`
- critical user flows are runtime traced or equivalent validation exists
- contradiction gaps are below threshold

Recommended runtime extension:

- new `architecture_readiness` block in `RunExecutionPlan`
- statuses: `blocked`, `partial`, `ready`

### 8. REPO UNDERSTANDING PIPELINE

Repo understanding is a formal pipeline, not a vague research phase.

Stages:

1. discovery
2. inventory
3. dependency mapping
4. runtime tracing
5. subsystem classification
6. business-rule extraction
7. risk analysis
8. comprehension checkpoint

Checkpoint thresholds by run type:

| Run type | Minimum threshold before strategy |
|---|---|
| bug fix | touched scope inventory + callsites + validation |
| migration | affected subsystem coverage + data path coverage + runtime traces for risky flows |
| modernization | critical subsystem inventory + dependency graph + duplicate logic + config coupling |
| full rewrite | critical category coverage + core business rules + runtime traces + integration map + auth map |

Suggested comprehension metrics:

- inventory completeness %
- critical item analyzed %
- critical item validated %
- callsite coverage %
- runtime trace coverage %
- contradiction gap count
- unknown dependency edge count
- open blocker count

### 9. LONG-RUN TASK MANAGEMENT

Large legacy work requires resumable runtime management.

Add runtime concepts:

- `workstream`
- `checkpoint`
- `continuation_budget`
- `pending_investigations`
- `ledger_snapshot`
- `execution_epoch`

Checkpoint contents:

```json
{
  "run_id": "run-123",
  "checkpoint_id": "cp-014",
  "phase": "runtime_tracing",
  "active_targets": ["service:billing/invoice-service"],
  "recent_evidence_refs": ["trace://run-123/invoice-create"],
  "open_gaps": ["gap:service:billing/invoice-service:missing-callsites"],
  "next_actions": ["dispatch dependency_mapper on invoice callers"],
  "compressed_context_ref": "memory://run-123/cp-014"
}
```

New commands:

- `devgod checkpoint`
- `devgod resume --run-id <id>`
- `devgod workstreams`
- `devgod coverage --run-id <id>`
- `devgod gaps --run-id <id>`

### 10. IMPLEMENTATION VALIDATION

Implementation validation must prove behavior, not just compile status.

Validation classes:

- unit tests
- integration tests
- e2e tests
- runtime trace parity
- schema validation
- migration dry-run or replay
- performance checks
- security checks
- config/env replay

Each task packet should declare:

- touched ledger items
- required validation classes
- parity behaviors to preserve
- rollback proof path

Recommended task-packet additions in [.devgod/templates/task-packet.md](/home/gii/apps/lexer/DevGod/.devgod/templates/task-packet.md):

- `## Coverage impact`
- `## Touched ledger items`
- `## Required runtime traces`
- `## Progress proof`
- `## Interrupt checkpoint policy`

### 11. FAILURE RECOVERY

Failure recovery must distinguish transient failure from understanding failure.

Recovery classes:

- tool failure
- test failure
- environment failure
- contradictory evidence
- stale coverage
- blocked trace
- invalid migration plan
- failed parity validation

Recovery protocol:

1. classify failure
2. attach to target item or workstream
3. determine transient vs structural
4. retry within bounded budget if transient
5. reopen understanding gap if structural
6. adjust next-step selection
7. escalate only when no safe automated next move exists

Recommended runtime additions:

- `recovery_reason`
- `retry_budget_remaining`
- `last_successful_checkpoint_id`

### 12. PROGRESS PROOFS

Progress proofs prevent fake completeness.

Every major loop cycle must emit:

- coverage delta
- gap delta
- dependency graph delta
- validation delta
- runtime evidence delta
- next-target rationale

Example proof record:

```json
{
  "cycle": 18,
  "phase": "dependency_mapping",
  "completed_targets": ["service:billing/invoice-service"],
  "coverage_delta": {
    "fully_analyzed": 3,
    "validated": 1
  },
  "gap_delta": {
    "closed": 4,
    "opened": 1
  },
  "next_target": "integration:stripe",
  "why_next": "high fanout, high runtime risk, unresolved auth semantics"
}
```

Recommended workflow-check additions:

- fail if latest cycles lack measurable deltas
- fail if run claims completion without progress-proof records

### 13. USER INTERRUPTIBILITY WITHOUT LOSING STATE

Interruptibility rules:

- the run must checkpoint before yielding control if meaningful state changed
- pending actions, open gaps, and highest-priority targets must be persisted
- the system must resume from runtime state, not from conversational recall
- user redirections create a new execution epoch but inherit compatible ledger state

Required persisted outputs before a pause:

- latest checkpoint
- compressed context summary
- open blocker list
- unresolved contradictions
- next recommended action set

### 14. MEMORY / CONTEXT COMPRESSION

Compression must retain execution-critical information.

Three memory tiers:

1. raw evidence
   - logs, traces, diffs, command outputs
2. structured operational memory
   - ledgers, graphs, gaps, checkpoints
3. compressed narrative memory
   - summaries keyed to structured refs

Compression rules:

- never compress away ids, evidence refs, blocker refs, invariants, or contradictions
- compress prose, not authority fields
- every compressed summary must point back to source refs

Recommended new module:

- `src/runtime/context-compression.ts`

Recommended template:

- `.devgod/templates/checkpoint-summary.md`

### 15. DEEP CODEBASE REVERSE ENGINEERING MODE

This mode is for hostile, undocumented, or legacy systems.

Objectives:

- recover actual system behavior
- identify business-critical invariants
- expose hidden coupling and implicit workflows
- separate accidental complexity from true requirements

Mandatory phases:

1. structural inventory
2. hotspot detection
3. model/service callsite saturation
4. runtime trace capture
5. business-rule extraction
6. contradiction resolution
7. rewrite-readiness checkpoint

Hard rules:

- no rewrite proposal before core model/service/auth/integration thresholds are met
- all important callsites of critical models/services must be analyzed
- critical workflows need runtime proof unless technically impossible
- hidden config/env coupling must be enumerated

## Strict Execution State Machine

This state machine replaces loose "plan then maybe act" behavior.

### States

1. `discovery`
2. `inventory`
3. `dependency_mapping`
4. `runtime_tracing`
5. `subsystem_classification`
6. `risk_analysis`
7. `modernization_strategy`
8. `migration_sequencing`
9. `implementation`
10. `validation`
11. `regression_detection`
12. `final_verification`
13. `blocked`
14. `done`

### State Definitions

| State | Entry condition | Mandatory outputs | Exit threshold | Stop condition | Retry condition | Escalation condition |
|---|---|---|---|---|---|---|
| `discovery` | run created | target scope, run profile, initial hypotheses | scope normalized | illegal scope or missing repo | missing scope artifacts fixed | user intent conflict |
| `inventory` | discovery complete | repo inventory, initial ledger items | critical surfaces discovered | repo inaccessible | scanner/index failure | generated code or polyrepo ambiguity |
| `dependency_mapping` | inventory threshold met | dependency graph, hotspots, callsite map | critical fanout mapped | graph impossible from missing artifacts | static map incomplete | dynamic indirection dominates |
| `runtime_tracing` | risky flows identified | traces, side effects, path observations | critical risky flows traced | no safe trace path | trace setup failure | prod-only behavior or missing env |
| `subsystem_classification` | inventory plus graph present | subsystem grouping, ownership map, criticality | all in-scope items classified | classification impossible | re-run after inventory update | boundaries remain contradictory |
| `risk_analysis` | classification complete | risk matrix, blocker ranking, gap score | critical unknowns ranked | insufficient data | reopen prior phase | unresolved contradiction on critical flow |
| `modernization_strategy` | comprehension gate satisfied | candidate strategies, preserved invariants, traps | strategy selected | gate not satisfied | return to earlier analysis phase | architecture risks exceed confidence |
| `migration_sequencing` | strategy selected | phases, cut lines, rollbacks, parity plan | executable sequence exists | dependencies unsolved | refine strategy | data/auth/integration cut is unsafe |
| `implementation` | task sequence ready | code changes, updated ledgers, task proofs | implementation scope complete | blocker or failed setup | bounded repair loop | destructive or auth-impacting change requires approval |
| `validation` | implementation landed | tests, traces, parity results | validation classes pass | failing critical validation | repair and re-run | conflicting results or unsafe drift |
| `regression_detection` | validation mostly green | regression diff, dead-code review, touched-scope findings | no unresolved critical regressions | regression open | fix and rerun | broad blast radius exceeds scope |
| `final_verification` | all prior states satisfied | workflow proof, review gates, final progress proof | completion authority obtained | missing gates | collect missing proofs | authenticated review failure |
| `blocked` | real blocker recorded | blocker record, attempted paths, resume trigger | blocker resolved | legal/safety/user approval boundary | on unblock | repeated budget exhaustion |
| `done` | final verification passed | final report, ledger snapshot, memory promotion | none | none | none | none |

### Transition Rules

- `discovery -> inventory`
  - when scope, success criteria, and target profile are fixed
- `inventory -> dependency_mapping`
  - when critical surface discovery threshold is met
- `dependency_mapping -> runtime_tracing`
  - when risky or uncertain dynamic behavior remains
- `runtime_tracing -> subsystem_classification`
  - when enough traces exist to classify critical behavior
- `subsystem_classification -> risk_analysis`
  - when all in-scope critical items have criticality, dependencies, and owners
- `risk_analysis -> modernization_strategy`
  - only if comprehension gate passes
- `modernization_strategy -> migration_sequencing`
  - when one strategy has evidence-backed superiority
- `migration_sequencing -> implementation`
  - when phases, rollback plans, and parity checks exist
- `implementation -> validation`
  - when code/task scope completes
- `validation -> regression_detection`
  - when primary validations pass
- `regression_detection -> final_verification`
  - when no unresolved critical regression exists
- `final_verification -> done`
  - only after authenticated review and workflow-proof

Backward transitions are expected:

- from `modernization_strategy` back to `runtime_tracing` if hidden behavior emerges
- from `validation` back to `dependency_mapping` if unexpected coupling appears
- from any state to `blocked` if a real blocker is recorded

### Confidence Thresholds

Recommended numeric thresholds:

- enter `modernization_strategy`
  - critical item coverage >= 0.80
  - critical item validated >= 0.60
  - callsite coverage for critical services/models >= 0.85
  - contradiction gap count = 0 for auth/data/payment flows
- enter `migration_sequencing`
  - critical item coverage >= 0.90
  - runtime trace coverage for risky flows >= 0.75
  - business-rule extraction coverage >= 0.80
- enter `final_verification`
  - touched-scope coverage >= 1.00
  - required validation pass rate = 1.00
  - blocking gap count = 0

Thresholds should be profile-driven, not hard-coded globally.

## Anti-Shallowness Rules

DevGod must explicitly prevent shallow work.

Rules:

- no selective sampling for critical categories
- no architecture recommendation before comprehension threshold
- no "partially analyzed but summarized as complete"
- no critical model/service marked fully analyzed until important callsites are covered
- no high-risk flow considered validated without runtime evidence or a recorded impossibility waiver
- no dead-code claim without graph or runtime proof level
- no migration phase approved without rollback notes and preserved behavior list

Enforcement mechanisms:

- workflow check validates presence of coverage and gap artifacts
- runtime plan blocks advancement if thresholds fail
- contract tests assert prompt/rule/template requirements
- report surfaces highlight unresolved open critical gaps
- `reasoning_quality` warnings remain advisory for non-critical scope but become blocking for rewrite-mode critical scope

## Architecture Rewrite Mode

Mode name:

- `legacy_rewrite`

Activation:

- user asks for large redesign, modernization, migration, or full rewrite
- or scope classifier marks legacy complexity high

Required outputs:

- current-system architecture map
- business-critical behavior ledger
- accidental-complexity ledger
- rewrite traps list
- modern target architecture
- migration phases
- parity validation matrix
- risk register

Rewrite traps to detect:

- hidden cron/business workflows
- env-specific branching
- coupling hidden in serializers/forms/controllers
- permission logic split across routes, services, and views
- database side effects outside repositories/services
- implicit integration retries and compensations
- UI state carrying business invariants

Refusal rule:

If comprehension threshold is not met, DevGod must say:

`rewrite recommendation blocked: critical repo-understanding threshold not met`

Then list the missing evidence and continue investigating automatically.

## Repo Understanding Pipeline

The pipeline should maintain explicit inventories of analyzed vs unanalyzed scope.

Recommended inventory outputs:

- `repo-map.json`
- `subsystems.json`
- `route-map.json`
- `model-map.json`
- `integration-map.json`
- `authz-map.json`
- `config-coupling.json`
- `runtime-side-effects.json`

Recommended new modules:

- `src/runtime/repo-inventory.ts`
- `src/runtime/dependency-graph.ts`
- `src/runtime/runtime-trace-registry.ts`
- `src/runtime/coverage-ledger.ts`
- `src/runtime/gap-engine.ts`
- `src/runtime/progress-proof.ts`

## Continuation Logic

Pseudo-flow:

```text
while true:
  state = load_run_state()
  if state.blocked and no_recovery_path():
    emit_blocker_report()
    break
  recompute_coverage()
  recompute_gaps()
  recompute_readiness()
  if final_done():
    emit_progress_proof()
    request_final_reviews()
    break
  target = select_highest_priority_uncovered_item()
  directive = decide_next_directive(target, state)
  execute_directive(directive)
  ingest_evidence()
  persist_checkpoint()
```

Directive selection examples:

- missing inventory -> `dispatch_subagents(repo_cartographer, dependency_mapper)`
- high-risk no trace -> `trace_runtime`
- critical contradiction -> `continue_analysis` with validating agent
- strategy blocked by low comprehension -> `rebuild_inventory` or `dispatch_subagents`
- validations failing -> `apply_recovery`

## Failure Recovery Strategy

Recovery should be phase-aware.

Example matrix:

| Failure | Phase | Automatic action | Escalate when |
|---|---|---|---|
| scanner misses files | inventory | rerun with alternate scan path | repo layout is non-standard after retry budget |
| dependency graph contradictory | dependency_mapping | open contradiction gap and trace flow | critical edge still unresolved |
| tests unavailable | runtime_tracing | use logs or dry-run traces | no safe evidence path exists |
| migration dry-run fails | validation | classify as parity or schema blocker | destructive rollback risk |
| repeated low-confidence summaries | any analysis phase | require alternate hypothesis pass | confidence remains below threshold after budget |

## Progress Proof Strategy

Progress proof must answer:

- what was newly understood
- what remains unknown
- why the next target was chosen
- what risk was reduced
- what evidence changed state

Recommended runtime report additions:

- `coverageSummary`
- `criticalUnknowns`
- `closedGaps`
- `openedGaps`
- `phaseReadiness`
- `nextTargetRationale`

Add to:

- [src/admin/report.ts](/home/gii/apps/lexer/DevGod/src/admin/report.ts)
- [src/admin/ops.ts](/home/gii/apps/lexer/DevGod/src/admin/ops.ts)
- `loop` command output

## Internal DSL / Protocol Formats

### Coverage Manifest

```json
{
  "run_id": "run-123",
  "profile": "legacy_rewrite",
  "required_categories": ["models", "services", "routes", "auth", "integrations"],
  "thresholds": {
    "critical_item_coverage": 0.9,
    "critical_item_validation": 0.75,
    "callsite_coverage": 0.9,
    "runtime_trace_coverage": 0.75
  }
}
```

### Phase Readiness Block

```json
{
  "phase": "modernization_strategy",
  "status": "blocked",
  "reasons": [
    "critical auth flow lacks runtime trace",
    "service:billing/invoice-service has unresolved contradiction gap"
  ]
}
```

### Progress Proof Block

```json
{
  "cycle": 9,
  "proof_id": "proof-009",
  "phase_before": "runtime_tracing",
  "phase_after": "subsystem_classification",
  "evidence_refs": ["trace://run-123/auth-login", "src/auth/service.ts:1"],
  "coverage_delta": {"validated": 2},
  "blocking_gap_delta": {"closed": 1},
  "next_target": "authorization policy resolution"
}
```

## Concrete Implementation Ideas

### Type additions

Extend [src/domain/types.ts](/home/gii/apps/lexer/DevGod/src/domain/types.ts) with:

- `coverageItemCategories`
- `coverageItemStates`
- `gapKinds`
- `gapSeverities`
- `analysisPhases`
- `runProfiles`
- `progressProof`
- `checkpointRecord`
- `phaseReadiness`
- `coverageSummary`

### Core service additions

Extend [src/core/service.ts](/home/gii/apps/lexer/DevGod/src/core/service.ts) with:

- `computeCoverageSummary(runId)`
- `computeGapReport(runId)`
- `computePhaseReadiness(runId)`
- `selectNextAnalysisTarget(runId)`
- `recordProgressProof(runId)`
- `checkpointRun(runId)`
- `resumeCheckpoint(runId)`

### CLI additions

Extend [src/admin.ts](/home/gii/apps/lexer/DevGod/src/admin.ts) and [src/admin/devgod.ts](/home/gii/apps/lexer/DevGod/src/admin/devgod.ts) with:

- `coverage`
- `gaps`
- `checkpoint`
- `resume`
- `trace`
- `inventory`
- `rewrite-readiness`
- `progress-proof`

### Workflow template additions

Add templates:

- `.devgod/templates/coverage-manifest.json`
- `.devgod/templates/checkpoint-summary.md`
- `.devgod/templates/architecture-audit.md`
- `.devgod/templates/reverse-engineering-report.md`

Extend existing templates:

- `intake-brief.md`
  - add `## Coverage target profile`
  - add `## Comprehension gate`
- `task-packet.md`
  - add `## Coverage impact`
  - add `## Touched ledger items`
  - add `## Required runtime traces`
  - add `## Progress proof`
  - add `## Interrupt checkpoint policy`

### Workflow checks

Extend [scripts/check-devgod-workflow.sh](/home/gii/apps/lexer/DevGod/scripts/check-devgod-workflow.sh) and [scripts/check-devgod-workflow-live.sh](/home/gii/apps/lexer/DevGod/scripts/check-devgod-workflow-live.sh) to fail on:

- missing coverage manifest for non-trivial work
- missing progress proof
- rewrite-mode run without comprehension readiness
- critical item with open blocking gap marked complete
- missing required runtime traces for risky flows

### Tests

Add tests:

- `tests/coverage-ledger.test.ts`
- `tests/gap-engine.test.ts`
- `tests/checkpoint-resume.test.ts`
- `tests/rewrite-readiness.test.ts`
- `tests/progress-proof.test.ts`

Extend:

- [tests/control-layer-contract.test.ts](/home/gii/apps/lexer/DevGod/tests/control-layer-contract.test.ts)
- [tests/workflow-check.test.ts](/home/gii/apps/lexer/DevGod/tests/workflow-check.test.ts)
- [tests/orchestration-eval.test.ts](/home/gii/apps/lexer/DevGod/tests/orchestration-eval.test.ts)

Current [src/runtime/coverage-thresholds.ts](/home/gii/apps/lexer/DevGod/src/runtime/coverage-thresholds.ts) should remain focused on code coverage, but its threshold parsing and failure style should be reused for analysis coverage summaries.

Recommended artifact/rule extensions based on current audit:

- add quality gates:
  - `coverage_ledger_required`
  - `progress_proof_required`
  - `checkpoint_resume_required`
  - `memory_compaction_required`
- extend `tests/control-layer-contract.test.ts` to assert new task-packet and brief sections
- extend `tests/workflow-check.test.ts` with rejection fixtures for missing coverage ledger, missing checkpoint, missing progress proof, and stale compressed-memory refs
- extend `tests/orchestration-eval.test.ts` with cases for shallow completion, interrupted resume, stale checkpoint recovery, and backlog-not-exhausted false completion

## Recommended Enforcement Mechanisms

Use four layers together:

1. Runtime blocking
   - phase advancement blocked by missing coverage or blocking gaps
2. Workflow validation
   - artifact/live checks fail closed
3. Contract tests
   - prompt/template/rule regressions detected in CI
4. Review proof
   - authenticated final authority remains intact

Prompt-only instructions are insufficient for:

- exhaustive coverage guarantees
- rewrite-readiness gates
- progress proofs
- interruption-safe continuation

Those must be implemented in runtime state and workflow validators.

## Example Execution Trace A: Legacy Rewrite

1. `discovery`
   - run profile `legacy_rewrite`
   - required categories: models, services, routes, auth, integrations, infra
2. `inventory`
   - repo cartographer discovers 142 services, 61 routes, 27 jobs
   - coverage manifest created
3. `dependency_mapping`
   - dependency mapper identifies payment, auth, and pricing hotspots
4. `runtime_tracing`
   - runtime tracer captures checkout, refund, and login flows
5. `subsystem_classification`
   - billing and auth marked critical, admin export marked medium
6. `risk_analysis`
   - contradiction gap opened on refund authorization rule
7. continuation loop
   - chooses refund authorization because high criticality plus contradiction
8. deeper analysis
   - business-rule extractor resolves refund invariants
9. comprehension gate passes
   - architecture strategy unlocked
10. modernization strategy
   - modular monolith retained, auth boundary split, payment side effects isolated
11. migration sequencing
   - phase 1 auth extraction, phase 2 payment orchestration, phase 3 admin cleanup
12. implementation and validation
   - parity traces confirm preserved behavior
13. final verification
   - workflow-proof passes, run done

## Example Execution Trace B: Debugging a Large Legacy Failure

1. run starts in `discovery` with profile `debug_heavy`
2. inventory finds the failing subsystem and its dependents
3. gap engine flags low runtime evidence
4. loop selects `runtime_tracing`
5. tracer captures failure path and discovers hidden feature flag plus stale cache coupling
6. dependency graph updated
7. fix task packet created with touched ledger items
8. validation passes, but regression detection finds duplicate fallback path
9. dead-code hunter marks duplicate path suspicious, not deprecated yet
10. loop continues until duplicate path is resolved or blocked explicitly

## Example Rules / Prompt Fragments

### Intake rule fragment

```text
Every non-trivial run must declare:
- run profile
- required coverage categories
- minimum comprehension threshold before architecture or rewrite output
- blocker escalation policy
```

### Task-packet rule fragment

```text
A task packet is invalid if:
- touched ledger items are omitted
- required runtime traces for risky flows are omitted
- coverage impact is unspecified
- progress-proof expectations are missing
```

### Gap-engine rule fragment

```text
If a critical item has open contradiction, missing callsite coverage, or missing runtime trace,
the item cannot enter fully_analyzed or validated.
```

## GOLD STANDARD OPERATIONAL PROMPT

```text
You are DevGod operating in strict autonomous execution mode.

Your job is to behave like a persistent engineering organization, not a conversational assistant.

Core behavior:
- Continue automatically until the required coverage profile is complete or a real blocker exists.
- Do not stop because a partial answer, interesting finding, or single passing command exists.
- Maintain explicit inventories of discovered, partially analyzed, fully analyzed, validated, migrated, deprecated, and blocked items.
- Continuously update the live coverage ledger, dependency graph, gap register, progress proofs, and checkpoints.
- Treat uncertainty as work to investigate, not prose to smooth over.
- Refuse architecture or rewrite recommendations until comprehension thresholds are met.
- For critical models, services, integrations, auth flows, migrations, and runtime side effects, analyze all important callsites and require runtime-backed evidence when risk is high.
- Detect hidden coupling, implicit business logic, config/env branching, duplicate logic, dead code suspicion, and undocumented side effects.

Execution loop:
1. Load run state, coverage state, gap state, and last checkpoint.
2. Recompute readiness, coverage deficits, and highest-risk unknowns.
3. Select the next uncovered or weakly-supported target autonomously.
4. Choose the appropriate directive: inventory, dependency mapping, runtime tracing, subsystem classification, risk analysis, modernization strategy, migration sequencing, implementation, validation, regression detection, or recovery.
5. Execute bounded work and ingest evidence.
6. Update ledgers, proofs, checkpoints, and next-step rationale.
7. Repeat automatically.

Hard prohibitions:
- Do not present selective sampling as complete analysis.
- Do not provide rewrite guidance before critical repo-understanding thresholds are met.
- Do not mark critical items fully analyzed if important callsites remain unreviewed.
- Do not mark high-risk behavior validated without runtime evidence or an explicit impossibility waiver.
- Do not declare done while blocking gaps, missing proofs, or unmet coverage thresholds remain.

Definition of done:
- required coverage thresholds met
- blocking gaps resolved or explicitly blocked with authority
- required validation passed
- regression detection complete
- authenticated reviews passed
- workflow-proof passed
- final progress proof recorded

When interrupted:
- checkpoint immediately
- persist open gaps, active targets, next actions, and compressed context
- resume from runtime state rather than conversational memory

When uncertain:
- open or update a gap
- investigate an alternative hypothesis
- gather stronger evidence
- continue unless a real blocker exists
```

## Recommended First Implementation Slices

1. Add domain/runtime schema for coverage items, gaps, checkpoints, and progress proofs.
2. Add coverage and gap persistence plus CLI reporting.
3. Add phase-readiness blocking to the execution plan.
4. Extend workflow checks and templates to require coverage manifests and progress proofs.
5. Add rewrite-readiness mode and reverse-engineering outputs.
6. Add runtime trace registry and critical-flow trace requirements.
7. Add continuation target selection based on coverage and risk scoring.

That sequence preserves the current workflow-proof authority while adding the missing operational guarantees incrementally.
