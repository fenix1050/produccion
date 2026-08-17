# Cotizacion Backend Behavior Invariant Specification

## Purpose

`cotizacion-service-split` is a pure structural refactor: `backend/src/services/cotizacion.service.js` (641 lines, 7-9 mixed responsibilities) is split by functional layer into 4-5 new service modules (`umbral-inspeccion.service.js`, `cotizacion-authorization.service.js`, `cotizacion-context.service.js`, `cotizacion-pricing.service.js`, `cotizacion-persistence.service.js`, optionally `cotizacion-oferta.service.js`), with `cotizacion.service.js` reduced to a thin orchestrator/barrel. The proposal declares **New Capabilities: `cotizacion-backend-behavior-invariant`** and **Modified Capabilities: None** — no existing `openspec/specs/{domain}/spec.md` covers this module structure, so this is a new spec, not a delta.

This spec exists to make the "zero observable behavior change" contract explicit and testable across the PR chain (Feature Branch Chain, 400-line review budget per PR, see proposal). It does not invent new functional capabilities of MRC, Incendio, Vida/AP, or Auto — those live in their own capability specs and are unaffected.

## Requirements

### Requirement: Public API Surface Preserved Exactly

The system MUST preserve `cotizacion.service.js`'s public API — `calcularPreview`, `crearCotizacion`, `listarCotizaciones`, `obtenerCotizacion`, `generarPdfOferta`, `actualizarCotizacion`, `aceptarCotizacion`, `generarPdfPropuestaFormal` — as named exports with identical signatures, after every PR in the chain, by re-exporting from the extracted layer modules.

#### Scenario: Controller requires zero changes

- GIVEN `cotizaciones.controller.js` imports from `cotizacion.service.js` today
- WHEN the full PR chain (PR 1 through PR 4/5) lands
- THEN `cotizaciones.controller.js` has zero modified lines

#### Scenario: Stub methods stay in the orchestrator

- GIVEN `aceptarCotizacion` and `generarPdfPropuestaFormal` are Fase 4 stubs
- WHEN the split completes
- THEN both remain exported from `cotizacion.service.js` unchanged, not relocated into a layer module

### Requirement: Cache Keys Remain Byte-Identical

The system MUST keep the `withCache` key strings (`catalogoRamo:`, `tasasRamo:`, `tasasObjeto:`, `rpfCuotas`) unchanged during the `cotizacion-context.service.js` extraction (PR 2).

#### Scenario: Cache keys unchanged after context extraction

- GIVEN `withCache` calls using `catalogoRamo:`, `tasasRamo:`, `tasasObjeto:`, `rpfCuotas` in the pre-split service
- WHEN `cotizacion-context.service.js` is extracted
- THEN the same literal key strings appear verbatim in the new module

#### Scenario: No duplicate cache-key definitions introduced

- GIVEN `invalidarCacheCatalogos` (admin) references these same key prefixes
- WHEN a grep for these key strings runs before PR 2 merges
- THEN each key string is defined/used in exactly one module, with no new duplicate definition outside `cotizacion-context.service.js`

### Requirement: RPC Payload Shaping and Call Stay Co-Located

The system MUST keep `armarPayloadDetalle` (payload shaping for `p_cotizacion`/`p_coberturas`/`p_variantes`) and the `crear_cotizacion_atomica`/`actualizar_cotizacion_atomica` RPC calls in the same module (`cotizacion-persistence.service.js`), with no manual compensation logic introduced between them.

#### Scenario: Payload shape identical before and after PR 4

- GIVEN a cotizacion create/update request with fixed inputs
- WHEN the RPC payload is built pre-split and post-split (PR 4)
- THEN `p_cotizacion`, `p_coberturas`, `p_variantes` are structurally identical

#### Scenario: RPC error passthrough unchanged

- GIVEN `crear_cotizacion_atomica` or `actualizar_cotizacion_atomica` returns an error
- WHEN the persistence module handles it after the split
- THEN the error propagates the same way as before, with no manual rollback/compensation step added

### Requirement: Auto Franquicia Relocation Is Byte-Identical

The system MUST relocate `resolverTiposFranquicia` into `cotizacion-pricing.service.js` (PR 3) verbatim, without resolving its existing `TODO Fase 2` or modifying `auto.calculator.js`, because Auto individual remains paused.

#### Scenario: RPF/franquicia regression fixture passes unchanged

- GIVEN the existing byte-identical RPF/franquicia regression fixture test
- WHEN `resolverTiposFranquicia` is moved to `cotizacion-pricing.service.js`
- THEN the fixture test passes with the same assertions, no test edits beyond import paths

#### Scenario: Auto TODO left untouched

- GIVEN the `TODO Fase 2` comment inside `resolverTiposFranquicia`
- WHEN the function is relocated
- THEN the comment and surrounding logic are copied verbatim, not edited or removed

### Requirement: Existing Test Suite Passes After Every PR

The system MUST keep all existing tests (25+ in `cotizacion.service.test.js` / `cotizacion.service.ownership.test.js`, re-scoped per module as needed) green after each PR in the chain, with import-path updates only — no assertion rewrites.

#### Scenario: Full backend suite green per PR

- GIVEN the backend suite is green (154/154) before PR 1
- WHEN each PR (1 through 4, and 5 if taken) merges
- THEN `npm test --prefix backend` remains green with the same assertions

#### Scenario: Test re-scoping does not change coverage

- GIVEN tests are optionally split into per-module files (e.g. `cotizacion-pricing.service.test.js`)
- WHEN the re-scoping happens
- THEN every original assertion still exists in exactly one test file, none dropped

### Requirement: Tests Characterize, They MUST NOT Alter Production Behavior

Tests MUST assert CURRENT behavior of the relocated code. No PR SHALL change production logic; each PR is a verbatim relocation into a new file plus barrel re-export wiring.

#### Scenario: Failing test after relocation is fixed by correcting the import, not the logic

- GIVEN a relocated test fails only due to a stale import path
- WHEN the import path is corrected
- THEN the underlying production logic remains byte-identical to pre-split

### Requirement: Orchestrator Depends on Layer Modules, Never the Reverse

The system MUST wire dependencies in one direction only: `cotizacion.service.js` (orchestrator) imports from the layer modules; no layer module imports back from the orchestrator.

#### Scenario: No import cycle introduced

- GIVEN `cotizacion-context.service.js`, `cotizacion-pricing.service.js`, `cotizacion-persistence.service.js`, `cotizacion-authorization.service.js`, `umbral-inspeccion.service.js`
- WHEN their import graphs are inspected after the full chain lands
- THEN none of them import from `cotizacion.service.js`

## Non-Requirements (Explicit)

- This spec does NOT define new or modified functional capabilities of MRC, Incendio, Vida/AP, or Auto calculators. Existing capability specs (`mrc-plan-descuento-fijo`, `incendio-planes-objeto-riesgo`, `incendio-umbral-inspeccion`, `rpf-por-cuotas`, `cotizacion-moneda`) are unaffected and require no delta.
- Frontend behavior, `frontend/**`, and migrations/`backend/migrations/**` are out of scope and unaffected (proposal "Out of Scope").
- Resolving the Auto Fase 2 franquicia `TODO` is explicitly out of scope; Auto individual stays paused.
