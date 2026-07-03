# DevGod Agentic Company Loop — Software Design Document

**Document type:** Software Design Document
**Target repository:** `WitchyNibbles/DevGod`
**Prepared on:** 2026-06-20
**Primary objective:** Define the product, workflow, user experience, and operating model required for DevGod to behave like a disciplined Codex-powered software development company.

---

## 1. Product Vision

DevGod should make Codex behave less like “one very capable coding chat” and more like a small engineering organization:

- It receives work.
- It clarifies scope.
- It decomposes tasks.
- It assigns specialists.
- Specialists delegate lower-level work.
- It verifies evidence.
- It debates high-risk decisions.
- It hands off when context is getting fat and stupid.
- It resumes from structured state instead of vibes.
- It stops only when done or genuinely blocked.

The current system already has many of the ingredients: agent roles, skills, runtime state, review gates, workflow proof, MCP/UI surfaces, and autonomous execution concepts. The product problem is that the behavior still feels too close to baseline Codex: useful, but loose. Helpful, but not institutionally reliable. A brilliant intern with root access and a caffeine problem.

This design converts DevGod into an **agentic company loop** with explicit departments, roles, task ownership, subagent delegation, context handoff, debate gates, and measurable completion.

---

## 2. Product Goals

| Goal | Description |
|---|---|
| Company-like operation | DevGod acts as an engineering organization with managers, specialists, QA, security, docs, release, and memory roles. |
| Persistent agentic loop | Work continues through discovery, planning, implementation, validation, repair, and review until done or blocked. |
| 70% context handoff | Every agent and subagent must hand off when context reaches 70% usage. |
| Specialist subteams | Specialist agents can delegate lower-level tasks to micro-subagents. |
| Evidence-backed progress | State, proofs, ledgers, gaps, tests, traces, reviews, and handoffs back all completion claims. |
| Controlled debate | Multi-agent debate is used at high-risk decision gates, not for every sneeze. |
| Codex-native workflow | DevGod uses Codex subagents, `exec`, app-server, automations, AGENTS.md, MCP, and Codex config instead of ignoring the platform. |
| Anti-looseness | DevGod must fail tests/evals when it behaves like plain Codex plus fancy stationery. |

---

## 3. Non-Goals

| Non-goal | Reason |
|---|---|
| Replacing Codex | Codex remains the execution substrate. DevGod adds governance and state. |
| Infinite agent hierarchy | Unbounded recursion is not organization; it is distributed confusion. |
| Human-free production deployment | Risky side effects still need explicit policy and approval. |
| Debate as default behavior | Debate is reserved for gates where disagreement improves outcome quality. |
| Memories as required authority | Memories are optional recall; checked-in docs and runtime state are authority. |
| One universal agent prompt | Different roles need different instructions, tools, budgets, and output schemas. |

---

## 4. Target Users

| User | Needs |
|---|---|
| Solo maintainer | Wants Codex to keep moving on large code tasks without constantly losing the thread. |
| Legacy-codebase developer | Wants reverse engineering, test repair, migration planning, and safe incremental changes. |
| Tech lead | Wants scoped plans, traceable decisions, review gates, and progress reports. |
| Reviewer | Wants evidence that claims are true and incomplete work is not being laundered as done. |
| Operator | Wants dashboards, logs, context state, blockers, and restart/resume controls. |
| Security/compliance reviewer | Wants auditability, permission boundaries, and no agent casually rummaging through secrets like a raccoon in a server closet. |

---

## 5. Product Requirements

### 5.1 Functional requirements

| ID | Requirement | Priority |
|---|---|---:|
| FR-1 | DevGod must run an autonomous loop for non-trivial tasks. | P0 |
| FR-2 | DevGod must track each run phase, task, owner, active agent, and blocker. | P0 |
| FR-3 | Every agent and subagent must be subject to the same context-pressure policy. | P0 |
| FR-4 | At 70% context usage, an agent must checkpoint and hand off before new work. | P0 |
| FR-5 | Handoff must include open work, completed work, evidence refs, next actions, checkpoint, compact summary, and target role. | P0 |
| FR-6 | Specialists must be able to dispatch approved lower-level subagents. | P0 |
| FR-7 | Subagent outputs must be schema-validated and evidence-backed. | P0 |
| FR-8 | Multi-agent debate must trigger at defined high-risk gates. | P1 |
| FR-9 | DevGod must block completion when required debates, reviews, proofs, validations, or handoffs are missing. | P0 |
| FR-10 | DevGod must expose operator commands for context status, handoffs, subagent jobs, debates, blockers, and run loop state. | P1 |
| FR-11 | DevGod must support Codex-native execution through subagents, `exec --json`, app-server, automations, AGENTS.md, and MCP. | P1 |
| FR-12 | DevGod must ship eval fixtures that detect shallow completion and context-loss failures. | P0 |

### 5.2 Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | Resumability | A run can resume from runtime state without relying on prior chat transcript. |
| NFR-2 | Auditability | Every decision and completion claim points to evidence refs. |
| NFR-3 | Predictable fanout | Agent spawning is bounded by role, depth, count, and budget. |
| NFR-4 | Least privilege | Default sandbox/tool permissions match role risk. |
| NFR-5 | Operator clarity | Status surfaces show current phase, active owners, context pressure, blockers, and next target. |
| NFR-6 | Testability | Context handoff, subagent delegation, debate gates, and completion gates are unit/integration/eval tested. |
| NFR-7 | Portability | Core artifacts remain inspectable as JSON/Markdown exports. |
| NFR-8 | Failure transparency | Partial, blocked, failed, and done are distinct states. No “done-ish” nonsense. |

---

## 6. Operating Model: DevGod as a Software Company

### 6.1 Organization chart

```text
DevGod Root Manager
├── Product / Planning
│   ├── Product Strategist
│   ├── Planner
│   └── Scope / acceptance micro-agents
├── Architecture
│   ├── Solution Architect
│   ├── Dependency Mapper
│   ├── Boundary Analyst
│   └── Legacy Trap Scout
├── Delivery
│   ├── Backend Engineer
│   ├── Frontend Designer
│   ├── Data Engineer
│   ├── Infra Engineer
│   └── Patch / route / schema / config micro-agents
├── Quality
│   ├── Reviewer
│   ├── QA Engineer
│   ├── E2E Runner
│   ├── Release Readiness
│   └── Regression / flake / coverage micro-agents
├── Security / Compliance
│   ├── Security Reviewer
│   ├── Compliance Reviewer
│   └── Authz / secret / dependency-risk micro-agents
├── Knowledge / Memory
│   ├── Docs Researcher
│   ├── Technical Writer
│   ├── Memory Curator
│   └── Decision / checkpoint / docs micro-agents
└── Agent Runtime
    ├── Agent Runtime Engineer
    ├── Eval Engineer
    └── Codex-event / handoff / MCP contract micro-agents
```

### 6.2 Authority model

| Authority | Owner | Example |
|---|---|---|
| Run state | DevGod runtime | active phase, task status, owner, blocker state |
| Work ownership | Root manager / planner | task assignment, handoff target, next directive |
| Technical design | Solution architect | architecture decisions, migration phases |
| Implementation | Delivery specialist | code changes and local tests |
| Verification | QA/reviewer/security | pass/fail review decisions |
| Durable memory | Memory curator | approved facts, checkpoint summaries, decision logs |
| Final completion | Blocking review trio + workflow proof | done gate |

### 6.3 Role responsibilities

| Role | Responsibility | Can delegate to |
|---|---|---|
| Root Manager | Owns loop, state, staffing, continuation, and final synthesis. | All specialists. |
| Planner | Decomposes work, task packets, checkpoints, sequencing. | `task_slicer`, `risk_ranker`, `acceptance_criteria_writer`. |
| Product Strategist | Frames user value, scope, acceptance criteria. | `user_story_extractor`, `edge_case_scout`. |
| Solution Architect | Defines boundaries, tradeoffs, migration strategy. | `dependency_mapper`, `boundary_analyst`, `legacy_trap_scout`. |
| Backend Engineer | Implements APIs/services/server logic. | `api_route_scanner`, `service_patch_worker`, `test_writer`. |
| Frontend Designer | Owns UI/UX/frontend implementation quality. | `component_mapper`, `state_flow_tracer`, `a11y_checker`. |
| Data Engineer | Owns data model, migrations, query risk. | `schema_mapper`, `migration_dry_runner`. |
| Infra Engineer | Owns CI, env, deployment, ops safety. | `ci_log_triager`, `env_config_mapper`. |
| QA Engineer | Owns verification, regression, false-completion rejection. | `test_runner`, `regression_hunter`, `flake_investigator`. |
| Reviewer | Reviews correctness and invariants. | `diff_reviewer`, `invariant_checker`. |
| Security Reviewer | Reviews trust boundaries and security regressions. | `authz_path_auditor`, `secret_scanner`. |
| Memory Curator | Promotes durable reviewed state and compaction. | `checkpoint_summarizer`, `decision_recorder`. |
| Eval Engineer | Maintains anti-looseness evals. | `eval_fixture_writer`, `trace_grader`. |
| Agent Runtime Engineer | Maintains orchestration and Codex integration. | `codex_event_parser`, `handoff_schema_validator`. |

---

## 7. Run Lifecycle

### 7.1 Standard lifecycle

```text
1. Intake
2. Scope normalization
3. Run profile selection
4. Coverage target selection
5. Task decomposition
6. Specialist assignment
7. Agentic loop
8. Subagent dispatch as needed
9. Evidence ingestion
10. Context handoff when any agent reaches 70%
11. Validation and repair loops
12. Debate gates for high-risk decisions
13. Blocking reviews
14. Workflow proof
15. Done or blocked report
```

### 7.2 Phase model

| Phase | Purpose | Main owner | Completion signal |
|---|---|---|---|
| `discovery` | Understand request and repo surface. | Planner | Scope and profile recorded. |
| `inventory` | Enumerate relevant files/systems. | Solution architect / cartographer | Inventory threshold met. |
| `dependency_mapping` | Map callsites, graph, fanout. | Solution architect | Critical edges mapped. |
| `risk_analysis` | Rank unknowns and blockers. | Reviewer / architect | Risk matrix exists. |
| `planning` | Create task packets and sequence. | Planner | Accepted plan. |
| `implementation` | Apply scoped changes. | Delivery specialist | Patch and local checks. |
| `validation` | Prove behavior. | QA engineer | Required validation passes. |
| `regression_detection` | Hunt side effects. | QA/reviewer | No critical regression. |
| `security_review` | Check trust boundaries. | Security reviewer | Security approval or blocker. |
| `final_verification` | Verify proof and reviews. | Blocking trio | Workflow proof passes. |
| `done` | Final state. | Root manager | Done report. |
| `blocked` | Real blocker. | Root manager | Blocker report + resume trigger. |

---

## 8. Context Lifecycle and Handoff UX

### 8.1 Product rule

Every agent has a visible context meter. When that meter reaches 70%, the agent must hand off. This includes:

- root manager
- planners
- architects
- implementation specialists
- QA/review/security agents
- documentation/memory agents
- micro-subagents

No exceptions for “just one more thing.” That phrase has personally murdered more clean software process than most outage reports.

### 8.2 Threshold behavior

| Threshold | User-visible behavior | Agent behavior |
|---:|---|---|
| 55% | Status shows `handoff prep`. | Drafts handoff skeleton. |
| 65% | Status shows `soft limit`. | Stops broad exploration, finishes atomic step only. |
| 70% | Status shows `handoff required`. | Blocks new work, checkpoints, compacts, creates handoff. |
| 80% | Status shows `emergency compact`. | Only saves state and compresses. |
| 90% | Status shows `abort to checkpoint`. | Stops all non-checkpoint work. |

### 8.3 Handoff types

| Type | Description | Example |
|---|---|---|
| Context-pressure handoff | Same role, fresh context, same work. | Backend engineer at 70% hands to backend engineer successor. |
| Strategic handoff | Ownership moves to another role. | Architect finishes plan; backend engineer implements. |
| Child handoff | Micro-subagent hits 70% or partial boundary. | Dependency mapper emits partial map, successor continues. |
| Blocker handoff | Work cannot safely continue. | Runtime tracer blocked by missing env; infra engineer receives. |
| Review handoff | Work moves to validation/review. | Implementation complete; QA and reviewer take over. |
| Contradiction handoff | Conflicting claims require independent validation. | Two agents disagree on auth behavior; security reviewer validates. |

### 8.4 Handoff content

A valid handoff must include:

- run id
- phase
- from/to role
- reason
- context usage at handoff
- active task/subtask
- completed work
- open work
- decisions made
- evidence refs
- open gaps
- unresolved contradictions
- files read
- files changed
- write scope
- validation commands
- next actions
- checkpoint id
- compact summary ref
- child job statuses

### 8.5 User-facing handoff report

```text
Handoff required: backend_engineer / thread be_014
Reason: context pressure 72%
Checkpoint: cp_028
Compact summary: ctx_028_backend.md
Successor: backend_engineer / thread be_015

Completed:
  - mapped invoice create flow
  - added failing test for duplicate invoice retry
  - found hidden retry job callsite

Open:
  - implement idempotency guard
  - run billing integration tests
  - ask qa_engineer to verify regression path

Risk:
  - payment integration side effects not runtime traced
```

---

## 9. Specialist Subagent UX

### 9.1 How specialists delegate

A specialist may delegate only when:

1. The subtask is narrow.
2. A matching micro-agent exists.
3. The output schema is known.
4. The parent has spawn budget.
5. The task packet allows delegation.
6. The subagent write scope is safe.

Example:

```text
backend_engineer receives task: fix invoice retry bug
  -> api_route_scanner maps relevant routes
  -> query_inspector checks DB writes
  -> test_writer creates regression test
  -> service_patch_worker proposes patch
  -> qa_engineer/test_runner validates
```

### 9.2 Subagent status states

| State | Meaning |
|---|---|
| `queued` | Waiting for dispatch. |
| `running` | Active Codex subagent/thread. |
| `partial` | Returned partial evidence, more work remains. |
| `handoff_required` | Hit 70%; needs successor or parent absorption. |
| `complete` | Output schema valid and accepted. |
| `blocked` | Cannot proceed safely. |
| `failed` | Tool/model/runtime failure. |
| `cancelled` | Parent cancelled or superseded. |

### 9.3 Parent responsibilities

The parent specialist must:

- define scope
- define acceptance criteria
- set write boundary
- choose micro-agent
- ingest result
- resolve contradictions
- decide whether result is sufficient
- update task/gap/proof records

The parent cannot blindly paste child output into final answer. That is not delegation; that is outsourcing negligence with extra steps.

---

## 10. Multi-Agent Debate Product Design

### 10.1 Purpose

Multi-agent debate is used to improve high-risk decisions by forcing independent views, critique, dissent capture, and evidence-backed synthesis.

It is not used for routine work. A three-agent debate about fixing a typo would be a cry for help.

### 10.2 Required debate gates

| Gate | Trigger |
|---|---|
| Architecture strategy | Choosing target architecture or migration strategy. |
| Legacy rewrite readiness | Before recommending a rewrite or modernization path. |
| High-risk implementation | Auth, data migrations, payments, destructive operations, production-impacting code. |
| Critical blocker closure | Closing blocker that previously stopped work. |
| Contradiction resolution | Evidence conflicts on important behavior. |
| Final done | Before final completion for substantial work. |

### 10.3 Debate workflow

```text
1. Manager opens debate.
2. Participants receive same evidence packet.
3. Each participant gives independent claim.
4. Participants critique other claims.
5. Participants revise position.
6. Manager or judge synthesizes decision.
7. Dissent and required follow-ups are recorded.
8. Gate passes, blocks, or asks for more evidence.
```

### 10.4 Debate participant behavior

Every participant must provide:

- position: approve, reject, approve with conditions, or insufficient evidence
- claim
- evidence refs
- assumptions
- risks
- required conditions
- confidence
- dissent, if any

### 10.5 Decision outcomes

| Outcome | Meaning |
|---|---|
| `approved` | Gate passes. |
| `approved_with_conditions` | Gate passes only if conditions become tasks/gaps. |
| `needs_more_evidence` | Loop dispatches investigation before proceeding. |
| `blocked` | Work cannot safely proceed. |
| `rejected` | Proposed plan/patch/closure is not acceptable. |

---

## 11. User Stories

### 11.1 Context handoff

**As a maintainer**, I want every agent to hand off at 70% context usage, so long-running work does not dissolve into amnesia and improvisation.

Acceptance criteria:

- Context status lists all active agents.
- Agent at 70% cannot start new work.
- Handoff packet is created and schema-valid.
- Successor agent resumes from handoff packet.
- Old thread is marked handoff-complete.

### 11.2 Specialist delegation

**As a developer**, I want a backend specialist to delegate lower-level scan/test/patch tasks, so broad engineering work is decomposed without me manually prompting every tiny step.

Acceptance criteria:

- Specialist can spawn approved micro-agents.
- Each child has bounded scope and output schema.
- Parent ingests child outputs into progress proof and gaps.
- Invalid child output fails closed.

### 11.3 Architecture debate

**As a tech lead**, I want high-risk architecture recommendations debated by specialist agents before DevGod commits to a path.

Acceptance criteria:

- Architecture gate opens debate.
- Architect, reviewer, QA, security, and relevant domain specialists submit evidence-backed claims.
- Dissent is recorded.
- Decision either approves, blocks, or asks for more evidence.

### 11.4 Shallow completion prevention

**As a reviewer**, I want DevGod blocked from claiming completion after one passing command if coverage/gaps/reviews are incomplete.

Acceptance criteria:

- Completion gate checks ledgers, gaps, validations, handoffs, debates, reviews, and proof.
- Missing evidence blocks `done`.
- Final report distinguishes partial/blocker/done.

### 11.5 Operator visibility

**As an operator**, I want to see active agents, context pressure, open blockers, child jobs, and next target.

Acceptance criteria:

- `devgod status` includes agentic summary.
- `devgod context status` lists per-thread ratios.
- `devgod subagent jobs` lists child work.
- `devgod debate list` shows gate state.
- UI/MCP can expose same data.

---

## 12. UX / Command Design

### 12.1 Core commands

| Command | User value |
|---|---|
| `devgod loop --agentic` | Start/resume strict autonomous loop. |
| `devgod status` | See run phase, owners, blockers, gates. |
| `devgod context status` | See context pressure for all agents. |
| `devgod handoff list` | Inspect handoff history. |
| `devgod handoff consume <id>` | Resume from handoff. |
| `devgod subagent jobs` | Inspect child jobs. |
| `devgod debate list` | Inspect required debates and decisions. |
| `devgod proof --run-id latest` | Inspect completion proof status. |
| `devgod agents verify` | Verify agent catalog/config drift. |

### 12.2 Status screen design

```text
DevGod Run: run_123
Profile: legacy_migration
Phase: implementation
Directive: validate_patch

Owners:
  Manager: planner
  Current specialist: backend_engineer
  Quality gates: reviewer, qa_engineer, security_reviewer

Agent context:
  planner/root                43% normal
  backend_engineer/be_015     68% soft_limit
  test_writer/tw_002          31% normal
  regression_hunter/rg_004    72% handoff_required

Subagent jobs:
  tw_002 complete        regression test created
  rg_004 handoff_required checkpoint cp_044

Open gates:
  - context_handoff_required: rg_004
  - required_validation_missing: billing integration tests

Next action:
  consume handoff for regression_hunter rg_004, then run validation.
```

### 12.3 Handoff packet Markdown view

```markdown
# Agent Handoff: handoff_abc123

## Reason
Context pressure reached 72%.

## From / To
- From: regression_hunter / rg_004
- To: regression_hunter successor

## Completed
- Reproduced failing retry path.
- Confirmed failure appears only when stale cache key exists.

## Open Work
- Check duplicate fallback path in `src/billing/retry.ts`.
- Run `npm test -- billing`.

## Evidence
- `command://run_123/npm-test-billing-044`
- `src/billing/retry.ts:41-88`

## Next Actions
1. Continue fallback path analysis.
2. Open contradiction gap if retry and fallback disagree.
3. Return schema-valid child result to backend engineer.
```

---

## 13. Artifacts

### 13.1 Required runtime artifacts

| Artifact | Format | Authority |
|---|---|---|
| Run record | DB/JSON | Authoritative |
| Task packet | Markdown + JSON frontmatter | Semi-authoritative; runtime validates |
| Coverage ledger | JSON/NDJSON | Authoritative |
| Gap register | JSON/NDJSON | Authoritative |
| Progress proof | JSON | Authoritative |
| Checkpoint | JSON | Authoritative |
| Compact summary | Markdown with refs | Supporting |
| Handoff packet | JSON + Markdown | JSON authoritative |
| Debate record | JSON + Markdown | JSON authoritative |
| Review decision | JSON/Markdown | Authoritative once signed/recorded |
| Final report | Markdown | Projection of authoritative state |

### 13.2 New templates

```text
.devgod/templates/handoff-packet.md
.devgod/templates/debate-record.md
.devgod/templates/subagent-job.md
.devgod/templates/context-summary.md
.devgod/templates/agentic-run-report.md
```

### 13.3 New schemas

```text
.devgod/schemas/handoff-packet.schema.json
.devgod/schemas/subagent-job.schema.json
.devgod/schemas/subagent-result.schema.json
.devgod/schemas/debate-session.schema.json
.devgod/schemas/debate-decision.schema.json
.devgod/schemas/context-measurement.schema.json
```

---

## 14. Completion Definition

### 14.1 Run is done only when

- Required coverage thresholds pass.
- No blocking gaps remain.
- All active context handoffs are resolved.
- All child jobs are complete, blocked, cancelled, or absorbed.
- Required debates are closed with acceptable decisions.
- Required tests/validations pass.
- Regression detection is complete.
- Blocking trio reviews pass.
- Workflow proof passes.
- Final progress proof exists.

### 14.2 Task is done only when

- Acceptance criteria pass.
- Touched ledger items are updated.
- Evidence refs exist.
- Required validations pass.
- Required reviews pass.
- Residual risk is either closed or promoted to blocker.
- Context/handoff state is clean.

### 14.3 Explicit non-done states

| State | Meaning |
|---|---|
| `partial_report` | Useful interim result, not completion. |
| `blocked` | Cannot proceed safely or legally without external input/resource. |
| `failed` | Tool/runtime/test failure needs recovery. |
| `needs_more_evidence` | Reasonable path exists, but evidence is insufficient. |
| `handoff_required` | Work cannot continue in current thread due to context pressure. |

---

## 15. Governance and Safety

### 15.1 Permission posture

| Work type | Default policy |
|---|---|
| Read-only analysis | Allowed for relevant roles. |
| Workflow artifact writes | Allowed for managers/knowledge roles. |
| Code writes | Delivery specialists only, scoped by task packet. |
| Test execution | Allowed under sandbox policy. |
| Dependency install/update | Approval required. |
| DB migrations | Approval or dry-run requirement. |
| Secrets access | Deny by default. |
| Network calls | Docs/tooling allowlist, otherwise approval. |
| Git push/force/rebase | Explicit operator approval. |
| Production access | Deny by default. |

### 15.2 Review authority

The universal blocking review trio remains:

- `reviewer`
- `qa_engineer`
- `security_reviewer`

They block final completion. Optional/domain roles can contribute evidence but are not silent global blockers unless run profile requires them.

### 15.3 Human intervention

Human/operator approval is required when:

- action may destroy data
- action touches production or secrets
- migration cannot be safely dry-run
- security reviewer flags exploit risk
- review identity cannot be verified
- Codex/tool environment is inconsistent
- DevGod cannot determine context ratio with enough confidence for high-risk work

---

## 16. Metrics and Success Criteria

### 16.1 Product metrics

| Metric | Success threshold |
|---|---:|
| Long-run resume success after 70% handoff | >= 90% eval pass |
| False completion blocked | 100% on fixtures |
| Required handoff packet validity | 100% |
| Required debate gate trigger rate | >= 95% |
| Subagent output schema validity | >= 95% |
| Unbounded spawn incidents | 0 |
| Write-scope violations missed | 0 in tests |
| Completion with unresolved context handoff | 0 |

### 16.2 Qualitative success

DevGod should feel different from core Codex when:

- it does not forget long-running context
- it decomposes work without manual babysitting
- it escalates contradictions instead of smoothing them over
- it explains why the next target was selected
- it refuses to call work done without evidence
- it can recover from interruptions
- it produces useful handoff and review artifacts

---

## 17. Rollout Plan

### Stage 1 — Shadow mode

- Measure context ratio for all agents.
- Draft handoff packets at 55%.
- Do not block yet.
- Record where current behavior would have failed.

Exit criteria:

- Context measurements are visible in status.
- Shadow handoff packets validate.

### Stage 2 — Soft enforcement

- Warn at 65%.
- Require handoff draft by 70%, but allow operator override.
- Add eval fixtures.

Exit criteria:

- No major false positives.
- Successor resumes from handoff in test runs.

### Stage 3 — Hard 70% enforcement

- Block new work at 70% for all agents.
- Require checkpoint + handoff.
- Completion blocked if handoffs unresolved.

Exit criteria:

- Root/specialist/subagent parity verified.

### Stage 4 — Specialist subteams

- Enable micro-agent catalog.
- Add dispatcher budget/depth policy.
- Generate/verify `.codex/agents/*.toml`.

Exit criteria:

- Specialists delegate safely in eval scenarios.

### Stage 5 — Debate gates

- Enable architecture/high-risk/blocker/final debate gates.
- Add UI/CLI views.

Exit criteria:

- Debates block insufficient evidence and preserve dissent.

### Stage 6 — Default agentic company mode

- Enable for non-trivial runs by default.
- Keep opt-out for tiny tasks.
- Publish operator docs.

Exit criteria:

- Anti-looseness benchmark improves over baseline.

---

## 18. Example End-to-End Scenario

### Scenario: legacy billing bug

1. User asks DevGod to fix intermittent duplicate invoice retries.
2. Planner classifies task as `bug_fix_high_risk` because billing and external payment behavior are involved.
3. Product strategist writes acceptance criteria.
4. Solution architect dispatches:
   - `dependency_mapper`
   - `schema_mapper`
   - `legacy_trap_scout`
5. Backend engineer dispatches:
   - `api_route_scanner`
   - `test_writer`
   - `query_inspector`
6. `dependency_mapper` reaches 70% context and emits handoff.
7. Successor `dependency_mapper` consumes handoff and finishes callsite mapping.
8. Results reveal contradiction: retry job and fallback route use different idempotency keys.
9. Debate opens for contradiction resolution.
10. Security reviewer flags payment side-effect risk.
11. Runtime tracer or safe test harness validates behavior.
12. Backend engineer implements scoped patch.
13. QA engineer runs billing tests and regression hunter checks duplicate fallback path.
14. Reviewer verifies invariant.
15. Security reviewer approves trust boundary unchanged.
16. Workflow proof passes.
17. Final report cites evidence, closed gaps, validation, debate decision, and handoff continuity.

### Final behavior

DevGod does not simply say “fixed.” It proves what it understood, what changed, what was tested, who reviewed it, and how the long context rollover was preserved. Finally, an agent that doesn’t leave the room holding a half-written sticky note and a dangerous amount of confidence.

---

## 19. Multi-Agent Debate Outcome Summary

The design debate converged on these product principles:

1. **Manager-owned orchestration beats swarm democracy.**
2. **Context handoff must be runtime-enforced, not prompt-enforced.**
3. **Specialists should delegate, but only through bounded micro-agent contracts.**
4. **Debate belongs at gates, not everywhere.**
5. **Runtime state is authority; Markdown is a projection.**
6. **Codex-native primitives should be used directly.**
7. **Completion must be evidence-backed and review-backed.**
8. **Every role follows the same 70% context lifecycle.**

---

## 20. Recommended MVP

The MVP should include:

1. Context status for every active agent thread.
2. 70% hard handoff gate.
3. Handoff packet schema and CLI.
4. Same-role successor resume.
5. Subagent job registry and schema-validated result ingestion.
6. Minimal micro-agent catalog for:
   - `dependency_mapper`
   - `test_writer`
   - `regression_hunter`
   - `handoff_schema_validator`
7. Completion gate that blocks unresolved context handoffs.
8. Evals proving shallow completion and context-loss failures are caught.

Do not start with twenty-seven micro-agents and a grand mythology. Start with the spine. Add organs later. The monster will have plenty of time to become complicated.

---

## 21. Final Product Shape

When this design lands, DevGod should operate like this:

```text
User asks for work.
DevGod creates run and plan.
Manager selects specialist.
Specialist delegates low-level subtasks.
All agents produce schema-valid evidence.
Context pressure is continuously monitored.
At 70%, any agent hands off with checkpoint and compact summary.
High-risk decisions go through debate.
Reviews and workflow proof block completion.
Run continues until done or blocked.
```

That is the difference between “using Codex” and “running a Codex-powered engineering organization.” One is a tool. The other is a process with receipts. Receipts are annoying. Receipts are also how we avoid pretending a model’s confident shrug is a delivery pipeline.
