# Frontend And User-Facing Acceptance

Use this rubric when work is user-facing, artifact-heavy, or explicitly owned by `frontend_designer`.

## Required qualities

- clarity: the purpose and next action should be obvious
- consistency: layout, language, and interaction patterns should not contradict each other
- accessibility: readable structure, sensible semantics, and keyboard or non-pointer viability where applicable
- responsiveness: no broken layout at common narrow and wide widths when a visual surface exists
- polish: avoid generic filler UX and unresolved placeholder content
- ui-surface clarity: substantive frontend work should declare whether it is a `visual_change`, `interactive_flow`, `artifact_only`, or another explicit UI surface before implementation starts
- visual intent: substantive redesign work should name references, a chosen direction, and why the surface does not collapse into interchangeable AI UI
- authorship: broad redesigns should name a signature move and a reason the result still feels distinctive when the copy is removed
- family reset: broad remakes should name the new design family, the repeated primitives they banned, and why the result is not just a reordered version of the old shell
- exploration discipline: broad remakes should cite at least 1 externalized visual exploration artifact plus the chosen and rejected direction refs before production implementation
- remake integrity: when the brief asks for something new, the result should not visibly inherit the old design family unless that carryover was explicitly approved
- motion discipline: immersive UI should name the motion system, media strategy, and reduced-motion fallback
- media authorship: broad remakes should make an explicit generated-or-authored asset decision and explain why stronger media was used or intentionally skipped
- surface continuity: if authored media or scene work is present, the active modules should share that language instead of reverting to generic overlay cards
- reference translation: when the user supplies a vibe image or illustrative reference, the resulting UI should reflect its behavior and atmosphere across the whole surface rather than treating it as a literal placement asset by default
- semantic charm: playful, magical, or cute details should feel meaningful, recurring, and product-aware rather than random decorative clutter
- technical fit: ambitious visuals should match the target repo's actual stack and performance envelope
- function preservation: redesign work should preserve the visibility and operability of route-critical actions, not just the underlying API behavior
- codex routing discipline: substantive UI work should name the frontend workflow entrypoint and load deeper frontend skills only when the declared surface actually needs them

## Evidence expectations

- cite the flow or artifact changed
- for substantive redesigns, cite the inspiration sources and the rejected directions
- for substantive frontend work, cite the declared `ui surface` and frontend workflow entrypoint
- for high-polish redesigns, cite the chosen signature move, impressiveness hypothesis, and the asset, media, or motion rationale
- for broad remakes, cite the design-family reset, repeated primitive ban, generated asset decision, and surface-language continuity plan
- for broad remakes, cite the visual exploration artifact ref, chosen direction artifact ref, rejected direction artifact refs, and opposite-direction artifact ref when one was needed
- for image-led or vibe-led redesigns, cite the reference translation brief and how it changed motion, interaction, and material treatment
- for playful or whimsical redesigns, cite the semantic charm map and why those details are not placeholder clutter
- for immersive redesigns, cite the technical-fit choice, reduced-motion fallback, and browser-verified motion notes
- for workflow-bearing surfaces, cite the critical controls that were preserved and how the redesign kept them discoverable
- for remake work, cite the inheritance cutoff, legacy carryover ban, and how the chosen direction avoided evolving the old shell by accident
- note responsive and accessibility checks when relevant
- include E2E or replayable verification when the surface is critical

## Anti-patterns

- “looks nicer” with no acceptance check
- vague polish claims
- immersive claims with no motion critique notes
- vibe-led redesigns that merely embed the vibe image instead of translating it
- visually stronger but functionally harder to use
- a “remake” that is mostly an edited prior layout
- a “new family” claim that still depends on the same shell and card primitives in a different order
- a broad remake that implemented variants directly in the production shell without an externalized exploration artifact
- a substantive UI task that loaded multiple frontend skills without first declaring the UI surface and entrypoint
- an immersive or illustrated result where the active UI still reads as separate overlay panels rather than part of the same authored system
- mixed old and new visual systems competing on the same surface
- accessibility as a postscript
- design-system invention that ignores repo reality
