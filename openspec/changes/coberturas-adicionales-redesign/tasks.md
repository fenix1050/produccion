# Tasks: Coberturas Adicionales UI Redesign (MRC)

## Review Workload Forecast

| Field                   | Value                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Estimated changed lines | ~550-650 (additions ~350-400, deletions ~200-250, mostly CSS)                                   |
| 400-line budget risk    | High                                                                                            |
| Chained PRs recommended | Yes                                                                                             |
| Suggested split         | PR1 (foundation+state) → PR2 (CSS addition) → PR3 (render cutover + CSS cleanup + verification) |
| Delivery strategy       | ask-on-risk                                                                                     |
| Chain strategy          | pending — ask Kevin: stacked-to-main or feature-branch-chain                                    |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                                                                                                                                                                                            | Likely PR | Focused test command                                                                                                                                                           | Runtime harness                                                                                          | Rollback boundary                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Icons, `COBERTURA_ICONOS`, edit-mode Set + actions/events wiring (dead code, no caller yet)                                                                                                                                     | PR 1      | Manual: `state.coberturasAdicionalesEditando` toggles via new actions in console                                                                                               | N/A — unused until Unit 3 wires markup                                                                   | Revert `constants.js`/`nav-icons.js`/`state.js`/`actions.js`/`events.js` additions; no callers exist yet                                                                                                                       |
| 2    | New `.cobertura-adicional-card` CSS block + media query + D8 scoping (old blocks untouched, unused classes) — DONE (this unit ended up shipping the Phase 2 state machine, not new CSS; PR1 already shipped the CSS in Phase 4) | PR 2      | Manual: `habilitarEdicionMontoCobertura`/`cerrarEdicionMontoCobertura`/auto-open verified via console (no markup calls these yet — `render-datos.js` still emits the old rows) | N/A — new actions/handlers unreferenced by any live markup until Unit 3 wires the card's `data-action`s  | Revert `actions.js`/`events.js`/`body-builder.js` additions; no live caller exists yet                                                                                                                                         |
| 3    | `render-datos.js` cutover to `cardCoberturaAdicional()` + delete old CSS blocks + Playwright verification                                                                                                                       | PR 3      | Playwright suite (Phase 5 below)                                                                                                                                               | Real cotizador run, MRC-NORMAL, `test@test.com` + a `puede_agregar_cobertura_libre` role, 1440/768/480px | `git revert` single PR restores old renderers + old CSS — DONE, branch `feat/coberturas-adicionales-redesign-3-cutover`; checkbox-mode verification complete, free-selector role (5.2) not verified (no credentials available) |

## Phase 1: Foundation (icons, constants, state)

- [x] 1.1 Add `COBERTURA_ICONOS` (spread `SUBLIMITE_ICONOS` + 6 codes) to `frontend/cotizar/constants.js` — done in PR1 (`feat/coberturas-adicionales-redesign-1-fundacion`)
- [x] 1.2 Add `ICON_PENCIL`, `ICON_LOCK`, `ICON_CHECK_SMALL` + 6 coverage icon constants to `frontend/shared/nav-icons.js` (Boxicons filled style) — done in PR1
- [x] 1.3 Add `state.coberturasAdicionalesEditando = new Set()` + comment in `frontend/cotizar/state.js` — done in PR1

## Phase 2: Edit-mode state machine (actions.js, events.js)

- [x] 2.1 Add `habilitarEdicionMontoCobertura(id)` / `cerrarEdicionMontoCobertura(id)` to `actions.js` (Set add/delete) — done in PR2 (`feat/coberturas-adicionales-redesign-2-estados-edicion`)
- [x] 2.2 Add `focusMontoCobertura(id)` (`focus({preventScroll:true})` + `setSelectionRange(len,len)`), called after `renderApp()` — done in PR2
- [x] 2.3 Auto-open: `toggleCoberturaAdicionalPorCodigo`/`updateCoberturaLinea` add id to edit Set when codigo set + `sumaAsegurada` empty — done in PR2
- [x] 2.4 Cleanup: `.clear()` in `selectRamo`, `selectPlan`, `cargarParaEditar` prefill (via `body-builder.js` `prefillDatosDesdeCotizacion`); `.delete(id)` in `removeCoberturaLinea` and un-check branch — done in PR2
- [x] 2.5 Suppress `focusMontoCobertura` call from `preagregarCoberturasPrincipalesFijasMrc()` (marks open, no focus steal) — done in PR2
- [x] 2.6 Add `events.js` `data-action` branches: `editar-monto-cobertura`, `cerrar-edicion-monto-cobertura` — done in PR2
- [x] 2.7 Add `keydown` handler on `[data-linea-field="sumaAsegurada"]`: Enter/Escape close edit mode (no `focusout`, per D3) — done in PR2, delegated on `app` (not `document`, unlike the progress-modal handler) since it only needs to fire while the field itself has focus

## Phase 3: Shared card markup (render-datos.js) — DONE, Unit 3 (`feat/coberturas-adicionales-redesign-3-cutover`)

- [x] 3.1 Add private `cardCoberturaAdicional(opts)` emitting shared skeleton (icon, main, field zone: locked/static/editing)
- [x] 3.2 Rewrite `renderCoberturasAdicionales()` (free selector): static dot indicator, `<select>` in identity slot, `Quitar` in trailing slot
- [x] 3.3 Rewrite `renderCoberturasAdicionalesCheckbox()`: hidden checkbox + dot in identity slot, no trailing action
- [x] 3.4 Static field state always renders "—" placeholder, never the stored value
- [x] 3.5 Locked field state renders inert `<span class="…__lock" title="…">` (not a disabled button)
- [x] 3.6 Add `.is-locked` chrome (class + padlock glyph) to the single "+ Agregar cobertura" button in `render-datos.js` when `quedanCoberturasAdicionalesPorAgregar()` is false — **`render-datos.js` only**; no task for `render-detalle-plan.js` (button removed in PR #225, per D9)

## Phase 4: CSS

- [x] 4.1 Add new `.cobertura-adicional-card` block to `frontend/shared/cotizador.css` (grid skeleton, `--libre`/`--fija` modifiers, `is-locked`/`is-editing`, check/dot, icon, main, field, estatico, input, accion, lock) — done in PR1. Note: `--libre`/`--fija` column-width modifier classes were not needed to make the block additive/inert (no caller emits them yet); add them in Unit 3 alongside the renderer cutover if the two modes end up needing distinct column widths.
- [x] 4.2 Add single `@media (max-width: 480px)` block covering both modes (stacked field, full-width Quitar) — done in PR1
- [x] 4.3 Scope group-title selector: `.coberturas-adicionales label` → `.coberturas-adicionales > label` (D8) — done in PR1, verified zero visual change on current live markup (only descendant match today is the direct-child group-title label; `.field-checkbox-label` was already winning on specificity)
- [x] 4.4 Delete old `.cobertura-adicional-row*`/`-checkbox-row*` blocks and their two `@media(480px)` blocks, incl. the malformed `\*` comment near line 1817 — done in Unit 3
- [x] 4.5 Add `prefers-reduced-motion: reduce` rule dropping dot/background transitions (existing file convention) — done in PR1

## Phase 5: Verification (manual/Playwright — no automated tests, per proposal)

- [x] 5.1 Playwright, MRC-NORMAL, `test@test.com` (agente/checkbox), 1440/768/480px: check → unlock, dot fills, auto-open + focus; type amount; close; static shows "—"; reopen shows real value — **done**, all pass at all 3 widths (see apply-progress for exact assertions)
- [ ] 5.2 Playwright, role with `puede_agregar_cobertura_libre` (free selector): add row locked w/ padlock, choose coverage → unlock + auto-open; `Quitar` removes; add button locked at capacity (6 rows) — **NOT verified**: no credentials for a `puede_agregar_cobertura_libre` role were available this session (only `test@test.com`/agente, checkbox mode). Free-selector code path reviewed manually against design.md 2.3 but not exercised live.
- [ ] 5.3 Confirm live panel prima / "Capital total asegurado" updates after typing amount (calculation path unaffected) — **NOT fully verified**: form wasn't filled with the full MRC-required fields (tipo de riesgo, ciudad, capitales), so `puedeAvanzarADetalle()`/full preview never completed in the run; the "Sublímites incluidos" live panel did react to state changes during the session, but the specific "Capital total asegurado" assertion didn't trigger. Calculation code path (`armarRiesgoDatosMrc`, `state.coberturasAdicionales[].sumaAsegurada`) is untouched by this change (display-only rewrite).
- [x] 5.4 Confirm zero new console errors, both roles, all 3 widths — checkbox role confirmed (only pre-existing benign 401 on `/auth/me` before login resolves, same pattern seen in prior sessions); free-selector role not tested (see 5.2)
- [ ] 5.5 Confirm read-only `.cobertura-card` in "Detalle del plan" unaffected (`SUBLIMITE_ICONOS` byte-identical, no `render-detalle-plan.js` diff) — **NOT visually verified live** (same reason as 5.3: "Detalle del plan" tab never unlocked in the run). `render-detalle-plan.js` has zero diff in this PR (confirmed via `git diff --stat`), so regression risk is effectively nil, but this wasn't confirmed by an actual screenshot.
