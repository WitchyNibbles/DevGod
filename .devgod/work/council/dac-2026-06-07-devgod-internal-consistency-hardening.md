# Design And Architecture Council Decision

## Task ID

`2026-06-07-devgod-internal-consistency-hardening`

## Decision

`approved_with_conditions`

## Scope

Repair `devgod` so its shipped package surface, workflow artifacts, and maintainer/downstream verification paths agree on one internally consistent contract.

## Council Members

- `solution_architect`
- `product_strategist`
- `infra_engineer`
- `qa_engineer`

## Dissent Owner

`reviewer`

## Alternatives Considered

- minimal red-test repair only
- full parity chase with `archon`
- consistency-first cleanup with selective parity adoption where drift creates real workflow holes

## Chosen Direction

Take the consistency-first cleanup path. Fix contract drift first, remove or justify redundant surfaces, and only adopt `archon` parity deltas where they close real maintainability or installability gaps.

## Conditions

- do not silently expand shipped surface without matching tests and package metadata
- document remaining intentional debt in a maintainer-facing gap summary
- verify both maintainer and downstream-facing paths before closing the task

## Dissent

The main risk is overfitting `devgod` to `archon` rather than cleaning `devgod` on its own terms. The repair should prefer simplification over copying sibling surface area unless a concrete install or workflow hole requires it.
