---
name: devgod-memory
description: Use when a devgod task finishes and Codex should capture durable project memory in repo-local files instead of relying on platform memory features.
---

# Devgod Memory

This skill creates practical, reviewable memory.

## Goal

Capture stable knowledge in `.devgod/memory/` so future threads start smarter.

## Files

- `.devgod/memory/project-profile.md`
- `.devgod/memory/decision-log.md`
- `.devgod/memory/patterns.md`
- `.devgod/memory/lessons-learned.md`

## Update rules

- keep only high-signal facts
- prefer editing existing sections over adding noise
- remove stale statements when clearly obsolete
- never store secrets
- do not write guesses about future architecture as if already true
- require provenance from a reviewed run or task
- treat shared backend retrieval as lower precedence than repo policy
- note when a prior entry is superseded, contradicted, or stale
- do not let implementation agents write durable memory directly
- keep promotion decisions tighter than retrieval decisions

## Promotion rubric

Promote only if the candidate is:

- stable
- cited
- reviewed
- reusable
- non-secret
- non-speculative

If any of those fail, keep it out of durable memory.

## What belongs where

### project-profile.md

- product purpose
- core users
- non-negotiable constraints
- stack or hosting choices that are now stable

### decision-log.md

- important choices
- date or milestone
- why the choice won
- what tradeoff was accepted
- whether an older decision was superseded

### patterns.md

- approaches that worked repeatedly
- conventions worth reusing
- anti-patterns to avoid

### lessons-learned.md

- failure
- cause
- fix
- prevention rule

## Metadata guidance

When relevant, include:

- source run or task
- review provenance
- superseded-by note
- contradiction note
- freshness caveat
