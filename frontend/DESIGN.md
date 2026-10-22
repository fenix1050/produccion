---
name: Cotizador Tajy
description: Sober insurance quoting tool; Tajy red appears only where there is action or state.
colors:
  tajy-red: '#d8132e'
  tajy-red-a11y: '#c8112a'
  tajy-red-hover: '#b8102a'
  tajy-red-active: '#a20e25'
  tajy-maroon: '#5c0e10'
  tajy-pink: '#fbeaea'
  ink: '#1a1a1a'
  text-body: '#444444'
  text-muted: '#6e6e6e'
  warm-paper: '#f4f3f1'
  surface: '#ffffff'
  surface-alt: '#f9f8f6'
  border: '#dddddd'
  border-strong: '#cccccc'
  success: '#146c3c'
  success-bg: '#e9f7ee'
  warning: '#b8860b'
  danger: '#c0132e'
  info: '#2563a8'
typography:
  heading:
    fontFamily: 'Sora, system-ui, sans-serif'
  body:
    fontFamily: 'Public Sans, system-ui, sans-serif'
  mono:
    fontFamily: 'Roboto Mono, ui-monospace, monospace'
rounded:
  sm: '8px'
  md: '9px'
  lg: '10px'
  xl: '14px'
  pill: '999px'
components:
  button-primary:
    backgroundColor: '{colors.tajy-red}'
    textColor: '{colors.surface}'
    rounded: '{rounded.md}'
  button-primary-hover:
    backgroundColor: '{colors.tajy-red-hover}'
  button-primary-active:
    backgroundColor: '{colors.tajy-red-active}'
  card:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.xl}'
  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
---

# Design System: Cotizador Tajy

## Overview

**Creative North Star: "El Mostrador de Precisión"**

A working counter, not a showroom. Numbers (premiums, installments) are the content; everything else steps back. Surfaces are warm paper and white, text is near-black ink, and Tajy red is reserved for action, selection, and brand identity. Two themes share one token set: a light warm-paper theme and a near-black dark theme (activated by `data-theme="dark"` on `<html>`).

Controls are firm and contained: medium radii, solid red primary actions, clear focus rings, no ornament. Density favors desktop work sessions while staying usable at 375px.

**Key Characteristics:**

- Red is scarce and meaningful (action, selection, brand).
- Tonal, flat surfaces; shadow appears as a response to state.
- Accessible contrast is a hard rule, with dedicated a11y token variants.
- Same semantic tokens in light and dark; dark only redefines values.

## Colors

Warm neutrals with a single saturated brand red and desaturated state colors.

### Primary

- **Tajy Red** (#d8132e): primary buttons, active nav, focus borders, brand marks. Dark theme uses #ff2a3d.
- **Tajy Red A11y** (#c8112a): red text on the pink tint, where #d8132e falls under 4.5:1.
- **Tajy Maroon** (#5c0e10): text on pink badges; in dark it aliases the a11y red.

### Neutral

- **Ink** (#1a1a1a): primary text.
- **Warm Paper** (#f4f3f1): app background.
- **Surface** (#ffffff) and **Surface Alt** (#f9f8f6): cards, inputs, alternate rows.
- **Rose Tint** (#fbeaea): soft red surfaces (selected chips, badges).
- **Muted Text** (#6e6e6e): secondary text, ~5.1:1 on white. Body text is #444444.
- **Border** (#dddddd), **Border Strong** (#cccccc): dividers and field strokes.

### State

- **Success** (#146c3c on #e9f7ee), **Warning** (#b8860b), **Danger** (#c0132e), **Info** (#2563a8).

### Named Rules

**The Scarce Red Rule.** Red marks action or state, never decoration. If a screen has red everywhere, none of it means anything.
**The Contrast Floor Rule.** Text colors must reach WCAG AA (4.5:1) on their actual background; use the `-a11y` / `-fg` variants instead of dimming brand colors.

## Typography

**Heading Font:** Sora (with system-ui)
**Body Font:** Public Sans (with system-ui)
**Mono Font:** Roboto Mono (amounts and codes where alignment matters; only weights 600 and 700 are loaded)
**Badge / Login Font:** Inter (badges use Inter with Public Sans fallback; the login page loads only Inter, intentionally distinct from the rest of the app)

All fonts load from Google Fonts, linked in each page's `<head>` (no self-hosted files). Loaded weights: Sora 500–800, Public Sans 400–700.

**Character:** Sora gives headings a confident geometric voice; Public Sans keeps dense forms and tables neutral and readable. Sizes are compact (labels around 12–13px, banners 13px) and set per component rather than from a fluid scale.

### Named Rules

**The Tabular Number Rule.** Money and quote figures must align; use mono or tabular figures wherever amounts stack.

## Layout

App shell with a sidebar that collapses to a hamburger at 1024px. Breakpoints are literal media queries (custom properties do not work inside `@media` here): 1024px (two columns to one, sidebar collapses), 768px (density: tighter padding, tables scroll horizontally, fluid modals), 480px (single-column stacks, full-width buttons). Content scrolls inside panels; the body is clipped. A live quote summary stays visible beside the form on wide screens.

## Elevation & Depth

Tonal layering with flat surfaces at rest. Light theme: white cards on warm paper with a soft card shadow (`0 4px 12px rgba(0,0,0,0.08)`). Dark theme: near-black stacked layers (#050507 app, #0e0e12 surface, #16161b elevated), a heavier card shadow (`0 12px 30px rgba(0,0,0,0.42)`), and a subtle red ambient halo on cards.

### Named Rules

**The Flat-Until-State Rule.** Surfaces stay flat; shadow and glow appear on hover, focus, or selection.

## Shapes

Light theme radii: 8px (sm), 9px (md), 10px (lg), 14px (xl). Dark theme steps up to 10 / 12 / 18 / 20px. Chips and badges use full pills (999px). Borders are 1px hairlines.

## Components

### Buttons

- **Shape:** medium radius (9px light, 12px dark).
- **Primary:** solid Tajy red, white text; hover #b8102a, active #a20e25. Dark uses a subtle vertical red gradient.
- **Focus:** visible ring, never removed without replacement.

### Inputs / Fields

- **Style:** white fill, 1px border (#ddd), 9px radius.
- **Focus:** red border plus a 3px soft red ring.
- **Autofill:** dark theme overrides the browser tint with an opaque inset shadow.

### Cards / Containers

- **Corner Style:** 14px light, 20px dark.
- **Background:** surface on warm paper; gradient layer in dark.
- **Shadow Strategy:** see Elevation.

### Banners

- **Style:** 13px semibold, 1px tinted border; error uses red on a faint red wash, success uses green on #e9f7ee.

### Badges and Chips

- **Style:** pill shapes on tinted backgrounds; text uses a11y variants.

## Do's and Don'ts

### Do:

- **Do** use `--tajy-*` tokens for every color; add dark overrides in `shared/theme-dark.css`.
- **Do** keep red for actions, selection, and brand.
- **Do** verify 4.5:1 contrast in both themes.
- **Do** test layouts at 375px.

### Don't:

- **Don't** hardcode hex colors in component CSS (they will not follow the dark theme).
- **Don't** use blue-tinted grays in the dark content area; the dark neutrals are deliberately neutral.
- **Don't** add decorative shadows or gradients at rest in the light theme.
- **Don't** put custom properties inside `@media` queries.
