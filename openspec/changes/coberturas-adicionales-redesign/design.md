# Design: Coberturas adicionales — card redesign (MRC)

Architecture for the presentation-only rewrite approved in `proposal.md`. No behavior, no
backend, no schema. Product decisions from the RESOLVED question round are inputs here, not
open questions.

## 1. Architecture approach

**Pattern: one shared row template + two thin mode adapters.**

Today `renderCoberturasAdicionales` (free selector) and `renderCoberturasAdicionalesCheckbox`
(checkbox mode) each emit their own row markup and each own a CSS block
(`.cobertura-adicional-row*`, `.cobertura-adicional-checkbox-row*`), duplicated again inside two
`@media (max-width: 480px)` blocks. The mockup gives both modes the same skin, so the design
collapses the _skin_ into a single private renderer and keeps only the genuinely different parts
(identity control, trailing action) as slots.

```
render-datos.js
├─ cardCoberturaAdicional(opts)        ← NEW, private: the only place emitting card markup
├─ renderCoberturasAdicionales()       ← free selector: builds opts per state line, adds <select>
│                                        into the identity slot + "Quitar" into the trailing slot
└─ renderCoberturasAdicionalesCheckbox() ← checkbox: builds opts per catalog entry, hidden
                                           <input type="checkbox"> into the identity slot
```

Both modes emit the **same element order and the same class names**, so exactly one CSS block and
one mobile block cover both. The mode is expressed by a modifier on the root
(`.cobertura-adicional-card--libre` / `--fija`) used only for the two column-width differences.

Layering stays as-is: `render/*` is pure markup from `state`, `actions.js` owns mutations +
`renderApp()`, `events.js` owns delegation. No new layer, no cross-module import.

## 2. Component / DOM contract

### 2.1 Shared skeleton (identical in both modes)

```html
<div class="cobertura-adicional-card [is-locked] [is-editing]" data-linea-id="{id}">
  <!-- slot 1: identity control (mode-specific, see 2.2/2.3) -->
  <span class="cobertura-adicional-card__icon">{svg}</span>
  <div class="cobertura-adicional-card__main">
    <!-- name (fija) or <select> (libre) -->
    <span class="cobertura-adicional-card__sub">{Cobertura | Sublímite | motivo de bloqueo}</span>
  </div>
  <div class="cobertura-adicional-card__field">
    <!-- static block  OR  input, see 2.4 -->
  </div>
  <!-- slot 2: trailing action ("Quitar" only in libre) -->
</div>
```

Root is `display: grid` with `grid-template-columns: auto auto 1fr auto auto`; the two slots
collapse to zero-width when absent, so both modes share one grid definition.

### 2.2 Checkbox mode identity control

```html
<label class="cobertura-adicional-card__check">
  <input
    type="checkbox"
    class="sr-only"
    data-action="toggle-cobertura-checkbox"
    data-codigo="{codigo}"
    {checked}
  />
  <span class="cobertura-adicional-card__dot" aria-hidden="true"></span>
  <span class="sr-only">{nombre}</span>
</label>
```

A **real, visually-hidden native checkbox** drives the radio-style visual. This is deliberate: the
existing delegation in `events.js` reads `target.checked` on the `[data-action]` node, so the
toggle keeps working with **zero event-layer changes**, and keyboard/AT semantics come for free.
The filled dot is pure CSS (`:checked + .__dot { transform: scale(1) }`), matching the mockup's
`.chk-new .dot` scale transition — no checkmark, no square.

### 2.3 Free-selector identity control

The row's "selected" concept is _"a coverage code is chosen"_, not a checkbox. The dot renders in
the same slot as a **non-interactive state indicator**:

```html
<span
  class="cobertura-adicional-card__check cobertura-adicional-card__check--estatico"
  aria-hidden="true"
>
  <span class="cobertura-adicional-card__dot"></span>
</span>
```

filled when `l.codigo` is non-empty. The `<select>` (unchanged `data-linea-id` /
`data-linea-field="codigo"`, unchanged option-building logic including
`LIMITE_REPETICION_COBERTURA_MRC`) takes the name position inside `__main`. The trailing slot keeps
today's `Quitar` button verbatim (`btn-outline`, `data-action="remove-cobertura-linea"`), restyled
only by the card's grid placement.

### 2.4 Field zone — three mutually exclusive states

| State   | Predicate                                           | Markup                                                                                                                                                                                                             |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Locked  | no coverage selected (unchecked / empty `<select>`) | static block + `<span class="cobertura-adicional-card__lock" title="Elegí una cobertura para cargar la suma asegurada">{ICON_LOCK}</span>`                                                                         |
| Static  | selected, id ∉ edit set                             | static block + `<button data-action="editar-monto-cobertura" data-linea-id>{ICON_PENCIL}</button>`                                                                                                                 |
| Editing | selected, id ∈ edit set                             | the money `<input>` (own block, no persistent label) + `<button data-action="cerrar-edicion-monto-cobertura" data-linea-id>{ICON_PENCIL}</button>` — same icon that opens editing, per Kevin's 2026-08-11 feedback |

Static block (re-resolved 2026-08-10/11 — shows the real formatted value when set, "—" only when empty; see spec.md "Static View Shows the Real Amount When Set"):

```html
<div class="cobertura-adicional-card__estatico">
  <span class="cobertura-adicional-card__estatico-label">Suma asegurada</span>
  <span class="cobertura-adicional-card__estatico-valor">Gs. 100.000.000</span>
  <!-- or "—" when sumaAsegurada is empty -->
</div>
```

Editing block (2026-08-11 — the persistent label was dropped; the input alone is the whole
block, with the placeholder inside, matching the originally-approved mockup):

```html
<div class="cobertura-adicional-card__estatico cobertura-adicional-card__estatico--editando">
  <input class="cobertura-adicional-card__input" placeholder="Suma asegurada (Gs.)" ... />
</div>
```

The money input keeps every attribute the existing pipeline depends on — `id="cobertura-linea-{id}-suma"`,
`data-linea-id`, `data-linea-field="sumaAsegurada"`, `data-money="true"`, `inputmode="numeric"`,
`value="${fmtGsInput(l.sumaAsegurada)}"`, plus its `sr-only` `<label>` — so `formatMoneyInputInPlace`
and the `input`/`change` delegation are untouched.

The padlock is a **`<span>`, not a disabled `<button>`**: `resolveActionTarget()` already discards
`target.disabled`, and a disabled button renders `title` unreliably and is not focusable. A span
carries the tooltip and is inert by construction.

## 3. Data flow

```
click checkbox / change <select>
   → events.js delegation (unchanged nodes)
   → actions.js toggleCoberturaAdicionalPorCodigo | updateCoberturaLinea
        · mutates state.coberturasAdicionales      (unchanged)
        · NEW: if the line now has a codigo and an empty sumaAsegurada → edicionMonto.add(id)
   → renderApp()
   → NEW: focusMontoCobertura(id)  (skipped on the plan-preload path, see 4.3)
   → scheduleCalculate()           (unchanged)

click pencil  → habilitarEdicionMontoCobertura(id)  → Set.add  → renderApp → focus
click check   → cerrarEdicionMontoCobertura(id)     → Set.delete → renderApp
typing        → updateCoberturaLinea(id,'sumaAsegurada',…)  → NO re-render (unchanged)
```

`state.coberturasAdicionales[].sumaAsegurada` is never affected by the edit set. The preview
payload (`armarRiesgoDatosMrc`), the calculation, and "Detalle del plan" read the real value as
they do today — the dash is display-only.

## 4. Decisions (ADR-style)

### D1 — Shared row renderer instead of two parallel card implementations

**Decision.** One private `cardCoberturaAdicional(opts)`; the two exported renderers become
opts builders.
**Rationale.** The two modes are already drifting (the 2026-08-07 `flex-direction: row` fix landed
in only one of them). One skin = one CSS block + one mobile block instead of four.
**Rejected.** (a) Copy the card markup into both renderers — cheapest diff, but institutionalizes
the drift the mockup is trying to remove. (b) Unify the two _modes_ into one fixed list — explicitly
out of scope (Kevin: same mechanics).

### D2 — Hidden native `<input type="checkbox">` behind the radio-style dot

**Decision.** Keep a real checkbox, `.sr-only`, with today's `data-action`/`data-codigo`.
**Rationale.** Zero changes in `events.js` for the toggle (`target.checked` still works), free
keyboard/AT support, `:checked`-driven CSS, no JS-managed ARIA.
**Rejected.** A `<button role="checkbox" aria-checked>` — needs a new action, manual ARIA and manual
key handling, for no visual gain.

### D3 — Explicit close button + Enter/Escape, **not** `focusout`, to leave edit mode

**Decision.** Edit mode closes on the confirm icon-button, on `Enter`, or on `Escape`. There is no
`focusout` auto-close.
**Rationale.** `renderApp()` replaces `#app.innerHTML`. A `focusout`-triggered re-render destroys
the node the user is clicking _before_ its `click` fires, so clicking another row's pencil while
editing would be swallowed — a known class of bug in this codebase's full-innerHTML render model.
The mockup's `focusout` was safe only because it is a standalone page with no shared re-render.
**Consequence.** One extra icon-button visible while editing (same 30px slot the pencil occupies) —
a small, deliberate deviation from the mockup's editing state, invisible in the static state Kevin
approved. Escape closes without reverting: the value is already committed on every keystroke.
**Rejected.** `focusout` + `requestAnimationFrame` deferral — restores the mockup exactly but makes
the interaction order-dependent and hard to verify.

### D4 — Edit-open state as a `Set` on `state`, cleared at every reset site

**Decision.** `state.coberturasAdicionalesEditando = new Set()`. `.clear()` in `selectRamo`
(`actions.js:255`), `selectPlan` (`actions.js:314`) and in the `cargarParaEditar` prefill;
`.delete(id)` in `removeCoberturaLinea` and in the un-check branch of
`toggleCoberturaAdicionalPorCodigo`.
**Rationale.** Line ids are monotonic and never reused, so a stale id is inert — but leaking it
across quotes would silently re-open an unrelated row if ids ever change shape. Clearing at the two
existing `coberturasAdicionales = []` sites keeps the invariant "edit set ⊆ current line ids".
**Rejected.** Deriving edit mode from `sumaAsegurada === ''` — collapses "empty and being edited"
with "empty and closed", and would reopen the row on every re-render after clearing the field.

### D5 — Copy the 6-line inline-edit pattern; do not import `admin/inline-edit.js`

Confirmed from the proposal and re-verified: `frontend/admin/inline-edit.js` imports admin's
`renderApp` from `./render/shell.js`; importing it into the cotizador drags the admin module graph
in and re-renders the wrong app. Duplicating ~6 lines is the correct trade.

### D6 — Focus restoration is explicit, and suppressed on the preload path

**Decision.** `focusMontoCobertura(id)` after `renderApp()`: `focus({ preventScroll: true })` +
`setSelectionRange(len, len)`. Called from the pencil action, from the check/select auto-open — but
**not** from `preagregarCoberturasPrincipalesFijasMrc()`.
**Rationale.** Plan preload marks its rows as open (so the amount is never silently skipped) but
runs without user intent; stealing focus there would yank the agent out of the plan selector.

### D7 — New `COBERTURA_ICONOS` map; `SUBLIMITE_ICONOS` byte-identical

`constants.js` exports `COBERTURA_ICONOS = { ...SUBLIMITE_ICONOS, incendio_mobiliario_equipos,
robo_contenido, robo_caja_registradora, robo_transito, cristales, responsabilidad_civil }`. Only the
new card reads it; the read-only `.cobertura-card` and the live panel keep reading
`SUBLIMITE_ICONOS`, so they cannot regress.
**Icon house style (correction to the proposal).** The proposal says "stroke 1.6, viewBox 24". The
real convention in `nav-icons.js` is Boxicons **filled**: `<svg width="16" height="16"
viewBox="0 0 24 24" fill="currentColor">`. The 6 new constants follow the file, not the proposal
text; the mockup's paths are Boxicons-derived and carry over. Card sizing (19px) comes from CSS,
which overrides the width/height attributes.

### D8 — Scope the group-title CSS selector before adding nested labels

`.coberturas-adicionales label { font-size:12px; font-weight:600 }` is a descendant selector. The new
card contains `<label>` elements (the checkbox wrapper, the `sr-only` amount label), which would
inherit it. Change it to `.coberturas-adicionales > label` — a 2-character diff that keeps the group
title styled and stops the bleed. (Same class of specificity trap as the 2026-07-31
`.admin-valor-fijo span` incident.)

### D9 — Lock chrome on the add button: one call site, not two

RESOLVED #4 asks for lock chrome in `render-datos.js` **and** `render-detalle-plan.js`. Verified
against the current tree: the "Agregar cobertura adicional" button of "Detalle del plan" **no longer
exists** — it was removed in `3d102a5` (PR #225, 2026-08-07). `add-cobertura-linea` now has exactly
one occurrence, `render-datos.js:206`. The decision's intent ("both buttons stay consistent") is
satisfied vacuously; the chrome lands on the surviving button only. No behavior change: the existing
`disabled` + `title` stay, plus an `.is-locked` class and the padlock glyph.

## 5. CSS architecture

New block replaces **both** `.cobertura-adicional-row*` and `.cobertura-adicional-checkbox-row*`
(and their two `@media (max-width: 480px)` blocks, including the one that opens with the malformed
`\*` comment at `cotizador.css:1817` — it disappears with the rules it guards).

Token mapping mockup → repo (**no new tokens**):

| Mockup                                 | Repo                      | Note                                                      |
| -------------------------------------- | ------------------------- | --------------------------------------------------------- |
| `--tajy-radius-sm: 8px`                | `--tajy-radius-sm`        | identical                                                 |
| `--tajy-radius-md: 10px` (icon avatar) | `--tajy-radius-lg` (10px) | repo `--tajy-radius-md` is 9px                            |
| `--tajy-red-soft` @ 0.1                | `--tajy-red-soft` (0.25)  | focus ring only; stronger ring accepted                   |
| `--tajy-bg-alt` (locked avatar bg)     | `--tajy-bg`               | token does not exist in repo                              |
| `--tajy-white`                         | `#fff` / transparent      | card sits on the already-white panel                      |
| `--tajy-shadow-card`                   | none                      | rows are separated by `--tajy-border-light`, not elevated |

Class inventory:

```
.cobertura-adicional-card                grid, 14px 4px padding, hover bg var(--tajy-bg),
                                         + .cobertura-adicional-card { border-top: 1px solid
                                         var(--tajy-border-light) }
.cobertura-adicional-card--libre|--fija  column-width modifiers only
.cobertura-adicional-card.is-locked      opacity .55, muted avatar/dot, cursor default
.cobertura-adicional-card.is-editing     (hook for the field zone; no visual of its own)
.cobertura-adicional-card__check         20px circle, 2px var(--tajy-border), border-radius 50%
.cobertura-adicional-card__check--estatico  cursor default (free-selector indicator)
.cobertura-adicional-card__dot           10px circle var(--tajy-red), transform: scale(0),
                                         transition transform .15s ease
  :checked + __dot → scale(1);  :checked ~ → __check border-color var(--tajy-red)
  :focus-visible + __dot wrapper → box-shadow 0 0 0 3px var(--tajy-red-soft)
.cobertura-adicional-card__icon          38px, radius var(--tajy-radius-lg), bg var(--tajy-pink),
                                         color var(--tajy-red-a11y); svg 19px
.cobertura-adicional-card__main          min-width 0 (ellipsis for long coverage names)
.cobertura-adicional-card__nombre        14px/700 var(--tajy-ink)
.cobertura-adicional-card__sub           12px var(--tajy-text-muted)
.cobertura-adicional-card__field         190px, flex, gap 10px, justify-content flex-end
.cobertura-adicional-card__estatico-label  10px uppercase .05em var(--tajy-text-muted)
.cobertura-adicional-card__estatico-valor  14px/700, font-variant-numeric: tabular-nums
.cobertura-adicional-card__input         1.5px solid var(--tajy-red), radius --tajy-radius-sm,
                                         text-align right, tabular-nums;
                                         :focus → outline none + 3px var(--tajy-red-soft) ring
.cobertura-adicional-card__accion        30px icon-button, radius --tajy-radius-sm,
                                         color var(--tajy-red-a11y); hover bg var(--tajy-pink)
.cobertura-adicional-card__lock          same box, color var(--tajy-text-muted), inert <span>
.coberturas-adicionales > .btn-outline.is-locked   muted border/color + padlock glyph
```

`prefers-reduced-motion: reduce` → drop the dot/background transitions (existing convention in this
file).

**`@media (max-width: 480px)`** — single block, both modes:

```
.cobertura-adicional-card { grid-template-columns: auto auto 1fr; row-gap: 10px }
.cobertura-adicional-card__field { grid-column: 1 / -1; width: 100%; justify-content: space-between }
.cobertura-adicional-card__input { flex: 1 1 auto }
.cobertura-adicional-card .cobertura-adicional-row__quitar → __quitar { grid-column: 1 / -1; width: 100% }
```

This carries forward the intent of both deleted mobile blocks (amount below the label; full-width
"Quitar").

## 6. Integration points

| File                            | Change                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render/render-datos.js`        | `cardCoberturaAdicional()` + both renderers rewritten; `.is-locked` chrome on the add button                                                                              |
| `render/render-detalle-plan.js` | **no change** (see D9) — read-only `.cobertura-card` and its icons untouched                                                                                              |
| `shared/cotizador.css`          | new card block; delete 2 old blocks + their 2 mobile blocks; `> label` scoping (D8)                                                                                       |
| `shared/nav-icons.js`           | 6 coverage icons + `ICON_PENCIL`, `ICON_LOCK`, `ICON_CHECK_SMALL` (house Boxicons style)                                                                                  |
| `cotizar/constants.js`          | `COBERTURA_ICONOS` (spread of untouched `SUBLIMITE_ICONOS`)                                                                                                               |
| `cotizar/state.js`              | `coberturasAdicionalesEditando: new Set()` + comment                                                                                                                      |
| `cotizar/actions.js`            | `habilitar/cerrarEdicionMontoCobertura`, `focusMontoCobertura`, Set maintenance in `toggle*`/`update*`/`remove*`/`preagregar*`, `.clear()` at the 2 reset sites + prefill |
| `cotizar/events.js`             | 2 new `data-action` branches; `keydown` on `[data-linea-field="sumaAsegurada"]` for Enter/Escape                                                                          |

Unchanged by construction: `domain-rules.js` (`coberturasDisponibles`,
`quedanCoberturasAdicionalesPorAgregar`, `sublimitesFijosMrc`), `armarRiesgoDatosMrc`, the preview
pipeline, backend, schema, migrations.

## 7. Accessibility

- The visible dot is decorative; the accessible name comes from the `sr-only` text inside the label.
- Free-selector indicator is `aria-hidden="true"` (the `<select>` is the real control).
- Pencil/confirm buttons get `aria-label="Editar suma asegurada de {nombre}"` /
  `"Listo, cerrar edición de {nombre}"` (icon-only buttons).
- Padlock `<span>` carries `title` + `aria-hidden="true"`; the reason is also in the visible
  `__sub` line, so it is not tooltip-only.
- **Superseded a11y note:** an earlier revision of RESOLVED #2 hid the stored value behind "—" for
  every row, which would have exposed "—" to assistive tech even when a value was stored. That rule
  was reversed (2026-08-10, second round) — the static view now announces the real formatted amount,
  so this a11y cost no longer applies.

## 8. Verification strategy

No automated tests exist for this markup and none are added (proposal, out of scope). Playwright,
MRC-NORMAL, at 1440 / 768 / 480:

1. Checkbox role (`test@test.com`, agente): check → row unlocks, dot fills, edit mode auto-opens and
   is focused; type an amount; close; static shows the formatted value (`Gs. 100.000.000`); reopen →
   same real value present in the input.
2. Free-selector role: add row (locked, padlock), choose coverage → unlock + auto-open; "Quitar"
   removes; add button shows lock chrome at capacity (6 rows).
3. Amount reaches the calculation: live panel prima/`Capital total asegurado` change after typing.
4. Zero new console errors. Reuse one login for the whole run (`loginRateLimiter`: 10/15min).

## 9. Risks / assumptions

| Item                                       | Note                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D9 — second call site gone                 | Assumption that PR #225 removal is intentional and permanent. If the button returns, the chrome must be applied there too.                                                                                                                                                                                                           |
| ~~Amount permanently hidden~~ — superseded | Original risk no longer applies: Kevin re-resolved amount visibility on 2026-08-10 (second round) — static view now shows the real formatted value (`Gs. 100.000.000`) when set, "—" only when empty. Agents can scan filled rows again by design, not just via auto-open. See spec.md "Static View Shows the Real Amount When Set". |
| D3 deviation from mockup                   | Extra confirm button while editing. Needs a visual OK from Kevin at review time.                                                                                                                                                                                                                                                     |
| Deleting the two old CSS blocks            | Any other selector reaching into `.cobertura-adicional-row`/`-checkbox-row` outside these two renderers would break — grep confirms only `cotizador.css` + `render-datos.js` reference them.                                                                                                                                         |
| Mobile regression                          | No visual tooling; the 480px block is a rewrite, not a port. Playwright at 3 widths in the same commit.                                                                                                                                                                                                                              |
