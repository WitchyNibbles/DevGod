# Devgod Agent Team

This document records the shipped day-one devgod team shape and the default skill posture for each role.

The canonical source of truth is [`src/devgod/agent-catalog.ts`](/home/eimi/projects/devgod/src/devgod/agent-catalog.ts). The reviewed `.codex/agents/*.toml` files remain the explicit shipped agent artifacts, and CI is expected to fail if the catalog and shipped artifacts drift.

## Control Model

- The universal blocking review trio remains `reviewer`, `qa_engineer`, and `security_reviewer`.
- Optional or domain-specific roles are valid for ownership and specialist evidence when chosen, but they are not silent global blockers.
- Catalog drift is a verification failure, not a runtime continuation deadlock.

## Role Matrix

| Role | Class | Availability | Primary skills |
|---|---|---|---|
| `planner` | manager | core_required | `devgod-planning`, `superpowers:writing-plans` |
| `product_strategist` | manager | core_required | `devgod-product-framing`, `devgod-intake`, `market-research` |
| `solution_architect` | manager | core_required | `devgod-architecture`, `backend-patterns`, `security-review` |
| `docs_researcher` | knowledge | core_required | `devgod-docs-research`, `documentation-lookup` |
| `backend_engineer` | delivery | core_required | `devgod-execution`, `backend-patterns`, `api-design` |
| `frontend_designer` | delivery | core_required | `frontend-design`, `frontend-patterns`, `web-design-guidelines` |
| `git_operator` | knowledge | core_required | `devgod-git-operator`, `superpowers:using-git-worktrees`, `superpowers:finishing-a-development-branch` |
| `infra_engineer` | delivery | core_required | `devgod-infra-ops`, `devgod-setup`, `devgod-release-readiness` |
| `reviewer` | quality | core_required | `devgod-review` |
| `build_resolver` | delivery | core_required | `devgod-debugging`, `superpowers:systematic-debugging` |
| `security_reviewer` | quality | core_required | `security-review`, `devgod-docs-research` |
| `qa_engineer` | quality | core_required | `devgod-qa-verification`, `e2e-testing`, `verification-loop` |
| `tdd-guide` | quality | core_required | `devgod-tdd`, `superpowers:test-driven-development` |
| `e2e-runner` | quality | core_required | `devgod-e2e`, `e2e-testing` |
| `release-readiness` | quality | core_required | `devgod-release-readiness`, `verification-loop` |
| `memory_curator` | knowledge | core_required | `devgod-memory`, `strategic-compact` |
| `eval_engineer` | quality | core_required | `devgod-eval-engineering`, `devgod-skill-evals`, `eval-harness` |
| `technical_writer` | knowledge | core_required | `devgod-technical-writing`, `documentation-lookup`, `article-writing` |
| `agent_runtime_engineer` | delivery | core_required | `devgod-agent-runtime`, `mcp-server-patterns`, `verification-loop` |
| `mobile_engineer` | domain_specialist | domain_optional | `frontend-patterns`, `e2e-testing` |
| `ml_engineer` | domain_specialist | domain_optional | `documentation-lookup`, `verification-loop` |
| `data_engineer` | domain_specialist | domain_optional | `backend-patterns`, `verification-loop` |
| `ux_researcher` | domain_specialist | domain_optional | `devgod-ux-research`, `market-research` |
| `product_analyst` | domain_specialist | domain_optional | `devgod-product-analysis`, `market-research` |
| `compliance_reviewer` | domain_specialist | domain_optional | `devgod-compliance-review`, `security-review`, `documentation-lookup` |

## Notes

- Skills are intentionally sparse. Each role should have one primary workflow discipline and at most a small number of secondary skills.
- Repo-local workflow skills should be the default identity for roles with recurring `devgod`-specific decision loops; generic pattern skills remain secondary support.
- Repo-wide policy belongs in `AGENTS.md`; specialist workflow details belong in role-specific skills and agent instructions.
- Optional domain roles still stay intentionally thin until repeated repo-local workload justifies a dedicated `devgod-*` workflow skill.
- UI-affecting tasks should declare their UI surface explicitly and carry browser evidence through `qa_engineer` before workflow-proof approval.
- If a future role is added, update the catalog first, then the shipped agent artifact, then the package/tests/docs surfaces that verify drift.
