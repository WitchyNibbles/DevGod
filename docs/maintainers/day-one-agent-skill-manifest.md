# Day-One Agent Skill Manifest

Status date: `2026-05-28`

## Audience

- `devgod` maintainers
- agent/runtime owners
- release-readiness reviewers

## Purpose

This manifest defines the required day-one agent skill posture for `devgod`, including the browser-verification contract for UI-affecting work.

It is a maintainer rollout artifact, not a claim that every item below already ships today.

## Current truth

- `devgod` already ships a reviewed repo-local role catalog and default skill posture in [docs/devgod-agent-team.md](/home/gii/apps/lexer/DevGod/docs/devgod-agent-team.md) and [src/devgod/agent-catalog.ts](/home/gii/apps/lexer/DevGod/src/devgod/agent-catalog.ts).
- `devgod` already requires the blocking review trio `reviewer`, `qa_engineer`, and `security_reviewer`.
- `devgod` does not yet enforce a hard runtime rule that UI-affecting work must include browser evidence before approval.
- The live Playwright MCP surface is useful and current, but local browser provisioning is not yet guaranteed. A browser launch in this environment failed because Chrome was missing.

## Manifest rules

- Repo-local `devgod-*` skills remain the primary workflow layer.
- External skills must be vendored, wrapped, namespaced, tested, and referenced by local wrapper names.
- `devgod` must not depend on per-user `npx skills add ...` state for correctness.
- Browser screenshots, traces, and videos may exist as task-scoped artifacts, but must not be promoted into durable memory.
- Backend-only tasks must not be forced through browser verification or long-running E2E.

## Required external skill layer

These are approved for day-one rollout if vendored and wrapped into repo-local names.

| Local wrapper | Upstream source | Primary use |
|---|---|---|
| `superpowers-writing-plans` | `obra/superpowers@writing-plans` | plan discipline |
| `superpowers-systematic-debugging` | `obra/superpowers@systematic-debugging` | build/debug discipline |
| `superpowers-test-driven-development` | `obra/superpowers@test-driven-development` | TDD discipline |
| `superpowers-verification-before-completion` | `obra/superpowers@verification-before-completion` | verification discipline |
| `superpowers-using-git-worktrees` | `obra/superpowers@using-git-worktrees` | git hygiene |
| `superpowers-finishing-development-branch` | `obra/superpowers@finishing-a-development-branch` | publish hygiene |
| `anthropic-frontend-design` | `anthropics/skills@frontend-design` | primary frontend generation |
| `anthropic-webapp-testing` | `anthropics/skills@webapp-testing` | browser verification |
| `anthropic-mcp-builder` | `anthropics/skills@mcp-builder` | MCP implementation discipline |
| `vercel-web-design-guidelines` | `vercel-labs/agent-skills@web-design-guidelines` | UI standards and accessibility review |
| `vercel-react-best-practices` | `vercel-labs/agent-skills@vercel-react-best-practices` | React/Next quality |
| `impeccable-frontend-design` | `pbakaus/impeccable@frontend-design` | anti-generic UI critique/generation |
| `ms-frontend-design-review` | `microsoft/skills@frontend-design-review` | UI review rubric |
| `ckm-design-system` | `nextlevelbuilder/ui-ux-pro-max-skill@ckm:design-system` | tokens and systemization |
| `ecc-accessibility` | `affaan-m/everything-claude-code@accessibility` | accessibility gate |

## Explicit do-not-ship list

These must not be required day-one dependencies in their current marketplace state.

| Upstream source | Reason |
|---|---|
| `openai/skills@openai-docs` | visible audit fail on the skill page; drill-down evidence is inconsistent |
| `openai/skills@security-best-practices` | visible audit fail on the skill page |
| `microsoft/playwright@playwright-cli` | no `SKILL.md` published on the skill page; not acceptable as a required workflow dependency |

## Role manifest

### Core required roles

| Role | Primary local skills | Required wrapped secondary skills |
|---|---|---|
| `planner` | `devgod-planning` | `superpowers-writing-plans` |
| `product_strategist` | `devgod-product-framing`, `devgod-intake`, `market-research` | none required |
| `solution_architect` | `devgod-architecture`, `backend-patterns`, `security-review` | optional future local threat-model wrapper after source review |
| `docs_researcher` | `devgod-docs-research` | use Context7-backed docs lookup through repo-owned wiring, not a marketplace dependency |
| `backend_engineer` | `devgod-execution`, `backend-patterns`, `api-design` | none required |
| `frontend_designer` | `frontend-design`, `frontend-patterns`, `web-design-guidelines` | `anthropic-frontend-design`, `impeccable-frontend-design`, `vercel-web-design-guidelines`, `ms-frontend-design-review`, `ckm-design-system` |
| `git_operator` | `devgod-git-operator` | `superpowers-using-git-worktrees`, `superpowers-finishing-development-branch` |
| `infra_engineer` | `devgod-infra-ops`, `devgod-setup`, `devgod-release-readiness` | none required |
| `reviewer` | `devgod-review` | `superpowers-verification-before-completion` |
| `build_resolver` | `devgod-debugging` | `superpowers-systematic-debugging` |
| `security_reviewer` | `security-review`, `devgod-docs-research` | none required day one |
| `qa_engineer` | `devgod-qa-verification`, `e2e-testing`, `verification-loop` | `anthropic-webapp-testing`, `ecc-accessibility` |
| `tdd-guide` | `devgod-tdd` | `superpowers-test-driven-development` |
| `e2e-runner` | `devgod-e2e`, `e2e-testing` | `anthropic-webapp-testing` |
| `release-readiness` | `devgod-release-readiness`, `verification-loop` | none required |
| `memory_curator` | `devgod-memory`, `strategic-compact` | none required |
| `eval_engineer` | `devgod-eval-engineering`, `devgod-skill-evals`, `eval-harness` | none required beyond role-specific eval coverage |
| `technical_writer` | `devgod-technical-writing`, `documentation-lookup`, `article-writing` | none required |
| `agent_runtime_engineer` | `devgod-agent-runtime`, `mcp-server-patterns`, `verification-loop` | `anthropic-mcp-builder` |

### Optional domain roles

| Role | Primary local skills | Required wrapped secondary skills |
|---|---|---|
| `mobile_engineer` | `frontend-patterns`, `e2e-testing` | only if mobile is in scope: vendored React Native/Expo wrappers |
| `ml_engineer` | `documentation-lookup`, `verification-loop` | none required day one |
| `data_engineer` | `backend-patterns`, `verification-loop` | none required day one |
| `ux_researcher` | `devgod-ux-research`, `market-research` | `ms-frontend-design-review` for UI-heavy critique |
| `product_analyst` | `devgod-product-analysis`, `market-research` | none required day one |
| `compliance_reviewer` | `devgod-compliance-review`, `security-review`, `documentation-lookup` | none required day one |

## Anti-generic UI stack

`devgod` should not rely on a single frontend skill to avoid generic output. Day-one UI work should combine:

- `anthropic-frontend-design` as the primary generator
- `impeccable-frontend-design` as the anti-slop counterweight
- `ckm-design-system` for token and component discipline
- `vercel-web-design-guidelines` for standards review
- `ms-frontend-design-review` for critique and rubric-based review
- `ecc-accessibility` for accessibility blocking checks

This stack exists to reject:

- default gradient-hero layouts
- generic type hierarchy
- weak spacing rhythm
- no explicit mobile adaptation
- no design-token structure
- motion without intent
- inaccessible UI that only looks correct in static code

## Playwright contract

### Purpose

Agents must verify what users actually see before claiming UI work is complete.

### Classification

Each task packet and runtime task record should declare:

- `ui_surface = none`
- `ui_surface = visual_change`
- `ui_surface = interactive_flow`

Derived policy:

- `none` -> no Playwright requirement
- `visual_change` -> Playwright required
- `interactive_flow` -> Playwright required

### Required evidence

For every task with `playwright_required = true`:

1. `frontend_designer` must perform a browser self-check.
2. `qa_engineer` must perform an independent browser verification pass.
3. `workflow-proof` must reject approval if the QA review does not cite Playwright evidence.

### Minimum browser matrix

For UI-affecting work, require:

- one desktop viewport
- one mobile viewport
- one happy-path check
- one edge, failure, or regression-path check

Do not require broad multi-browser suites for every local loop. Wider coverage belongs to `release-readiness` and critical-flow `e2e-runner` work.

### Tooling posture

- Prefer Playwright MCP snapshot-first verification over screenshot-only review.
- Use screenshots as visual evidence, not as the sole interaction surface.
- Use vision mode only for canvas, charts, maps, or similar surfaces where the accessibility tree is insufficient.
- Use replayable storage/auth setup and mocking to keep flows fast and deterministic.

### Artifact policy

- Store screenshots, traces, and videos under task-scoped paths such as `.devgod/work/artifacts/playwright/<task-id>/`.
- Persist only text summaries and artifact paths in review exports.
- Do not place images, videos, raw traces, or screenshot blobs in `.devgod/memory/`.

### Provisioning requirement

Day-one rollout must not depend on ambient system Chrome.

Required browser bootstrap posture:

- managed Chromium
- hermetic install path when possible
- explicit install step during setup/CI
- deterministic MCP configuration checked into the repo

### Agent-specific browser obligations

| Role | Browser obligation |
|---|---|
| `frontend_designer` | inspect desktop + mobile before handoff; capture snapshot evidence and screenshots for layout-sensitive changes |
| `qa_engineer` | verify user-visible behavior with browser assertions and at least one negative/regression path |
| `e2e-runner` | capture bounded trace evidence for critical flows, install/setup, and release-sensitive journeys |
| `release-readiness` | require broader UI evidence for shipment-sensitive changes |
| `agent_runtime_engineer` | maintain the MCP/browser contract, timeouts, profiles, and evidence-routing rules |

## Required implementation work

### Repo-owned wrappers

- vendor approved external skills under a repo-owned path
- create local wrapper names
- document wrapper ownership and upstream source
- add wrapper-presence tests

### Catalog and prompt updates

- update `src/devgod/agent-catalog.ts`
- update the shipped `.codex/agents/*.toml`
- update `docs/devgod-agent-team.md`
- add explicit browser-verification language to `frontend_designer`, `qa_engineer`, `e2e-runner`, and `release-readiness`

### Runtime and workflow contract

- add `ui_surface` and `playwright_required` to task/runtime state
- update templates and task-packet guidance
- update workflow-proof so UI tasks require browser evidence in QA review summaries
- ensure backend-only tasks bypass the browser gate cleanly

### Browser environment

- check in reviewed Playwright MCP configuration
- provision managed Chromium during setup and CI
- define a fast default timeout profile for local verification
- define a separate richer profile for critical-flow traces

### Verification and evals

- add role-specific evals for each wrapped skill
- add frontend evals that fail generic AI UI output
- add tests for browser-evidence-required vs browser-evidence-not-required routing
- add tests proving screenshots are not written into durable memory

## Release gate

The manifest is not complete until all of the following are true:

- every required wrapped skill is vendored, wrapped, and referenced by local name
- agent catalog, docs, and shipped agent prompts agree
- managed Chromium provisioning is part of setup and CI
- UI task routing sets `playwright_required` correctly
- workflow-proof blocks UI approvals without browser evidence
- durable-memory policy excludes screenshots and trace blobs
- frontend evals reject generic UI output reliably enough to run on the release path

## Out of scope

- forcing E2E on backend-only tasks
- keeping screenshots or trace binaries in durable memory
- requiring long-running browser suites on every task
- trusting marketplace audit badges as the only release criterion

## Sources used for this manifest

- [docs/devgod-agent-team.md](/home/gii/apps/lexer/DevGod/docs/devgod-agent-team.md)
- [src/devgod/agent-catalog.ts](/home/gii/apps/lexer/DevGod/src/devgod/agent-catalog.ts)
- [Playwright MCP intro](https://playwright.dev/docs/getting-started-mcp)
- [Playwright MCP snapshots](https://playwright.dev/mcp/snapshots)
- [Playwright MCP capabilities](https://playwright.dev/mcp/capabilities)
- [Playwright MCP configuration](https://playwright.dev/mcp/configuration/options)
- [Playwright MCP assertions](https://playwright.dev/mcp/tools/assertions)
- [Playwright MCP tracing](https://playwright.dev/mcp/tools/tracing)
- [Playwright MCP storage/auth](https://playwright.dev/mcp/tools/storage)
- [Playwright MCP network mocking](https://playwright.dev/mcp/tools/network-mocking)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Playwright test configuration](https://playwright.dev/docs/test-configuration)
- [Playwright browsers](https://playwright.dev/docs/browsers)
