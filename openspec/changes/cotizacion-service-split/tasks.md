# Tasks: Split de `cotizacion.service.js` por capa funcional

## Review Workload Forecast

| Field                   | Value                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Estimated changed lines | PR1 ~120, PR2 ~260, PR3a ~180, PR3b ~280, PR4 ~340, PR5 ~110 (barrel finalize ~40) |
| 400-line budget risk    | Medium (PR3 as single unit is High ~440; split to 3a/3b resolves it)               |
| Chained PRs recommended | Yes                                                                                |
| Suggested split         | PR1 -> PR2 -> PR3a -> PR3b -> PR4 -> PR5(optional) -> Final barrel                 |
| Delivery strategy       | ask-on-risk                                                                        |
| Chain strategy          | feature-branch-chain                                                               |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit         | Goal                                                                                                     | Likely PR | Focused test command                                                         | Runtime harness                                                                                                          | Rollback boundary                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1            | `umbral-inspeccion.service.js` + `cotizacion-authorization.service.js` leaf extraction                   | PR 1      | `npm test --prefix backend -- cotizacion.service`                            | N/A (unit tests only, no runtime scenario needed for leaf relocation)                                                    | revert PR1 commit; barrel unchanged, callers unaffected                 |
| 2            | `cotizacion-context.service.js` merge + cache-key verbatim move                                          | PR 2      | `npm test --prefix backend -- cotizacion.service`                            | Manual cotizar MRC via `/run-cotizador` smoke to confirm `catalogoRamo:` cache still hits (shared w/ `ramos.service.js`) | revert PR2 commit; PR1 modules untouched                                |
| 3a           | `resolverDescuentos`/`resolverTasaRpf`/`resolverCuotas` -> `cotizacion-pricing.service.js` (pure fns)    | PR 3a     | `npm test --prefix backend -- cotizacion-pricing.service`                    | N/A (pure functions, unit-test coverage sufficient)                                                                      | revert PR3a; PR3b not yet dependent                                     |
| 3b           | `construirVariantes` + `resolverTiposFranquicia` -> same `cotizacion-pricing.service.js`                 | PR 3b     | `npm test --prefix backend -- cotizacion.service cotizacion-pricing.service` | Manual Auto RPF/franquicia fixture run via `/run-cotizador` to eyeball byte-identical output                             | revert PR3b only; 3a stays intact (same file, additive)                 |
| 4            | `cotizacion-persistence.service.js` (`armarPayloadDetalle` + `crearCotizacion` + `actualizarCotizacion`) | PR 4      | `npm test --prefix backend -- cotizacion-persistence.service`                | Manual crear+actualizar cotizacion (MRC) via `/run-cotizador`, confirm RPC `crear_cotizacion_atomica` payload unchanged  | revert PR4; PR1-3b remain valid, barrel still re-exports old symbols    |
| 5 (optional) | `cotizacion-oferta.service.js` (`generarPdfOferta`)                                                      | PR 5      | `npm test --prefix backend -- cotizacion-oferta.service`                     | Manual PDF Carta Oferta generation smoke via `/run-cotizador`                                                            | revert PR5; barrel keeps `generarPdfOferta` locally as fallback         |
| Final        | `cotizacion.service.js` -> thin barrel, confirm controller zero-diff                                     | Final     | `npm test --prefix backend` (full suite)                                     | N/A (barrel wiring only, covered by full suite)                                                                          | revert final commit; all PRs individually still valid on tracker branch |

## Phase 1: PR 1 — Leaf Modules (`umbral-inspeccion` + `authorization`)

- [x] 1.1 RED: add/relocate `resolverUmbralInspeccion` tests into `backend/src/services/umbral-inspeccion.service.test.js` (or update import path if already separate), asserting identical behavior to current `cotizacion.service.test.js` coverage. (No standalone describe block existed — behavior is exercised indirectly via `construirVariantes`/`calcularPreview` fixtures in `cotizacion.service.test.js`, per design's PR1 test-reorg table: "None." Safety net = full baseline run, 222/222 green before any production edit.)
- [x] 1.2 Create `backend/src/services/umbral-inspeccion.service.js`, move `resolverUmbralInspeccion` verbatim from `cotizacion.service.js`.
- [x] 1.3 Create `backend/src/services/cotizacion-authorization.service.js`, move `verificarPropiedad` verbatim.
- [x] 1.4 Update `cotizacion.service.js` to import + re-export both symbols (`export { resolverUmbralInspeccion } from './umbral-inspeccion.service.js'`, `export { verificarPropiedad } from './cotizacion-authorization.service.js'`), delete moved bodies.
- [x] 1.5 GREEN: run `npm test --prefix backend -- cotizacion.service` — confirm ownership tests (`cotizacion.service.ownership.test.js`) still pass unmodified (they exercise `verificarPropiedad` via the barrel).
- [x] 1.6 Run full backend suite `npm test --prefix backend`, confirm 154/154 baseline still green. (Actual current baseline is 222/222 — the 154 figure in tasks/docs predates later test additions; 222/222 confirmed green after PR1.)

## Phase 2: PR 2 — `cotizacion-context.service.js`

- [ ] 2.1 RED: confirm current `calcularPreview` tests in `cotizacion.service.test.js` already exercise `validarYResolverContexto`/`resolverContextoRepositorios` end-to-end (no new test needed per design; document this as the characterization anchor).
- [ ] 2.2 Grep `backend/src/services/**` for `catalogoRamo:`, `tasasRamo:`, `tasasObjeto:`, `rpfCuotas` key strings — confirm no duplicate definitions outside the module being extracted (cross-check `ramos.service.js:29` shares `catalogoRamo:${ramoId}` verbatim).
- [ ] 2.3 Create `backend/src/services/cotizacion-context.service.js`, move `validarYResolverContexto` + `resolverContextoRepositorios` verbatim (single file), including `withCache` calls with byte-identical key strings.
- [ ] 2.4 Update `umbral-inspeccion.service.js` consumption: `cotizacion-context.service.js` imports `resolverUmbralInspeccion` from PR 1's module (not from the barrel).
- [ ] 2.5 Update `cotizacion.service.js` to import + re-export both context symbols, delete moved bodies.
- [ ] 2.6 GREEN: run `npm test --prefix backend -- cotizacion.service`, confirm `calcularPreview` scenarios (MRC/Incendio/Vida-AP context resolution) pass unmodified.
- [ ] 2.7 Manual smoke: cotizar MRC via `/run-cotizador`, confirm catalog cache still hits shared key with `ramos.service.js` (no duplicate cache entries).
- [ ] 2.8 Run full backend suite, confirm 154/154 baseline still green.

## Phase 3a: PR 3a — Pricing Pure Functions

- [ ] 3a.1 RED: relocate `resolverDescuentos`/`resolverTasaRpf`/`resolverCuotas` describe blocks from `cotizacion.service.test.js` into new `backend/src/services/cotizacion-pricing.service.test.js`, import path pointing at the new module.
- [ ] 3a.2 Create `backend/src/services/cotizacion-pricing.service.js`, move `resolverDescuentos`, `resolverTasaRpf`, `resolverCuotas` verbatim.
- [ ] 3a.3 Update `cotizacion.service.js` to import + re-export the three symbols, delete moved bodies.
- [ ] 3a.4 GREEN: run `npm test --prefix backend -- cotizacion-pricing.service`, confirm relocated assertions pass unchanged.
- [ ] 3a.5 Run full backend suite, confirm 154/154 baseline still green.

## Phase 3b: PR 3b — `construirVariantes` + `resolverTiposFranquicia`

- [ ] 3b.1 RED: verify the byte-identical Auto RPF/franquicia regression fixture in `cotizacion.service.test.js` still targets the barrel's `calcularPreview` (per design, this describe stays on the public path, not relocated) — confirm no accidental deletion.
- [ ] 3b.2 Add `construirVariantes` + `resolverTiposFranquicia` into `cotizacion-pricing.service.js` (same file as PR 3a), moved verbatim including the `TODO Fase 2` comment untouched.
- [ ] 3b.3 Update `cotizacion.service.js` `calcularPreview` to call `construirVariantes` from `cotizacion-pricing.service.js`; delete moved bodies from the barrel.
- [ ] 3b.4 Confirm `auto.calculator.js` is untouched (grep diff for that file — must show zero changes).
- [ ] 3b.5 GREEN: run `npm test --prefix backend -- cotizacion.service cotizacion-pricing.service`, confirm Auto RPF/franquicia fixture assertions are byte-identical to pre-move output.
- [ ] 3b.6 Manual smoke: run Auto individual franquicia scenario via `/run-cotizador` (read-only check, Fase 2 stays paused — no logic edits).
- [ ] 3b.7 Run full backend suite, confirm 154/154 baseline still green.

## Phase 4: PR 4 — `cotizacion-persistence.service.js`

- [ ] 4.1 RED: relocate `crearCotizacion`/`actualizarCotizacion` top-level test blocks (moneda+snapshot, RPC error passthrough, tasa objeto-riesgo override) from `cotizacion.service.test.js` into new `backend/src/services/cotizacion-persistence.service.test.js`.
- [ ] 4.2 Create `backend/src/services/cotizacion-persistence.service.js`, move `armarPayloadDetalle`, `crearCotizacion`, `actualizarCotizacion`, `VENTANA_EDICION_MS` verbatim — keep RPC payload-shaping (`p_cotizacion`/`p_coberturas`/`p_variantes`) and `crear_cotizacion_atomica`/`actualizar_cotizacion_atomica` calls co-located in this single file, no manual compensation logic added.
- [ ] 4.3 Wire `cotizacion-persistence.service.js` imports: `cotizacion-pricing.service.js` (variantes/cuotas), `cotizacion-context.service.js` (contexto), `cotizacion-authorization.service.js` (`verificarPropiedad` for `actualizarCotizacion`).
- [ ] 4.4 Update `cotizacion.service.js` to import + re-export `crearCotizacion`/`actualizarCotizacion` only (per design's export list), delete moved bodies; `calcularPreview no persiste nada` test stays with the barrel.
- [ ] 4.5 GREEN: run `npm test --prefix backend -- cotizacion-persistence.service`, confirm RPC payload shape and error passthrough assertions pass unchanged.
- [ ] 4.6 Manual smoke: crear + actualizar cotizacion MRC via `/run-cotizador`, confirm RPC payload identical pre/post-split (compare Supabase logs if available).
- [ ] 4.7 Run full backend suite, confirm 154/154 baseline still green.

## Phase 5 (optional): PR 5 — `cotizacion-oferta.service.js`

- [ ] 5.1 Decide go/no-go: evaluate barrel line count after PR 4; only proceed if `cotizacion.service.js` still exceeds a thin-barrel size threshold.
- [ ] 5.2 RED: relocate `generarPdfOferta` ownership describe from `cotizacion.service.ownership.test.js` into new `cotizacion-oferta.service.ownership.test.js`.
- [ ] 5.3 Create `backend/src/services/cotizacion-oferta.service.js`, move `generarPdfOferta` verbatim, name chosen to avoid collision with existing `pdf.service.js`.
- [ ] 5.4 Update `cotizacion.service.js` to import + re-export `generarPdfOferta`, delete moved body.
- [ ] 5.5 GREEN: run `npm test --prefix backend -- cotizacion-oferta.service`, confirm ownership assertions pass unchanged.
- [ ] 5.6 Manual smoke: generate Carta Oferta PDF (MRC) via `/run-cotizador`, confirm output byte-for-byte unchanged vs pre-split baseline.
- [ ] 5.7 Run full backend suite, confirm 154/154 baseline still green.

## Phase Final: Barrel Finalization

- [ ] F.1 Confirm `cotizacion.service.js` contains only: `calcularPreview`, `listarCotizaciones`, `obtenerCotizacion`, `aceptarCotizacion` (Fase 4 stub), `generarPdfPropuestaFormal` (Fase 4 stub), plus re-export statements for all relocated symbols. `generarPdfOferta` stays local unless PR 5 landed.
- [ ] F.2 Verify import graph is acyclic: no layer module (`cotizacion-context`/`pricing`/`persistence`/`authorization`/`umbral-inspeccion`) imports from `cotizacion.service.js`.
- [ ] F.3 Diff `backend/src/controllers/cotizaciones.controller.js` against pre-change baseline — confirm zero modified lines.
- [ ] F.4 Run full backend suite `npm test --prefix backend`, confirm 154/154 (plus any newly split test files) green.
- [ ] F.5 Update `docs/ESTADO_PROYECTO.md` with a new dated entry describing the split (files created, PR chain, verification performed) per CLAUDE.md convention.
