---
name: devgod-ui-art-direction
description: Use when autonomous frontend work needs a real visual concept, reference sourcing, originality gates, and a screenshot-critique loop before implementation hardens.
---

# Devgod UI Art Direction

Use for substantive visual redesigns, new product surfaces, landing pages, dashboards, and any UI task where "beautiful", "memorable", or "high taste" matters.

Goal: force the agent to originate a high-authorship visual direction from strong public references, asset craftsmanship, motion/media systems, and structured critique instead of drifting into median AI dashboard output.

This skill is the default single entry point for substantive Codex frontend redesign work in `devgod`.

- load it first when the task includes a real UI surface, broad remake, or visible interaction flow
- do not load the broader frontend skill cluster on backend-only, infra-only, or non-visual tasks
- use it to decide which follow-on frontend skills are actually needed, then pull those detail skills on demand instead of front-loading the whole cluster
- treat `devgod-frontend-taste`, `devgod-design-system`, `devgod-accessibility-gate`, and generic frontend implementation skills as secondary supports after this routing pass

## Reference translation default

When the user provides an image, avatar, illustration, poster, game menu, or other vibe reference, treat it as a source for style language, motion tone, charm logic, interaction personality, and material treatment by default, not as a literal interface element to embed.

- assume the user is pointing at the feeling, medium, and behavior unless they explicitly ask to place the image itself in the UI
- translate the reference into reusable rules: palette energy, line softness, glow behavior, animation tempo, playfulness level, illustrative density, and object logic
- if the easiest interpretation is "put a bigger version of the reference art into the hero", reject it and restate the reference as an interaction and surface system
- use literal image placement only when the brief explicitly calls for a hero illustration, mascot, poster, or framed artwork
- when the reference is character-led, extract the scene vocabulary rather than cloning the character: workstation warmth, magical utility objects, floating code, playful lights, animated stars, tiny familiars, or other semantic charm anchors
- broad redesigns should answer "how does this reference change the whole interface language?" before answering "where does this image go?"

## Semantic charm rule

Playful details, cute motion, magical props, and whimsical entities are welcome only when they support the product's authored atmosphere without becoming clutter.

- every charm detail should have a reason: orientation, state signaling, delight during idle time, section identity, or interaction feedback
- charm can live in background motion, hover state, scene transitions, micro-illustration, empty states, loading states, and route-owned accents
- do not add mascots, cats, potions, stars, candles, moons, hats, or code fragments as random filler
- if a cute detail can be removed with no loss of meaning, rhythm, or delight, it is probably placeholder clutter
- prefer a small number of recurring, meaningful motifs over many unrelated decorative props
- playful motion must never bury labels, compete with critical controls, or create visual noise at reading speed

## Design-family reset rule

When the brief rejects the current concept family, do not think in terms of "rearranging sections." Think in terms of changing the visual grammar of the whole product.

- identify the current family's repeated primitives before ideation starts: shell silhouette, panel shape, headline block style, metric rhythm, card stack behavior, background treatment, or route lead pattern
- write a `repeated primitive ban` listing the old primitives that must not survive
- if a proposed direction still depends on the same primitives with a new order, palette, or animation garnish, reject it as a reorder, not a remake
- a new family should be describable by a different metaphor, different density logic, and different interaction rhythm, not only by a different theme
- if the new concept still reads like "the old app but now with cuter art, more glow, or more motion", restart before coding

## Media-first concept rule

Exceptional frontend work should choose an authored medium on purpose instead of assuming CSS surfaces plus copy will be enough.

- before implementation, choose the primary authored medium for the concept:
  - generated or illustrated raster assets
  - vector scene system
  - `Rive`-class authored interaction art
  - `Motion`-driven UI choreography
  - `GSAP`-style timeline reveal
  - true `three.js` / WebGL depth
  - or a deliberate low-media path with a written reason
- broad remakes must record a `media-first concept decision` naming what will carry the visual authorship beyond layout and color
- if the concept depends on world-building, ambience, charm, or a game-menu feeling, default to a real media or illustration strategy before relying on CSS decoration
- if generated imagery, texture, sprite work, or illustration would materially improve the concept and tooling is available, prefer producing or sourcing that media before hardening the layout
- if generated imagery, `Rive`, or 3D are *not* used, record the reason they were not the right fit instead of silently ignoring them
- treat media as part of the interface language, not a poster glued behind ordinary panels

## Externalized exploration rule

Broad remakes must prove at least one new family outside the production route before implementation hardens.

- do not use the live route as the first design canvas for a broad remake
- create at least 1 externalized exploration artifact before implementation:
  - lightweight HTML mock
  - SVG storyboard
  - screenshot paintover
  - generated image
  - or another durable visual concept artifact
- the artifact must be different enough that a reviewer can judge the family shift without reading the code
- if the only visible variants live inside production code branches, treat the exploration step as incomplete
- if the first critique still reads as "same family reordered", generate an `opposite-direction artifact` before continuing
- the opposite-direction artifact should deliberately break the dominant inherited grammar: shell silhouette, density logic, palette family, module treatment, or motion rhythm
- dashboard, admin, control-center, and game-like surfaces do not get to skip this step just because they are utility-bearing

## Legacy-anchor breaker

When the brief asks for a remake, a new concept, or a result that should not resemble the current surface, treat the existing UI as an audited legacy artifact, not as the base composition.

- do not start from the current route skeleton
- do not preserve shell, panel grouping, or section order unless the brief explicitly requires it
- preserve functional requirements and critical controls, not inherited layout
- if the new concept is still easiest to describe as "the old design but better", reject it and restart
- if the existing implementation is influencing composition too early, force a blank-slate pass before coding
- broad remakes should prefer `replace then reintroduce needed function` over `incrementally decorate what exists`

## Required workflow

1. Define the surface:
   - `ui surface`: `visual_change`, `interactive_flow`, `artifact_only`, or another explicit route-level label
   - product type
   - primary user
   - main action
   - density target
   - desktop/mobile priority
   - the first 3-second impression the screen should create
   - the key action or control the user must still find without hunting
2. Build a reference pack from the shipped inspiration registry:
   - `Awwwards` for ambition, motion, interaction, and composition risk
   - `Godly` for taste calibration and quality-over-quantity curation
   - `Siteinspire` for structural/category matching and layout retrieval
   - optionally `Lapa Ninja` when full-page landing density or section rhythm is a core need
3. Capture at least 8 references before implementation:
   - at least 4 different sources or source types
   - at least 1 `Awwwards` reference
   - at least 1 `Godly` reference
   - at least 1 `Siteinspire` reference
   - at least 2 non-web references such as poster, editorial spread, game UI, album art, film title sequence, or product packaging
   - at least 1 reference that is structurally bold
   - at least 1 reference that solves the same product category or density problem
   - at least 1 reference whose motion or interaction system matters as much as its static styling
   - at least 1 reference whose imagery, texture, 3D, or media treatment materially shapes the experience
   - at least 1 reference that proves how a dramatic visual system still keeps key actions obvious
4. Distill the references into a visual thesis:
   - reference translation notes: how the image or vibe references change behavior, motion, and material treatment across the whole surface
   - typography direction
   - surface logic
   - palette logic
   - image, illustration, or texture plan
   - charm logic: which playful motifs are semantically justified, where they belong, and why they are not placeholder clutter
   - asset craftsmanship plan: what is real art direction here beyond layout and CSS decoration
   - motion tone
   - motion personality: what kind of aliveness the screen should have during idle, hover, transition, and state-change moments
   - layout rhythm
   - the single `signature move` that makes the surface identifiable at a glance
   - the interaction choreography that makes the surface feel alive rather than merely styled
   - the `impressiveness hypothesis`: what exactly should feel stunning in the first glance, and why that effect is worth the space it takes
   - the `design-family reset`: what visual grammar replaces the previous one
   - the `repeated primitive ban`: which familiar layout or shell primitives are not allowed to survive
   - the `media-first concept decision`: what authored medium will carry the visual identity
   - the `generated asset decision`: whether generated imagery, textures, sprites, or edited artwork should be used, and why
   - the `control map`: where primary, secondary, and dangerous actions live in the layout
   - the `inheritance cutoff`: which visible structures from the current surface are intentionally discarded
   - the `remake threshold`: what would make this feel genuinely new rather than like an edited prior version
5. Produce 3 materially different directions:
   - not cosmetic variants
   - each direction must differ in composition, density, mood, and signature move
   - each direction must differ in motion language and media strategy, not just palette or card styling
   - each direction must state why it would not collapse into a generic app dashboard
   - each direction must state what makes it artistically memorable beyond typography and glass panels
   - each direction must state the functional risk: what controls could get buried and how that risk is avoided
   - each direction must state whether it is a true blank-slate composition or still inherits too much of the current surface
   - at least 1 direction must be represented by an externalized exploration artifact before production implementation starts
6. Choose one direction explicitly and record why the others were rejected.
7. Run a remake-vs-edit decision before implementation:
   - if the brief asks for "new", "remake", "totally different", or rejects the current concept family, default to remake mode
   - in remake mode, write a short `legacy carryover ban` listing the layouts, motifs, and shells that must not survive
   - if a required function from the old UI needs to return, reintroduce it inside the new concept rather than reusing the old structure wholesale
   - if the old surface is still being used as the easiest reference, generate one extra blank-slate variant before coding
8. Run a technical-fit pass before implementation:
   - is this target surface best served by CSS-only motion, `Motion` for React, `Rive`, `GSAP`, or `three.js` / WebGL-class effects
   - what motion can happen in background or idle states without reducing readability
   - what parts of the concept must degrade gracefully on lower-power devices
   - what is the reduced-motion fallback
   - what is the main performance risk and how will it be contained
   - what real media or illustration pipeline is required, if any
   - if image generation, edited artwork, or 3D are available, why are they being used or intentionally skipped for this concept
9. Record the exploration evidence before implementation:
   - visual exploration artifact ref
   - chosen direction artifact ref
   - rejected direction artifact refs
   - opposite-direction artifact ref when the first pass remained too close to the legacy family
10. Implement only after the direction is chosen, the technical-fit pass is recorded, and the exploration evidence exists.
11. Preserve functionality on purpose before judging beauty:
   - list critical user actions and controls for the touched routes
   - confirm where each one is visible and how many interactions away it is
   - reject the design if spectacle buries core actions or breaks the expected flow
12. Render the result in the browser, run a screenshot critique and a live-motion critique, identify weak hierarchy, generic patterns, amateur-looking decoration, janky timing, overloaded effects, or hidden controls, revise, and rerender.
13. Run an inheritance audit on the rendered result:
   - if the page still shares the old shell silhouette, section rhythm, or panel hierarchy, reject it
   - if legacy and new visual languages are mixed on the same route, reject it
   - if the result looks like an evolution of the prior concept family rather than a new family, reject it
14. Run a primitive-repetition audit on the rendered result:
   - if the result still relies on the old shell silhouette, old metric-strip logic, old headline block treatment, or old card-stack rhythm, reject it
   - if the only obvious change is palette, background animation, or route order, reject it
   - if the promised authored medium is absent and the result falls back to styled utility panels, reject it

## Source policy

- use the repo-local inspiration registry in `.devgod/rules/frontend-inspiration-sources.md`
- use this skill as the repo-local frontend routing hub before loading multiple frontend detail skills in Codex
- prefer public/free sources with strong curation and visible taste ceilings
- do not rely on gated boards or paid-only results as a required workflow dependency
- use references as inspiration, not as copy targets
- do not pretend text-only vibe words are enough for a high-polish redesign
- when motion-heavy or immersive work is requested, ground the implementation plan in official runtime guidance for the chosen stack such as `motion.dev`, `rive.app/docs`, `gsap.com/docs`, or `threejs.org/manual`
- when image- or motion-led craft is central, prefer real art assets or authored motion systems over CSS-only decoration
- when vibe references are image-led, convert them into a reference-translation brief before implementation starts
- prefer playful, meaningful motion systems over static theme props when the requested feeling is cute, magical, game-like, or lively
- when the concept needs illustration, world-building, or mascots, prefer generated or authored assets over placeholder CSS doodles when the tooling is available
- when 3D or heavy media would not materially improve the result, say so explicitly; do not skip the decision silently

## Surface-language continuity rule

If an immersive concept uses scene art, illustration, 3D, or authored media, the working surfaces must inherit that language instead of sitting on top of it like a separate product skin.

- key controls, status summaries, and evidence modules should feel embedded in the same world as the scene
- do not solve a magical or game-like brief with one nice artwork plus ordinary panels around it
- if the hero/background is lively but the active modules still read like generic product cards, the concept has failed its translation step
- route identity should not depend mainly on a giant headline block when the requested vibe is playful, alive, or interface-led
- prefer scene-integrated modules, object-owned controls, and motif-level continuity over overlaying boxed copy on top of authored media

## Originality gates

- every substantive redesign must name a `signature move` before implementation
- every immersive redesign must name a `motion system` and `media system` before implementation
- every redesign claiming to be impressive must name an `impressiveness hypothesis` and an `asset craftsmanship plan`
- every image-led or vibe-led redesign must name a `reference translation plan` before implementation
- every playful or whimsical redesign must name a `semantic charm map` before implementation
- every redesign touching workflows must name a `control map` before implementation
- every broad remake must name a `design-family reset` before implementation
- every broad remake must name a `repeated primitive ban` before implementation
- every broad remake must name a `media-first concept decision` before implementation
- every broad remake must name a `generated asset decision` before implementation
- every remake brief must name an `inheritance cutoff` before implementation
- every remake brief must name a `legacy carryover ban` before implementation
- if the screen still looks generic when the text is blurred, reject it
- if the screen could belong to any generic AI-generated SaaS app, reject it
- if a broad remake reached implementation without an externalized exploration artifact, reject it
- if the only variants were implemented directly on top of the production shell, reject them
- if dashboard or control-center work skipped the exploration step because it was treated as "just utility UI", reject it
- if the screen is still visibly based on the old composition even after re-theming, reject it
- if old and new design languages coexist as layers instead of a coherent replacement, reject it
- if the design depends on low-fidelity CSS scene props, clip-art motifs, or toy-like faux illustration, reject it unless the execution is intentionally high craft
- if the agent uses a vibe image mainly as a literal hero insert instead of translating its behavior and mood into the whole UI, reject it
- if playful details feel random, disposable, or detached from the product meaning, reject them as placeholder clutter
- if the work has no explicit asset, texture, imagery, or motion rationale, treat "breathtaking" claims as unsupported
- if the motion plan is only "fade/slide cards in" or "parallax a hero image", reject it as too weak for an immersive brief
- if the cute or magical feeling exists only in a static illustration while the rest of the interface remains ordinary utility panels, reject it
- if the result keeps the same shell primitives and only reorders or decorates them, reject it as the same family reordered
- if the chosen concept promised generated imagery, authored motion, or 3D depth and the final result quietly falls back to gradients and panels, reject it
- if the agent never explicitly decided whether to use generated imagery, authored interaction art, or 3D depth, reject the concept as under-specified
- if the concept promises cinematic motion, 3D, or heavy media without a performance and reduced-motion plan, reject it
- if the result is mostly typography plus dark glass panels, reject it as premium-but-basic
- if the wow factor lives only in the hero while the working surfaces collapse into ordinary panels, reject it
- if the result still reads as illustration or poster plus overlay panels, reject it as a split visual language
- if route identity is carried mostly by oversized copy while the interactive surfaces remain generic, reject it
- if the result still reads as illustration or poster plus overlay panels, reject it as a split visual language
- if route identity is carried mostly by oversized copy while the interactive surfaces remain generic, reject it
- if critical controls become harder to find than in the previous version, reject it even if the visuals improved

## Hard failures

- starting implementation without named references
- using only verbal style words like "modern", "beautiful", or "sleek"
- using a vibe image as a placement asset without first translating it into system-level design rules
- producing a single direction for a substantive redesign
- producing only prose variants with no externalized exploration artifact for a broad remake
- treating screenshots as proof only instead of as critique input
- defaulting to safe app-shell patterns with minor theming changes
- decorative scene-building that reads as amateur or placeholder art
- promising game-like or immersive UI without a technical-fit check for the target repo
- shipping motion-heavy work with no browser-backed critique of timing, smoothness, and readability
- shipping a redesign with no explicit critical-action inventory for the touched route
- claiming “artistic” quality when the implementation never leaves text, gradients, and panels
- broad remake work that never explicitly chooses whether generated imagery, authored motion art, or 3D depth belong in the concept
- broad remake work that reuses the same shell or panel primitives under a new order
- immersive work that keeps authored media in the background while critical modules remain visually unrelated overlay cards
- immersive work that keeps authored media in the background while critical modules remain visually unrelated overlay cards

## Output

Return:
- source-backed reference pack
- visual exploration artifact refs
- reference translation brief
- 3 design directions
- chosen direction and rejected alternatives
- named signature move
- named impressiveness hypothesis
- named design-family reset
- named repeated primitive ban
- named media-first concept decision
- named generated asset decision
- named semantic charm map
- surface-language continuity plan
- surface-language continuity plan
- named inheritance cutoff
- named legacy carryover ban
- critical control map
- asset, media, and motion plan
- technical-fit and reduced-motion plan
- screenshot and live-motion critique notes
- browser verification notes
