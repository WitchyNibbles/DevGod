# Plan

## Task ID

`2026-06-01-devgod-git-flow-defaults`

## Goal

Make git-flow-style branch naming and no-`codex` git metadata the shipped `devgod` default, with policy, local guardrails, docs, and tests aligned.

## Audience

- `devgod` package maintainers
- consuming repo operators
- git and GitHub-connected agent flows

## Constraints

- consuming repo-specific guidance remains the only normal override
- deterministic enforcement stays in hooks/scripts; remote PR guidance stays textual unless the repo actually ships a validator
- changes must remain small, reversible, and install-safe

## Risks

- over-enforcement could break setup or first-commit flows
- docs could drift if only `AGENTS.md` is changed without `src/install/merge.ts`
- branch guard logic could conflict with detached-head or maintenance scenarios

## Unknowns

- whether branch guard logic needs a narrow maintenance bypass for overlay-control commits
- whether any additional docs beyond AGENTS and rules are needed for operator clarity

## Approved assumptions

- the first slice should cover shipped policy text plus local branch/commit guardrails
- a dedicated git conventions rule is a clearer reusable source than burying all details in one AGENTS bullet

## Blocked assumptions

- no claim of runtime-authenticated workflow completion without separate authority evidence

## Reasoning quality

- claim: a combined policy-plus-guard slice is the smallest change that materially improves default naming behavior
- evidence refs: brief, council packet, `AGENTS.md`, `src/install/merge.ts`, git guard scripts, install tests, GitHub docs, Conventional Commits
- alternatives: docs-only, commit-only, GitHub API validation
- confidence: high
- bounded budgets: one implementation slice, focused test updates, no GitHub API expansion

## First slice

1. Update shared policy text and shipped AGENTS merge output to define branch prefixes, updated-`origin/main` branching, no-`codex` git metadata, and consuming-repo override precedence.
2. Add deterministic local guardrails for branch names and commit subjects.
3. Add tests for managed AGENTS output and git-guard setup behavior.
4. Update operator-facing rule/docs copy where needed to reflect the shipped truth.

## Verification

- `node --experimental-strip-types --test tests/install.test.ts`
- `npm test`
- inspect hook and script diffs for setup compatibility

## Stop Go

`go`
