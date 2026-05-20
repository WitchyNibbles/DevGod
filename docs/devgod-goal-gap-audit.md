# DevGod Goal Gap Audit

Generated: `2026-05-20`

## Executive Summary

`devgod` is materially beyond a prompt overlay. It already ships a runtime-backed workflow system with authenticated review gates, workflow proof, queue advancement, daemon/supervisor surfaces, checkpoints, progress proof, and typed autonomy records.

It is not yet at the stronger goal described in `docs/autonomous-execution-redesign.md`. The biggest remaining gaps are not generic “more autonomy” requests; they are specific missing substrates:

1. authoritative exported coverage ledgers instead of lightweight manifests
2. automated repo understanding and code-intelligence inventory generation
3. real runtime trace capture and trace-backed validation
4. broader executable continuation actions instead of narrative/operator-only guidance
5. real context-compaction mechanics instead of checkpoint refs alone
6. external, reproducible coding-agent evaluation beyond repo-local self-scoring
7. sharper operator truth alignment between docs, product state, and latest-run status

## Goal Being Audited

The strongest repo-local goal statement is in `docs/autonomous-execution-redesign.md`:

- execute until required coverage is complete or a real blocker exists
- maintain measurable repo-understanding coverage
- refuse shallow conclusions
- block rewrite recommendations until understanding thresholds are met
- keep live state, proofs, checkpoints, and resumable execution authority

That broader goal is stricter than the “current shipped package” framing in `docs/current-state.md` and `README.md`.

## What Is Clearly Shipped

Repo-local evidence supports these claims:

- runtime-backed workflow state, review recording, approvals, checkpoints, progress proof, and task queue handling
- authenticated workflow-proof completion gates
- operator surfaces for status, ops, report, loop, daemon, and supervisor flows
- typed autonomy state for coverage summaries, gaps, understanding maps, runtime traces, and checkpoints
- release coverage enforcement now passing live at `80.23%` branch coverage
- repo-local eval and benchmark surfaces for workflow/orchestration logic

Live verification during this audit:

- `npm run check:coverage` passed with aggregate branch coverage `80.23%`
- `npm run status` returned an authoritative approved run
- `npm run eval:orchestration` passed `14/14`
- `npm run benchmark:orchestration -- --format markdown` ran successfully

## Findings

### 1. The coverage ledger is still partial, not authoritative enough

Why this matters:
The redesign calls for a persistent coverage package with manifest, item ledger, dependency graph, gap ledger, and trace registry. Today the repo mainly enforces a small per-task manifest plus runtime arrays.

Repo evidence:

- redesign target: `docs/autonomous-execution-redesign.md`
  - wants `.devgod/work/coverage/coverage-manifest.json`
  - wants `.devgod/work/coverage/items.ndjson`
  - wants `.devgod/work/coverage/dependency-graph.json`
  - wants `.devgod/work/coverage/gaps.ndjson`
  - wants `.devgod/work/coverage/traces/`
- shipped template: `.devgod/templates/coverage-manifest.json`
- shipped artifacts present in the repo: `.devgod/work/coverage/coverage-*.json`
- workflow check: `scripts/check-devgod-workflow.sh`
  - treats `coverage_ledger_required` as satisfied by `.devgod/work/coverage/coverage-<task-id>.json`
- there are no shipped templates or exported files for `items.ndjson`, `gaps.ndjson`, `dependency-graph.json`, or trace directories

Assessment:
The runtime data model is ahead of the exported artifact contract. DevGod has typed coverage records in code, but it has not yet turned them into the authoritative, inspectable ledger package its redesign promises.

### 2. Repo understanding is modeled, but not generated from a strong code-intelligence substrate

Why this matters:
The redesign goal depends on measurable repo understanding. That requires more than handwritten records or test fixtures.

Repo evidence:

- `src/runtime/repo-markdown-indexer.ts` only indexes markdown allowlists such as `README.md`, `docs`, and `.agents/skills`
- I did not find a shipped AST indexer, symbol graph builder, call graph builder, route extractor, or LSP-backed inventory generator
- `src/runtime/autonomous-execution.ts` requires understanding map kinds such as `repo_map`, `route_map`, `model_map`, `integration_map`, `authz_map`, and `runtime_side_effects`
- those maps are validated and scored, but no equivalent production generator exists in `src/runtime/`

Assessment:
Devgod can validate understanding maps once provided, but it does not yet appear to autonomously build them from the codebase. That leaves a core gap between “typed understanding state exists” and “the system can derive that state deeply and repeatably.”

### 3. Runtime traces exist as records and thresholds, but not as an operational tracing system

Why this matters:
The redesign treats runtime traces as mandatory evidence for risky flows. Current code mostly validates trace records rather than capturing them.

Repo evidence:

- `src/runtime/autonomous-execution.ts` validates `RuntimeTraceRecord` and computes `runtimeTraceCoverage`
- the redesign explicitly names a future `src/runtime/runtime-trace-registry.ts`
- I did not find a shipped runtime trace registry module or a command that captures traces into `.devgod/work/coverage/traces/`
- current continuation directives do not include a first-class `trace_runtime` operation

Assessment:
Trace-backed reasoning is not yet a full operational subsystem. DevGod can reason *about* traces, but it still lacks a native tracing pipeline that reliably produces them.

### 4. The executable autonomy loop is narrower than the redesign’s action model

Why this matters:
The redesign proposes richer autonomy operations such as `dispatch_subagents`, `trace_runtime`, `rebuild_inventory`, and `checkpoint`. The current runtime directive/action model is materially smaller.

Repo evidence:

- current directive kinds in `src/domain/types.ts`:
  - `complete`
  - `dispatch_owner`
  - `dispatch_reviews`
  - `apply_recovery`
  - `continue_analysis`
  - `blocked`
- current continuation actions:
  - `resolve_blocking_gap`
  - `run_workflow_proof`
  - `resume_target`
- `createSupportedContinuationExecutor` in `src/admin.ts` mainly supports workflow-proof execution and stale-target normalization
- unsupported continuation targets fall back to operator-required handling or Codex turns

Assessment:
The system can continue, but not yet across the full redesign action space. Many next steps are still advisory guidance rather than runtime-native executable operations.

### 5. Context compaction is enforced as a reference, not delivered as a full mechanism

Why this matters:
Long-running agents need real context compaction and rehydration, not only checkpoint metadata.

Repo evidence:

- `memory_compaction_required` is a shipped quality gate
- `src/runtime/autonomous-execution.ts` blocks when the latest checkpoint lacks `compressedContextRef`
- `src/admin.ts` validates `compressedContextRef` as a `memory://` scheme
- I did not find a built-in compaction generator or replay/rehydration pipeline that creates those compressed memory artifacts automatically

Assessment:
This is a schema-and-gate feature more than an end-to-end compaction system. DevGod is asserting the need for compaction before it fully automates it.

### 6. External evaluation is still missing

Why this matters:
Internal consistency is not enough for a system whose goal is persistent engineering execution.

Repo evidence:

- `npm run eval:orchestration` is repo-local and passed `14/14`, but the output is marked `derived_only`
- `src/evals/orchestration-benchmark.ts` compares `devgod` with other systems using reviewed fixtures and explicitly says it is “not an external lab certification”
- I did not find integration with SWE-bench or another external coding-agent benchmark harness

External guidance:

- SWE-bench positions itself as a benchmark for real-world software issues and offers reproducible evaluation harnesses:
  - https://www.swebench.com/SWE-bench/
  - https://www.swebench.com/verified.html
- Anthropic’s eval guidance says agent evals need a harness, traces/transcripts, graders, outcomes, and often multiple trials:
  - https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- OpenAI recommends traces, graders, datasets, and eval runs for agent workflows:
  - https://developers.openai.com/api/docs/guides/agent-evals
  - https://developers.openai.com/api/docs/guides/trace-grading

Assessment:
Devgod still lacks an external or semi-external coding-agent eval layer. Until that exists, claims about reaching the goal should stay qualified.

### 7. Human oversight is strong at task completion, weaker at tool/action granularity

Why this matters:
Modern agent systems increasingly use per-action human review for risky operations, not just end-of-task review.

Repo evidence:

- DevGod has strong authenticated review and workflow-proof gates
- daemon/supervisor flows can block on review queues and scope expansion
- I did not find per-tool approval/edit/reject/respond semantics inside the autonomous worker loop

External guidance:

- OpenAI recommends human intervention for high-risk actions and failure thresholds:
  - https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/
- LangGraph documents interrupt-based approval flows with per-tool decision policies and persistent checkpointing:
  - https://docs.langchain.com/oss/python/langchain/human-in-the-loop
  - https://docs.langchain.com/oss/python/langgraph/durable-execution

Assessment:
Devgod is stronger on authenticated completion review than on dynamic in-flight action approval. That is a real gap if the target is safe long-horizon autonomy.

### 8. Operator truth is not fully aligned

Why this matters:
If the system claims completion while adjacent docs say “partially implemented,” operator trust degrades.

Repo evidence:

- `docs/current-state.md` says the full redesign is still evolving
- `docs/autonomous-execution-redesign.md` says the full 15-part redesign remains partially implemented
- `.devgod/work/product-state.md` says the broader redesign is complete
- `npm run status` on the latest authoritative run returned `autonomous.configured=false`
- `docs/benchmarks/orchestration-benchmark.md` still shows `8/8`, while the live command now returns `14/14`

Assessment:
The repo has a truth-alignment problem. Some of the work is done, but the repo’s public/current/runtime narratives are not synchronized enough to support strong autonomy claims.

## Priority Order

### P0. Truth alignment and operator semantics

- align `product-state`, current-state docs, and benchmark docs with live runtime truth
- make it clear when `status` is showing a proof run versus an active autonomous execution run
- stop letting stronger completion claims outrun operational evidence

### P1. Authoritative ledger export

- ship the full coverage artifact set:
  - `coverage-manifest.json`
  - `items.ndjson`
  - `gaps.ndjson`
  - `dependency-graph.json`
  - `traces/`
- make `coverage_ledger_required` actually require ledger evidence, not just a thin manifest

### P2. Automated inventory and code understanding

- build repo scanners that can populate coverage items and understanding maps from code, not only operator input
- start with route/service/integration/auth/config inventories
- keep markdown indexing, but stop treating it as the main repo-understanding substrate

### P3. Runtime trace capture

- add a real trace registry and trace-capture flow for risky paths
- connect traces to gaps, checkpoints, and validation decisions
- make trace-backed evidence inspectable in operator reports

### P4. Broader executable continuation actions

- promote more redesign actions into runtime-native operations
- examples:
  - `trace_runtime`
  - `rebuild_inventory`
  - richer gap-resolution actions
  - bounded specialist/subagent dispatch when the harness allows it

### P5. Real context compaction and resume rehydration

- generate compressed context artifacts automatically
- store them in durable memory with provenance
- teach resume flows to consume them directly

### P6. External eval and benchmark layer

- add a reproducible coding-agent eval suite beyond repo-local orchestration fixtures
- use trace-level grading and multi-trial evaluation for unstable behaviors
- add at least one external benchmark path such as SWE-bench-style task banks or an internal equivalent with Dockerized replay

### P7. Finer-grained human review

- add per-action or per-tool approval policies for risky operations
- preserve existing task-level authenticated review, but do not rely on it alone for sensitive in-flight actions

## What Is Not Missing

These should not be thrown away or understated:

- runtime-backed workflow authority is real
- authenticated review identity is real
- workflow-proof gating is real
- queue advancement and safe recovery are real
- daemon/supervisor/operator surfaces are real
- typed autonomy scoring for gaps, checkpoints, understanding maps, and trace coverage is real

The problem is not “nothing exists.” The problem is that the deepest redesign promises are only partially operationalized.

## Recommended Next Planning Slice

If the goal is to move fastest toward truth, do this next:

1. align operator truth and documentation
2. implement authoritative ledger export
3. implement automated inventory generation
4. implement runtime trace capture
5. only then expand continuation actions and external evals

That order gives DevGod a stronger evidentiary substrate before it tries to claim deeper autonomy.

## Sources

### Repo-local

- `README.md`
- `docs/current-state.md`
- `docs/autonomous-execution-redesign.md`
- `.devgod/work/product-state.md`
- `.devgod/work/task-queue.json`
- `src/domain/types.ts`
- `src/admin.ts`
- `src/admin/devgod.ts`
- `src/runtime/autonomous-execution.ts`
- `src/runtime/repo-markdown-indexer.ts`
- `src/evals/orchestration-baseline.ts`
- `src/evals/orchestration-benchmark.ts`
- `scripts/check-devgod-workflow.sh`

### External

- OpenAI Agents SDK: https://developers.openai.com/api/docs/guides/agents
- OpenAI agent evals: https://developers.openai.com/api/docs/guides/agent-evals
- OpenAI trace grading: https://developers.openai.com/api/docs/guides/trace-grading
- OpenAI deep research: https://developers.openai.com/api/docs/guides/deep-research
- SWE-bench overview: https://www.swebench.com/SWE-bench/
- SWE-bench Verified: https://www.swebench.com/verified.html
- Anthropic, Building Effective Agents: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, Demystifying evals for AI agents: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Anthropic, Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- LangGraph durable execution: https://docs.langchain.com/oss/python/langgraph/durable-execution
- LangChain human-in-the-loop: https://docs.langchain.com/oss/python/langchain/human-in-the-loop
