# Devgod Agent Team

This document records the shipped day-one devgod team shape and the default skill posture for each role.

The canonical source of truth is [`src/devgod/agent-catalog.ts`](/home/eimi/projects/devgod/src/devgod/agent-catalog.ts). The reviewed `.codex/agents/*.toml` files remain the explicit shipped agent artifacts, and CI is expected to fail if the catalog and shipped artifacts drift.

## Control Model

- The universal blocking review trio remains `reviewer`, `qa_engineer`, and `security_reviewer`.
- The `Design and Architecture Council` is a quality gate for substantive roadmap and plan work, not a fourth blocking review role.
- Optional or domain-specific roles are valid for ownership and specialist evidence when chosen, but they are not silent global blockers.
- Catalog drift is a verification failure, not a runtime continuation deadlock.

## Role Matrix

| Role | Class | Availability | Primary skills |
|---|---|---|---|
| `planner` | manager | core_required | `devgod-planning`, `superpowers-writing-plans` |
| `product_strategist` | manager | core_required | `devgod-product-framing`, `devgod-intake`, `devgod-market-research` |
| `solution_architect` | manager | core_required | `devgod-architecture`, `devgod-backend-patterns`, `devgod-security-review` |
| `docs_researcher` | knowledge | core_required | `devgod-docs-research`, `devgod-documentation-lookup`, `devgod-search-first` |
| `backend_engineer` | delivery | core_required | `devgod-execution`, `devgod-backend-patterns`, `devgod-api-design`, `devgod-tdd-workflow` |
| `frontend_designer` | delivery | core_required | `devgod-ui-art-direction`, `devgod-frontend-taste`, `devgod-design-system`, `devgod-frontend-patterns`, `devgod-web-design-guidelines` |
| `git_operator` | knowledge | core_required | `devgod-git-operator`, `superpowers-using-git-worktrees`, `superpowers-finishing-development-branch` |
| `infra_engineer` | delivery | core_required | `devgod-infra-ops`, `devgod-setup`, `devgod-release-readiness` |
| `reviewer` | quality | core_required | `devgod-review`, `superpowers-verification-before-completion` |
| `build_resolver` | delivery | core_required | `devgod-debugging`, `superpowers-systematic-debugging` |
| `security_reviewer` | quality | core_required | `devgod-security-review`, `devgod-security-scan`, `devgod-docs-research` |
| `qa_engineer` | quality | core_required | `devgod-qa-verification`, `devgod-accessibility-gate`, `anthropic-webapp-testing`, `devgod-e2e-testing`, `devgod-verification-loop` |
| `tdd-guide` | quality | core_required | `devgod-tdd`, `superpowers-test-driven-development` |
| `e2e-runner` | quality | core_required | `devgod-e2e`, `anthropic-webapp-testing`, `devgod-e2e-testing` |
| `release-readiness` | quality | core_required | `devgod-release-readiness`, `devgod-verification-loop` |
| `memory_curator` | knowledge | core_required | `devgod-memory`, `devgod-strategic-compact` |
| `eval_engineer` | quality | core_required | `devgod-eval-engineering`, `devgod-skill-evals`, `devgod-eval-harness` |
| `technical_writer` | knowledge | core_required | `devgod-technical-writing`, `devgod-documentation-lookup`, `devgod-article-writing` |
| `agent_runtime_engineer` | delivery | core_required | `devgod-agent-runtime`, `anthropic-mcp-builder`, `devgod-mcp-server-patterns`, `devgod-verification-loop` |
| `mobile_engineer` | domain_specialist | domain_optional | `devgod-frontend-taste`, `devgod-design-system`, `devgod-frontend-patterns`, `devgod-e2e-testing` |
| `ml_engineer` | domain_specialist | domain_optional | `devgod-documentation-lookup`, `devgod-verification-loop` |
| `data_engineer` | domain_specialist | domain_optional | `devgod-backend-patterns`, `devgod-postgres-patterns`, `devgod-database-migrations`, `devgod-verification-loop` |
| `ux_researcher` | domain_specialist | domain_optional | `devgod-ux-research`, `devgod-frontend-taste`, `devgod-market-research` |
| `product_analyst` | domain_specialist | domain_optional | `devgod-product-analysis`, `devgod-market-research` |
| `compliance_reviewer` | domain_specialist | domain_optional | `devgod-compliance-review`, `devgod-security-review`, `devgod-documentation-lookup` |

## Notes

- Skills are intentionally sparse. Each role should have one primary workflow discipline and at most a small number of secondary skills.
- Repo-local workflow skills should be the default identity for roles with recurring `devgod`-specific decision loops; generic pattern skills remain secondary support.
- Frontend-facing roles now use repo-local wrappers for art direction, visual taste, design-system discipline, implementation patterns, and accessibility gating so UI quality does not depend on ambient global skill installs.
- Planning, debugging, TDD, verification, docs lookup, architecture support, backend patterns, browser verification, MCP implementation, and git handoff hygiene now ship as repo-local wrapper skills instead of relying on ambient global installs.
- Repo-wide policy belongs in `AGENTS.md`; specialist workflow details belong in role-specific skills and agent instructions.
- Roles that participate in the `Design and Architecture Council` should critique with explicit alternatives, dissent ownership, and user/problem/value framing rather than taste-only feedback or passive agreement.
- Optional domain roles still stay intentionally thin until repeated repo-local workload justifies a dedicated `devgod-*` workflow skill.
- UI-affecting tasks should declare their UI surface explicitly and carry browser evidence through `qa_engineer` before workflow-proof approval.
- If a future role is added, update the catalog first, then the shipped agent artifact, then the package/tests/docs surfaces that verify drift.
