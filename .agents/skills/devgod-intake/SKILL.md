---
name: devgod-intake
description: First-pass intake, risk triage, and staffing.
---

# Devgod Intake

Use for substantive requests by default.

Goal: turn the ask into a clarified brief, risk triage, architecture handoff, planner handoff, and stop/go.

1. Normalize goal, audience, constraints, risks, unknowns, success criteria, and stop/go.
2. Ask concise clarifying questions before planning when the request is ambiguous, outcome-sensitive, or has multiple plausible interpretations.
3. If clarification is not required, state the operating assumptions explicitly in the brief before continuing.
4. Keep manager/root shallow; do not do deep investigation or implementation design directly.
5. Use no more than two shallow inspections before trivial classification or bounded investigation.
6. Create or update `.devgod/ACTIVE` and the matching intake brief.
7. Route ambiguous or user-flow-heavy work through `product_strategist`.
8. Run bounded evidence gathering when ownership, call flow, or behavior is unclear.
9. Treat refactors as behavior-preserving improvement work: surface touched-scope risks and route them into planning instead of hiding behind "refactor only".
10. Hand evidence to `solution_architect`, then hand architecture to `planner`.
11. Preserve the trivial fast path for low-risk mechanical work.
12. Stop before implementation if the user asked for planning only.

Manager checklist:

- confirm request, success criteria, constraints, completion bar, and main risk
- capture clarifying questions and answers or explicit assumptions
- confirm whether the user expects end-to-end completion or planning only
- do not exceed two shallow inspections before delegation
- require current task id and matching brief before worker execution

Default chain:

- `product_strategist`
- `solution_architect`
- `security_reviewer`
- `qa_engineer`
- `planner`

Use caveman format for specialist handoffs.
