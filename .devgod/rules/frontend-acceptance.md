# Frontend And User-Facing Acceptance

Use this rubric when work is user-facing, artifact-heavy, or explicitly owned by `frontend_designer`.

## Required qualities

- clarity: the purpose and next action should be obvious
- consistency: layout, language, and interaction patterns should not contradict each other
- accessibility: readable structure, sensible semantics, and keyboard or non-pointer viability where applicable
- responsiveness: no broken layout at common narrow and wide widths when a visual surface exists
- polish: avoid generic filler UX and unresolved placeholder content
- design direction: visible work should state a clear visual point of view instead of defaulting to a generic SaaS aesthetic
- redesign delta: remake or redesign asks must materially improve the prior hierarchy, layout, or affordance problems rather than only restyle them
- system logic: repeated visual patterns should follow explicit typography, spacing, palette, and surface rules
- content strategy: image, illustration, icon, empty-state, or animation treatment should be intentional when the surface depends on them

## Evidence expectations

- cite the flow or artifact changed
- note responsive and accessibility checks when relevant
- include E2E or replayable verification when the surface is critical
- for visible redesign work, cite the design package: redesign intent, visual direction, layout changes, asset plan, motion plan, and palette or contrast logic

## Anti-patterns

- “looks nicer” with no acceptance check
- vague polish claims
- accessibility as a postscript
- design-system invention that ignores repo reality
- same layout, same hierarchy, or same button-placement mistakes after a claimed redesign
- imagery, motion, or palette choices left implicit when they materially affect the user experience
