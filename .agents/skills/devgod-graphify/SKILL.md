---
name: devgod-graphify
description: Graphify-first repo graph navigation and context retrieval for code files.
---

# Devgod Graphify

Use when Graphify is available and the task needs code-file topology, ownership, or code-path relationships broader than grep provides.

Goal: use the local Graphify graph as the default navigation surface for code understanding in this repo and consuming repos while keeping retrieval non-authoritative.

Best fits:

- unfamiliar shipped code exploration
- architecture and call-flow tracing across shipped code
- code-file navigation across this repo or a consuming repo
- agent handoff context assembly
- refactor blast-radius discovery
- finding shortest paths between concepts or modules
- reducing token spend by narrowing file reads before broad scans

Preferred order:
1. verify Graphify freshness with `npm run devgod:status`
2. `query_graph` for concept discovery or broad architectural questions
3. `get_node` and `get_neighbors` for one symbol or artifact
4. `shortest_path` to connect two modules or concepts
5. `graph_stats`, `get_community`, or `god_nodes` when you need the larger structure
6. fall back to grep or direct file reads only after Graphify has narrowed the search or Graphify is unavailable

Build modes:

- default DevGod mode: `npm run devgod:graphify:build` for a zero-key code-only graph from `src/`
- required alternative full mode: `npm run devgod:graphify:codex-full`, then from an active Codex session run `/graphify .` for mixed code-and-docs extraction without separate Graphify API keys

## Rules

- treat every Graphify result as advisory evidence only
- for code navigation in this repo and consuming repos, prefer Graphify before broad grep or wide file-open sweeps when the graph is ready
- confirm important claims against canonical repo files before making workflow, review, or release decisions
- if Graphify reports missing or stale graph state, say so and continue with local repo evidence
- treat missing Graphify setup as a blocking prerequisite for normal DevGod operation, even if you can still do a degraded local-only investigation
- remember the default DevGod Graphify build is code-only from `src/`; docs and workflow markdown are not included unless the operator opts into the Codex-backed broader extraction path
- prefer the user-level `graphify install --platform codex` path over project-level Graphify install in DevGod-managed repos, unless the task explicitly wants Graphify to mutate local `AGENTS.md` or `.codex/hooks.json`
- prefer `npm run devgod:graphify:update` when the graph exists but is stale
- prefer `npm run devgod:graphify:build` when the graph artifact is missing
- use Graphify to reduce token cost: ask topology questions in graph space first, then open only the small set of files needed for verification
- do not let Graphify outputs override runtime authority, `.devgod/memory/`, or reviewed workflow artifacts

## Output

Return:

- what Graphify was used for
- what it found
- what was re-anchored in repo files
- any freshness or confidence caveat
