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
| `product_strategist` | manager | core_required | `devgod-product-framing`, `devgod-intake`, `market-research` |
| `solution_architect` | manager | core_required | `devgod-architecture`, `backend-patterns`, `security-review` |
| `docs_researcher` | knowledge | core_required | `devgod-docs-research`, `documentation-lookup` |
| `backend_engineer` | delivery | core_required | `devgod-execution`, `backend-patterns`, `api-design` |
| `frontend_designer` | delivery | core_required | `devgod-frontend-taste`, `devgod-design-system`, `frontend-design`, `frontend-patterns`, `web-design-guidelines` |
| `git_operator` | knowledge | core_required | `devgod-git-operator`, `superpowers-using-git-worktrees`, `superpowers-finishing-development-branch` |
| `infra_engineer` | delivery | core_required | `devgod-infra-ops`, `devgod-setup`, `devgod-release-readiness` |
| `reviewer` | quality | core_required | `devgod-review`, `superpowers-verification-before-completion` |
| `build_resolver` | delivery | core_required | `devgod-debugging`, `superpowers-systematic-debugging` |
| `security_reviewer` | quality | core_required | `security-review`, `devgod-docs-research` |
| `qa_engineer` | quality | core_required | `devgod-qa-verification`, `devgod-accessibility-gate`, `anthropic-webapp-testing`, `e2e-testing`, `verification-loop` |
| `tdd-guide` | quality | core_required | `devgod-tdd`, `superpowers-test-driven-development` |
| `e2e-runner` | quality | core_required | `devgod-e2e`, `anthropic-webapp-testing`, `e2e-testing` |
| `release-readiness` | quality | core_required | `devgod-release-readiness`, `verification-loop` |
| `memory_curator` | knowledge | core_required | `devgod-memory`, `strategic-compact` |
| `eval_engineer` | quality | core_required | `devgod-eval-engineering`, `devgod-skill-evals`, `eval-harness` |
| `technical_writer` | knowledge | core_required | `devgod-technical-writing`, `documentation-lookup`, `article-writing` |
| `agent_runtime_engineer` | delivery | core_required | `devgod-agent-runtime`, `anthropic-mcp-builder`, `mcp-server-patterns`, `verification-loop` |
| `mobile_engineer` | domain_specialist | domain_optional | `devgod-frontend-taste`, `devgod-design-system`, `frontend-patterns`, `e2e-testing` |
| `ml_engineer` | domain_specialist | domain_optional | `documentation-lookup`, `verification-loop` |
| `data_engineer` | domain_specialist | domain_optional | `backend-patterns`, `verification-loop` |
| `ux_researcher` | domain_specialist | domain_optional | `devgod-ux-research`, `devgod-frontend-taste`, `market-research` |
| `product_analyst` | domain_specialist | domain_optional | `devgod-product-analysis`, `market-research` |
| `compliance_reviewer` | domain_specialist | domain_optional | `devgod-compliance-review`, `security-review`, `documentation-lookup` |

## Notes

- Skills are intentionally sparse. Each role should have one primary workflow discipline and at most a small number of secondary skills.
- Repo-local workflow skills should be the default identity for roles with recurring `devgod`-specific decision loops; generic pattern skills remain secondary support.
- Frontend-facing roles now use a stronger concept-generation-plus-critique posture: repo-local taste and design-system wrappers, `frontend-design` for intentional visual direction, and browser-backed review so UI quality does not collapse into generic AI restyles.
- Planning, debugging, TDD, review-completion discipline, browser verification, MCP implementation, and git handoff hygiene now also ship as repo-local wrapper skills instead of relying on ambient global installs.
- Repo-wide policy belongs in `AGENTS.md`; specialist workflow details belong in role-specific skills and agent instructions.
- Roles that participate in the `Design and Architecture Council` should critique with explicit alternatives, dissent ownership, and user/problem/value framing rather than taste-only feedback or passive agreement.
- Optional domain roles still stay intentionally thin until repeated repo-local workload justifies a dedicated `devgod-*` workflow skill.
- UI-affecting tasks should declare their UI surface explicitly and carry browser evidence through `qa_engineer` before workflow-proof approval.
- Visible UI redesign tasks should also carry a frontend direction package that makes redesign intent, material hierarchy changes, content or asset strategy, motion intent, and palette or contrast choices explicit before code starts.
- If a future role is added, update the catalog first, then the shipped agent artifact, then the package/tests/docs surfaces that verify drift.
