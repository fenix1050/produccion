# Tasks: Red de seguridad de tests para la lógica de cotización (frontend)

## Review Workload Forecast

| Field                   | Value                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | domain-rules tier 1 ~300-420 · tier 2 ~80-100 · body-builder ~150-220 (all new-file additions)                   |
| 400-line budget risk    | High                                                                                                             |
| Chained PRs recommended | Yes                                                                                                              |
| Suggested split         | PR 1 = domain-rules.test.js tier 1 (Phases 1-2) → PR 2 = body-builder.test.js + domain-rules tier 2 (Phases 3-4) |
| Delivery strategy       | ask-on-risk                                                                                                      |
| Chain strategy          | stacked-to-main                                                                                                  |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                 | Likely PR | Focused test command                                                                      | Runtime harness                                                                                                                   | Rollback boundary                                                                                                             |
| ---- | ---------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1    | `domain-rules.test.js` tier 1 (mandatory functions)  | PR 1      | `node --test frontend/cotizar/domain-rules.test.js`                                       | N/A — pure-logic unit tests; no DOM/UI behavior changes, existing live Playwright suite already gates full-change parity per spec | Delete `frontend/cotizar/domain-rules.test.js`; no production file touched                                                    |
| 2    | `body-builder.test.js` + domain-rules tier 2 add-ons | PR 2      | `node --test frontend/cotizar/body-builder.test.js frontend/cotizar/domain-rules.test.js` | N/A — same reason as Unit 1                                                                                                       | Delete `frontend/cotizar/body-builder.test.js`; revert tier-2 additions in `domain-rules.test.js`; no production file touched |

## Phase 1: Harness Setup — `domain-rules.test.js` (PR 1)

- [x] 1.1 Create `frontend/cotizar/domain-rules.test.js`: build a `JSDOM`, assign `globalThis.document`, then `await import()` of `state.js`, `domain-rules.js`, `constants.js`.
- [x] 1.2 Add local `resetState()` helper resetting the 12 mutable `state` fields (ramoId, planId, planes, data, preview, previewError, formaPagoCodigo, franquiciasPorCobertura, coberturasCatalogo, planCoberturas, coberturasAdicionales, coberturasAdicionalesEditando); call in `beforeEach`.

## Phase 2: `domain-rules.js` Tier 1 Characterization (PR 1)

- [x] 2.1 `planEsCalculable`: plan `null`; vida-ap in/out of `PLANES_VIDA_AP_CALCULABLES` (mark `// CARACTERIZACIÓN`); `prima_tecnica_minima` `0` vs `null`/absent. Run test; fix assertion (never code) on mismatch.
- [x] 2.2 `monedaEfectiva`: `'MAQUINARIA BASICO'`→USD regardless of `tipo_mecanica` (`// CARACTERIZACIÓN`); `objeto_riesgo`→`state.data.moneda||'PYG'`; default→`'PYG'`; plan `null`→`'PYG'`.
- [x] 2.3 `datosMinimosCompletos`: mrc; incendio 3 branches (`// CARACTERIZACIÓN` on MAQUINARIA BASICO/`objeto_riesgo` field asymmetry); vida-ap `PROTECCION FAMILIAR` vs resto; ramo outside `RAMOS_CON_CALCULO`→`false`.
- [x] 2.4 `capitalAseguradoParaBody`: same incendio triage; mrc sums edificio+contenido; unknown ramo→`0`.
- [x] 2.5 Cross-triage test: run one plan through `monedaEfectiva`, `datosMinimosCompletos`, `capitalAseguradoParaBody`, `armarRiesgoDatos` (import from `body-builder.js`) and assert agreement — baseline for the deferred dedup change.
- [x] 2.6 `sugerenciaInspeccion`: every `return null` branch + both non-null messages.
- [x] 2.7 `puedeAvanzarADetalle`: ramo without calculator→`true`; with preview; blocked by `previewError`.
- [x] 2.8 `sumaObjetoRiesgo`, `franquiciaValorPorDefecto`, `franquiciasPorCoberturaParaBody` (`// CARACTERIZACIÓN` unknown valor→`null`), `ajustesParaBody`: typical values + monto-over-porcentaje priority + ramo without ajustes→`[]`.

## Phase 3: `domain-rules.js` Tier 2 (PR 2, if budget allows)

- [x] 3.1 `sublimiteVentanillaCalculado`, `sublimitesFijosMrc`, `coberturasPrincipalesFijasMrc`, `capitalTotalAsegurado`, `formasPagoDisponibles` (`// CARACTERIZACIÓN` codigo outside `ORDEN_FORMAS_PAGO`), `formaPagoSeleccionada`, `quedanCoberturasAdicionalesPorAgregar`.

## Phase 4: `body-builder.test.js` (PR 2)

- [x] 4.1 Create `frontend/cotizar/body-builder.test.js`: mirror the Phase 1 JSDOM bootstrap + `resetState()` pattern.
- [x] 4.2 `armarRiesgoDatos` MRC: fixed sublimits + one valid adicional line, fixed line first.
- [x] 4.3 `armarRiesgoDatos` Incendio: MAQUINARIA BASICO omits blank `sublimite_vandalismo_porcentaje`; `objeto_riesgo` zero-fills undeclared objects (`// CARACTERIZACIÓN`); default branch.
- [x] 4.4 `armarRiesgoDatos` Vida-AP: omits renta diaria unless flagged; `armarRiesgoDatosVidaAp` edad=`0`→`null` (`// CARACTERIZACIÓN`).
- [x] 4.5 `armarRiesgoDatos` default `{}` for `'auto'` — scope barrier proving Auto stays untouched.
- [x] 4.6 `prefillDatosDesdeCotizacion`: round-trip vs `armarRiesgoDatos`; mrc franquicias written additively without clearing prior keys (`// CARACTERIZACIÓN`).
- [x] 4.7 `idLinea`: uniqueness + fallback path without `crypto.randomUUID`.

## Phase 5: Verification & Closeout

- [x] 5.1 After each PR: `npm run check`; confirm zero production diff via `git diff --stat -- frontend/cotizar/*.js`.
- [x] 5.2 `rg "CARACTERIZACION" frontend/cotizar/*.test.js` — confirm all 6 design-listed candidates (plus any new ones) are marked.
- [x] 5.3 Update issue #165 per proposal Success Criteria (#1 obsolete, #4 closed, #2/#3 derived to their own changes).
