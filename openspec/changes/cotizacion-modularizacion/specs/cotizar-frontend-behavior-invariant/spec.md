# Delta for cotizar-frontend-behavior-invariant

## ADDED Requirements

### Requirement: Automated Characterization Coverage of `domain-rules.js`

The system MUST have `node --test` coverage (`domain-rules.test.js`) for `planEsCalculable`, `monedaEfectiva`, `sugerenciaInspeccion`, `datosMinimosCompletos`, `puedeAvanzarADetalle` across MRC/Incendio/Vida-AP branches. Auto individual paths MUST NOT be touched.

#### Scenario: `monedaEfectiva` locks MAQUINARIA BASICO to USD

- GIVEN a plan with `nombre === 'MAQUINARIA BASICO'`
- WHEN `monedaEfectiva(plan)` runs
- THEN it returns `'USD'` regardless of `state.data.moneda`

#### Scenario: `planEsCalculable` uses fixed catalog for Vida-AP (CARACTERIZACIÓN)

- GIVEN `ramoNombre === 'vida-ap'` and `plan.nombre` not in `PLANES_VIDA_AP_CALCULABLES`
- WHEN `planEsCalculable('vida-ap', plan)` runs
- THEN it returns `false` even with a valid `prima_tecnica_minima`
- AND the assertion carries `// CARACTERIZACIÓN` (ignores `prima_tecnica_minima`, unlike MRC/Incendio — known FE/BE duplication)

#### Scenario: `datosMinimosCompletos` per-ramo branches

- GIVEN each ramo's minimum fields (MRC: rubro/ciudad/capital; MAQUINARIA BASICO: capitalMaquinaria > 0; PROTECCION FAMILIAR: capitalAsegurado > 0)
- WHEN fields are complete vs incomplete
- THEN it returns `true` only when that branch's conditions hold

#### Scenario: `puedeAvanzarADetalle` blocks on preview error

- GIVEN `state.ramoId` is in `RAMOS_CON_CALCULO` and `state.previewError` is truthy
- WHEN `puedeAvanzarADetalle()` runs
- THEN it returns `false`

### Requirement: Automated Characterization Coverage of `body-builder.js`

The system MUST have `node --test` coverage (`body-builder.test.js`) for the exported `armarRiesgoDatos(plan)`, exercising MRC, Incendio (MAQUINARIA BASICO, `objeto_riesgo`, default), and Vida-AP via `state.ramoId` (private per-ramo builders are not individually exported).

#### Scenario: Incendio `objeto_riesgo` zero-fills undeclared objects (CARACTERIZACIÓN)

- GIVEN `tipo_mecanica === 'objeto_riesgo'`, only some of the 4 `OBJETOS_RIESGO_CAMPOS` filled
- WHEN `armarRiesgoDatos(plan)` runs
- THEN every risk-object key is present, defaulting missing/non-numeric values to `0`
- AND the assertion carries `// CARACTERIZACIÓN` (duplicated in `incendio.calculator.js`)

#### Scenario: MAQUINARIA BASICO omits blank vandalismo sublimit

- GIVEN `sublimiteVandalismoPorcentaje` is `''`/`undefined`
- WHEN `armarRiesgoDatos(plan)` runs
- THEN the payload has no `sublimite_vandalismo_porcentaje` key

#### Scenario: MRC includes fixed sublimits and adjustable lines

- GIVEN `sublimitesFijosMrc()` returns one fixed line and one valid adicional line exists
- WHEN `armarRiesgoDatos(plan)` runs
- THEN `coberturas_adicionales` contains both, fixed line first

#### Scenario: Vida-AP omits renta diaria unless flagged

- GIVEN an Accidentes Personales plan with `incluyeRentaDiaria` falsy
- WHEN `armarRiesgoDatos(plan)` runs
- THEN the payload has no `incluye_renta_diaria`/`suma_renta_diaria` keys

### Requirement: Tests Characterize, They MUST NOT Alter Production Behavior

Tests MUST assert CURRENT behavior of unmodified `domain-rules.js`/`body-builder.js`. No PR SHALL modify any `.js` file under `frontend/cotizar/` other than adding new `*.test.js` files.

#### Scenario: Failing test is fixed by editing the test

- GIVEN a new test fails against current production code
- WHEN the mismatch is investigated
- THEN the assertion is corrected; the production file stays byte-identical

### Requirement: Suspicious Behavior MUST Be Marked, Not Fixed

Any assertion documenting a possible bug MUST carry an inline `// CARACTERIZACIÓN` comment, giving the deferred `cotizacion-contrato-fe-be` change a baseline.

#### Scenario: Marker present on every documented duplication

- GIVEN the `monedaEfectiva` USD-lock, `objeto_riesgo` zero-fill, and Vida-AP fixed-catalog assertions
- WHEN the test file is reviewed
- THEN each has an adjacent `// CARACTERIZACIÓN` comment

## MODIFIED Requirements

### Requirement: Observable Behavior Parity Across the Module Split

The system MUST produce identical observable behavior before/after the `cotizar.js` split, for MRC/Incendio/Vida-AP. "Observable" = rendered DOM/UI, `data-action` attributes, request payloads, console output.

No PR SHALL alter business logic, payload shape, DOM structure/classes, or API contract; each PR is a verbatim relocation. Live Playwright verification remains the mechanism for end-to-end DOM/UI parity; it is now complemented — not replaced — by automated `node --test` characterization coverage of `domain-rules.js`/`body-builder.js` (see ADDED Requirements), which previously had zero automated coverage.
(Previously: pure-logic verification relied solely on live Playwright checks.)

#### Scenario: MRC quote flow unchanged after split

- GIVEN a user cotiza MRC before the split, repeated after a PR lands
- WHEN the same inputs are entered
- THEN "Detalle del plan" values and the `/cotizaciones/calcular` payload are identical, no new console errors

#### Scenario: Incendio and Vida-AP quote flows unchanged after split

- GIVEN a user cotiza Incendio or Vida-AP before the split, repeated after a PR lands
- WHEN the equivalent flow runs
- THEN the same fields render and the same validation errors trigger, no new console errors

#### Scenario: Live preview panel unaffected by relocation

- GIVEN `renderLivePanel` is invoked from `actions.js` as a DOM patch
- WHEN `render-cotizacion-vivo.js` is extracted
- THEN the panel still updates on every relevant change and matches pre-split values

#### Scenario: Event dispatch unchanged after `registrarEventos()` extraction

- GIVEN listeners are wrapped into `registrarEventos()` in `events.js`
- WHEN `cotizar.js` calls `registrarEventos(); init();`
- THEN every `data-action` dispatches to the same handler as before

#### Scenario: Automated coverage complements, does not replace, Playwright

- GIVEN `npm run check` runs the frontend suite
- WHEN `domain-rules.test.js`/`body-builder.test.js` pass
- THEN pure-logic coverage is satisfied; full DOM/UI parity still needs a live Playwright check before merge

## Notes for Archive

`camposEspecificosParaRamo` (proposal listed it under `body-builder.js`) actually lives in `render/render-datos.js` — verified against code. Out of this spec's pure-logic scope; `body-builder.test.js` covers `armarRiesgoDatos` only.

On archive, remove/update the base spec's "Non-Requirements" bullet "does NOT require new automated frontend tests": `domain-rules.js`/`body-builder.js` now require automated characterization coverage; DOM/UI verification stays Playwright-driven.
