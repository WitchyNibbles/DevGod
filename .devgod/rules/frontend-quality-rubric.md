# Frontend Quality Rubric

Use this rubric for visible UI work owned or reviewed by `frontend_designer`, `qa_engineer`, `reviewer`, or `release-readiness`.

## Goal

Reject generic AI-generated UI output and require browser-backed proof for user-visible quality claims, especially when the brief asks for immersive motion-heavy experiences.

A redesign also fails if it presents authored scene/media work in the background while leaving the active UI in a separate, generic panel language.

For Codex-managed work, frontend review also fails if substantive UI tasks skip the repo-local frontend entrypoint and load an unfocused skill pile without declaring the actual UI surface first.

## Hard fail patterns

- generic gradient-hero layout with interchangeable SaaS sections
- default font stack with no stated typographic direction
- left-rail plus hero plus metric-strip layouts that remain structurally generic after theming
- remakes that still rely on the same shell, card, metric, or headline primitives in a new order
- results that still read as poster or illustration plus overlay product panels
- route identity that comes mainly from a large copy block while interactive surfaces remain ordinary
- weak spacing rhythm or arbitrary padding changes
- decorative cards with no information hierarchy
- desktop-only composition with no intentional mobile adaptation
- no token or component discipline for repeated UI patterns
- motion that is decorative only and does not clarify hierarchy or state
- motion-heavy claims backed only by entrance fades, tiny hover lifts, or ornamental parallax
- barely noticeable ambient motion used to justify an otherwise unchanged layout
- vibe-image-led redesigns that treat the reference mainly as a literal hero asset instead of translating its motion, charm, and material language into the whole surface
- cinematic or game-like claims with no imagery, texture, media, or interaction choreography plan
- broad remakes with no explicit decision on whether generated imagery, authored interaction art, or 3D depth should be used
- broad remakes that go straight from plan text to production code with no externalized exploration artifact
- dashboard, admin, control-center, or game-like remakes that skip the exploration step because the surface is "functional"
- WebGL, video, or heavy animation chosen with no technical-fit rationale or reduced-motion fallback
- immersive visuals that obscure task clarity or make key actions hard to find
- critical controls pushed far enough down the route that the experience feels impressive only until the user tries to use it
- premium dark surfaces with large typography but no real asset craftsmanship, visual tension, or authored media
- a signature move that exists only in the shell or hero and does not carry into the route surfaces
- faux illustration, CSS scene props, or decorative motifs that read as amateur or placeholder art
- cute, magical, or whimsical details that appear as random filler or placeholder clutter rather than meaningful interaction or atmosphere cues
- accessibility or layout claims made without rendered browser evidence
- substantive redesign work with no named public inspiration sources
- substantive redesign work with only one direction explored before implementation
- remake briefs that still preserve the old shell silhouette, section rhythm, or panel hierarchy
- mixed legacy and new design languages that look like layered leftovers instead of a coherent replacement
- no named signature move for a broad redesign
- no named design-family reset, repeated primitive ban, or media-first concept choice for a broad remake
- no artifact refs for the chosen direction and rejected directions on a broad remake
- no explicit `ui surface` declaration for a substantive frontend task
- no named frontend entrypoint or routing decision before loading multiple frontend workflow skills

## Required design checks

1. Visual direction is explicit:
   - `ui surface` declaration
   - typography choice
   - palette or surface logic
   - density and spacing rhythm
   - motion tone when motion exists
   - named inspiration sources and why they matter
   - named signature move
   - named impressiveness hypothesis
   - named design-family reset
   - named repeated primitive ban
   - named media-first concept choice
   - named generated asset decision
   - reference translation brief when image, avatar, or vibe references are supplied
   - semantic charm map when whimsical, playful, or magical atmosphere is part of the brief
   - asset, imagery, texture, or motion rationale when exceptional visual quality is claimed
   - motion system choice and why it fits the target repo
   - background or idle-motion rationale and why it does not reduce readability
   - reduced-motion and performance rationale when immersive motion is claimed
   - critical-control map and functionality-preservation rationale when the touched surface contains key actions
   - frontend skill-entry decision when the task uses multiple frontend workflow skills
2. Substantive redesigns explore multiple materially different directions before implementation.
3. Remake briefs prove at least one blank-slate direction that does not inherit the current structure.
4. Broad remakes externalize at least one direction as a durable visual artifact before production code starts.
5. Information hierarchy is obvious at a glance.
6. Repeated UI patterns use a token or component rule instead of one-off styling.
7. Mobile composition is intentionally designed, not a compressed desktop version.
8. User actions, labels, and affordances remain accessible and legible.
9. When the text is mentally blurred, the remaining composition still feels identifiable rather than generic.
10. When motion is central, the choreography should clarify focus, state, or progression instead of competing with them.
11. Immersive effects should degrade gracefully on smaller screens or lower-power environments.
12. The route that owns key actions should still make those actions easy to discover in the designed experience.
13. The screen should have at least one source of visual authorship beyond typography, spacing, and panel treatment alone.

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
- If the text were blurred out, would the screen still feel authored?
- Did the agent source real references or only style adjectives?
- Were the chosen references structurally useful, or were they only decorative taste markers?
- Is there a single memorable move in the composition, or only competent panel arrangement?
- Did the agent translate the vibe reference into a whole interaction language, or just place a cuter picture in the route?
- Is this genuinely a new design family, or just the previous layout with new paint and scene props?
- Did the agent reject the old primitives, or only shuffle them?
- Did the workflow produce a non-code exploration artifact before implementation, or did it jump straight into the production shell?
- Are the working surfaces actually translated into the same visual language as the authored media, or are they still generic overlays?
- Did the agent explicitly ban legacy carryover, or did the old shell quietly survive?
- Is there a real motion or interaction hook, or only static polish plus card entrances?
- Did the agent explicitly decide whether generated imagery, authored interaction art, or 3D were part of the concept, or were those possibilities silently ignored?
- Do playful details help the product feel alive, or do they read as placeholder mascots and random props?
- Is there any real artistic medium here beyond text, dark panels, and gradients?
- Did the design preserve or improve the discoverability of critical controls?
- Is the most important action still in the visual gravity of the route, or buried beneath scene-setting copy?
- Is the typography doing real hierarchy work?
- Is the spacing rhythm consistent enough to feel intentional?
- Does mobile keep the same content priorities and compositional clarity?
- Did the agent choose the lightest implementation stack that could still achieve the intended effect?
- Would reduced-motion users still understand the hierarchy and flow?
- Do the browser artifacts prove what the user actually sees?

## Approval rule

Do not approve visible UI work that fails the hard-fail checks or lacks browser-backed evidence for the claimed quality.
