# Design And Architecture Council

## Task ID

`2026-06-02-devgod-frontend-redesign-workflow`

## Decision

`approved_with_conditions`

## Trigger rationale

Shared frontend workflow policy, shipped prompts, and planning artifacts for human-facing work are being changed across consuming repos.

## Council members

- `solution_architect`
- `product_strategist`
- `frontend_designer`

## Dissent owner

`product_strategist`

## Reviewed evidence

- `.devgod/work/briefs/brief-2026-06-02-devgod-frontend-redesign-workflow.md`
- `.agents/skills/devgod-frontend-taste/SKILL.md`
- `.codex/agents/frontend-designer.toml`
- `.devgod/rules/frontend-quality-rubric.md`
- `.devgod/templates/task-packet.md`
- `docs/maintainers/day-one-agent-skill-manifest.md`

## Findings

### What is true now

- `devgod` already rejects some obvious generic UI patterns and requires browser-backed proof for visual claims.
- The workflow does not yet force a strong design brief before code for redesign-heavy asks.
- Existing UI remakes can preserve the same weak hierarchy or bad control placement and still look "complete" to the current contract.

### Alternatives considered

1. Prompt-only fix in `frontend_designer`
2. Review-only hardening in the rubric
3. Combined contract fix across planner, templates, role prompts, and rules

### Preferred path

Choose the combined contract fix. Prompt-only and review-only changes are too easy to bypass because they leave planning and task decomposition under-specified.

## Conditions

- preserve conservative behavior when the task explicitly says to keep an existing design system
- make redesign depth explicit so "polish" and "reimagine" do not share one vague contract
- keep the change mostly in prompts, rules, templates, docs, and tests instead of a large runtime migration

## Reversible decisions

- wording and required sections in the task packet template
- frontend role prompt posture
- AGENTS and install merge guidance
- catalog skill ordering

## Expensive decisions avoided

- new runtime schema fields beyond the current UI-surface controls
- mandatory image-generation infrastructure
- remote design-review services or new authenticated gate roles

## Dissent

The `product_strategist` dissent is that stronger aesthetic ambition can become over-design if the workflow confuses user value with novelty. The accepted mitigation is to require a user-task hierarchy and current-surface failure list in the redesign package so visual ambition remains anchored to actual problems.

## Outcome summary

Proceed with a thin slice that adds a frontend redesign contract, pushes stronger redesign intent into the planner and frontend role, keeps browser proof, and enforces the new posture with focused tests.
