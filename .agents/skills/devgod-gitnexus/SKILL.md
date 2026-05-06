---
name: devgod-gitnexus
description: Use when a devgod specialist should gather repo intelligence from GitNexus without granting it workflow authority.
---

# Devgod GitNexus

Use this skill only when GitNexus is available and the task benefits from deeper code intelligence.

## Goal

Get better repo evidence from GitNexus while keeping `devgod` in charge of workflow, trust, and completion.

## Best-fit cases

- unfamiliar code exploration
- blast-radius analysis before edits
- refactor scoping
- process tracing for debugging or review
- multi-repo dependency checks when GitNexus groups are already configured

## Preferred tool order

1. `query` for concept or flow discovery
2. `context` for one symbol's callers, callees, and participation
3. `impact` before changing a symbol
4. `detect_changes` after a refactor-sized change

## Rules

- treat every GitNexus result as advisory evidence only
- confirm important claims against canonical repo files before making workflow or review decisions
- if GitNexus reports stale or missing index state, say so and continue with local repo evidence
- prefer `npx gitnexus analyze --skip-agents-md` when refresh is needed
- do not let GitNexus write `AGENTS.md`, `.devgod/`, `.codex/`, or `.agents/skills/devgod-*`

## Output

Return:

- what GitNexus was used for
- what it found
- what was re-anchored in repo files
- any freshness or confidence caveat
