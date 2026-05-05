task_id: 2026-05-04-project-state-review
status: in_review
goal: Assess current devgod package state and identify improvements to agent coverage, skills, guidelines, and hard QA blocking behavior.
audience: Maintainers of the shared devgod package and repo-local control layer.
constraints:
- Respect package boundary; keep changes reusable and package-scoped.
- Treat review, security, and QA gates as blocking for any proposed control-layer changes.
- Do not modify protected control-layer assets unless explicitly assigned by this review task.
risks:
- Recommending additional agents or rules without grounding in existing repository assets.
- Tightening QA language without wiring it into actual execution and review flow.
unknowns:
- Current completeness of `.agents/`, `.codex/`, `.devgod/templates/`, and quality gate instructions.
- Whether current QA behavior is advisory or enforced in task packets and completion rules.
success_criteria:
- Produce an evidence-based assessment of repo state.
- Identify concrete gaps in agent roles, skills, or guidelines.
- Propose and, where safe, implement improvements that make QA a real blocking gate.
- Verify resulting control-layer consistency.
stop_go: go
