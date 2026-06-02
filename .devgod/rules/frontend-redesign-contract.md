# Frontend Redesign Contract

Use this rule when a task asks `devgod` to build, beautify, remake, redesign, or substantially refresh a visible interface.

## Goal

Make intentional, differentiated frontend work repeatable instead of relying on generic default UI patterns.

## Required decision before code

Classify the request explicitly:

- `preserve_and_polish`
- `refresh`
- `redesign`
- `reimagine`

If the task does not say, infer the mildest level that still matches the user's ask and record the assumption.

## Required design package for visible UI work

Before implementation, record:

1. the primary user task and information hierarchy
2. the current-surface failures to correct
3. the intended visual direction
4. the layout or hierarchy changes required
5. the typography, palette, surface, and contrast strategy
6. the content and asset plan:
   - imagery
   - illustration or iconography
   - empty-state treatment
   - whether assets are generated, sourced, intentionally omitted, or deferred
7. the motion plan and what the motion clarifies
8. the mobile composition strategy
9. the browser evidence plan for desktop and mobile

## Redesign-specific rules

- if the operator asked for a remake, redesign, or beautification pass, keeping the same weak hierarchy or same control-placement mistakes counts as failure unless the task explicitly preserves them
- visible delta must be structural when the request is structural; a color-only or spacing-only pass is not enough for a redesign ask
- do not preserve stock "AI SaaS" section patterns by inertia

## Preserve-specific rules

- if the task explicitly says to preserve the existing design system or visual language, honor that and improve quality within those bounds
- redesign ambition must not silently override preservation constraints

## Anti-generic checks

Reject or rework output that depends on:

- generic gradient-hero patterns
- default font stacks with no rationale
- interchangeable card grids
- filler marketing sections not tied to user tasks
- motion with no hierarchy or state-change purpose
- ad hoc colors that ignore contrast and surface roles

## Review requirement

Visible UI work is not complete until the design package, implementation, and browser evidence tell the same story.
