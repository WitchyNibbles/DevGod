---
name: devgod-intake
description: First-pass intake, risk triage, and staffing.
---

# Devgod Intake

Use for substantive requests by default.

Goal: turn the ask into a brief, risk triage, architecture handoff, planner handoff, and stop/go.

1. Normalize goal, audience, constraints, risks, unknowns, success criteria, and stop/go.
2. Keep manager/root shallow; do not do deep investigation or implementation design directly.
3. Use no more than two shallow inspections before trivial classification or bounded investigation.
4. Create or update `.devgod/ACTIVE` and the matching intake brief.
5. Route ambiguous or user-flow-heavy work through `product_strategist`.
6. Run bounded evidence gathering when ownership, call flow, or behavior is unclear.
7. Hand evidence to `solution_architect`, then hand architecture to `planner`.
8. Preserve the trivial fast path for low-risk mechanical work.
9. Stop before implementation if the user asked for planning only.

Manager checklist:

- confirm request, success criteria, constraints, and main risk
- do not exceed two shallow inspections before delegation
- require current task id and matching brief before worker execution

Default chain:

- `product_strategist`
- `solution_architect`
- `security_reviewer`
- `qa_engineer`
- `planner`

Use caveman format for specialist handoffs.
