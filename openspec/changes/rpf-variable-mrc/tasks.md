# Tasks: RPF variable por cantidad de cuotas (MRC/Incendio/Vida-AP)

## Review Workload Forecast

| Field                   | Value                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Estimated changed lines | ~650-800 (migration ~90, backend ~220, admin backend ~110, admin frontend ~200, tests ~200+)   |
| 400-line budget risk    | High                                                                                           |
| Chained PRs recommended | Yes                                                                                            |
| Suggested split         | PR 1 (migration) -> PR 2 (backend resolution + regression tests) -> PR 3 (admin endpoint + UI) |
| Delivery strategy       | ask-on-risk                                                                                    |
| Chain strategy          | pending                                                                                        |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                                                                       | Likely PR    | Focused test command                                                                  | Runtime harness                                                                                                                                 | Rollback boundary                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Migration `058_rpf_por_cuotas.sql`: table + flag + 33-row seed, applied and verified against real Supabase | PR 1         | `backend/scripts/verificar-numeracion-migraciones.js` + manual SQL SELECT count(*)=33 | Supabase MCP query against real project (read-only SELECT)                                                                                      | `UPDATE ramos SET usa_rpf_por_cuotas = FALSE` reverts instantly; table itself is additive, DROP TABLE rpf_cuotas is a clean separate rollback                                             |
| 2    | `resolverTasaRpf()` + `construirVariantes` integration + Auto regression test + 422 range validation       | PR 2         | `npm test --prefix backend -- cotizacion.service`                                     | `npm test --prefix backend` (full suite, must stay green pre/post)                                                                              | Revert `resolverTasaRpf` call site in `construirVariantes` back to direct `plan_formas_pago.tasa_rpf` read; flag stays FALSE from PR1 rollback so no live effect even if code ships early |
| 3    | Admin bulk endpoint (`PUT /admin/rpf-cuotas`, schema, service, controller, route)                          | PR 3a (or 3) | `npm test --prefix backend -- admin`                                                  | Playwright: role with `puede_editar_planes` edits a cell, cotización reflects it; role without permission gets 403                              | Remove route registration in `admin.routes.js`; no data mutation risk, endpoint is additive                                                                                               |
| 4    | Admin UI (`render/rpf-cuotas.js`, wiring in `render/planes.js`, remove old `tasa_rpf` input for 3 ramos)   | PR 3b (or 3) | N/A (frontend, no unit test harness in repo)                                          | Playwright: grid renders/saves for MRC/Incendio/Vida-AP; old scalar input absent for those 3 ramos; Auto still shows old scalar input unchanged | Revert `render/planes.js` diff restores old scalar input; grid file removal is self-contained                                                                                             |

## Phase 1: Migration & Data Foundation

- [x] 1.1 Verify migration number 058 is still free in `backend/migrations/` (re-check before opening PR — history shows 046/048 collisions). — confirmed free, last file was `057_telefono_usuarios.sql`.
- [x] 1.2 Write `backend/migrations/058_rpf_por_cuotas.sql`: create `rpf_cuotas(id, forma_pago_id, cuotas, tasa_rpf, UNIQUE(forma_pago_id, cuotas))`, add `ramos.usa_rpf_por_cuotas BOOLEAN NOT NULL DEFAULT FALSE`.
- [x] 1.3 Seed 33 rows (cuotas 1-11 × Cobrador/Aquí Pago/Tarjeta de Crédito) with exact 4-decimal values from source Hoja4, including literal 0 rows for Tarjeta @ 1-2 cuotas.
- [x] 1.4 Add header comment in the migration documenting it reverts the 2026-07-13 decision in `002_ramos_planes.sql:38-39` and `023_rpf_incendio_y_vida_ap.sql:2-7`.
- [x] 1.5 (Scope amended by explicit user instruction for this invocation) — the flag `usa_rpf_por_cuotas` stays `FALSE` for the 3 ramos in THIS migration; no `UPDATE ... TRUE` statement was added. The design's "deploy code first, then migration flip" rollout order is honored by splitting the flip into PR2, alongside the code that reads the curve, instead of gating a same-file UPDATE on deploy order. Documented inline in the migration's header comment.
- [x] 1.6 Apply migration against real Supabase (via Supabase MCP or CLI) and verify: 33 rows in `rpf_cuotas`, correct flag state, Cobrador@11=9.5%, Cobrador@3=1.6889, boca_cobranza@5=3.04%, Tarjeta@1=0, Tarjeta@3=0.8%. — **DONE by the orchestrator** (2026-08-05, Engram #396): verified via `execute_sql` — 33 rows in `rpf_cuotas`, 0 ramos with `usa_rpf_por_cuotas = TRUE` (flag inert as designed), Cobrador@11=9.5000, Tarjeta@2=0.0000, matching Hoja4.
- [x] 1.7 Run `npm run verify:migrations` to confirm no numbering collision. — `OK: 58 migraciones, sin colisiones de numeración.`

## Phase 2: Core Resolution Logic

- [x] 2.1 RED: write failing unit test in `backend/src/services/cotizacion.service.test.js` for `resolverTasaRpf()` — flagged ramo + valid cuotas returns curve value (no mocks, pure function).
- [x] 2.2 RED: write failing test — `resolverTasaRpf()` for non-flagged ramo (Auto) returns legacy `plan_formas_pago.tasa_rpf` scalar unchanged (also asserts it stays constant across cuotas=3 and cuotas=11).
- [x] 2.3 RED: write failing test — `resolverTasaRpf()` for `contado` forma de pago bypasses curve, returns 0 regardless of ramo flag.
- [x] 2.4 RED: write failing test — `resolverTasaRpf()` for flagged ramo with `cuotas = 0` on a financed forma de pago returns 0 (explicit behavior-change scenario per design decision #4).
- [x] 2.5 RED: write failing test — `resolverTasaRpf()` for flagged ramo with `cuotas > MAX(rpf_cuotas.cuotas)` throws/signals 422 condition, no clamp.
- [x] 2.6 GREEN: implement `resolverTasaRpf()` in `backend/src/services/cotizacion.service.js` next to `resolverDescuentos` — reads `ramo.usa_rpf_por_cuotas`, looks up `(formas_pago.codigo, cuotas)` in the loaded curve, else returns legacy scalar. Also added a 6th test: Tarjeta de Crédito @ 1 cuota returns the literal 0 row (not "missing").
- [x] 2.7 GREEN: out-of-range validation lives inside `resolverTasaRpf()` itself (curve miss → `httpError(422)`) rather than as a separate pre-check before `tiposFranquicia.map` — same observable behavior (throws before any variant/premio is returned to the caller), fewer moving parts. Documented deviation from design.md's literal wording.
- [x] 2.8 GREEN: wired `resolverTasaRpf()` into `construirVariantes` (`cotizacion.service.js`) replacing the direct `plan_formas_pago.tasa_rpf` read, without changing `calcularPlanPago`'s input contract (still `{codigo, tasa_rpf}`).
- [x] 2.9 Added `findCurvaRpf()` to `backend/src/repositories/ramos.repository.js`. Loaded via `withCache('rpfCuotas', ...)` in `construirVariantes`, only when `ramo.usa_rpf_por_cuotas` is true (Auto never pays this extra query).
- [x] 2.10 RED+GREEN: Auto regression test — fixed input set (financed forma de pago "Cobrador", not contado) with hand-derived Premio/RPF/IVA/Inicial/Cuota values, asserting the escalar legacy path is byte-identical to pre-change behavior; also mocks `findCurvaRpf()` to throw if invoked, proving Auto never touches the curve. RPF-unchanged-across-cuotas covered in the `resolverTasaRpf` unit test (2.2) rather than a second full integration test — Auto's schema doesn't accept a `cuotas` field in the request body, so a full end-to-end variant would need to bypass schema validation to prove the same point already proven at the unit level.
- [x] 2.11 Ran full backend suite (`npm test --prefix backend`): 201/201 green, plus explicitly re-ran `ramo-calculator.contract.test.js` standalone (16/16 green, zero diff — calculator signature untouched).

**Migration 059**: `backend/migrations/059_activar_rpf_por_cuotas.sql` flips `usa_rpf_por_cuotas = TRUE` for `mrc`/`incendio`/`vida-ap`, shipped in the SAME PR as this code (per design.md rollout order) — **not yet applied against real Supabase**, needs the orchestrator's Supabase MCP access (same as migration 058/PR1).

## Phase 3: Admin Backend

- [ ] 3.1 RED: write failing test for `editarCurvaRpfSchema` (Zod, `backend/src/schemas/admin.schema.js`) — validates 33-cell bulk payload shape, rejects malformed cells.
- [ ] 3.2 GREEN: implement `editarCurvaRpfSchema`.
- [ ] 3.3 Add `upsertCurvaRpf()` to `backend/src/repositories/tasas.repository.js` — single atomic bulk upsert of all submitted cells.
- [ ] 3.4 Add service method in `backend/src/services/admin/planes.service.js` (or equivalent) calling `upsertCurvaRpf()` then `invalidarCacheCatalogos()`.
- [ ] 3.5 Add `PUT /admin/rpf-cuotas` route in `backend/src/routes/admin.routes.js`, gated by `requirePlanesEdit` (`puede_editar_planes`) — NOT literal admin.
- [ ] 3.6 Add controller handler in `backend/src/controllers/admin.controller.js` wiring schema + service.
- [ ] 3.7 RED+GREEN: integration test — role with `puede_editar_planes` can PUT and persist; role without permission gets 403, no persistence.

## Phase 4: Admin UI

- [ ] 4.1 Create `frontend/admin/render/rpf-cuotas.js` — standalone panel above the Planes table (not inside per-plan "Formas de pago" subrow), renders 33-cell grid (11 cuotas × 3 formas de pago).
- [ ] 4.2 Wire panel state/fetch in `frontend/admin/state.js` and mount point.
- [ ] 4.3 Implement bulk save (single PUT call, not per-cell) with success/error feedback.
- [ ] 4.4 Update `frontend/admin/render/planes.js` (~L100, L232) to remove the old `tasa_rpf` scalar input for plans belonging to mrc/incendio/vida-ap; keep it unchanged for Auto/Auto-Flota.

## Phase 5: Spec Scenario Coverage & Live Verification

- [ ] 5.1 Test: same curve applies across MRC/Incendio/Vida-AP (Cobrador@11 = 9.5% for all three).
- [ ] 5.2 Test: curve values match source exactly (Cobrador@3 = 1.6889).
- [ ] 5.3 Test: boca_cobranza@5 cuotas = 3.04%.
- [ ] 5.4 Test: contado bypasses curve entirely, always RPF=0.
- [ ] 5.5 Test: Tarjeta@1 = 0.
- [ ] 5.6 Test: Tarjeta@3 = 0.8% (non-zero, confirms rule is cuotas-scoped).
- [ ] 5.7 Test: 12 cuotas rejected with 422, no Premio computed.
- [ ] 5.8 Test: 11 cuotas is the accepted max.
- [ ] 5.9 Test: permitted role edits a cell, next cotización reflects it without deploy.
- [ ] 5.10 Test: role without `puede_editar_planes` gets 403, no persistence.
- [ ] 5.11 Test: old scalar `tasa_rpf` input confirmed absent from admin UI for MRC/Incendio/Vida-AP plans (grid shown instead).
- [ ] 5.12 Test: Auto Premio byte-identical pre/post change for fixed input set.
- [ ] 5.13 Test: Auto RPF does not vary when cuotas changes 3->11.
- [ ] 5.14 Test: Auto admin UI keeps old scalar input unchanged (not migrated).
- [ ] 5.15 Live Playwright matrix: MRC x financed forma de pago, Incendio x financed forma de pago, Vida-AP x financed forma de pago (at least 1 case each), plus the 422 case (cuotas=12) and the Auto-unchanged case, against the real dev environment.
- [ ] 5.16 Confirm zero console/network errors during the live matrix; update `docs/ESTADO_PROYECTO.md` and `CLAUDE.md` per project convention once verified.
