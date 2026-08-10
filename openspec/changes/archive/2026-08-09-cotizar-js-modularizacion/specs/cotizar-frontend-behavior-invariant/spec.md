# Cotizar Frontend Behavior Invariant Specification

## Purpose

`cotizar-js-modularizacion` is a pure structural refactor: `frontend/cotizar/cotizar.js` (2514 lines) is split into ~10 ES modules by responsibility (`state.js`, `constants.js`, `domain-rules.js`, `body-builder.js`, `actions.js`, `events.js`, `render/*.js`), with `cotizar.js` reduced to a thin bootstrap. The proposal declares **New Capabilities: None** and **Modified Capabilities: None** — no functional requirement of the Cotizador changes. No existing `openspec/specs/{domain}/spec.md` covers "cotizar module structure", so there is no MODIFIED/ADDED/REMOVED delta against any prior capability spec.

Per `sdd-spec` Step 2 (`skills/sdd-spec/SKILL.md`), this change has no Capabilities section entries to map to spec files. This artifact does **not** invent functional requirements. It exists only to make the "cero cambios visibles" contract explicit and testable, since this project has no frontend automated test suite and the only verification mechanism is live Playwright checks per PR (per proposal's Risks and Success Criteria).

## Requirements

### Requirement: Observable Behavior Parity Across the Module Split

The system MUST produce identical observable behavior before and after the `cotizar.js` module split, for the 3 ramos with a real calculator (MRC, Incendio, Vida-AP) — the only ramos exercised by `RAMOS_CON_CALCULO`. "Observable" means: rendered DOM/UI, `data-action` attributes emitted, request payloads sent to the backend (`armarRiesgoDatos`/`camposEspecificosParaRamo` output), and console output (no new errors/warnings).

No PR in this change SHALL alter business logic, payload shape, DOM structure/classes used by other modules or CSS, or API contract. Each PR is a verbatim (pure-move) relocation of existing functions into a new module plus import/export wiring.

#### Scenario: MRC quote flow unchanged after split

- GIVEN a user cotiza MRC (plan NORMAL or SEGUCOOP) before the module split
- AND the same flow is repeated after a PR in this change has landed
- WHEN the same inputs are entered (risk data, coberturas adicionales, forma de pago)
- THEN the rendered "Detalle del plan" values (prima, RPF, IVA, premio, cuota) are byte-identical
- AND the request payload sent to `/cotizaciones/calcular` is structurally identical
- AND no new browser console errors appear

#### Scenario: Incendio and Vida-AP quote flows unchanged after split

- GIVEN a user cotiza Incendio (HIPOTECARIO, CON INSPECCION, SIN INSPECCION, MAQUINARIA BASICO) or Vida-AP (PROTECCION FAMILIAR, ACCIDENTES PERSONALES with/without renta diaria) before the split
- WHEN the equivalent flow is repeated after a PR in this change has landed
- THEN the same branch-specific fields render (per ramo/plan) and the same validation errors trigger for the same out-of-range inputs
- AND no new browser console errors appear

#### Scenario: Live preview panel (`renderLivePanel`) unaffected by relocation

- GIVEN `renderLivePanel` is invoked directly from `actions.js` as a DOM patch (not via `renderApp`)
- WHEN `render-cotizacion-vivo.js` is extracted in its own PR
- THEN the live panel ("Cotización en vivo": Costo, Tasa efectiva, Capital total asegurado, forma de pago pills) still updates on every relevant input change
- AND its values match the pre-split panel exactly

#### Scenario: Event dispatch (`data-action`) unchanged after `registrarEventos()` extraction

- GIVEN the 4 top-level listener statements are wrapped into an exported `registrarEventos()` in `events.js`
- WHEN `cotizar.js` calls `registrarEventos(); init();` as its only bootstrap logic
- THEN every `data-action` attribute still dispatches to the same handler as before the wrap
- AND click/submit/change behavior across Datos, Detalle del plan, and Coberturas adicionales is unchanged

## Non-Requirements (Explicit)

- This spec does NOT define new or modified functional capabilities of MRC, Incendio, Vida-AP, or any ramo calculator. Those existing capability specs (e.g. `mrc-plan-descuento-fijo`, `incendio-planes-objeto-riesgo`, `rpf-por-cuotas`) are unaffected and require no delta.
- This spec does NOT require new automated frontend tests. Verification is explicitly Playwright-driven, live, per PR (per proposal Risks/Success Criteria) — consistent with the precedent set by `admin-module-split`.
- Backend behavior, schema, migrations, and API contracts are out of scope and unaffected (proposal "Out of Scope").
