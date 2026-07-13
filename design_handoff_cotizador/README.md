# Handoff: Cotizador de Seguros Múltiples (Aseguradora Tajy)

## Overview
Internal quoting tool for insurance agents/analysts. Agent logs in, picks a ramo (Auto, Multiriesgo, Incendio, Accidentes Personales, Vida), fills client + risk data, sees a live premium recalculating, picks a plan tier (Básico/Estándar/Premium), reviews a detailed plan (coverages + summary), and can issue a "Carta Oferta" (offer letter) as a printable document/PDF.

## About the Design Files
The file in this bundle (`Cotizador-B.dc.html`) is a **design reference built in HTML** — a working prototype showing intended look, content, and behavior. It is **not production code to copy directly**. Recreate this design in your app's existing stack (React, Vue, etc.) using your established component library, routing, state management, and data layer — or choose the most appropriate stack if none exists yet.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final/intentional. Recreate pixel-close using your codebase's own components/tokens where equivalents exist.

## Screens / Views

### 1. Login
- Split screen: left 45% solid red (`#BD1719`) panel with logo, "Aseguradora Tajy" (Sora, 800, 28px), tagline, blurb; right white panel with a centered 340px-wide form (usuario corporativo email + password, red submit button, 9px radius, 13px font).

### 2. App shell
- Left sidebar, 264px, fixed, background `#1A1A1A`, white text:
  - Logo + "Tajy · Cotizador" wordmark (Sora 700, 15px)
  - "RAMO A COTIZAR" section label (11px, uppercase, letter-spacing .07em, `#8a8a8a`)
  - 5 ramo rows (Auto, Multiriesgo, Incendio, Accidentes Personales, Vida), each a 26×26 rounded badge with 2-letter code + label; selected row gets `rgba(189,23,25,.25)` background, red badge, bold white text
  - Bottom: nav items (Historial, Configuración), agent avatar/name/role
- Main content area (flex:1):
  - Header: page title "Nueva cotización" + dynamic subtitle; tabs "Datos" / "Detalle del plan" (only once a ramo is picked)
  - **Plan selector row** (once a ramo is picked): "Plan a presentar:" label + 3 pill buttons (Básico / Estándar / Premium), active pill filled red, inactive outlined gray. Selecting a plan changes premium and coverage sums via multiplier factors.
  - Empty state: centered "Seleccioná un ramo…" message when no ramo picked yet

### 3. Datos (form) view
- Two-column layout: form (flex:1, max-width 560px, 2-col grid of fields with 16px gap) + fixed 320px right-hand "Cotización en vivo" live summary panel (white, border-left) showing big price (Sora 800, 30px), Gs./mes + Gs./año, then Deducible/Franquicia, Vigencia, Coberturas count.
- Field defs are per-ramo (see Design Tokens/Data below); every ramo now includes 3 shared client fields at the top: Nombre del asegurado, Cédula de identidad, Dirección.
- CTA: "Ver detalle completo →" red button, 9px radius.

### 4. Detalle del plan (result) view
- Dark card (`#1A1A1A`, 16px radius) header: "Plan {Plan} · {Ramo}" label (12px, uppercase, `#c9a5a5`), big price (Sora 800, 30px) + "Gs. / mes", and a red "Emitir carta oferta" button (opens the Carta Oferta modal).
- Below: 2-col grid — left card lists all coberturas (name + monto, green check icon) with a bottom border row separator; right card (`#FBEAEA` bg) is the "Resumen" (Deducible/Franquicia, Anual) + "Editar datos" outlined button.

### 5. Carta Oferta modal
- Fixed full-screen overlay (`rgba(20,16,16,.55)`), centered 720px white card, scroll if tall.
- Non-printable toolbar: "Imprimir / Guardar PDF" (red) + "Volver a editar" (outlined) buttons.
- Printable letter body: Tajy letterhead (logo + name + RUC), "CARTA OFERTA N° {code}" top-right, date, client block (nombre/cédula/dirección), intro paragraph naming ramo + plan, "bien/persona asegurada" highlight box, full coverages list, prima mensual/anual mini-cards (dark + light), deducible/vigencia row, legal disclaimer paragraph, signature block.
- Print CSS (`@media print`) hides everything except `.carta-print-area`, strips its shadow/position for a clean printed page.

## Interactions & Behavior
- Login is a no-op that just flips a `step` state to `'app'` (no real auth).
- Selecting a ramo resets the form `data` object and switches to `view:'form'`.
- Selecting a plan (Básico/Estándar/Premium) applies a premium multiplier (`factorPrima`) and a coverage-sum multiplier (`factorCobertura`) — see Design Tokens.
- Premium formulas are ramo-specific (see below), recalculated live on every field change.
- "Emitir carta oferta" opens the modal; "Volver a editar" closes it; "Imprimir / Guardar PDF" calls `window.print()`.
- Tabs ("Datos"/"Detalle del plan") just toggle `view` state; both read the same live-computed data.

## State Management
State needed:
- `step`: `'login' | 'app'`
- `ramoId`: selected ramo id or null
- `view`: `'form' | 'result'`
- `data`: object of form field values (per current ramo)
- `plan`: `'basico' | 'estandar' | 'premium'`
- `cartaOfertaOpen`: boolean

Derived/computed (recalculate on any state change): `prima` (mensual/anual/deducible text), `coberturas` (list of {nombre, monto}), plan-adjusted via multipliers.

## Design Tokens

**Colors**
- Primary red: `#BD1719`
- Ink/near-black: `#1A1A1A`
- App background: `#F4F3F1`
- Soft pink accent bg: `#FBEAEA`
- Success green: `#1e8a4c` on `#e9f7ee`
- Borders: `#ddd`, `#eee`, `rgba(0,0,0,.08)`
- Text secondary: `#8a8a8a`, `#999`, `#555`, `#333`, `#444`

**Typography**
- Headings: "Sora", weights 500/600/700/800
- Body: "Public Sans", weights 400/500/600/700
- Google Fonts import: `family=Sora:wght@500;600;700;800&family=Public+Sans:wght@400;500;600;700`

**Radii**: 8–9px (buttons/inputs), 10–14px (cards), 16px (dark hero card), pill (plan selector).

**Plan multipliers** (`PLANES` const):
- Básico: `factorPrima 0.72`, `factorCobertura 0.65`
- Estándar: `factorPrima 1`, `factorCobertura 1`
- Premium: `factorPrima 1.4`, `factorCobertura 1.35`

**Premium formulas (per ramo, before plan multiplier)** — see `computePrima()` in the file for exact math per ramo (auto uses valor × 5% × uso factor; multiriesgo uses valor × 0.45% + m² × 2000; incendio uses valor × 0.15% × construcción factor; AP uses suma × 0.7% × edad factor; vida uses suma × 0.6% × edad factor). Auto's deducible is a fixed "Franquicia: 350.000 Gs."; other ramos show "10% del siniestro (mín. Gs. 500.000)" or "Sin deducible" for AP/Vida.

**Coverage lists per ramo**: see `coberturasFor()` in the file — exact coverage names and sum-insured formulas per ramo (auto, multiriesgo, incendio, AP, vida).

**Form fields per ramo**: see `FIELD_DEFS` in the file — every ramo shares `CLIENT_FIELDS` (nombreAsegurado, cedula, direccion) plus ramo-specific fields (e.g. auto: marca/modelo/año/valor/uso/ciudad).

## Assets
- `assets/tajy-logo.png` — square logo used in sidebar, login panel, and carta oferta letterhead. Replace with your real brand mark.

## Files
- `Cotizador-B.dc.html` — the full working prototype (markup + logic in one file). Read top-to-bottom: template first, `<script data-dc-script>` at the bottom has all state/logic (`computePrima`, `coberturasFor`, `FIELD_DEFS`, `PLANES`, `RAMOS`).
