# DevGod Agentic Company Loop Roadmap

## Goal

Convert the current `devgod` package into the governed agentic-company loop described by:

- `docs/devgod_agentic_loop_SDD.md`
- `docs/devgod_agentic_loop_TDD.md`

The target is not "better prompting." The target is a runtime-authoritative system where Codex acts like a small software company: manager-led, specialist-driven, resumable, evidence-backed, and blocked from declaring success without proof.

## Current baseline

The repo already contains much of the substrate the new design needs:

- runtime authority and workflow proof
- coverage, gaps, checkpoints, resume, and autonomous execution surfaces
- a shipped role catalog in `src/devgod/agent-catalog.ts` and `.codex/agents/*.toml`
- manager, review, QA, security, memory, and runtime roles
- installer, CLI, MCP, UI, daemon, supervisor, and docs-export surfaces

The main gap is enforcement. Too much of the intended behavior still lives as instructions, docs, or optional operator discipline instead of runtime gates.

## Gap summary

1. Context pressure is not a uniform enforced lifecycle across all agents and subagents.
2. Handoffs exist, but the repo does not yet treat 70% context handoff as a hard operating rule.
3. Specialist roles exist, but bounded lower-level subagent delegation is not a first-class runtime contract.
4. Debate and contradiction handling are described conceptually, not enforced as gateable runtime records.
5. Workflow transition gates are not yet a first-class runtime system that blocks progress when proof, debate, handoff, review, child-job, or coverage requirements are missing.
6. Run-profile and coverage-target selection are not yet expressed as a canonical runtime contract for company-loop execution.
7. Least-privilege role policy, side-effect approval, and MCP/tool permission enforcement are not yet explicit enough for the target model.
8. Operator surfaces do not yet expose a single clear view of active owners, context pressure, handoff status, debate state, and subagent jobs.
9. Anti-looseness evals are not yet explicitly shaped around "plain Codex with paperwork" failure modes.
10. Some docs still overstate shipped autonomy relative to what the runtime currently enforces.

## Architectural stance

Execution should build on the current runtime instead of replacing it.

- Keep runtime state authoritative.
- Keep markdown as export, projection, or advisory evidence.
- Keep memories optional and useful, but never authoritative.
- Reuse `src/runtime/autonomous-execution.ts`, `src/runtime/coverage-ledger.ts`, `src/core/service.ts`, `src/admin.ts`, `src/admin/status.ts`, `src/admin/ops.ts`, `src/devgod/agent-catalog.ts`, and `.codex/agents/*.toml`.
- Add missing control planes for context pressure, handoffs, delegation, debate, and operator visibility around those existing surfaces.

## Delivery phases

### Phase 1: Company-kernel contract

Define the runtime contract for the agentic company loop.

Deliverables:

- one canonical run lifecycle spanning discovery through done/blocked
- typed owner, phase, blocker, and active-agent records
- typed run-profile and coverage-target profile records
- explicit artifact authority matrix for DB/JSON/NDJSON/Markdown workflow objects
- explicit separation between manager ownership, specialist ownership, and review authority
- explicit non-authority rule for memory and conversation summaries
- alignment between the new SDD/TDD and `AGENTS.md`, `docs/devgod-agent-team.md`, `docs/autonomous-execution-redesign.md`, and workflow schema text

Primary surfaces:

- `src/domain/types.ts`
- `src/core/service.ts`
- `src/runtime/autonomous-execution.ts`
- `src/devgod/workflow-schema.ts`
- `AGENTS.md`
- `docs/devgod-agent-team.md`

Acceptance criteria:

- one runtime-defined phase model exists
- one runtime-defined authority model exists
- one runtime-defined run-profile and coverage-target contract exists
- one runtime-defined artifact portability and authority contract exists
- the blocking trio remains the completion gate
- roadmap and shipped docs stop implying behavior that the runtime cannot enforce

Verification:

- targeted contract tests for phase and ownership state
- targeted contract tests for run-profile and coverage-target selection
- targeted contract tests for artifact authority and portability expectations
- workflow-schema verification
- doc drift checks for manager/runtime authority language

### Phase 2: Run-profile and phase-readiness engine

Make company-loop execution start from an explicit run profile and readiness model.

Deliverables:

- canonical `run_profile` model with `engineering_company` as the default non-trivial profile
- canonical coverage-target profile model
- phase-readiness rules that govern when the loop may move from discovery to planning to implementation to final verification
- explicit distinction between trivial, substantial, risky, and human-approval-sensitive runs

Primary surfaces:

- `src/domain/types.ts`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/devgod/workflow-schema.ts`

Acceptance criteria:

- every non-trivial run records a `run_profile`
- every non-trivial run records a coverage-target profile
- phase transitions can fail closed when readiness requirements are unmet

Verification:

- targeted contract tests for run-profile selection
- targeted contract tests for phase-readiness blocking

### Phase 3: Workflow gates and completion enforcement

Make runtime transition guards first-class and early.

Deliverables:

- dedicated workflow-gates layer for handoff, proof, debate, review, child-job, and coverage enforcement
- dedicated progress-proof contract for per-transition and final-proof records
- explicit terminal-state rules for `partial`, `blocked`, `failed`, and `done`
- final-completion rules that require all child jobs to be resolved or explicitly absorbed
- proof-time rejection for missing required gate artifacts

Primary surfaces:

- `src/runtime/workflow-gates.ts`
- `src/core/service.ts`
- `src/admin.ts`
- `src/devgod/workflow-schema.ts`

Acceptance criteria:

- runs cannot advance when required handoff, review, debate, proof, or child-job closure requirements are missing
- `done` is distinct from `partial`, `failed`, and `blocked`
- every substantive state transition emits or updates progress proof
- completion enforcement happens in runtime gates, not just release docs or eval prose

Verification:

- workflow-integrity tests for blocked transitions
- targeted tests for terminal-state distinction
- targeted tests for progress-proof emission and final-proof presence
- proof-time tests for missing gate artifacts

### Phase 4: Context-pressure middleware

Make context usage a first-class runtime concern.

Deliverables:

- normalized context-usage adapter for Codex event sources and fallback estimation
- enforced thresholds at 55/65/70/80/90 percent
- hard block on new work after 70 percent until checkpoint/handoff is recorded
- surfaced confidence level when usage is estimated instead of directly observed
- explicit decision and implementation policy for whether trusted operator override exists at 70 percent handoff

Primary surfaces:

- `src/admin.ts`
- `src/core/service.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`
- `src/admin/runtime-surface.ts`
- `src/sql/migrations/*.sql`

Acceptance criteria:

- root manager, specialists, reviewers, and micro-subagents all use the same policy
- status/ops output can show handoff prep, soft limit, handoff required, emergency compact, and abort states
- context pressure becomes release-blocking for claimed autonomous runs
- the roadmap records whether operator override is supported, and if supported, under what trust and audit conditions

Verification:

- unit coverage for threshold transitions
- integration coverage for handoff-required blocking
- eval fixture where an agent tries to continue past 70 percent and is rejected

### Phase 5: Handoff engine and resumable continuity

Turn checkpoints and handoffs into the default continuity primitive.

Deliverables:

- structured handoff schema for context-pressure, strategic, blocker, review, and contradiction handoffs
- required handoff fields: open work, completed work, evidence refs, next steps, target role, checkpoint ref
- same-role successor flow for context pressure
- parent/child continuity for partial micro-subagent work

Primary surfaces:

- `src/core/service.ts`
- `src/admin.ts`
- `src/docs-export/summarizer.ts`
- `src/domain/contracts.ts`
- `src/store/postgres-store.ts`
- `src/store/memory-store.ts`

Acceptance criteria:

- a run can resume from runtime state without prior transcript dependence
- context-pressure handoffs are distinguishable from strategic and blocker handoffs
- incomplete work cannot disappear into summaries

Verification:

- checkpoint/resume integration tests
- workflow-proof guardrails for missing required handoffs
- report/status tests covering partial, blocked, resumed, and completed states

### Phase 6: Specialist parent-child runtime model

Define the runtime model for delegation before expanding the full micro-agent catalog.

Deliverables:

- parent/child job records and child-job state machine
- dispatcher contract for bounded delegation
- parent responsibilities for ingesting, validating, and closing child work
- explicit absorbed/blocked/cancelled child resolution rules

Primary surfaces:

- `src/runtime/agent-dispatcher.ts`
- `src/runtime/autonomous-execution.ts`
- `src/core/service.ts`
- `src/domain/types.ts`

Acceptance criteria:

- child jobs have explicit lifecycle states
- parents cannot declare completion while child jobs are unresolved
- contradiction and partial-result paths are explicit at the runtime layer

Verification:

- contract tests for child-job lifecycle
- workflow-gate tests for unresolved child-job blocking

### Phase 7: Specialist hierarchy and micro-agent catalog

Move from a flat role catalog to bounded specialist teams.

Deliverables:

- per-role subagent capability registry
- generated or canonicalized micro-agent catalog artifacts
- explicit spawn budgets, max depth, max fanout, and write-scope rules
- schema-validated micro-agent outputs
- contradiction handling when child outputs disagree

Primary surfaces:

- `src/devgod/agent-catalog.ts`
- `.codex/agents/*.toml`
- `src/runtime/autonomous-execution.ts`
- `src/admin.ts`
- `src/mcp/tools.ts`

Acceptance criteria:

- planner, architect, delivery, QA, reviewer, security, docs, memory, and runtime roles can each delegate only approved child work
- depth-2 delegation is exceptional and budgeted
- child outputs cannot silently mutate canonical state without validation

Verification:

- contract tests for per-role delegation rules
- evals for runaway fanout, out-of-scope writes, and contradictory child outputs

### Phase 8: Least-privilege and side-effect approval policy

Make role risk, tool access, sandbox defaults, and side-effect approvals explicit.

Deliverables:

- per-role sandbox defaults
- tool allow/deny policy for managers, specialists, reviewers, and micro-agents
- side-effect approval rules for destructive or externally impactful actions
- MCP permission and approval posture for runtime tools
- explicit policy for which MCP and local actions are auto-approved versus prompt-approved in trusted repos

Primary surfaces:

- `.codex/agents/*.toml`
- `src/devgod/agent-catalog.ts`
- `src/mcp/tools.ts`
- `src/mcp/server.ts`
- `AGENTS.md`

Acceptance criteria:

- least privilege is encoded per role class, not left to convention
- risky side effects have explicit approval or blocking rules
- MCP and tool permissions follow the same governance model as agent delegation

Verification:

- contract tests for per-role permission defaults
- targeted tests for blocked destructive actions and approval-required paths

### Phase 9: Debate and contradiction gates

Operationalize multi-agent debate only where it improves quality.

Deliverables:

- runtime debate-session records
- explicit triggers for architecture, blocker-closure, contradiction, high-risk patch, and final-done gates
- dissent-owner capture
- decision packet integration with workflow proof and task closeout

Primary surfaces:

- `src/core/service.ts`
- `src/admin.ts`
- `src/devgod/workflow-schema.ts`
- `.devgod/rules/design-council-policy.md`
- `.devgod/templates/dac-decision-packet.md`

Acceptance criteria:

- debate is not default behavior
- missing required debate records can block completion
- contradictions open tracked gaps instead of being flattened into manager prose

Verification:

- workflow-integrity tests for debate-required tasks
- eval fixtures for contradiction without adjudication

### Phase 10: Operator command surface

Expose the company loop through explicit operator-facing commands.

Deliverables:

- `devgod loop --agentic`
- `devgod agents compile`
- `devgod context status`
- `devgod context enforce`
- `devgod handoff create`
- `devgod handoff list`
- `devgod handoff consume`
- `devgod subagent jobs`
- `devgod debate list`
- `devgod proof --run-id latest`
- `devgod agents verify`

Primary surfaces:

- `src/admin.ts`
- `src/admin/status.ts`
- `src/admin/ops.ts`

Acceptance criteria:

- the command surface matches the target docs
- context, handoff, child-job, debate, and proof state are inspectable without reading raw runtime records
- agent catalog compilation and context enforcement are first-class operator actions, not hidden implementation details

Verification:

- command-surface tests for each operator command
- status-report and admin command tests

### Phase 11: Codex-native runtime adapters

Wire the runtime to real Codex execution signals.

Deliverables:

- adapters for Codex CLI JSONL, app-server streams, and automation continuations
- supervisor/daemon behavior that treats structured handoff as the continuation source of truth
- same-thread versus fresh-thread continuation policy
- context compaction integration path for Codex and DevGod-owned API workflows
- explicit policy that automations act as heartbeat/resume triggers, never as an authority layer

Primary surfaces:

- `src/runtime/codex-session-adapter.ts`
- `src/runtime/context-compression.ts`
- `src/admin/runtime-surface.ts`
- `src/admin.ts`
- `src/ui/server.ts`

Acceptance criteria:

- same-thread vs fresh-thread continuation is explicit
- Codex-native execution is the default path, not a side note in docs

Verification:

- adapter tests for CLI JSONL, app-server, and automation event ingestion
- focused end-to-end proof for daemon/supervisor handoff continuation

### Phase 12: UI and MCP exposure

Expose the same runtime truth through richer operator surfaces.

Deliverables:

- UI panels for active agents, context pressure, blockers, handoffs, debates, and next target
- MCP tools for runtime state, ledgers, handoffs, debates, and job inspection
- approval-aware MCP exposure

Primary surfaces:

- `src/ui/server.ts`
- `src/mcp/server.ts`
- `src/mcp/tools.ts`

Acceptance criteria:

- UI and MCP expose the same company-loop state as the CLI
- approval-aware MCP behavior matches least-privilege policy

Verification:

- focused MCP contract tests
- focused UI/runtime-surface tests

### Phase 13: Anti-looseness eval and release gate hardening

Make shallow pseudo-autonomy fail.

Deliverables:

- eval fixtures for false completion, missing handoff, ignored blocker, unbounded delegation, and missing review evidence
- release checks that distinguish advisory docs from runtime-enforced behavior
- regression suite for company-loop invariants

Primary surfaces:

- `src/evals/*`
- `tests/orchestration-*.test.ts`
- `tests/workflow-integrity.test.ts`
- `tests/status-report.test.ts`
- `tests/admin.test.ts`

Acceptance criteria:

- "answered confidently" is never enough to close a run
- autonomy claims have explicit failing tests when enforcement is absent
- release readiness reports the remaining gap between shipped substrate and enforced company-loop behavior

Verification:

- targeted eval suite
- `npm run check:quality`
- workflow proof for the migration task family

### Phase 14: Package, template, and migration rollout

Ship the company-loop model into downstream repos safely.

Deliverables:

- updated installer and scaffold defaults
- role/team docs aligned to runtime behavior
- operator runbooks and command docs for the company-loop control surface
- migration notes for consuming repos
- explicit optional-vs-core boundary for UI, Grafana, Playwright, and other extras
- explicit artifact-format guidance for task packets, including Markdown plus JSON frontmatter where required by the portability contract

Primary surfaces:

- `src/install/cli.ts`
- `src/install/merge.ts`
- `README.md`
- `docs/current-state.md`
- `.devgod/templates/*`

Acceptance criteria:

- downstream repos get the new governance model by default where supported
- optional modules do not masquerade as core autonomy requirements
- public docs distinguish shipped enforcement from future roadmap items
- operator-facing docs explain the commands, override policy if any, and authoritative artifact surfaces

Verification:

- install/happy-path tests
- release-overlay verification
- packed install checks

## Recommended execution order

1. Phase 1 company-kernel contract
2. Phase 2 run-profile and phase-readiness engine
3. Phase 3 workflow gates and completion enforcement
4. Phase 4 context-pressure middleware
5. Phase 5 handoff engine
6. Phase 6 specialist parent-child runtime model
7. Phase 7 specialist hierarchy and micro-agent catalog
8. Phase 8 least-privilege and side-effect approval policy
9. Phase 9 debate gates
10. Phase 10 operator command surface
11. Phase 11 Codex-native runtime adapters
12. Phase 12 UI and MCP exposure
13. Phase 13 anti-looseness evals
14. Phase 14 downstream rollout

This order matters. The repo already has coverage/gap/checkpoint substrate; the first missing layer is runtime authority over context pressure and delegation, not more passive planning prose.

## First thin slices

### Slice A

`DG-011-company-kernel-contract`

- align runtime phase/owner/blocker types
- add run-profile and coverage-target contracts
- reconcile docs that currently overclaim autonomy
- add tests for canonical run lifecycle transitions

### Slice B

`DG-012-workflow-gates-and-readiness`

- add workflow-gates enforcement for completion-state transitions
- add progress-proof emission and final-proof requirements
- add run-profile selection and phase-readiness blocking
- add terminal-state distinction for partial, blocked, failed, and done

### Slice C

`DG-013-context-pressure-and-handoff-foundation`

- add context-usage adapter and threshold model
- surface context pressure in status/ops
- add structured handoff types and storage
- wire resume logic to handoff/checkpoint truth
- add proof-time rejection for missing required handoffs

## Main risks

- implementing company-loop prose without runtime enforcement
- adding delegation without bounded budgets and write scopes
- overusing debate and turning the loop into approval theatre
- claiming Codex-native support without consuming real CLI/app-server event signals
- letting docs and status imply "done" before anti-looseness evals exist

## Done bar for the roadmap program

The program is complete when `devgod` can run a non-trivial task through manager-led decomposition, bounded specialist delegation, uniform 70% context handoff, evidence-backed review gates, and resumable continuity, and the runtime can prove that behavior without relying on transcript vibes.
