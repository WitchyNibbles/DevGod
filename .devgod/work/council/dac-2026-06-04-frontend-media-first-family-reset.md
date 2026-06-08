# Design And Architecture Council Decision Packet

## Task ID

`2026-06-04-frontend-media-first-family-reset`

## Decision

`approved_with_conditions`

## Council members

- `solution_architect`
- `product_strategist`
- `frontend_designer`
- `qa_engineer`

## Dissent owner

`reviewer`

## Decision summary

`devgod` should escalate broad frontend remakes from panel-first restyling into explicit design-family resets with a required media-first decision, richer authored-asset expectations, and stricter rejection of repeated shell primitives.

## Approved conditions

- generated imagery, Rive, GSAP, and 3D/WebGL must stay deliberate choices with technical-fit and reduced-motion evidence, not mandatory ornament
- the new contract must preserve control discoverability and must not reward spectacle that hides critical actions
- the proof on `hexchange` must be judged against family-level differentiation, not just polish or palette change

## Dissent

The main risk is replacing one shallow failure mode with another: forcing image generation or heavy motion as cargo cult. The workflow must require an explicit rationale for why generated assets, authored motion, or 3D are or are not used, and must still allow excellent results through lighter stacks when they are conceptually stronger.
