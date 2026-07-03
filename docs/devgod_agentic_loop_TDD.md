# DevGod Agentic Company Loop — Technical Design Document

**Document type:** Technical Design Document
**Target repository:** `WitchyNibbles/DevGod`
**Prepared on:** 2026-06-20
**Primary objective:** Turn DevGod from a loose Codex workflow overlay into a governed, resumable, multi-agent engineering runtime with uniform 70% context handoff and specialist subagent delegation.

---

## 1. Executive Summary

DevGod already ships a serious amount of scaffolding: a TypeScript CLI/runtime, a `.codex/agents/` catalog, repo-local skills, workflow checks, review proof, MCP/UI surfaces, runtime state, checkpoints, coverage/gap concepts, and automation commands. The weak point is not lack of nouns. The weak point is authority: too much behavior can still be treated as conversational guidance instead of runtime-enforced process. In other words, the project owns the costume; this design gives it bones. 🦴

This TDD proposes a **Codex-native orchestration layer** that uses existing DevGod runtime state as the authority while exploiting current Codex capabilities:

- **Codex subagents** for bounded parallel specialist work.
- **Codex `exec --json`** for machine-readable event streams, usage accounting, and CI/automation integration.
- **Codex app-server** for deeper local client integration, streamed events, approvals, conversation history, and thread management.
- **Codex automations** for heartbeat continuation and scheduled maintenance.
- **AGENTS.md + `.codex/agents/*.toml`** for instruction distribution.
- **MCP** for tool expansion under strict permission policy.
- **Responses API compaction** where DevGod owns direct API-backed workflows.
- **Agents SDK patterns** for reasoning about handoffs, guardrails, resumable state, and manager-vs-specialist ownership.

The core design decision is this:

> DevGod should remain the runtime authority. Codex is the worker substrate. Markdown is a projection. Natural-language summaries are decorative until backed by state, evidence, and gates. Yes, prose lied to us again. Shocking.

The proposed implementation adds five runtime pillars:

1. **Agentic Run Loop** — a strict loop that continuously selects the next highest-value task until completion gates pass or a real blocker exists.
2. **Uniform Context Pressure Middleware** — every agent and subagent is wrapped by the same 55/65/70/80/90% context lifecycle; at 70%, handoff becomes mandatory.
3. **Handoff Engine** — context-pressure, strategic, blocker, and ownership handoffs produce structured, resumable artifacts.
4. **Specialist Subagent Hierarchy** — existing DevGod roles can delegate lower-level work to bounded micro-agents with explicit schemas, budgets, and write boundaries.
5. **Multi-Agent Debate Engine** — debates occur only at high-risk decision gates, not constantly, because otherwise DevGod becomes a committee meeting wearing a trench coat.

---

## 2. Research Inputs Reviewed

### 2.1 DevGod repository evidence

| Area | Evidence reviewed | Design consequence |
|---|---|---|
| Package surface | `package.json` lists `.codex/agents/*.toml`, many repo-local skills, CLI scripts, MCP/UI/runtime modules, workflow checks, evals, and automation scripts. | Build on the existing TypeScript package and runtime instead of replacing it. |
| Agent team | `docs/devgod-agent-team.md` defines manager, delivery, quality, knowledge, and domain-specialist roles; `reviewer`, `qa_engineer`, and `security_reviewer` are universal blocking review roles. | Preserve current role model, add subagent hierarchy under specialist roles, and keep blocking trio as completion authority. |
| Codex config | `.codex/config.toml` enables multi-agent mode, request compression, goals, plugin hooks, `max_threads = 8`, `max_depth = 2`, Playwright MCP, and repo/runtime state environment variables. | Treat Codex subagents as available, but add DevGod-side fanout and depth governance because `max_depth = 2` can become chaos with a nice hat. |
| Autonomous redesign | `docs/autonomous-execution-redesign.md` already defines coverage ledgers, gap engine, progress proofs, checkpoint/resume, strict state machine, runtime authority, and continuation loop. | The new design should extend this shipped direction with a concrete context-handoff and subagent execution model, not duplicate it. |
| README/runtime baseline | DevGod describes itself as a manager-led workflow control layer and proof system for Codex-based software work. | The target is not “better prompts”; it is an enforceable software-development-company runtime. |

### 2.2 Codex/OpenAI platform evidence

| Technology | Relevant capability | Design use |
|---|---|---|
| Codex CLI | Local coding agent, open source, can read/change/run code in the selected directory. | Primary worker substrate for local DevGod runs. |
| Codex subagents | Specialized agents can run in parallel; custom agents live under `~/.codex/agents/` or `.codex/agents/`; default `max_threads` is 6 and default `max_depth` is 1; child depth can be configured. | Use current `.codex/agents/` as generated role artifacts and enforce depth/budget from DevGod. |
| Codex `exec --json` | Emits JSONL events including thread/turn events, item events, file changes, commands, MCP calls, plan updates, and `turn.completed.usage` token fields. | Use JSONL as the most practical source for context-pressure measurement and automated job ingestion. |
| Codex app-server | JSON-RPC protocol powering rich clients with authentication, conversation history, approvals, and streamed events. | Use for the future operator UI / daemon integration where live thread orchestration is required. |
| Codex automations | Thread automations can wake an existing thread and preserve context; project automations can run scheduled local jobs. | Use heartbeat-style continuation for active runs and scheduled maintenance for ledgers/evals. |
| AGENTS.md | Codex reads project instructions and supports layered instruction discovery. | Keep repo-wide policy in `AGENTS.md`; generate narrow role behavior into `.codex/agents/*.toml` and skills. |
| MCP | Codex supports MCP servers, tool allow/deny lists, approval modes, and plugin-provided MCP servers. | Expose DevGod runtime, ledger, task, and review operations as MCP tools under strict approval rules. |
| Codex memories | Useful for stable preferences, but required team/project instructions belong in checked-in docs or AGENTS.md. | Do not rely on memories for authority; use them only as optional local recall. |
| Responses API compaction | Compaction reduces context size while preserving state needed for continued work. | Use for DevGod-owned API workflows; for Codex CLI, use DevGod structured handoff plus Codex request compression. |
| Agents SDK orchestration | Recommends handoffs when another specialist should own a branch, and “agents as tools” when a manager remains in control. | Root DevGod manager owns final synthesis; specialists and subagents are bounded workers unless a formal ownership handoff is recorded. |
| Agents SDK guardrails/results | Guardrails can validate inputs/outputs/tools; interrupted runs expose resumable state. | Mirror these patterns in DevGod’s runtime state, workflow gates, and side-effect approvals. |
| Multi-agent debate research | Debate can improve reasoning/factuality in some tasks, but later work suggests benefits depend on agent diversity and intrinsic reasoning strength, not just louder group chats. | Use debate selectively at high-risk gates, require evidence-backed claims, and avoid constant debate theatre. |

### 2.3 Source Links

- DevGod repository: <https://github.com/WitchyNibbles/DevGod>
- DevGod autonomous redesign: <https://github.com/WitchyNibbles/DevGod/blob/main/docs/autonomous-execution-redesign.md>
- DevGod agent team: <https://github.com/WitchyNibbles/DevGod/blob/main/docs/devgod-agent-team.md>
- DevGod package metadata: <https://github.com/WitchyNibbles/DevGod/blob/main/package.json>
- DevGod Codex config: <https://github.com/WitchyNibbles/DevGod/blob/main/.codex/config.toml>
- OpenAI Codex Help: <https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan>
- OpenAI Codex CLI: <https://developers.openai.com/codex/cli>
- OpenAI Codex subagents: <https://developers.openai.com/codex/subagents>
- OpenAI Codex non-interactive mode: <https://developers.openai.com/codex/noninteractive>
- OpenAI Codex app-server: <https://developers.openai.com/codex/app-server>
- OpenAI Codex MCP: <https://developers.openai.com/codex/mcp>
- OpenAI Codex automations: <https://developers.openai.com/codex/automations>
- OpenAI Codex AGENTS.md: <https://developers.openai.com/codex/agents-md>
- OpenAI Codex memories: <https://developers.openai.com/codex/memories>
- OpenAI Responses API compaction: <https://platform.openai.com/docs/guides/compaction?api-mode=responses>
- OpenAI Agents SDK orchestration: <https://openai.github.io/openai-agents-js/guides/multi-agent/>
- OpenAI Agents SDK guardrails: <https://openai.github.io/openai-agents-js/guides/guardrails/>
- OpenAI Agents SDK results/state: <https://openai.github.io/openai-agents-js/guides/results/>
- Multiagent debate paper: <https://arxiv.org/abs/2305.14325>
- Controlled multi-agent debate study: <https://arxiv.org/abs/2511.07784>

---

## 3. Goals and Non-Goals

### 3.1 Goals

1. **Agentic loop by default**
   DevGod continues automatically through analysis, planning, implementation, verification, repair, and review until the run is done or blocked.

2. **Uniform context handoff at 70%**
   Every agent, including lower-level subagents, is wrapped by the same context-pressure policy. At 70% effective context usage, new work is blocked and a checkpoint/handoff is required.

3. **Specialists with subagents**
   Specialist agents can delegate lower-level work to micro-agents such as dependency mappers, test writers, regression hunters, route scanners, schema analysts, and log triagers.

4. **Codex-native implementation**
   Use Codex subagents, `exec --json`, app-server events, automations, MCP, AGENTS.md, and `.codex/agents/*.toml` rather than inventing a parallel fantasy runtime.

5. **Runtime authority**
   State tables, ledgers, gap records, progress proofs, review artifacts, and handoff records are authoritative. Prompt instructions are not authority. Prompt instructions are sticky notes on a flamethrower.

6. **Debate where useful**
   Use multi-agent debate only at architectural, blocker, high-risk implementation, contradiction, and completion gates.

7. **Measurable anti-looseness**
   Add evals and workflow checks that fail when DevGod behaves like vanilla Codex with extra paperwork.

### 3.2 Non-Goals

| Non-goal | Rationale |
|---|---|
| Build a replacement for Codex | Codex is the worker substrate. DevGod should govern and compose it. |
| Infinite recursive agent spawning | The result is cost explosion plus nonsense. A classic enterprise duet. |
| Depend on exact hidden model context windows | Use configured budgets and observed/estimated usage; do not assume unavailable internals. |
| Treat memories as authoritative state | Memories are optional convenience. Runtime state is authority. |
| Debate every action | Debate is a gate mechanism, not a lifestyle choice. |
| Give every agent write access | Exploration and review agents should default to read-only or constrained write boundaries. |

---

## 4. Existing Baseline and Gap Analysis

### 4.1 Existing strengths

DevGod already has:

- A TypeScript package with CLI entrypoint `devgod`.
- A substantial `.codex/agents/` catalog.
- Repo-local skills under `.agents/skills/`.
- Runtime modules under `src/runtime/`, `src/core/`, `src/store/`, `src/mcp/`, and `src/ui/`.
- Workflow checks and quality checks.
- Runtime-backed commands: `status`, `loop`, `daemon`, `supervisor`, `ops`, `recover`, `checkpoint`, `resume`, `coverage`, `gaps`, and related surfaces described in docs/README.
- Review/proof posture with universal blocking roles: `reviewer`, `qa_engineer`, and `security_reviewer`.
- Current Codex project config enabling multi-agent mode, plugin hooks, request compression, `max_threads = 8`, `max_depth = 2`, and Playwright MCP.

### 4.2 Current gaps to close

| Gap | Current symptom | Technical correction |
|---|---|---|
| Context continuity is advisory | Long runs can drift, summarize badly, or stop based on conversation state. | Add `ContextPressureMiddleware`, mandatory 70% checkpoint/handoff, and recovery from structured runtime state. |
| Subagent delegation is shallow | Existing roles exist, but not all roles have lower-level micro-agent delegation contracts. | Add `agent_hierarchy`, `subagent_capability`, `dispatch_budget`, and schema-validated child outputs. |
| Completion can still feel chatty | A plausible answer can masquerade as progress. | Make progress proofs, coverage deltas, gap deltas, and review gates mandatory for state transitions. |
| Debates are not operationalized | Architecture council exists conceptually but not as runtime-gated debate records. | Add `debate_sessions`, `debate_claims`, dissent ownership, decision records, and gate integration. |
| Token/context accounting is not first-class | Codex may expose usage in `exec --json`, but DevGod needs a normalized monitor. | Add adapters for Codex JSONL, app-server events, Responses API usage, and estimation fallback. |
| Agent fanout can escape predictability | Current Codex config allows `max_depth = 2`. | Add DevGod depth/budget governance and per-role spawn policy. |

---

## 5. Architectural Decision Summary

### 5.1 Decision table

| Decision | Chosen design | Reason |
|---|---|---|
| Orchestration owner | Root DevGod Manager owns run state and final answer. | Keeps one authority path; specialists do bounded work. |
| Codex integration | Codex-native first: CLI/app-server/subagents/exec/automations/MCP. | Avoid duplicate worker runtime. |
| Handoff trigger | Mandatory at `context_ratio >= 0.70`; preparation starts earlier. | Prevents “oops, context evaporated” as an architectural strategy. |
| Handoff target | Same-role successor for context pressure; manager-directed specialist for strategic ownership; validator for contradictions. | Maintains continuity while allowing role transitions. |
| Subagent depth | Default DevGod logical depth = 1 under specialists; allow depth 2 only for approved micro-agent classes and budget. | Balances specialization against fanout chaos. |
| Debate scope | Triggered only at gates and contradictions. | Debate is useful; infinite debate is Jira with better grammar. |
| Authority | Runtime DB/state first; markdown exports second; prose last. | Required for auditable autonomy. |
| Context compression | Structured handoff always; model/API compaction when available. | Human-readable continuity plus model-side compression where supported. |
| Guardrails | Runtime guards around side effects, write scopes, and completion. | Agent-level instructions alone are not reliable enforcement. |

---

## 6. Multi-Agent Debate Synthesis

This section records the design debate used to converge the architecture. It is not theatre; it is the trace of competing design pressures.

### 6.1 Participants

| Role | Position |
|---|---|
| Chief Architect | Wants coherent runtime architecture and minimal duplicated systems. |
| Codex Runtime Engineer | Wants Codex-native primitives used directly. |
| Context/Memory Engineer | Wants safe compaction, checkpointing, and resumable handoffs. |
| Agent Orchestration Engineer | Wants specialists, subagents, bounded delegation, and queue semantics. |
| Security/Review Engineer | Wants least privilege, side-effect approval, and non-bypassable gates. |
| Eval Engineer | Wants measurable failure cases, regression fixtures, and anti-looseness tests. |
| Skeptical Reviewer | Assumes every agent will eventually hallucinate with confidence and asks for receipts. Sensible, irritating, correct. |

### 6.2 Debate rounds

| Motion | Main arguments | Decision |
|---|---|---|
| Should 70% context handoff be a prompt rule or runtime gate? | Prompt rule is easy but bypassable. Runtime gate can block new work, checkpoint, and produce handoff records. | Runtime gate. Prompt only explains behavior. |
| Should DevGod use democratic swarm control? | Swarms improve coverage but can fragment authority. Manager-as-orchestrator keeps state consistent. | Root manager controls run; specialists are bounded workers. |
| Should specialists spawn subagents freely? | Free spawning increases parallelism but creates cost, duplicate work, and contradictory outputs. | Specialists may spawn only approved lower-level subagents within budget and explicit scope. |
| Should every task be debated? | Could catch more mistakes, but turns small changes into bureaucracy soup. | Debate only at defined gates: architecture, blocker closure, high-risk patch, contradiction, final done. |
| Should markdown files be authoritative? | Markdown is portable and human-readable. It is also easy to lie in. | Runtime DB/state is authority; markdown is export/projection. |
| Should DevGod replace Codex subagents with a custom SDK worker pool? | Custom pool gives control but duplicates Codex features. | Use Codex subagents and event streams; add DevGod runtime governance around them. |
| How should context pressure be measured? | Exact context window may not always be available. Codex `exec --json` can emit usage, Responses API emits usage, and fallback estimates are possible. | Use normalized `ContextUsageAdapter` with confidence levels. |
| What happens when a subagent hits 70%? | Letting it continue risks lost state. Killing it loses work. | It must report partial state, checkpoint child output, and hand off to a same-role successor or parent. |
| How strict should completion be? | Too strict can block useful partial results; too loose recreates current problem. | Separate `partial_report`, `blocked`, and `done`; never call `done` without gates. |

### 6.3 Final synthesis

The best design is **not** “more agents.” The best design is **bounded agents inside a strict runtime loop**:

```text
root manager loop
  -> select highest-value next target
  -> dispatch specialist or debate gate
  -> specialist optionally dispatches bounded micro-agents
  -> ingest evidence
  -> update ledgers/gaps/proofs
  -> context middleware checks every participant
  -> checkpoint/handoff at 70%
  -> continue until completion or blocker
```

---

## 7. Proposed System Architecture

### 7.1 Logical architecture

```text
+-------------------+
| User / Operator   |
+---------+---------+
          |
          v
+-------------------------------+
| DevGod CLI / UI / MCP Server  |
+-------------------------------+
          |
          v
+-------------------------------------------------------------+
| Orchestration Kernel                                      |
| - Run loop                                                |
| - Phase readiness                                         |
| - Task queue                                              |
| - Coverage/gap/proof authority                            |
| - Context pressure middleware                             |
+--------------------+----------------------+-----------------+
                     |                      |
                     v                      v
+--------------------------------+   +------------------------+
| Runtime Store                  |   | Codex Runtime Adapter  |
| - runs                         |   | - CLI exec JSONL       |
| - agent threads                |   | - app-server JSON-RPC  |
| - subagent jobs                |   | - subagent spawning    |
| - handoffs/checkpoints         |   | - automations          |
| - debates/decisions            |   | - MCP tools            |
| - coverage/gaps/proofs         |   +-----------+------------+
+--------------------------------+               |
                                                 v
                                      +-----------------------+
                                      | Codex Workers         |
                                      | - manager agents      |
                                      | - specialists         |
                                      | - micro-subagents     |
                                      +-----------------------+
```

### 7.2 Runtime authority layers

| Layer | Authority | Examples |
|---|---|---|
| Runtime state | Highest | run phase, task status, active thread, context ratio, checkpoint id, handoff id |
| Evidence | High | code refs, diffs, tests, command logs, traces, review decisions |
| Workflow artifacts | Medium | briefs, plans, task packets, handoff markdown, debate summaries |
| Conversation output | Low | agent prose, status blurbs, informal summaries |

### 7.3 Key runtime additions

| Component | New module | Purpose |
|---|---|---|
| Context Pressure Monitor | `src/runtime/context-pressure.ts` | Measures context ratio for every agent thread/job. |
| Handoff Engine | `src/runtime/handoff-engine.ts` | Creates, validates, stores, and resumes structured handoff packets. |
| Context Compression | `src/runtime/context-compression.ts` | Produces structured compact summaries and optional API compaction. |
| Codex Session Adapter | `src/runtime/codex-session-adapter.ts` | Reads Codex JSONL/app-server events and normalizes usage/thread events. |
| Agent Dispatcher | `src/runtime/agent-dispatcher.ts` | Spawns specialists/subagents under budget and role policy. |
| Agent Hierarchy | `src/devgod/agent-hierarchy.ts` | Maps specialist roles to lower-level micro-agents and permissions. |
| Debate Engine | `src/runtime/debate-engine.ts` | Runs evidence-backed debate rounds at decision gates. |
| Debate Schemas | `src/domain/debate-types.ts` | Type-safe debate claims, votes, dissent, and decision records. |
| Handoff Schemas | `src/domain/handoff-types.ts` | Type-safe handoff records and checkpoint references. |
| Workflow Validators | `src/runtime/workflow-gates.ts` | Blocks transitions when handoff/proof/debate/coverage rules fail. |

---

## 8. Agentic Run Loop Design

### 8.1 Loop invariants

The run loop must obey these invariants:

1. Every non-trivial run has a `run_profile` and coverage target.
2. Every active agent has an `agent_thread` record.
3. Every subagent job has a bounded scope, output schema, owner, and budget.
4. Every state transition has evidence and a progress proof.
5. Every agent action passes the context-pressure middleware.
6. No agent may start new substantive work at or above 70% context usage.
7. No run reaches `done` while blocking gaps, missing reviews, missing validation, or unresolved context handoff failures exist.

### 8.2 Main loop pseudocode

```ts
export async function runAgenticLoop(runId: RunId): Promise<RunLoopResult> {
  while (true) {
    const state = await loadRunAuthority(runId);
    await workflowGates.assertRunCanContinue(state);

    const readiness = await computePhaseReadiness(runId);
    const coverage = await computeCoverageSummary(runId);
    const gaps = await computeGapReport(runId);

    if (await finalDone({ state, readiness, coverage, gaps })) {
      await recordProgressProof(runId, { kind: "final_done" });
      await requestBlockingReviews(runId);
      return { status: "done" };
    }

    if (await noSafeAutomatedMove(state, gaps)) {
      const blocker = await recordBlocker(runId, state, gaps);
      await checkpointRun(runId, { reason: "blocked", blockerId: blocker.id });
      return { status: "blocked", blockerId: blocker.id };
    }

    const target = await selectHighestPriorityTarget({ state, readiness, coverage, gaps });
    const directive = await chooseDirective(target, state);

    await contextPressure.assertCanStartWork(state.activeAgentThreadId, directive);

    const result = await dispatchDirective(runId, directive);
    await ingestEvidence(runId, result.evidenceRefs);
    await updateLedgersAndGaps(runId, result);
    await recordProgressProof(runId, { kind: "cycle", target, directive, result });
    await checkpointRun(runId, { reason: "cycle_complete" });
  }
}
```

### 8.3 Priority function

```text
priority = criticality
         * uncertainty
         * fanout
         * runtime_risk
         * migration_relevance
         * blocker_pressure
         * freshness_decay
         * context_recovery_bonus
```

`context_recovery_bonus` increases priority for partially completed handoff work so successors continue unfinished work instead of discovering shiny new yak species.

---

## 9. Uniform Context Pressure and 70% Handoff

### 9.1 Requirement

> When any agent or subagent reaches 70% effective context usage, that agent must hand off before starting new substantive work. This must apply equally to root manager, managers, specialists, quality agents, knowledge agents, and lower-level micro-agents.

### 9.2 Definitions

| Term | Definition |
|---|---|
| `context_limit_tokens` | Configured model context budget for the agent thread. If exact model window is unknown, use DevGod configured budget. |
| `input_tokens_effective` | Current thread/session input tokens minus cache/compaction benefits when known. |
| `output_tokens_pending_budget` | Reserved budget for final summary, tool results, review notes, and emergency checkpoint. |
| `context_ratio` | `(input_tokens_effective + output_tokens_pending_budget) / context_limit_tokens`. |
| `pressure_confidence` | `authoritative`, `observed`, `estimated`, or `unknown`. |

### 9.3 Measurement adapters

```ts
export interface ContextUsageAdapter {
  readonly source: "codex_exec_jsonl" | "codex_app_server" | "responses_api" | "session_log" | "estimate";
  measure(thread: AgentThreadRecord): Promise<ContextUsageMeasurement>;
}

export interface ContextUsageMeasurement {
  threadId: string;
  model: string;
  contextLimitTokens: number;
  inputTokensEffective: number;
  cachedInputTokens?: number;
  outputTokens: number;
  reasoningOutputTokens?: number;
  reservedOutputBudget: number;
  contextRatio: number;
  confidence: "authoritative" | "observed" | "estimated" | "unknown";
  measuredAt: string;
}
```

Adapters:

| Adapter | Input | Confidence | Notes |
|---|---|---|---|
| `CodexExecJsonlAdapter` | `codex exec --json` event stream; `turn.completed.usage`. | `observed` | Best practical path for scripted runs. |
| `CodexAppServerAdapter` | app-server streamed turn/thread notifications if usage metadata is available. | `observed` or `estimated` | Best for future DevGod UI/daemon integration. |
| `ResponsesUsageAdapter` | Responses API usage + compaction items. | `authoritative` | Use when DevGod directly owns API calls. |
| `CodexSessionLogAdapter` | Local session logs / JSONL rollout files. | `observed` or `estimated` | Useful for resume and postmortems. |
| `ByteEstimateAdapter` | Prompt/artifact bytes + tokenizer estimate. | `estimated` | Fallback only. Treat as conservative. |

### 9.4 Pressure thresholds

| Context ratio | State | Runtime behavior |
|---:|---|---|
| `< 0.55` | `normal` | Work proceeds. |
| `>= 0.55` | `prepare_handoff` | Create/update handoff skeleton and compact summary draft. |
| `>= 0.65` | `soft_limit` | Stop broad exploration; only finish current atomic step. |
| `>= 0.70` | `handoff_required` | Block new substantive work. Must checkpoint and hand off. |
| `>= 0.80` | `compact_or_fail` | Only compaction, evidence ingestion, and emergency checkpoint actions allowed. |
| `>= 0.90` | `abort_to_checkpoint` | Hard stop except saving state. |

### 9.5 Middleware enforcement

```ts
export async function beforeAgentAction(ctx: AgentActionContext, action: AgentAction) {
  const pressure = await contextPressure.measure(ctx.agentThreadId);
  await contextPressure.record(ctx.agentThreadId, pressure);

  if (pressure.contextRatio >= 0.90 && action.kind !== "checkpoint") {
    throw new ContextAbortRequiredError(ctx.agentThreadId, pressure);
  }

  if (pressure.contextRatio >= 0.80 && !ACTION_KINDS_ALLOWED_DURING_EMERGENCY.has(action.kind)) {
    throw new ContextEmergencyCompressionRequiredError(ctx.agentThreadId, pressure);
  }

  if (pressure.contextRatio >= 0.70 && !ACTION_KINDS_ALLOWED_DURING_HANDOFF.has(action.kind)) {
    throw new ContextHandoffRequiredError(ctx.agentThreadId, pressure);
  }

  if (pressure.contextRatio >= 0.55) {
    await handoffEngine.ensureDraftHandoff(ctx.agentThreadId, { reason: "context_pressure" });
  }
}
```

Allowed actions during mandatory handoff:

```ts
const ACTION_KINDS_ALLOWED_DURING_HANDOFF = new Set([
  "checkpoint",
  "compress_context",
  "emit_partial_result",
  "record_handoff",
  "ingest_evidence",
  "close_child_thread",
  "spawn_successor_same_role"
]);
```

### 9.6 70% handoff algorithm

```text
on context_ratio >= 0.70:
  1. Freeze write scope for the agent thread.
  2. Finish only the current atomic command if safe.
  3. Ingest produced evidence, diffs, logs, and findings.
  4. Record child job status if this is a subagent.
  5. Write checkpoint record.
  6. Generate structured compact summary.
  7. Create handoff packet.
  8. Validate packet against schema.
  9. Select successor:
     - same-role successor for context pressure
     - parent manager for completed/blocked child work
     - validation specialist for contradiction or blocker
 10. Spawn/resume successor with packet.
 11. Mark old thread `handoff_complete` and block further work.
```

### 9.7 Handoff target selection

| Handoff reason | Target |
|---|---|
| `context_pressure` | Same role, fresh Codex thread, same work item. |
| `scope_change` | Manager-selected specialist. |
| `phase_transition` | Next phase owner. |
| `child_context_pressure` | Same micro-role successor or parent specialist, depending on remaining job size. |
| `contradiction` | Validator / reviewer / runtime tracer. |
| `blocker` | Parent owner and blocking review trio if high risk. |
| `completion_review` | `reviewer`, `qa_engineer`, `security_reviewer`. |

### 9.8 Handoff packet schema

```ts
export interface AgentHandoffPacket {
  schemaVersion: "devgod.agent-handoff.v1";
  handoffId: string;
  runId: string;
  workstreamId: string;
  fromAgentThreadId: string;
  fromAgentRole: string;
  toAgentRole: string;
  toAgentThreadId?: string;
  reason: "context_pressure" | "scope_change" | "phase_transition" | "child_context_pressure" | "contradiction" | "blocker" | "completion_review";
  contextRatioAtHandoff: number;
  contextMeasurementConfidence: "authoritative" | "observed" | "estimated" | "unknown";
  phase: string;
  activeTaskId?: string;
  activeSubagentJobId?: string;
  acceptanceCriteria: string[];
  completedWork: HandoffCompletedWork[];
  openWork: HandoffOpenWork[];
  openGaps: string[];
  unresolvedContradictions: string[];
  evidenceRefs: string[];
  decisionRefs: string[];
  filesTouched: string[];
  filesRead: string[];
  writeScope: WriteScope;
  blockedActions: string[];
  validationCommands: string[];
  nextActions: string[];
  compactSummaryRef: string;
  checkpointId: string;
  parentThreadId?: string;
  childJobStatus: ChildJobStatus[];
  createdAt: string;
  validatedAt?: string;
}
```

### 9.9 Handoff artifact paths

```text
.devgod/work/runs/<run_id>/handoffs/<handoff_id>.json
.devgod/work/runs/<run_id>/handoffs/<handoff_id>.md
.devgod/work/runs/<run_id>/checkpoints/<checkpoint_id>.json
.devgod/work/runs/<run_id>/context/<compact_summary_id>.md
```

The JSON file is authoritative. The Markdown file is human-readable. The agent prose is charming nonsense until it points at the JSON. Naturally.

---

## 10. Specialist/Subagent Hierarchy

### 10.1 Design principle

DevGod should model a software company, but not by giving every intern admin access and a philosophy degree. The hierarchy is:

```text
Root DevGod Manager
  -> Manager/Specialist roles
      -> Lower-level micro-subagents
```

The root manager owns run state and final synthesis. Specialists own scoped work. Micro-subagents own narrow evidence-producing tasks.

### 10.2 Role classes

| Class | Examples | Can own task? | Can spawn micro-subagents? | Default write access |
|---|---|---:|---:|---|
| Manager | `planner`, `product_strategist`, `solution_architect` | Yes | Yes, via dispatcher | Read/write to workflow artifacts; code edits normally delegated. |
| Delivery | `backend_engineer`, `frontend_designer`, `infra_engineer`, `data_engineer` | Yes | Yes | Workspace write within task packet scope. |
| Quality | `reviewer`, `qa_engineer`, `security_reviewer`, `e2e-runner` | Yes | Yes, mostly read-only validators | Read-only by default; write only review artifacts unless explicitly repairing. |
| Knowledge | `docs_researcher`, `memory_curator`, `technical_writer`, `git_operator` | Yes | Limited | Read-only plus docs/workflow artifacts. |
| Domain specialist | `mobile_engineer`, `ml_engineer`, `compliance_reviewer` | Optional | Yes when activated | Scope-specific. |
| Micro-subagent | `route_scanner`, `test_writer`, `schema_mapper`, etc. | No direct run ownership | No, except approved batch workers | Usually read-only or narrow write. |

### 10.3 Proposed lower-level micro-agent catalog

| Parent specialist | Micro-subagents | Purpose |
|---|---|---|
| `planner` | `scope_normalizer`, `acceptance_criteria_writer`, `task_slicer`, `risk_ranker` | Convert broad request into executable work. |
| `product_strategist` | `user_story_extractor`, `edge_case_scout`, `value_risk_mapper` | Product framing and acceptance details. |
| `solution_architect` | `dependency_mapper`, `boundary_analyst`, `legacy_trap_scout`, `architecture_option_critic` | Architecture map, coupling, options, and dissent. |
| `backend_engineer` | `api_route_scanner`, `service_patch_worker`, `test_writer`, `query_inspector`, `migration_worker` | Backend implementation and verification slices. |
| `frontend_designer` | `component_mapper`, `state_flow_tracer`, `a11y_checker`, `visual_regression_scout` | UI/UX implementation and evidence. |
| `data_engineer` | `schema_mapper`, `migration_dry_runner`, `query_plan_reader`, `data_invariant_extractor` | DB and migration risk. |
| `infra_engineer` | `ci_log_triager`, `env_config_mapper`, `docker_compose_checker`, `deploy_risk_checker` | CI, environment, and deployment safety. |
| `qa_engineer` | `test_runner`, `regression_hunter`, `flake_investigator`, `coverage_gap_checker` | Verification and regression detection. |
| `security_reviewer` | `authz_path_auditor`, `secret_scanner`, `dependency_risk_checker`, `trust_boundary_mapper` | Security evidence. |
| `reviewer` | `diff_reviewer`, `invariant_checker`, `false_completion_detector` | Correctness and completion review. |
| `memory_curator` | `checkpoint_summarizer`, `decision_recorder`, `memory_deduper` | Durable memory and compaction. |
| `eval_engineer` | `eval_fixture_writer`, `trace_grader`, `prompt_regression_checker` | Anti-looseness measurement. |
| `technical_writer` | `operator_doc_writer`, `changelog_writer`, `api_doc_checker` | Documentation outputs. |
| `agent_runtime_engineer` | `codex_event_parser`, `handoff_schema_validator`, `mcp_tool_contract_tester`, `agent_config_linter` | Runtime and agent tooling. |

### 10.4 Micro-agent constraints

Every micro-agent must declare:

```ts
export interface MicroAgentDefinition {
  id: string;
  parentRoles: string[];
  description: string;
  model: "gpt-5.5" | "gpt-5.4" | "gpt-4.5";
  reasoningEffort: "low" | "medium" | "high";
  sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
  allowedTools: string[];
  deniedTools: string[];
  canWriteCode: boolean;
  canSpawnChildren: boolean;
  maxRuntimeSeconds: number;
  maxContextRatio: number;
  requiredOutputSchema: string;
  requiredEvidenceTypes: string[];
}
```

### 10.5 Example generated Codex agent TOML

```toml
name = "dependency_mapper"
description = "Maps static imports, callsites, fanout, risky indirection, and unknown dependency edges for a bounded target scope."
model = "gpt-5.4"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"

nickname_candidates = ["depmapper", "mapper"]

[skills]
config = { inherit = true }

developer_instructions = """
You are a DevGod lower-level micro-agent.
You do not own final conclusions.
You do not modify source files.
You inspect only the assigned target scope.
You must return JSON matching devgod.micro-agent-result.v1.
Every claim must cite code refs, command refs, or evidence refs.
If evidence conflicts, report a contradiction instead of resolving it silently.
If context pressure reaches 70%, emit a partial result and request handoff.
"""
```

### 10.6 Subagent dispatch contract

```ts
export interface SubagentJobRequest {
  runId: string;
  parentAgentThreadId: string;
  parentAgentRole: string;
  microAgentId: string;
  scope: TargetScope;
  objective: string;
  acceptanceCriteria: string[];
  writeScope: WriteScope;
  maxRuntimeSeconds: number;
  maxContextRatio: 0.70;
  outputSchemaRef: string;
  evidenceRequirements: EvidenceRequirement[];
  failClosed: boolean;
}
```

### 10.7 Subagent result contract

```ts
export interface SubagentJobResult {
  schemaVersion: "devgod.micro-agent-result.v1";
  jobId: string;
  runId: string;
  microAgentId: string;
  status: "complete" | "partial" | "blocked" | "failed" | "handoff_required";
  summary: string;
  claims: EvidenceBackedClaim[];
  evidenceRefs: string[];
  filesRead: string[];
  filesChanged: string[];
  openQuestions: string[];
  gapsOpened: GapRecordInput[];
  nextRecommendedActions: string[];
  contextRatioAtExit: number;
  checkpointId?: string;
  handoffId?: string;
}
```

---

## 11. Codex Integration Strategy

### 11.1 Use Codex subagents, but generate them from DevGod state

DevGod should treat `.codex/agents/*.toml` as generated/verified artifacts derived from `src/devgod/agent-catalog.ts` and `src/devgod/agent-hierarchy.ts`.

New command:

```bash
npm run devgod -- agents compile
npm run devgod -- agents verify
```

`agents compile` should:

1. Read the canonical agent catalog.
2. Read specialist/micro-agent hierarchy.
3. Generate `.codex/agents/*.toml`.
4. Include context-pressure and handoff obligations in developer instructions.
5. Apply sandbox and MCP tool restrictions.
6. Validate against expected schema.
7. Fail CI if generated artifacts drift.

### 11.2 Use `codex exec --json` for automation jobs

For scripted dispatch, DevGod should prefer:

```bash
codex exec --json \
  --output-schema .devgod/schemas/micro-agent-result.schema.json \
  -o .devgod/work/runs/<run_id>/subagents/<job_id>/final.json \
  "$(devgod prompt subagent --job-id <job_id>)"
```

The JSONL stream should be captured at:

```text
.devgod/work/runs/<run_id>/subagents/<job_id>/events.jsonl
```

DevGod ingests:

- thread id
- turn id
- usage tokens
- command events
- file changes
- MCP calls
- plan updates
- agent final output
- errors/failures

### 11.3 Use Codex app-server for live UI/daemon orchestration

For `devgod daemon`, `devgod supervisor`, and `serve-ui`, use app-server when a live local client needs:

- persistent conversation history
- streamed events
- approvals
- resumable threads
- active thread control
- operator inspection

App-server should not replace the runtime store. It is the transport and event source, not the source of truth.

### 11.4 Use automations as heartbeat, not as authority

Thread automations are appropriate for:

- “continue run if unblocked” wakeups
- checking long-running tests
- polling CI or logs
- reminding Codex to continue review loop
- scheduled ledger refresh

Automation prompts must be generated from runtime state:

```text
Load DevGod run <run_id>.
Do not infer state from this message.
Call devgod status, devgod gaps, devgod checkpoint, then continue the highest-priority unblocked action.
If context ratio >= 70%, checkpoint and hand off.
```

### 11.5 Use MCP carefully

Expose DevGod as an MCP server with tools such as:

| MCP tool | Purpose | Approval |
|---|---|---|
| `devgod.status` | Read run status. | approve/auto |
| `devgod.next_target` | Read next target recommendation. | approve/auto |
| `devgod.record_evidence` | Attach evidence refs. | prompt |
| `devgod.open_gap` | Create gap record. | prompt |
| `devgod.create_handoff` | Create handoff packet. | prompt |
| `devgod.spawn_subagent` | Dispatch child job. | prompt/deny by default for untrusted roles |
| `devgod.mark_done` | Attempt completion gate. | prompt + blocking review required |

Do not expose raw “write arbitrary state” tools. Future-you would hate present-you, and future-you would be correct.

---

## 12. Data Model

### 12.1 Tables / persistent collections

| Table | Purpose |
|---|---|
| `agent_threads` | Tracks every Codex/DevGod agent thread participating in a run. |
| `subagent_jobs` | Tracks bounded lower-level work items. |
| `context_measurements` | Stores token/context measurements over time. |
| `handoff_packets` | Stores structured handoff records. |
| `checkpoint_records` | Stores resumable checkpoints. |
| `compact_context_records` | Stores compact summaries and source refs. |
| `debate_sessions` | Stores debate lifecycle and gate target. |
| `debate_claims` | Stores participant claims, evidence, votes, and dissent. |
| `agent_spawn_budgets` | Tracks per-run/role fanout and runtime budgets. |
| `workflow_gate_results` | Stores pass/fail reasons for runtime gates. |

### 12.2 Example SQL migration sketch

```sql
create table devgod_agent_threads (
  id text primary key,
  run_id text not null,
  parent_thread_id text null,
  role text not null,
  codex_thread_id text null,
  status text not null,
  depth integer not null default 0,
  context_limit_tokens integer not null,
  latest_context_ratio numeric(6,5) not null default 0,
  latest_checkpoint_id text null,
  latest_handoff_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table devgod_handoff_packets (
  id text primary key,
  run_id text not null,
  from_agent_thread_id text not null,
  to_agent_thread_id text null,
  reason text not null,
  context_ratio_at_handoff numeric(6,5) not null,
  phase text not null,
  packet_json jsonb not null,
  status text not null,
  checkpoint_id text not null,
  created_at timestamptz not null default now(),
  validated_at timestamptz null,
  consumed_at timestamptz null
);

create table devgod_subagent_jobs (
  id text primary key,
  run_id text not null,
  parent_agent_thread_id text not null,
  micro_agent_id text not null,
  status text not null,
  scope_json jsonb not null,
  output_schema_ref text not null,
  result_json jsonb null,
  checkpoint_id text null,
  handoff_id text null,
  max_runtime_seconds integer not null,
  max_context_ratio numeric(4,3) not null default 0.700,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table devgod_debate_sessions (
  id text primary key,
  run_id text not null,
  gate text not null,
  target_ref text not null,
  status text not null,
  decision_json jsonb null,
  created_at timestamptz not null default now(),
  closed_at timestamptz null
);
```

### 12.3 Domain type additions

Add to `src/domain/types.ts` or split by concern:

```ts
export type AgentThreadStatus =
  | "active"
  | "handoff_preparing"
  | "handoff_required"
  | "handoff_complete"
  | "blocked"
  | "failed"
  | "closed";

export type SubagentJobStatus =
  | "queued"
  | "running"
  | "complete"
  | "partial"
  | "handoff_required"
  | "blocked"
  | "failed"
  | "cancelled";

export type ContextPressureState =
  | "normal"
  | "prepare_handoff"
  | "soft_limit"
  | "handoff_required"
  | "compact_or_fail"
  | "abort_to_checkpoint";
```

---

## 13. Multi-Agent Debate Engine

### 13.1 Debate triggers

Debate is required for:

| Gate | Participants |
|---|---|
| Architecture strategy selection | `solution_architect`, `backend_engineer`, `security_reviewer`, `qa_engineer`, `skeptical_reviewer`/`reviewer` |
| Legacy rewrite readiness | `solution_architect`, `dependency_mapper`, `business_rule_extractor`, `qa_engineer`, `security_reviewer` |
| High-risk implementation before patch | Owner specialist, `reviewer`, `qa_engineer`, domain specialist, `security_reviewer` if trust boundary involved |
| Critical blocker closure | Blocker owner, validating specialist, `reviewer`, `qa_engineer` |
| Contradictory evidence | Agents that produced conflicting claims + independent validator |
| Final done | Blocking trio + owner + manager |

Debate is optional for:

- small doc edits
- low-risk refactors
- one-file tests
- formatting
- routine task slicing

### 13.2 Debate stages

```text
1. Open debate session with target gate.
2. Freeze relevant state snapshot.
3. Assign participants and evidence packet.
4. Round 1: independent position statements.
5. Round 2: critique of opposing claims.
6. Round 3: revised position + risk list.
7. Judge/manager synthesis.
8. Decision record emitted.
9. Workflow gate consumes decision.
```

### 13.3 Debate claim schema

```ts
export interface DebateClaim {
  debateId: string;
  participantRole: string;
  claimId: string;
  position: "approve" | "reject" | "approve_with_conditions" | "insufficient_evidence";
  claim: string;
  evidenceRefs: string[];
  assumptions: string[];
  risks: string[];
  requiredConditions: string[];
  confidence: number;
}
```

### 13.4 Debate decision schema

```ts
export interface DebateDecision {
  debateId: string;
  gate: string;
  decision: "approved" | "rejected" | "blocked" | "needs_more_evidence";
  winningRationale: string;
  dissentingClaims: string[];
  requiredFollowUps: string[];
  evidenceRefs: string[];
  createsGaps: string[];
  closesGaps: string[];
  approvedBy: string;
  createdAt: string;
}
```

### 13.5 Debate anti-patterns to block

| Anti-pattern | Gate response |
|---|---|
| Participants agree without evidence | `needs_more_evidence` |
| Majority vote ignores strongest objection | `blocked` until objection addressed |
| Debate claims cite only prior summaries | `needs_more_evidence` |
| Owner self-approves critical blocker closure | `blocked`; independent validation required |
| Debate runs while context ratio >= 70% without handoff | `handoff_required` first |

---

## 14. Workflow Gates

### 14.1 New gate types

| Gate | Blocks when |
|---|---|
| `context_handoff_required` | Any active thread is `handoff_required` or above 70% and has no valid handoff/checkpoint. |
| `subagent_result_schema_invalid` | Child result does not validate against schema. |
| `subagent_context_unresolved` | Child hit context pressure but did not hand off or report partial result. |
| `debate_required_missing` | A gate requires debate but no closed decision exists. |
| `debate_decision_blocked` | Debate reached `blocked` or `needs_more_evidence`. |
| `spawn_budget_exceeded` | Agent tries to exceed thread/depth/runtime budget. |
| `write_scope_violation` | Agent changed files outside allowed scope. |
| `handoff_packet_invalid` | Handoff lacks open work, evidence refs, next action, checkpoint, or compact summary. |

### 14.2 Completion gate additions

A run may reach `done` only when:

- No active agent thread is above 70% without valid handoff.
- All subagent jobs are `complete`, `blocked`, `cancelled`, or explicitly absorbed into parent work.
- Required debates are closed with approving decisions.
- Blocking review trio passes.
- Coverage thresholds pass.
- Gap thresholds pass.
- Validation and regression gates pass.
- Final progress proof exists.

---

## 15. CLI / Operator Surface

### 15.1 New commands

| Command | Purpose |
|---|---|
| `devgod agents compile` | Generate `.codex/agents/*.toml` from catalog/hierarchy. |
| `devgod agents verify` | Verify catalog/config/artifact drift. |
| `devgod dispatch --role <role> --scope <scope>` | Dispatch specialist work. |
| `devgod subagent spawn --micro-agent <id> --job <job>` | Spawn bounded lower-level job. |
| `devgod context status --run-id <id>` | Show context ratio for all active threads. |
| `devgod context enforce --run-id <id>` | Apply context-pressure gates and force handoff if needed. |
| `devgod handoff create --thread <id>` | Create handoff for an agent thread. |
| `devgod handoff consume --handoff <id>` | Start/resume successor from handoff packet. |
| `devgod debate open --gate <gate>` | Start a debate session. |
| `devgod debate decide --id <id>` | Close debate with decision record. |
| `devgod loop --agentic` | Run strict agentic loop. |

### 15.2 Example operator flow

```bash
npm run devgod -- agents compile
npm run devgod -- agents verify
npm run devgod -- loop --agentic --run-id latest
npm run devgod -- context status --run-id latest
npm run devgod -- handoff create --thread <thread_id>
npm run devgod -- debate open --gate architecture_strategy --target latest-plan
npm run devgod -- workflow-proof --run-id latest --task-id <task_id>
```

### 15.3 Status output sketch

```text
DevGod Agentic Run: run_123
Phase: dependency_mapping
Directive: dispatch_subagents

Context pressure:
  planner/root                  0.44 normal
  solution_architect            0.61 prepare_handoff
  dependency_mapper/job_12      0.72 handoff_required ⚠

Required action:
  dependency_mapper/job_12 must emit checkpoint + handoff before more work.

Open gates:
  - context_handoff_required: job_12
  - missing_runtime_trace: service:billing/invoice-service

Next target:
  integration:stripe-webhook-auth
Reason:
  criticality high, uncertainty high, fanout 6, runtime risk high.
```

---

## 16. Configuration

### 16.1 DevGod config file

Add:

```toml
# .devgod/agentic.toml

[agentic_loop]
enabled = true
manager_role = "planner"
default_run_profile = "engineering_company"
require_progress_proof_every_cycle = true
require_runtime_authority = true

[context_pressure]
prepare_threshold = 0.55
soft_threshold = 0.65
handoff_threshold = 0.70
emergency_threshold = 0.80
abort_threshold = 0.90
reserved_output_tokens = 12000
measurement_fallback = "conservative_estimate"
fail_closed_when_unknown = false

[subagents]
max_threads = 8
max_depth = 2
max_children_per_specialist = 4
max_total_child_jobs_per_cycle = 12
allow_child_spawn_from_micro_agents = false
require_output_schema = true
require_evidence_refs = true

[debate]
enabled = true
required_gates = [
  "architecture_strategy",
  "legacy_rewrite_readiness",
  "high_risk_implementation",
  "critical_blocker_closure",
  "contradiction_resolution",
  "final_done"
]
max_rounds = 3
require_dissent_summary = true

[guards]
block_write_scope_violation = true
block_completion_without_handoff_resolution = true
block_completion_without_debate_decisions = true
block_owner_self_approval_for_critical_gaps = true
```

### 16.2 Codex config guidance

Current DevGod config uses `max_threads = 8` and `max_depth = 2`. Keep it only if DevGod guards are active. Without DevGod guards, prefer lower depth.

Recommended package default:

```toml
[agents]
max_threads = 8
max_depth = 2

[features]
multi_agent = true
enable_request_compression = true
plugin_hooks = true
```

Recommended installed-repo conservative default:

```toml
[agents]
max_threads = 6
max_depth = 1
```

Then enable depth 2 per project only after `devgod agents verify` and `devgod context enforce` pass. Because recursion without governance is how you get a distributed intern hive chewing your repo.

---

## 17. Security and Permissions

### 17.1 Sandbox policy

| Role type | Default sandbox | Notes |
|---|---|---|
| Root manager | `workspace-write` for workflow artifacts only | Should not directly patch code unless explicitly needed. |
| Planner/product | `read-only` or workflow-artifact write | No code writes. |
| Architect | `read-only` | Writes architecture artifacts only. |
| Delivery specialist | `workspace-write` within task scope | Code changes allowed only with task packet. |
| Quality/review | `read-only` | Can write review artifacts; repair mode explicit. |
| Security | `read-only` | No secret exfiltration, no unapproved network tools. |
| Micro-agent scanners | `read-only` | Evidence-only. |
| Micro-agent patch workers | `workspace-write` narrow files | Only for explicit implementation jobs. |

### 17.2 Side-effect guardrails

Block or require approval for:

- destructive shell commands
- network calls beyond approved docs/tooling
- dependency install/update
- DB migration execution
- secrets access
- production environment access
- git push/rebase/force operations
- broad file rewrites
- generated code mass changes

### 17.3 Write-scope validation

Every implementation job gets a `writeScope`:

```json
{
  "mode": "allowlist",
  "allowedPaths": ["src/runtime/context-pressure.ts", "tests/context-pressure.test.ts"],
  "deniedPaths": ["src/sql/migrations/**", ".env*"],
  "maxFilesChanged": 4,
  "requiresReviewForExpansion": true
}
```

If an agent changes outside scope:

1. Freeze thread.
2. Record violation.
3. Revert or quarantine diff.
4. Open blocker/gap.
5. Require review before continuing.

---

## 18. Evals and Tests

### 18.1 Unit tests

Add:

- `tests/context-pressure.test.ts`
- `tests/handoff-engine.test.ts`
- `tests/subagent-dispatcher.test.ts`
- `tests/debate-engine.test.ts`
- `tests/agent-hierarchy.test.ts`
- `tests/codex-session-adapter.test.ts`
- `tests/workflow-gates-context.test.ts`

### 18.2 Integration tests

Add fixtures for:

| Fixture | Expected result |
|---|---|
| Agent thread reaches 69% | Work may continue, handoff draft exists. |
| Agent thread reaches 70% | New work blocked; handoff required. |
| Subagent reaches 70% | Partial result + checkpoint + handoff. |
| Missing handoff packet field | Workflow gate fails. |
| Specialist spawns forbidden micro-agent | Dispatch denied. |
| Micro-agent writes outside scope | Gate fails and violation recorded. |
| Architecture plan without required debate | Gate fails. |
| Debate ignores dissenting evidence | Decision rejected/blocked. |
| Vanilla Codex-style “done” without proofs | Completion blocked. The way nature intended. |

### 18.3 Evals

Add orchestration eval cases:

1. **Long bugfix context rollover** — force context pressure; verify same-role successor continues work accurately.
2. **Nested specialist delegation** — backend engineer delegates route scan, test writing, and regression check; verify schemas/evidence.
3. **Contradictory subagent outputs** — two scanners disagree; verify contradiction gap and debate/validator dispatch.
4. **High-risk architecture decision** — verify debate triggers and blocks insufficient evidence.
5. **False completion trap** — agent claims task complete after one passing command; verify runtime gate blocks done.
6. **Autonomous recovery** — failed test leads repair loop instead of stopping.
7. **Subagent budget exhaustion** — verify blocker or consolidation, not unbounded spawn.

### 18.4 Metrics

| Metric | Target |
|---|---:|
| Handoff packet schema validity | 100% |
| Context-pressure gate enforcement | 100% for instrumented runs |
| Handoff continuation success | >= 90% on eval fixtures |
| False-completion rejection | 100% on fixtures |
| Debate gate precision | >= 95% required debates triggered |
| Subagent schema-valid output | >= 95% |
| Write-scope violation false negatives | 0 in tests |
| Runtime proof completeness before done | 100% |

---

## 19. Implementation Plan

### Phase 0 — Baseline audit

- Confirm current runtime schemas and CLI commands.
- Add fixture runs that reproduce current looseness.
- Record baseline orchestration benchmark.

**Exit criteria:** failing tests/evals exist for context rollover, shallow completion, missing debate, and unbounded subagent behavior.

### Phase 1 — Context Pressure Middleware

- Implement usage adapters.
- Add `agent_threads` and `context_measurements` persistence.
- Add `devgod context status`.
- Add gates at 70/80/90%.

**Exit criteria:** every agent action can be denied based on context ratio; tests pass.

### Phase 2 — Handoff Engine

- Implement handoff schema and validators.
- Add checkpoint/compact summary integration.
- Add `handoff create` and `handoff consume`.
- Add same-role successor dispatch.

**Exit criteria:** a run can resume from handoff without relying on prior chat transcript.

### Phase 3 — Specialist Subagent Hierarchy

- Add `agent-hierarchy.ts`.
- Add micro-agent definitions and output schemas.
- Add dispatcher budget/depth policy.
- Add agent TOML generation/verification.

**Exit criteria:** specialists can spawn approved subagents; invalid spawn attempts fail.

### Phase 4 — Debate Engine

- Add debate sessions, claims, decisions.
- Wire debates into architecture/high-risk/blocker/final gates.
- Add CLI and Markdown export.

**Exit criteria:** gates requiring debate cannot pass without closed decision.

### Phase 5 — Codex Integration Hardening

- Capture `codex exec --json` streams.
- Add app-server event adapter for UI/daemon path.
- Add MCP tools for DevGod state with approvals.
- Add automation heartbeat templates.

**Exit criteria:** DevGod can run a scripted specialist job, ingest events, measure context, and enforce handoff.

### Phase 6 — Evals, hardening, rollout

- Add eval fixtures.
- Add mutation/contract tests for workflow gate bypasses.
- Add docs and operator UI panels.
- Ship behind feature flag, then default for non-trivial runs.

**Exit criteria:** anti-looseness evals pass and regression benchmark improves over baseline.

---

## 20. Acceptance Criteria

This design is implemented when all are true:

1. `devgod loop --agentic` continuously advances work until done or blocked.
2. Every active root/specialist/subagent thread appears in `devgod context status`.
3. At 70% context ratio, new substantive actions are blocked for every agent class.
4. Handoff packets contain checkpoint, compact summary, open work, evidence refs, next actions, and target role.
5. Same-role successor can resume a context-pressure handoff.
6. Specialists can spawn approved micro-subagents only within budget/depth/write-scope policy.
7. Micro-agent outputs are schema-validated and ingested into ledgers/gaps/proofs.
8. Required debates block architecture, high-risk, blocker, contradiction, and final gates until closed.
9. Completion cannot pass while a context handoff is unresolved.
10. Tests and evals catch vanilla-Codex-style shallow completion.

---

## 21. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Token usage unavailable in some Codex surfaces | Context ratio may be estimated. | Use adapter confidence; conservative estimate; configurable budgets. |
| Too many agents increase cost/noise | Slow, expensive runs. | Spawn budgets, depth limits, narrow schemas, debate only at gates. |
| Handoff summaries omit critical facts | Successor repeats or corrupts work. | Structured handoff schema with evidence refs; no prose-only authority. |
| Subagents produce contradictory claims | Bad synthesis. | Contradiction gaps + validator/debate gate. |
| Over-strict gates block useful partial work | User frustration. | Separate `partial_report`, `blocked`, and `done`; allow partial status without fake completion. |
| Write-scope guard false positives | Legit changes blocked. | Explicit scope expansion flow via parent manager/review. |
| App-server protocol changes | Adapter breakage. | Generate schemas per Codex version and version adapters. |
| Codex config drift | Agents diverge from catalog. | `agents compile`, `agents verify`, CI drift failure. |

---

## 22. Open Questions

1. Which exact context limits should be configured per model in `.devgod/agentic.toml` for your environments?
2. Should installed repos default to `max_depth = 1` until they opt into depth 2, even though DevGod source config currently uses depth 2?
3. Which workflows should be allowed to use API-side compaction versus Codex-native request compression and structured handoff only?
4. Should micro-agent TOML files be shipped in package or generated at install time from catalog/hierarchy?
5. Which MCP tools should be auto-approved in local trusted repos versus prompt-approved?

---

## 23. Recommended First PR Slice

The first implementation should avoid trying to build the whole company in one PR, because that way lies a cursed cathedral.

**PR 1: Context handoff foundation**

Files/modules:

- `src/domain/handoff-types.ts`
- `src/runtime/context-pressure.ts`
- `src/runtime/handoff-engine.ts`
- `src/runtime/codex-session-adapter.ts`
- `src/admin/devgod.ts` command wiring
- `tests/context-pressure.test.ts`
- `tests/handoff-engine.test.ts`
- `.devgod/templates/handoff-packet.md`
- `.devgod/schemas/handoff-packet.schema.json`

Deliverables:

- `devgod context status`
- `devgod handoff create`
- 70% enforcement in loop path
- schema-valid handoff JSON
- checkpoint/compact summary references
- tests for root/specialist/subagent equality

That PR directly attacks the biggest requested behavior: **all agents hand off at 70% context pressure**.
