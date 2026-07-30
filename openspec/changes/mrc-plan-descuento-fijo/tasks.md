# Tasks: MRC — plan con descuento fijo del 10% y permiso de rol

## Review Workload Forecast

| Field                   | Value                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | 350–450 (10+ files: migration, service, 2 calculators, auth/repos/schemas, admin+cotizador frontend, 3+ test files, docs)                                      |
| 400-line budget risk    | High                                                                                                                                                           |
| Chained PRs recommended | Yes                                                                                                                                                            |
| Suggested split         | PR 1 (backend: migration + service + calculators + auth/repos/schemas + backend tests) → PR 2 (frontend: admin Roles checkbox + cotizador prefill/lock + docs) |
| Delivery strategy       | ask-on-risk                                                                                                                                                    |
| Chain strategy          | pending                                                                                                                                                        |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                                                                    | Likely PR | Focused test command                              | Runtime harness                                                                    | Rollback boundary                                                      |
| ---- | ------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | Migration 046 + `resolverDescuentos` + calculator tope guard + role/permission plumbing + backend tests | PR 1      | `npm test --prefix backend -- cotizacion.service` | N/A — logic covered by Vitest; no live cotización flow needed until frontend lands | Revert commit; migration is additive, not yet applied to real Supabase |
| 2    | Admin Roles checkbox + cotizador prefill/lock + docs update                                             | PR 2      | `npm test --prefix backend` (regression)          | run-cotizador skill: login, select plan, verify field lock/unlock                  | Revert commit; no schema change, purely UI                             |

## Phase 1: Migration (Foundation)

- [x] 1.1 Write `backend/migrations/046_plan_mrc_descuento_fijo.sql`: `ALTER TABLE roles ADD COLUMN puede_editar_descuento_plan BOOLEAN NOT NULL DEFAULT FALSE`
- [x] 1.2 In same file: `UPDATE roles SET puede_editar_descuento_plan = TRUE WHERE nombre = 'admin'`
- [x] 1.3 In same file: `INSERT INTO planes (...)` new MRC plan row, placeholder name, `descuento_default = 10`, `descuento_maximo = 10`, `cotizacion_combinada = FALSE`
- [x] 1.4 In same file: `plan_formas_pago` rows via `CROSS JOIN (VALUES ...)` pattern from `012_seed_mrc.sql` — contado `habilitada=TRUE, tasa_rpf=0`; cobrador/boca_cobranza/tarjeta `habilitada=FALSE`
- [x] 1.5 Add header comment explaining `descuento_default` reuse and the `cotizacion_combinada` guard; add N1/N2/N3 rollback statements as comments
- [ ] 1.6 Flag task (not auto-run): apply migration via `mcp__supabase__apply_migration` ONLY after Kevin confirms plan name/roles/coverages — do not execute in this change (explicitly NOT applied against Supabase in this apply run, per instructions)

## Phase 2: Backend Core (TDD)

- [x] 2.1 RED: unit test for `resolverDescuentos` — no `descuento_default` → body untouched; with permission → body untouched; without permission → forces 10%, ignores body; `cotizacion_combinada=true` → never forces
- [x] 2.2 GREEN: implement `resolverDescuentos({plan, descuentosBody, usuario})` in `backend/src/services/cotizacion.service.js`, wire into `construirVariantes` (~line 470-480)
- [x] 2.3 RED: unit test on `mrc.calculator.js` — `forzadoPorPlan=true` + `usuario.descuento_maximo_pct=5` → 10% applied in full; `forzadoPorPlan=false` → clamps to 5% (no-regression)
- [x] 2.4 GREEN: `mrc.calculator.js:236` — `topeEfectivo(plan.descuento_maximo, forzadoPorPlan ? null : usuario?.descuento_maximo_pct)`, `forzadoPorPlan` default `false`
- [x] 2.5 Apply same one-line change to `incendio.calculator.js` for symmetry (inert today, no `descuento_default` seeded there)
- [x] 2.6 RED: security test — `POST /cotizaciones/calcular`, user without permission sends `descuentos:[{porcentaje:5}]` for the new MRC plan → response prima reflects 10%, not 5% (implemented at service layer via `calcularPreview`, the function the controller calls — see design.md testing strategy)
- [x] 2.7 GREEN: confirm 2.2/2.4 satisfy 2.6; adjust wiring if body still leaks through (confirmed — no additional wiring needed)
- [x] 2.8 Add `puede_editar_descuento_plan` to `CAMPOS` in `backend/src/repositories/roles.repository.js`
- [x] 2.9 Add `puede_editar_descuento_plan` to `CAMPOS_ROL` and `aplanar()` (`?? false`) in `backend/src/repositories/usuarios.repository.js`
- [x] 2.10 Add `puede_editar_descuento_plan` to `req.usuario` assembly in `backend/src/middleware/auth.js` (~line 39-50)
- [x] 2.11 Add `puede_editar_descuento_plan` to `PERMISOS_ROL` in `backend/src/services/admin/roles.service.js`
- [x] 2.12 Add `puede_editar_descuento_plan` to `crearRolSchema` (`.default(false)`) and `editarRolSchema` (`.optional()`) in `backend/src/schemas/admin.schema.js`
- [x] 2.13 Add `puede_editar_descuento_plan` to the login response `usuario` object in `backend/src/services/auth.service.js` (~line 54-68)
- [x] 2.14 RED+GREEN: regression test proving `resolverTiposFranquicia` (Auto, `cotizacion_combinada=true`) is unaffected by 2.2/2.4
- [x] 2.15 Run `npm test --prefix backend` — confirm 154 pre-existing tests plus new ones all green (166/166 green)

## Phase 3: Frontend

- [x] 3.1 `frontend/admin/admin.js` — add `puede_editar_descuento_plan` checkbox in `abrirModalRolCrear`/`Editar`/`guardarModalRol`, plus a badge column in the Roles table
- [x] 3.2 `frontend/cotizar/cotizar.js` — prefill `state.data.descuentoPorcentaje = plan?.descuento_default ?? null` at load (~line 582) and in `selectPlan` (~610-621)
- [x] 3.3 `frontend/cotizar/cotizar.js` — in `renderAjusteField` (~1950), compute `bloqueado = prefijo === 'descuento' && plan?.descuento_default != null && !usuario?.puede_editar_descuento_plan` and add to the existing `disabled` conditions on both inputs (~1988, ~1996); add helper text "Descuento fijo del plan"

## Phase 4: Verification & Docs

- [ ] 4.1 Manual verification via `run-cotizador` skill: login as test user (no permission), select new MRC plan, confirm only Contado shown, field shows 10% and is locked, resulting prima reflects 10%
- [ ] 4.2 Manual verification: grant `puede_editar_descuento_plan` via admin Roles, re-login, confirm field becomes editable and a custom discount is respected within caps
- [x] 4.3 Update `docs/ESTADO_PROYECTO.md` and `CLAUDE.md` with the change summary, noting migration 046 is committed but NOT applied to Supabase pending plan-name confirmation
