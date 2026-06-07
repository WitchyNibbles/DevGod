# Devgod Consistency Gap Summary

## Purpose

This pass targeted both maintainers working in the `devgod` source repo and downstream repos installing `devgod` as a package. The objective was not just to turn the tests green, but to remove the concrete drift that made the package surface and workflow contract untrustworthy.

## Fixed in this pass

### 1. Package surface drift

- `package.json` did not ship several `.codex/agents/*.toml` files that already existed in the repo.
- `package.json` also missed repo-local skills that the package was implicitly expected to expose.
- Result before repair: install and pack verification failed, and downstream repos could not rely on the source tree matching the published artifact.
- Repair: added the missing agent and skill artifacts to the package `files` surface and verified them through `npm pack --dry-run` during `npm run check:quality`.

### 2. Workflow template drift

- `.devgod/templates/task-packet.md` lacked required sections that the workflow checker and scaffold tests enforce, including `## Verification steps`, `## Required reviews`, and `## Rollback notes`.
- Result before repair: a newly scaffolded task packet could violate the repo's own checker contract.
- Repair: aligned the template with the enforced schema and updated the active task packet accordingly.

### 3. Hook write-scope hole

- `plugins/devgod/scripts/hook-utils.mjs` did not correctly interpret glob-style directory scopes such as `dir/**`.
- Result before repair: valid task scopes could self-block `apply_patch` edits, which is a direct workflow break for real development.
- Repair: added explicit support for glob-style directory scopes and covered it with hook tests.

### 4. Agent metadata drift

- Several `.codex/agents/*.toml` artifacts used hyphenated `name` values while the repo catalog and role ids use underscore-based identifiers.
- Result before repair: metadata verification could pass on filenames while still exposing identity drift inside the artifacts.
- Repair: normalized the affected `name` fields to match the catalog role ids.

### 5. Test duplication that encouraged future drift

- `tests/install.test.ts` duplicated large static lists of expected repo-local skills instead of deriving them from the repo's canonical helper.
- Result before repair: every role or skill-surface adjustment had multiple manual update points.
- Repair: replaced the copied lists with `listCatalogRepoLocalSkillPaths()` and made the intentionally always-shipped repo-local skills explicit in `src/devgod/repo-local-skill-surface.ts`.

### 6. Workflow artifact drift inside this task itself

- The new brief initially did not match the intake brief schema that `scripts/check-devgod-workflow.sh` expects.
- Result before repair: the repo could claim a stricter workflow than its own active artifact set actually satisfied.
- Repair: rewrote the brief to the current template structure and reran the workflow check.

## Follow-up completed after this pass

### Priority 1 follow-up: canonical package-surface verification

- `package.json` `files` drift is now checked against one canonical helper in `src/devgod/package-surface.ts`.
- `src/devgod/verify-package-surface.ts` now fails the repo when the manifest has missing, unexpected, or duplicate shipped entries.
- `scripts/check-quality.sh` now runs that verifier before `npm pack --dry-run`.
- `tests/install.test.ts` now reuses the canonical helper instead of maintaining another copied package-surface list.
- Result: future agent, skill, or shipped-overlay additions fail fast against one maintained source instead of drifting across `package.json`, tests, and dry-run expectations.

### Priority 2 follow-up: canonical workflow-schema ownership

- duplicated workflow schema literals are now centralized in `src/devgod/workflow-schema.ts`
- the shell checker now reads a shipped repo-owned artifact from `.devgod/templates/workflow-schema.json` instead of maintaining separate requirement lists
- the intake brief, task packet, and review gate templates are now verified against renderer output from the canonical schema module
- scaffold, checker-fixture, and workflow tests now consume the centralized schema surface instead of copied role/heading definitions
- Result: checker/templates/tests now share one schema source, while downstream consumers still receive a deterministic shipped artifact with no behavior regression

### Priority 3 follow-up: package-surface ownership documentation

- maintainers now have a focused note in `docs/maintainers/package-surface-ownership.md`
- `src/devgod/package-surface.ts` now exposes explicit ownership groups instead of only one opaque flat list
- `tests/install.test.ts` now verifies that the grouped ownership model flattens back to the exact canonical shipped surface
- `docs/maintainers/quality-tooling.md` now cross-references the shipped-surface ownership note while keeping maintainer-only boundaries separate
- Result: maintainers can tell which shipped paths are owned by static package policy, repo-local skill policy, or shipped agent-artifact policy without changing package behavior

## What was duplicated or unnecessary

### Removed logically duplicated expectations

- install test skill allowlists are now derived from the canonical helper instead of being maintained as copied arrays

### Still intentionally duplicated

- package shipping metadata remains manually enumerated in `package.json`
- role/skill packaging is also represented in tests and helper code

This remaining duplication is intentional only because `npm` packaging still consumes the `files` array directly. It is still a drift risk.

## Workflow holes that would block actual development

### Fixed

- task scopes using `/**` could block legitimate edits through the hook layer
- scaffolded task packets could miss sections the checker requires
- package dry runs could omit supported roles and skills from downstream installs

### Residual

- the workflow contract is still strict enough that newly created artifacts can fail if they are not authored directly against the current templates
- the package surface still depends on manual `files` maintenance instead of generation, even though enforcement is now centralized

## Residual gaps and priorities

### Priority 4 follow-up: workflow contract breadth simplification

- non-behavioral task-packet headings were removed from the canonical workflow schema, shipped template, scaffold defaults, and contract tests
- removed headings include coverage-impact, touched-ledger, interrupt-checkpoint-policy, retrieval-guidance, anti-patterns, handoff-format, and the template-only good-path/bad-path checks
- `scripts/check-devgod-workflow.sh` now preserves release-readiness fallback through retained sections instead of depending on the removed `## Good-path checks`
- Result: the workflow packet is meaningfully smaller while review, release, reasoning, rollback, and UI/Playwright gates keep the same behavior

### Priority 5 follow-up: canonical review-role contract reuse

- review-role aliases, required gate roles, artifact-ref keys, and default review artifact path helpers are now centralized in `src/devgod/workflow-schema.ts`
- the workflow checker, scaffold/install helpers, workflow-schema CLI, and checker-fixture generator now reuse that canonical review-role surface instead of copied literals
- the installed `scripts/check-devgod-happy-path.sh` now reads the shipped `.devgod/templates/workflow-schema.json` artifact so downstream repos enforce the same review-role contract
- Result: source-repo and installed-repo workflow checks now share one review-role contract without behavior regression

### Priority 6 follow-up: canonical artifact-ref and review-export policy reuse

- artifact-ref guidance text, example ref lines, and runtime-optional review-export policy now live in `src/devgod/workflow-schema.ts` alongside the existing schema values
- `.devgod/rules/review-gate-policy.md` is now verified as managed renderer output instead of hand-maintained prose
- `src/install/merge.ts` and `src/install/cli.ts` now reuse canonical helper-summary or policy strings instead of copying the artifact-ref/review-export wording
- Result: managed docs, shipped workflow metadata, and install/scaffold helpers now describe the same artifact-ref and review-export policy without prose drift

### Priority 1: continue collapsing copied contract surfaces

This pass removed one copied skill allowlist, centralized the workflow schema, centralized the review-role contract, and centralized the managed artifact-ref/review-export policy surface, but other multi-file contract surfaces still exist across:

- templates
- check scripts
- docs
- install/runtime helpers

Any place where the same contract is maintained in prose, tests, and code should be treated as a drift hotspot.

That workflow artifact-ref and review-export policy slice is now complete.

### Priority 7 follow-up: stop-hook completion relaxation

- `plugins/devgod/scripts/hook-utils.mjs` now normalizes authoritative queued task pointers with terminal statuses (`done`, `complete`, `completed`) to no-active-task state before stop-hook policy evaluation
- `tests/hooks.test.ts` now proves a terminal queued pointer allows stop while a genuinely active queued pointer still blocks vague completion summaries
- Result: completed tasks no longer need exact transcript phrasing to exit when control-layer authority already says the work is over, while blocker and active-task protection remain intact

The queued stop-hook integrity repair is now complete. The remaining follow-up surface is copied workflow commentary that still lives outside managed rule, template, and helper surfaces.

## Verification evidence

The repo passed all core verification requested for this pass:

- `npm run typecheck`
- `npm test`
- `npm run check:quality`
- `bash scripts/check-devgod-workflow.sh --task-id 2026-06-07-devgod-internal-consistency-hardening`

## Bottom line

`devgod` is internally consistent again on the release-critical path. The main remaining problem is now narrower maintainability drift across copied contract surfaces in docs, scripts, and helpers, not broken package or workflow gate behavior.
