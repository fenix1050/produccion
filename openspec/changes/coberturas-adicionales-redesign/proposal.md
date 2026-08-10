# Proposal: Coberturas adicionales — visual redesign (MRC)

## Intent

The "Coberturas adicionales" block (MRC only) renders as raw form rows — a bare checkbox or a `<select>` + always-visible money input. Kevin approved a card mockup (avatar icon, radio-style indicator, pencil-revealed amount, dimmed lock). Goal: apply that skin to both render modes without changing any mechanic.

## Scope

### In Scope

- Markup rewrite of `renderCoberturasAdicionales` (free selector) and `renderCoberturasAdicionalesCheckbox` (checkbox mode) into the card shape.
- New purpose-built CSS class family (`.cobertura-adicional-card*`) using existing `--tajy-*` tokens; mobile `@media (max-width: 480px)` rules carried forward.
- Pencil-reveals-amount via a `Set` of line ids in `state.js` + local `habilitar/cancelarEdicionMontoCobertura` in `actions.js`, plus a `data-action` pair in `events.js`.
- 6 new SVG icon constants + new `COBERTURA_ICONOS` map.
- Lock chrome on the add button in both call sites (Datos + Detalle del plan).

### Out of Scope

- Any behavior change: `coberturasDisponibles()`, `quedanCoberturasAdicionalesPorAgregar()`, limits, preload of plan defaults, backend, schema.
- Converting the free selector to a fixed list (Kevin: same look, same mechanics).
- Restyling the read-only `.cobertura-card` in Detalle del plan.
- Incendio / Vida-AP (no such concept).
- Automated tests (none exist for this markup).

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- None (presentation-only; no requirement changes)

## Approach

**Lock semantics (resolved).** Two distinct, consistent uses of one predicate each:

1. Row-level lock = *amount not editable yet* — the row has no coverage selected (unchecked in checkbox mode, empty `<select>` in selector mode). Dimmed padlock replaces the pencil. Identical rule in both modes.
2. Add-affordance lock = `!quedanCoberturasAdicionalesPorAgregar(...)`. Cosmetic swap of the existing `disabled + title`, applied in `render-datos.js` **and** `render-detalle-plan.js` together so the two buttons stay consistent.

Capacity never locks an individual row (limit is 1 per code), so no per-row capacity state is invented.

**Icons.** Six new inline SVGs in `frontend/shared/nav-icons.js` (mockup set, `currentColor`, `viewBox 24`, stroke 1.6, matching the existing MIT Boxicons style) for `incendio_mobiliario_equipos`, `robo_contenido`, `robo_caja_registradora`, `robo_transito`, `cristales`, `responsabilidad_civil`. Registered in a **new** `COBERTURA_ICONOS = { ...SUBLIMITE_ICONOS, ...nuevos }` in `constants.js`; `SUBLIMITE_ICONOS` stays byte-identical so the read-only card is untouched.

**Inline-edit reuse.** Do **not** import `frontend/admin/inline-edit.js`: it imports admin's `renderApp` from `./render/shell.js`, which would pull the admin module graph into the cotizador and re-render the wrong app. Copy the 6-line pattern into `cotizar/actions.js` calling cotizar's `renderApp`. Deliberate duplication over cross-module coupling.

**Focus/cursor.** `renderApp()` replaces `app.innerHTML` with no focus restoration (unlike `renderLivePanel`). After enabling edit mode, explicitly `focus({ preventScroll: true })` the revealed input and place the caret at end. Typing itself never re-renders (`updateCoberturaLinea` only re-renders on `codigo`), so `formatMoneyInputInPlace` cursor handling is unaffected. Rows checked/added with an empty amount auto-enter edit mode so the amount can never be silently skipped. The static (non-editing) view always renders the "—" placeholder as a visual reference for the field — never the stored formatted value, even once an amount is set. Only the input in edit mode shows the real number. This is display-only: `state.coberturasAdicionales[].sumaAsegurada` keeps its real value at all times and still flows unchanged into the preview/calculation and Detalle del plan (which is out of scope and unaffected by this hiding rule).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/cotizar/render/render-datos.js` | Modified | Card markup for both modes |
| `frontend/cotizar/render/render-detalle-plan.js` | Modified | Lock chrome on add button only |
| `frontend/shared/cotizador.css` | Modified | New card classes + mobile rules |
| `frontend/shared/nav-icons.js` | Modified | 6 new SVG constants |
| `frontend/cotizar/constants.js` | Modified | New `COBERTURA_ICONOS` map |
| `frontend/cotizar/state.js` | Modified | Edit-mode `Set` (reset at both `coberturasAdicionales = []` sites) |
| `frontend/cotizar/actions.js` | Modified | Enable/cancel edit + focus |
| `frontend/cotizar/events.js` | Modified | New `data-action` entries |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Event wiring breaks | Low | Delegation is `data-*`-based; keep `data-action`/`data-linea-id`/`data-linea-field`/`data-money`/`data-codigo` on the interactive nodes |
| Amount hidden behind pencil → agents skip it, MRC 3-coverage minimum fails | Med | Auto-open edit mode on rows with empty amount. Static view always shows the "—" placeholder, never the stored value (Kevin, resolved) — the amount is only visible while actively editing |
| Mobile regression (no visual tooling) | Med | Port `@media (max-width: 480px)` rules in the same commit; Playwright at 3 widths |
| Edit `Set` leaks across quotes | Med | Clear it at both reset sites (`actions.js:255`, `actions.js:314`) |
| Focus loss on pencil toggle | Med | Explicit focus + caret-at-end after `renderApp()` |

## Rollback Plan

Frontend-only, no migration, no backend, no state schema. Revert the PR (or `git revert` the merge commit); no data cleanup and no redeploy coordination required — Vercel redeploys `main` automatically.

## Dependencies

- Final SVG assets from the approved mockup (6 icons). If unavailable, ship with `ICON_SUBLIMITE_GENERICO` fallback and add icons in a follow-up.

## Success Criteria

- [ ] Both modes render the approved card (avatar icon, radio indicator, pencil, lock) with unchanged mechanics.
- [ ] Selector mode keeps `<select>` per row, "Quitar", and free row addition.
- [ ] All 6 previously icon-less codes show a dedicated icon; read-only Detalle del plan card unchanged.
- [ ] Add button shows lock chrome at capacity in both call sites.
- [ ] Playwright (MRC-NORMAL, agent + free-selector role): check/uncheck, pencil edit, amount persists to preview, zero new console errors, 1440/768/480 layouts OK.

## Proposal question round — RESOLVED (Kevin, 2026-08-10)

1. **Row lock** = "amount not editable until the coverage is selected" — confirmed, matches intent for the dimmed padlock.
2. **Amount visibility — changed from the original assumption.** The amount is **never** shown as static text, set or not. The static (non-editing) state always shows the placeholder dash ("—") as a visual reference for the field, regardless of whether a value is already stored. The actual number is only visible while the row is in edit mode (input open, after clicking the pencil). This supersedes the "Risks" table mitigation text ("keep amount visible as text when set") — replace that behavior: static view is always "—", never the formatted value.
3. **Auto-open edit mode** on a just-checked/just-selected coverage with an empty amount — confirmed, desired.
4. **Lock chrome on the add button** — confirmed, land in **both** call sites (`render-datos.js` Datos step and `render-detalle-plan.js` Detalle del plan step) in this same change.
