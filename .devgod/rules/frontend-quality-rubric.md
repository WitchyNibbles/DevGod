# Frontend Quality Rubric

Use this rubric for visible UI work owned or reviewed by `frontend_designer`, `qa_engineer`, `reviewer`, or `release-readiness`.

## Goal

Reject generic AI-generated UI output and require browser-backed proof for user-visible quality claims.

## Hard fail patterns

- generic gradient-hero layout with interchangeable SaaS sections
- default font stack with no stated typographic direction
- weak spacing rhythm or arbitrary padding changes
- decorative cards with no information hierarchy
- redesign requested but the same layout, hierarchy, or known misplaced controls are effectively preserved
- no explicit content or asset strategy for surfaces that rely on imagery, illustration, iconography, empty states, or animation
- palette choices that lack surface logic or produce muddy contrast
- desktop-only composition with no intentional mobile adaptation
- no token or component discipline for repeated UI patterns
- motion that is decorative only and does not clarify hierarchy or state
- accessibility or layout claims made without rendered browser evidence

## Required design checks

1. Visual direction is explicit:
   - typography choice
   - palette or surface logic
   - density and spacing rhythm
   - motion tone when motion exists
   - redesign intent when changing an existing UI
   - content or asset plan when visuals depend on imagery, illustration, iconography, or animation
2. Information hierarchy is obvious at a glance.
3. Existing-surface redesigns materially fix the specific layout or affordance problems they claim to address.
4. Repeated UI patterns use a token or component rule instead of one-off styling.
5. Mobile composition is intentionally designed, not a compressed desktop version.
6. User actions, labels, and affordances remain accessible and legible.

## Required browser verification for UI tasks

For `ui_surface = visual_change` or `ui_surface = interactive_flow`, require:

- one desktop viewport
- one mobile viewport
- one happy path
- one failure or regression path
- cited Playwright evidence refs in the `qa_engineer` review

## Review prompts

Ask these before approval:

- Could this screen belong to any generic AI-generated app?
- If this was a redesign ask, what actually changed structurally?
- Is the typography doing real hierarchy work?
- Are asset, illustration, empty-state, and animation choices intentional or merely absent?
- Is the spacing rhythm consistent enough to feel intentional?
- Does the palette define surface roles and maintain convincing contrast?
- Does mobile keep the same content priorities and compositional clarity?
- Do the browser artifacts prove what the user actually sees?

## Approval rule

Do not approve visible UI work that fails the hard-fail checks or lacks browser-backed evidence for the claimed quality.
