# Design and Architecture Council Decision Packet

## Task ID

`2026-06-20-devgod-agentic-company-loop-roadmap`

## Decision

`pending`

## Context

The repo now has two target-state documents describing DevGod as a Codex-native agentic software company. The roadmap task converts those documents into an implementation sequence tied to the current codebase.

## Options

### Option A: Runtime-enforcement first

Use the current runtime substrate and add missing enforcement for context pressure, handoffs, delegation, debate, and anti-looseness.

### Option B: New orchestration stack

Replace large parts of the current runtime with a new orchestration layer before hardening existing surfaces.

### Option C: Documentation-first refinement

Continue refining docs and prompts before adding new runtime gates.

## Preferred option

`Option A`

## Rationale

The repo already has most of the required substrate. The dominant gap is enforcement, not missing nouns.

## Dissent owner

`reviewer`

## Conditions

- the first execution slice must prove runtime contract gains, not just doc edits
- optional surfaces must stay optional until the core company-loop contract is enforced
- the roadmap cannot be treated as proof that the target model already ships
