---
name: devgod-frontend-taste
description: Use when designing or reviewing visible UI in devgod-managed repos and you need to avoid default AI-generated layouts, weak hierarchy, generic spacing, or interchangeable styling.
---

# Devgod Frontend Taste

Use for UI-affecting work where visual quality matters.

Goal: produce interfaces that look intentional, differentiated, and implementation-ready instead of generic model output.

1. Start from the user task and information hierarchy, not from a stock hero/feature grid pattern.
2. If the task is a remake, redesign, beautify, or refresh of an existing UI, first state what must materially change. Keeping the same weak hierarchy, same control-placement mistakes, or same stock composition is failure unless the task explicitly preserves them.
3. Pick a concrete visual direction before writing code: typography, spacing rhythm, palette, density, and motion tone.
4. Write a compact frontend direction package before implementation:
   - redesign intent
   - current-surface failures
   - visual direction
   - layout changes
   - content or asset plan
   - motion plan
   - palette and contrast strategy
   - mobile composition notes
5. Reject default AI patterns:
   - generic gradient hero
   - default sans stack with no reason
   - weak section hierarchy
   - decorative cards with no content structure
   - mobile layout treated as a shrink of desktop
6. Make the layout legible in three passes:
   - scan from far away: hierarchy is obvious
   - scan at component level: spacing and grouping are consistent
   - scan on mobile: composition still feels intentional
7. When changing existing UI, preserve the product's established visual language unless the task explicitly calls for redesign.
8. When the surface depends on imagery, illustration, iconography, empty states, or animation, decide whether those are generated, sourced, reused, deferred, or intentionally absent. Do not leave them implicit.
9. Before handoff, state the intended visual direction in one or two sentences and verify it in the browser.
10. Apply the repo-local frontend quality rubric before approval so generic AI patterns are rejected explicitly.

## Heuristics

- prefer one strong idea over many weak decorative ideas
- use fewer visual motifs with better consistency
- typography must do real work, not act as a default placeholder
- motion should clarify entry, hierarchy, or state change
- redesign asks should create visible structural change, not only nicer paint
- a good palette defines surface roles and convincing contrast, not only accent colors
- content, imagery, and empty-state treatment are part of the design, not optional afterthoughts
- if a page could plausibly belong to any SaaS landing page, it is too generic
- mobile layout must feel composed, not merely scaled down

## Output

Return:
- redesign intent
- visual direction
- material changes from the prior surface
- content or asset plan
- motion and contrast notes
- core layout decisions
- anti-generic checks performed
- browser verification notes
