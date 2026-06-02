# Plan

## Task ID

`2026-06-02-devgod-frontend-redesign-workflow`

## Goal

Strengthen the shipped `devgod` frontend workflow so beautiful new builds and meaningful redesigns become repeatable instead of accidental.

## Audience

- `devgod` package maintainers
- operators directing UI work
- end-users of generated interfaces

## Constraints

- avoid destabilizing unrelated specialist roles
- prefer reusable contract changes over one-off operator advice
- keep the slice reversible and testable

## Risks

- too much aesthetic language without explicit structure could still create vague prompts
- ambient-skill assumptions could drift from what the package truly ships
- aggressive redesign defaults could conflict with preserve-system tasks if the contract is not explicit

## Unknowns

- whether AGENTS/install guidance needs a new dedicated frontend section or only stronger bullets
- whether adding `frontend-design` to the frontend role defaults is helpful enough to justify another ambient skill dependency

## Approved assumptions

- the highest-leverage fix is a stronger frontend redesign contract spanning planning, execution, and review
- existing browser-evidence gates should stay, but they need a stronger pre-code design package

## Blocked assumptions

- no claim of runtime-authenticated review completion in this local branch pass unless that evidence is actually produced

## Reasoning quality

- claim: `devgod` needs a stronger frontend contract, not just a louder anti-slop slogan
- evidence refs: brief, council packet, frontend role prompt, frontend skill, frontend rubric, task template, maintainer manifest
- alternatives: prompt-only, rubric-only, model-only
- confidence: high
- bounded budgets: one implementation slice plus one repair loop if tests fail

## First slice

1. Define a reusable frontend redesign contract in repo rules and AGENTS/install guidance.
2. Extend the planner and task-packet workflow so visible UI work requires a design-direction package before code.
3. Strengthen the shipped frontend role and catalog posture toward concept generation, systemization, and anti-generic critique.
4. Add tests that anchor the new contract and catch drift.

## Verification

- `node --experimental-strip-types --test tests/control-layer-contract.test.ts`
- `node --experimental-strip-types --test tests/install.test.ts`
- targeted follow-up tests if the catalog or template changes ripple into other suites

## Stop Go

`go`
