# Intake Brief

## Brief ID

`brief-2026-06-01-devgod-git-flow-defaults`

## Task ID

`2026-06-01-devgod-git-flow-defaults`

## Request

Original user ask:

`make devgod default branch naming conventions follow git flow style prefixes, prioritize that over GitHub MCP naming conventions unless a consuming repo has a repo-specific guideline, avoid mentioning codex in branches/commits/PR fields, always start task or plan work from an updated origin/main branch, and research good GitHub practices for branch names, commit messages, and PR titles/bodies`

## Goal

Make git-flow-style branch naming, conventional commit hygiene, branch-from-updated-main workflow, and no-`codex` git metadata the default reusable `devgod` behavior across repo rules, shipped prompt artifacts, and local git guardrails.

## Intended outcome

- shared `devgod` policy prefers git-flow-style branch prefixes over GitHub MCP naming habits
- generated branch names, commit subjects, and PR titles or bodies avoid `codex` wording by default
- local git guardrails block or push back on invalid branch and commit metadata early
- consuming repos can still override branch naming via their own higher-precedence repo guidance

## User

Devgod package maintainer tightening reusable git workflow defaults for both local Codex work and GitHub-connected publish flows.

## Problem

Current repo policy and shipped guidance define commit-message hygiene, but do not establish a hard default branch taxonomy, do not explicitly forbid `codex` in git metadata, and do not consistently tell agents to branch from updated `origin/main` before planning or implementation work.

## Value

Clearer branch taxonomy improves reviewability and release handling, prevents tool-specific naming leakage into user-facing git history, and gives consuming repos a consistent default that can still yield to higher-precedence repo guidance.

## Audience

- devgod package maintainers
- consuming repo operators using installed `devgod` control layers
- GitHub-connected publish flows and agents that synthesize branch, commit, and PR metadata

## Constraints

- package defaults must remain reusable across consuming repos
- consuming repo-specific guidance must remain the only normal override
- deterministic enforcement belongs in scripts/hooks where possible and in prompts/rules where judgment is needed
- keep the first slice reversible and avoid inventing a GitHub integration surface that the repo does not ship

## Risks

- prompt-only wording without guardrails would leave naming behavior inconsistent
- hard guardrails that ignore consuming-repo precedence could over-constrain downstream repos
- broad docs-only edits would drift from actual shipped installer output and hook behavior
- enforcing branch rules too aggressively could break existing setup and install flows

## Unknowns

- which shipped prompt and installer surfaces currently mention branch workflows implicitly
- whether existing git-guard setup can absorb branch-name checks without breaking repo setup tests
- how much of the PR-title/body behavior should live in policy text versus local verification

## Clarifying questions

- full implementation requested, not planning-only
- optimize for both local Codex work and GitHub-connected flows
- treat git-flow prefixes as a hard default rule unless a consuming repo overrides it
- done means policy, automation/workflows, docs, and tests are all updated

## Council need

`required`

## Council rationale

This is shared governance and runtime-behavior work that changes reusable git workflow defaults, shipped control-layer prompts, and guardrail behavior across consuming repos.

## Assumptions

### Approved assumptions

- a small reusable first slice can cover repo rules, shipped AGENTS merge output, git guard hooks, and focused tests without introducing GitHub API-specific code
- branch-name enforcement should block direct commits from invalid branch names while still allowing consuming repos to override through higher-precedence repo guidance
- `codex` should be treated as disallowed in branch names and commit subjects, and as discouraged in PR metadata through policy text

### Blocked assumptions

- do not assume GitHub MCP defaults are safe to follow when they conflict with this repo policy
- do not assume runtime-authenticated review gates can be completed during this local implementation turn

## Evidence

- `AGENTS.md`
- `.devgod/rules/policy-precedence.md`
- `src/install/merge.ts`
- `scripts/check-devgod-commit-msg.sh`
- `src/install/git-guard.ts`
- `.githooks/pre-commit`
- `.githooks/commit-msg`
- `tests/install.test.ts`
- GitHub Docs: best practices for pull requests
- GitHub Docs: configuring branch rulesets with branch-name patterns
- Conventional Commits 1.0.0 specification

## Reasoning quality

### Facts

- `AGENTS.md` and `src/install/merge.ts` are current source-of-truth layers for shipped reusable repo guidance
- the repo already ships commit-message and managed-path git guards, but no branch-name guard
- consuming repo guidance has higher precedence than lower-level reusable rules
- the worktree was created from updated `origin/main` on 2026-06-01 at commit `558ed5b`

### Hypotheses and alternatives

- preferred: encode branch/commit/PR policy in AGENTS and managed merge output, then add a local branch-name guard plus commit-message `codex` rejection
- alternative: document the rule only and trust agent prompts to comply
- alternative: add a larger GitHub publish integration that validates PR metadata directly

### Counter-evidence

- hard local enforcement cannot fully validate remote PR fields, so some PR guidance must remain policy-driven rather than mechanically blocked in git hooks

### Confidence

`high`

### Research and debug budget

- repo inspection: two shallow passes completed
- implementation and regression budget: focused on prompt/rule/guard surfaces plus install tests

### Verification plan

- update focused install and git-guard tests
- run targeted tests first, then broader repo verification as needed
- inspect staged diffs before each atomic commit

## Success Criteria

- git-flow prefix policy is explicit in shipped reusable repo guidance and install merge output
- branch and commit guardrails reject invalid names and `codex`-containing commit subjects where appropriate
- docs summarize the new default and its override rule accurately
- tests cover the updated managed policy text and guard behavior

## Completion bar

- implementation landed on a new branch from updated `origin/main`
- focused verification passes
- branch is pushed to `origin`
- remaining runtime-authenticated review gates, if any, are called out explicitly rather than implied complete

## Good-path outcomes

- new work starts on branches such as `feature/user-authentication` or `bugfix/login-validation`
- commit subjects remain conventional and avoid tool-branding leakage
- repo guidance tells agents to branch from updated `origin/main` before task or plan work

## Bad-path or edge-case outcomes

- invalid branch names or direct work on `main` are blocked early by local git guardrails
- consuming repos with explicit repo guidance can document a different policy without mutating shared package defaults

## Non-goals

- adding a GitHub App or PR API validator
- changing unrelated release or deployment workflows
- rewriting historical branch or commit names

## Out of scope

- durable memory updates
- runtime-authenticated review identity changes
- non-git workflow conventions outside branch/commit/PR metadata

## Council handoff target

`solution_architect`

## Trust boundaries

- repo policy and shipped prompt artifacts
- local deterministic git guard scripts and hook setup
- consuming repo higher-precedence guidance
- remote GitHub PR metadata, which is advisory from local repo code unless explicitly integrated

## Stop Go

`go`

## Next step

Produce the council packet and executable task packet, then implement the smallest safe slice across policy text, git guards, and tests.
