---
name: devgod-visual-standards
description: Canonical visual identity for devgod and projects built with it. Use before writing any CSS, choosing any palette, or making any typography decision. Defines exact color tokens, type scale, motion curves, and surface elevation for dark-first developer tool UIs.
---

# Devgod Visual Standards

Use this skill as the source of truth before any visual design decision. Override only with explicit task justification and council approval.

Goal: produce UIs that feel premium, technically credible, and intentionally designed — not generic AI output.

---

## Core Principle: Restraint Is the Decision

The best developer tool UIs (Vercel, Linear, Raycast) are distinguished primarily by what they *omit*:
- No gradient fills on UI elements — gradients only as ambient/atmospheric glow behind live status
- No decorative shadows — use luminance steps for elevation
- No more than one accent color — used sparingly, never decoratively
- No rounded corners on data or infrastructure UI — 0–6px max radius, nothing "friendly"
- No multiple competing typefaces — one sans + one mono, both variable
- No warm/cool color tints in the neutral ramp — pure neutral grays only

---

## Color System

### Surface Ramp (luminance-based elevation)

```css
--surface-base:     #0A0A0A;
--surface-raised:   #111111;
--surface-elevated: #1A1A1A;
--surface-overlay:  #222222;
```

### Border System

```css
--border-default:   rgba(255, 255, 255, 0.08);
--border-emphasis:  rgba(255, 255, 255, 0.15);
--border-strong:    rgba(255, 255, 255, 0.24);
```

### Text Hierarchy

```css
--text-primary:   #EDEDED;
--text-secondary: #A0A0A0;
--text-muted:     #6B6B6B;
--text-inverse:   #0A0A0A;
```

### Accent (one, used sparingly)

```css
--accent:         #6366F1;
--accent-bright:  #818CF8;
--accent-subtle:  rgba(99, 102, 241, 0.12);
```

### Semantic Status Colors

```css
--status-success:  #22C55E;
--status-error:    #EF4444;
--status-warning:  #F59E0B;
--status-running:  #06B6D4;
--status-pending:  #6366F1;
--status-muted:    #6B6B6B;
```

---

## Typography

**Geist Sans + Geist Mono (variable fonts, free, open source)**

```css
body { font-family: 'Geist Sans', system-ui, sans-serif; }
code, pre, kbd, .metadata { font-family: 'Geist Mono', monospace; }
```

### Type Scale

```css
--text-h1:    font-size: 32px; font-weight: 600; letter-spacing: -0.03em;
--text-h2:    font-size: 24px; font-weight: 600; letter-spacing: -0.02em;
--text-body:  font-size: 14px; font-weight: 400; letter-spacing:  0em;
--text-small: font-size: 12px; font-weight: 400; letter-spacing: +0.01em;
--text-label: font-size: 11px; font-weight: 500; letter-spacing: +0.03em; font-family: Geist Mono;
--text-code:  font-size: 13px; font-weight: 400; letter-spacing: +0.017em; font-family: Geist Mono;
```

---

## Spacing

8px base grid — only use multiples: 4, 8, 12, 16, 24, 32, 48, 64px.

---

## Motion

- All animations: **150–200ms maximum**
- Enter easing: `cubic-bezier(0.16, 1, 0.3, 1)`
- Exit easing: `cubic-bezier(0.4, 0, 1, 1)`

```css
@keyframes status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.85); }
}
.status-running { animation: status-pulse 2s ease-in-out infinite; }
```

---

## Anti-Patterns (Hard Fail)

- Gradient fills on cards, panels, or sections
- More than one accent color
- Border radius > 8px on data UI
- Shadows instead of luminance steps
- Pure `#FFFFFF` body text or pure `#000000` canvas
- Random spacing values not on the 8px grid
- Motion longer than 200ms or looping decoratively

---

## Output

When applying this skill, return:
- Tokens introduced or reused
- Typeface decisions and rationale
- Motion choices
- Any deviation from this standard with justification
