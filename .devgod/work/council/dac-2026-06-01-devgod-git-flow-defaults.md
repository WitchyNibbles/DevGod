# Design And Architecture Council Decision Packet

## Task ID

`2026-06-01-devgod-git-flow-defaults`

## Decision type

`governance`

## Problem

`devgod` currently lacks a reusable default branch taxonomy and explicit guidance for avoiding `codex` wording in git metadata, leaving branch naming and PR hygiene too dependent on tool defaults and local habit.

## User

Devgod package maintainer and downstream operators who rely on shipped defaults.

## Value

Shared defaults become more reviewable, release-friendly, and less tool-branded, while still preserving consuming-repo override authority.

## Proposal

Adopt git-flow-style branch prefixes as the default shared policy, require new task or plan work to start from an updated `origin/main` branch, forbid `codex` in branch names and commit subjects, express PR-title/body guidance in shipped repo policy, and add local git guard coverage for the branch and commit parts that can be validated deterministically.

## Alternatives

- Conservative option: document the preferred branch prefixes in `AGENTS.md` only and leave enforcement to agent judgment.
- Broader option: build GitHub-specific PR validation or publish-time automation that rewrites branch and PR metadata.
- Compromise option: enforce only commit messages locally and treat branch naming as advisory.

## Evidence refs

- `.devgod/work/briefs/brief-2026-06-01-devgod-git-flow-defaults.md`
- `AGENTS.md`
- `src/install/merge.ts`
- `src/install/git-guard.ts`
- `scripts/check-devgod-commit-msg.sh`
- GitHub Docs on pull-request best practices and branch-name pattern rulesets
- Conventional Commits 1.0.0

## Counter-evidence

- local repo hooks cannot fully validate remote PR fields, so policy text remains necessary even with stronger local hooks
- strict branch enforcement could surprise install flows if it blocks setup commits on default branches without an explicit maintenance path

## Consequences

- shared repo guidance becomes more opinionated and explicit
- install/setup verification must absorb any new guard script or hook requirement
- downstream repos gain a stronger default but need a documented override path at higher-precedence repo guidance

## Rollback or reversal path

Revert the new branch guard and the added policy text, leaving commit-message hygiene and managed-path guardrails intact.

## Council question

Is the smallest safe first slice to combine shared policy updates with local branch/commit guardrails, while leaving PR metadata as policy-guided rather than API-enforced?

## Proposed council members

- `solution_architect`
- `product_strategist`
- `security_reviewer`

## Proposed dissent owner

`product_strategist`

## Outcome

`approved_with_conditions`

## Conditions or actions

- keep consuming-repo override authority explicit in the shipped policy text
- keep deterministic enforcement limited to branch and commit surfaces the repo actually controls
- cover setup/install regression paths in tests before push

## Exception expiry

`none`

## Decision summary

Proceed with a thin slice: shared git-flow default policy, explicit no-`codex` git metadata guidance, updated branch-from-main workflow language, local branch/commit guardrails, and focused regression tests.
