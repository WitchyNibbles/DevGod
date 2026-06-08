# Plan

## Task ID

`2026-06-04-frontend-media-first-family-reset`

## Objective

Reset `devgod`'s frontend workflow so autonomous agents must choose a genuinely new design family, a real authored medium, and an explicit motion/media strategy before implementation, then prove the change on `hexchange`.

## Steps

1. Gather current official evidence on how strong UI agents use references, direct visual iteration, generated imagery, authored motion, and selective 3D.
2. Inspect the shipped `devgod` frontend workflow for the exact places where dark panel-shell primitives and CSS-only decoration still slip through.
   - include whether the workflow forces externalized exploration artifacts before production code
3. Update the shipped workflow, planner, rubric, acceptance, and tests so broad remakes require:
   - a design-family reset
   - a media-first concept choice
   - explicit generated/authored asset reasoning
   - externalized exploration artifacts and direction refs before production code
   - repeated-primitive rejection
   - a fallback when 3D or generated assets are intentionally not used
4. Apply the stronger contract to `hexchange` from a blank slate and build a materially different concept family.
5. Verify with focused tests, build, and browser review, then critique whether the result still inherits the old family.

## 2026-06-07 scoped extension

Add a bounded `archon` audit for the permitted control-layer files and adapt only the Codex-facing frontend-routing behavior that fits the active write scope:

- frontend entrypoint clarity
- UI-surface gating
- task-artifact recording of the routing decision
- contract-test coverage

## Verification

- `node --experimental-strip-types --test tests/control-layer-contract.test.ts`
- `npm test -- --run tests/app/app-shell.test.tsx tests/app/dashboard.test.tsx tests/app/strategy-cockpit.test.tsx tests/app/trades-control-center.test.tsx`
- `npm run build`
- desktop and mobile browser renders for `hexchange`
