# Design: Split de `cotizacion.service.js` por capa funcional

Mirror artifact: Engram `sdd/cotizacion-service-split/design`. Input: proposal (#731), exploration (#726).

## Technical Approach

Pure relocation into 4-5 layer modules under `backend/src/services/`. `cotizacion.service.js` survives as a **barrel/orchestrator**: it keeps the 8 public functions the controller calls and re-exports relocated symbols with `export { x } from './y.js'`, so `cotizaciones.controller.js` and both test files keep their current import specifiers. Dependencies flow in one direction only, so every PR compiles and tests green on its own.

## Function-to-file map

| New file                                        | Symbols moved                                                                                                                                         | Exports                                   |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `umbral-inspeccion.service.js`                  | `resolverUmbralInspeccion`                                                                                                                            | named                                     |
| `cotizacion-authorization.service.js`           | `verificarPropiedad`                                                                                                                                  | named                                     |
| `cotizacion-context.service.js`                 | `validarYResolverContexto` + `resolverContextoRepositorios` (merged, one file)                                                                        | named (both)                              |
| `cotizacion-pricing.service.js`                 | `construirVariantes`, `resolverTiposFranquicia`, `resolverCuotas`, `resolverDescuentos`, `resolverTasaRpf`                                            | named (all 5)                             |
| `cotizacion-persistence.service.js`             | `armarPayloadDetalle`, `crearCotizacion`, `actualizarCotizacion`, `VENTANA_EDICION_MS`                                                                | `crearCotizacion`, `actualizarCotizacion` |
| `cotizacion-oferta.service.js` (PR 5, optional) | `generarPdfOferta`                                                                                                                                    | named                                     |
| `cotizacion.service.js`                         | keeps `calcularPreview`, `listarCotizaciones`, `obtenerCotizacion`, `generarPdfOferta` (until PR 5), `aceptarCotizacion`, `generarPdfPropuestaFormal` | re-exports the rest                       |

## Import graph (acyclic, single direction)

```
tipo-cambio.service ─→ umbral-inspeccion ─→ cotizacion-context ─┐
                                                                ├─→ cotizacion-pricing ─→ cotizacion-persistence ─┐
cotizacion-authorization ───────────────────────────────────────┘                                                  │
                                                                                          cotizacion.service (barrel) ←┘
```

`cotizacion.service.js` imports downward only; no module imports the barrel. `cotizacion-authorization` is a leaf consumed by the barrel (`obtenerCotizacion`, `generarPdfOferta`) and by `cotizacion-persistence` (`actualizarCotizacion`).

## Architecture Decisions

| Decision                | Choice                                                                                           | Alternatives rejected                                                                         | Rationale                                                                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barrel style            | Static named re-export (`export { crearCotizacion } from './cotizacion-persistence.service.js'`) | Proxy wrappers (`export async function crearCotizacion(...a){return impl(...a)}`); `export *` | Zero extra frames, identical signatures/arity, and no hand-written passthrough to drift. `export *` is rejected: it hides the public surface and would leak internals like `armarPayloadDetalle`. |
| Test mock compatibility | Keep mocking repositories (not service functions) via `t.mock.module(specifier)`                 | Mock the new service modules                                                                  | `node:test` module mocking resolves by module specifier, so repository mocks keep working no matter which file imports them. Mocking the new services would couple tests to the split itself.     |
| Context merge           | One `cotizacion-context.service.js`                                                              | Issue #165's two files (`context` + `repository-context`)                                     | There is a single cohesive unit; the `switch(ramo.calculador)` has no internal seam.                                                                                                              |
| Payload + RPC           | `armarPayloadDetalle` stays in `cotizacion-persistence.service.js` with both RPC calls           | Its own `cotizacion-payload.service.js`                                                       | Protects the migración-052 "no manual compensation" invariant: shape and call are one contract.                                                                                                   |
| Auto franquicia         | `resolverTiposFranquicia` moved verbatim, `TODO Fase 2` comment included                         | Fix the TODO while moving                                                                     | Auto is paused; the byte-identical RPF fixture test is the guard.                                                                                                                                 |
| Cache keys              | Key strings moved verbatim                                                                       | Extract key builders/constants                                                                | See finding below.                                                                                                                                                                                |

## Cache-key finding (resolves the proposal's pre-PR-2 grep)

Grep executed. `invalidarCacheCatalogos()` in `services/cache.js:42` does `store.clear()` — it is **key-agnostic**, so admin invalidation cannot desync from a moved key. The real coupling is different: `services/ramos.service.js:29` already builds the identical key `` `catalogoRamo:${ramoId}` `` and therefore **shares a cache entry** with the context module. The key strings must move byte-identical to preserve that shared hit; do not extract them into constants in this change (that would be a behavior-adjacent refactor outside scope). Residual risk downgraded Med → Low.

## Test re-organization per PR

Mocks target repositories, so only import specifiers change; assertions stay identical.

| PR  | Test action                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | None. `cotizacion.service.ownership.test.js` keeps importing the barrel (`verificarPropiedad` is internal, exercised through `obtenerCotizacion`/`generarPdfOferta`/`actualizarCotizacion`).                                                                                                                                                                    |
| 2   | None. Context is internal; `calcularPreview` tests still drive it end to end.                                                                                                                                                                                                                                                                                   |
| 3   | `resolverDescuentos`/`resolverTasaRpf` describes move to `cotizacion-pricing.service.test.js`, importing `./cotizacion-pricing.service.js` directly; the three `construirVariantes (vía calcularPreview)` describes — including the byte-identical Auto RPF fixture — stay in `cotizacion.service.test.js` because they assert through the public preview path. |
| 4   | The 6 top-level `crearCotizacion`/`actualizarCotizacion`/`calcularPreview`-never-persists tests move to `cotizacion-persistence.service.test.js`; `calcularPreview no persiste nada` stays with the barrel (it asserts the preview path, not persistence).                                                                                                      |
| 5   | `generarPdfOferta` ownership describe moves to `cotizacion-oferta.service.ownership.test.js` only if the module is created.                                                                                                                                                                                                                                     |

## Per-PR independence

Each PR: (a) creates the new file(s) with verbatim bodies, (b) deletes them from `cotizacion.service.js`, (c) adds imports/re-exports so the public surface is unchanged, (d) runs `npm test --prefix backend` green. No intermediate PR leaves a dangling reference because a symbol is only deleted in the same commit that adds its import. Because the dependency chain is strictly downward, PR N never needs PR N+1. Feature Branch Chain: PR 1 → feature branch; PR N targets PR N-1's branch.

**Budget note**: PR 3 is the budget risk (~220 relocated lines ≈ 440 changed). If it exceeds 400, slice into 3a (pure functions `resolverDescuentos`/`resolverTasaRpf`/`resolverCuotas`) and 3b (`construirVariantes` + `resolverTiposFranquicia`). PR 4 slices the same way (payload shaping vs. RPC orchestration) **only if** both halves land in the same file.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Pure intra-package module relocation.

## Migration / Rollout

No migration. No DB, API, or UI change. Rollback = `git revert` per PR in reverse chain order.

## Open Questions

- [ ] PR 5 (PDF orchestration) in scope or deferred? Assumption: decide after PR 4 based on the barrel's line count.
- [ ] Confirm test re-scoping into per-module files is acceptable (assumption: yes, same assertions).
