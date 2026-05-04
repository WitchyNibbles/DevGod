---
name: devgod-architecture
description: Use when devgod needs architecture guidance with clear boundaries, trust assumptions, migration risk, and reversible versus expensive decisions.
---

# Devgod Architecture

Use this skill for architecture decisions that will shape planning or worker routing.

## Goal

Produce a thin-slice architecture that fits current repo reality.

## Workflow

1. Identify the canonical source-of-truth layers involved.
2. Map the proposed change into components and data flow.
3. Call out trust boundaries, failure modes, and migration risk.
4. Label each meaningful decision:
   - reversible
   - expensive
5. Prefer the simplest architecture that preserves policy, review, and rollback.
6. End with the smallest safe first slice.

## Rules

- canonical policy stays in repo markdown
- operational state stays explicit
- retrieval stays derived and rebuildable
- do not introduce hidden durable authority
- do not add distributed complexity without a concrete need

## Output

Return boundaries, risks, reversible decisions, expensive decisions, and the first slice.
