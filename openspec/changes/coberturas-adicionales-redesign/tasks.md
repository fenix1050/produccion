# Tasks: Coberturas Adicionales UI Redesign (MRC)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550-650 (additions ~350-400, deletions ~200-250, mostly CSS) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (foundation+state) → PR2 (CSS addition) → PR3 (render cutover + CSS cleanup + verification) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — ask Kevin: stacked-to-main or feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Icons, `COBERTURA_ICONOS`, edit-mode Set + actions/events wiring (dead code, no caller yet) | PR 1 | Manual: `state.coberturasAdicionalesEditando` toggles via new actions in console | N/A — unused until Unit 3 wires markup | Revert `constants.js`/`nav-icons.js`/`state.js`/`actions.js`/`events.js` additions; no callers exist yet |
| 2 | New `.cobertura-adicional-card` CSS block + media query + D8 scoping (old blocks untouched, unused classes) | PR 2 | Visual no-op check: existing checkbox/selector rows render byte-identical | N/A — new classes unreferenced by any renderer yet | Revert new CSS block; zero visual dependency |
| 3 | `render-datos.js` cutover to `cardCoberturaAdicional()` + delete old CSS blocks + Playwright verification | PR 3 | Playwright suite (Phase 5 below) | Real cotizador run, MRC-NORMAL, `test@test.com` + a `puede_agregar_cobertura_libre` role, 1440/768/480px | `git revert` single PR restores old renderers + old CSS |

## Phase 1: Foundation (icons, constants, state)

- [x] 1.1 Add `COBERTURA_ICONOS` (spread `SUBLIMITE_ICONOS` + 6 codes) to `frontend/cotizar/constants.js` — done in PR1 (`feat/coberturas-adicionales-redesign-1-fundacion`)
- [x] 1.2 Add `ICON_PENCIL`, `ICON_LOCK`, `ICON_CHECK_SMALL` + 6 coverage icon constants to `frontend/shared/nav-icons.js` (Boxicons filled style) — done in PR1
- [x] 1.3 Add `state.coberturasAdicionalesEditando = new Set()` + comment in `frontend/cotizar/state.js` — done in PR1

## Phase 2: Edit-mode state machine (actions.js, events.js)

- [ ] 2.1 Add `habilitarEdicionMontoCobertura(id)` / `cerrarEdicionMontoCobertura(id)` to `actions.js` (Set add/delete)
- [ ] 2.2 Add `focusMontoCobertura(id)` (`focus({preventScroll:true})` + `setSelectionRange(len,len)`), called after `renderApp()`
- [ ] 2.3 Auto-open: `toggleCoberturaAdicionalPorCodigo`/`updateCoberturaLinea` add id to edit Set when codigo set + `sumaAsegurada` empty
- [ ] 2.4 Cleanup: `.clear()` in `selectRamo`, `selectPlan`, `cargarParaEditar` prefill; `.delete(id)` in `removeCoberturaLinea` and un-check branch
- [ ] 2.5 Suppress `focusMontoCobertura` call from `preagregarCoberturasPrincipalesFijasMrc()` (marks open, no focus steal)
- [ ] 2.6 Add `events.js` `data-action` branches: `editar-monto-cobertura`, `cerrar-edicion-monto-cobertura`
- [ ] 2.7 Add `keydown` handler on `[data-linea-field="sumaAsegurada"]`: Enter/Escape close edit mode (no `focusout`, per D3)

## Phase 3: Shared card markup (render-datos.js)

- [ ] 3.1 Add private `cardCoberturaAdicional(opts)` emitting shared skeleton (icon, main, field zone: locked/static/editing)
- [ ] 3.2 Rewrite `renderCoberturasAdicionales()` (free selector): static dot indicator, `<select>` in identity slot, `Quitar` in trailing slot
- [ ] 3.3 Rewrite `renderCoberturasAdicionalesCheckbox()`: hidden checkbox + dot in identity slot, no trailing action
- [ ] 3.4 Static field state always renders "—" placeholder, never the stored value
- [ ] 3.5 Locked field state renders inert `<span class="…__lock" title="…">` (not a disabled button)
- [ ] 3.6 Add `.is-locked` chrome (class + padlock glyph) to the single "+ Agregar cobertura" button in `render-datos.js` when `quedanCoberturasAdicionalesPorAgregar()` is false — **`render-datos.js` only**; no task for `render-detalle-plan.js` (button removed in PR #225, per D9)

## Phase 4: CSS

- [x] 4.1 Add new `.cobertura-adicional-card` block to `frontend/shared/cotizador.css` (grid skeleton, `--libre`/`--fija` modifiers, `is-locked`/`is-editing`, check/dot, icon, main, field, estatico, input, accion, lock) — done in PR1. Note: `--libre`/`--fija` column-width modifier classes were not needed to make the block additive/inert (no caller emits them yet); add them in Unit 3 alongside the renderer cutover if the two modes end up needing distinct column widths.
- [x] 4.2 Add single `@media (max-width: 480px)` block covering both modes (stacked field, full-width Quitar) — done in PR1
- [x] 4.3 Scope group-title selector: `.coberturas-adicionales label` → `.coberturas-adicionales > label` (D8) — done in PR1, verified zero visual change on current live markup (only descendant match today is the direct-child group-title label; `.field-checkbox-label` was already winning on specificity)
- [ ] 4.4 Delete old `.cobertura-adicional-row*`/`-checkbox-row*` blocks and their two `@media(480px)` blocks, incl. the malformed `\*` comment near line 1817 — Unit 3
- [x] 4.5 Add `prefers-reduced-motion: reduce` rule dropping dot/background transitions (existing file convention) — done in PR1

## Phase 5: Verification (manual/Playwright — no automated tests, per proposal)

- [ ] 5.1 Playwright, MRC-NORMAL, `test@test.com` (agente/checkbox), 1440/768/480px: check → unlock, dot fills, auto-open + focus; type amount; close; static shows "—"; reopen shows real value
- [ ] 5.2 Playwright, role with `puede_agregar_cobertura_libre` (free selector): add row locked w/ padlock, choose coverage → unlock + auto-open; `Quitar` removes; add button locked at capacity (6 rows)
- [ ] 5.3 Confirm live panel prima / "Capital total asegurado" updates after typing amount (calculation path unaffected)
- [ ] 5.4 Confirm zero new console errors, both roles, all 3 widths; reuse one login per role (`loginRateLimiter` 10/15min)
- [ ] 5.5 Confirm read-only `.cobertura-card` in "Detalle del plan" unaffected (`SUBLIMITE_ICONOS` byte-identical, no `render-detalle-plan.js` diff)
