# Graphify Advisory Policy

Graphify is the repo-graph prerequisite for normal `devgod` operation. It is still not workflow authority.

## Required rules

- treat Graphify output as advisory retrieval evidence only
- keep task state, review trust, approvals, waivers, and completion authority inside `devgod`
- re-anchor important Graphify findings in canonical repo files before using them for planning, implementation, or review
- surface Graphify freshness and readiness in operator status when available
- degrade gracefully when Graphify is stale or invalid, but treat missing Graphify setup as an operational prerequisite gap
- prefer `npm run devgod:graphify:update` when the graph exists but is stale
- prefer `npm run devgod:graphify:build` when the graph artifact is missing

## Prohibited patterns

- satisfying review, QA, or security gates from Graphify output alone
- treating Graphify freshness as workflow freshness authority
- allowing Graphify outputs to overwrite `.devgod/`, `.codex/`, `AGENTS.md`, or `.agents/skills/devgod-*` by default
- treating Graphify topology as a substitute for canonical runtime or reviewed workflow evidence

## Recommended uses

- unfamiliar code exploration
- blast-radius checks before refactors
- process or call-flow tracing across shipped code
- shortest-path or neighbor analysis between concepts or modules
- targeted regression and review evidence gathering
