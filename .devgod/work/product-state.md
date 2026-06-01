# Product State

## Product Goal

Make git-flow-style branch naming, branch-from-updated-main workflow, and no-`codex` git metadata the default reusable `devgod` git policy.

## Global Acceptance Criteria

- `devgod` ships explicit reusable branch naming defaults using the approved git-flow-style prefixes
- shared prompts, rules, and install output prioritize that default over GitHub MCP naming habits unless a consuming repo overrides it
- local git guardrails reject invalid branch names or commit metadata that violates the new default
- focused tests cover the shipped policy text and git-guard behavior

## Required Capabilities

| Capability | Status | Evidence |
|---|---|---|
| Shared git naming policy | done | `AGENTS.md`, `src/install/merge.ts`, `.devgod/rules/git-conventions.md` |
| Deterministic local guardrails | done | `src/install/git-guard.ts`, `.githooks/pre-commit`, `scripts/check-devgod-branch-name.sh`, `scripts/check-devgod-commit-msg.sh` |
| Install/setup compatibility | done | `tests/install.test.ts` |
| Branch-from-main workflow guidance | done | `AGENTS.md`, `src/install/merge.ts` |

## Current Milestone

Ship the reusable git-flow default naming and git metadata hygiene slice.

## Completed Milestones

- clarified operator intent and done criteria on 2026-06-01
- created a clean worktree from updated `origin/main` at commit `558ed5b`
- completed baseline dependency install and test-start verification in the isolated worktree

## Current Task

`2026-06-01-devgod-git-flow-defaults`

## Next Task

`runtime-authenticated review and push reporting`

## Blockers

- runtime-authenticated review and workflow-proof completion remain out of scope for this local implementation turn

## Reasoning Debt

- local hooks can only guide PR metadata indirectly through policy text unless a future GitHub integration surface is added

## Verification Summary

- `npm ci` passed in the isolated worktree
- `npm test` baseline started on the clean branch before implementation edits
- `node --experimental-strip-types --test tests/install.test.ts` passed after the policy and git-guard updates
- `npm test` passed after the policy and git-guard updates

## Review Summary

- Design and Architecture Council packet recorded with `approved_with_conditions`

## Last Updated

2026-06-01
