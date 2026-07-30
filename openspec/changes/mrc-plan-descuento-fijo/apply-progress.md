# Apply Progress: mrc-plan-descuento-fijo (PR1 of 2 — backend)

**Branch**: `sdd/mrc-plan-descuento-fijo-backend` (off `main` at `73da353`, targets `main` directly per stacked-to-main chain strategy — PR2 will target this branch).
**Commit**: `e60a35b` — "feat(mrc): descuento fijo del 10% por plan + permiso de rol (backend)"
**Mode**: Strict TDD (RED→GREEN for every backend behavior rule).

## Scope of this run

Phase 1 (migration) + Phase 2 (backend core) from `tasks.md` ONLY. Phase 3 (frontend) and Phase 4 (manual verification + docs) are explicitly OUT of scope — deferred to PR2, a later separate `sdd-apply` run.

## Completed Tasks

- [x] 1.1–1.5 `backend/migrations/046_plan_mrc_descuento_fijo.sql` written and committed.
- [ ] 1.6 NOT applied to real Supabase — explicitly deferred, awaiting Kevin's confirmation of the plan name.
- [x] 2.1–2.15 all done (see tasks.md for detail).

## Files Changed

| File                                                 | Action   | What Was Done                                                                     |
| ---------------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| `backend/migrations/046_plan_mrc_descuento_fijo.sql` | Created  | Permission column + new MRC plan + plan_formas_pago rows, NOT applied to Supabase |
| `backend/src/services/cotizacion.service.js`         | Modified | Added exported `resolverDescuentos()`, wired into `construirVariantes`            |
| `backend/src/services/cotizacion.service.test.js`    | Modified | 7 unit tests + 2 security integration tests + 1 Auto regression test              |
| `backend/src/calculators/mrc.calculator.js`          | Modified | `forzadoPorPlan` param, neutralizes user tope in `topeEfectivo()`                 |
| `backend/src/calculators/mrc.calculator.test.js`     | Modified | 2 new tests: forced full 10% vs clamped-to-5% no-regression                       |
| `backend/src/calculators/incendio.calculator.js`     | Modified | Same one-liner for symmetry (inert today)                                         |
| `backend/src/repositories/roles.repository.js`       | Modified | `puede_editar_descuento_plan` in CAMPOS + crear()                                 |
| `backend/src/repositories/usuarios.repository.js`    | Modified | `puede_editar_descuento_plan` in CAMPOS_ROL + aplanar()                           |
| `backend/src/middleware/auth.js`                     | Modified | `puede_editar_descuento_plan` in req.usuario                                      |
| `backend/src/services/admin/roles.service.js`        | Modified | `puede_editar_descuento_plan` in PERMISOS_ROL                                     |
| `backend/src/schemas/admin.schema.js`                | Modified | `puede_editar_descuento_plan` in crearRolSchema/editarRolSchema                   |
| `backend/src/services/auth.service.js`               | Modified | `puede_editar_descuento_plan` in login response                                   |
| `openspec/changes/mrc-plan-descuento-fijo/tasks.md`  | Modified | Phase 1/2 checkboxes marked `[x]` (except 1.6, deliberately unchecked)            |

## TDD Cycle Evidence

| Task                                  | Test File                    | Layer                                           | Safety Net                    | RED                        | GREEN     | TRIANGULATE                   | REFACTOR |
| ------------------------------------- | ---------------------------- | ----------------------------------------------- | ----------------------------- | -------------------------- | --------- | ----------------------------- | -------- |
| 2.1/2.2 resolverDescuentos            | `cotizacion.service.test.js` | Unit                                            | ✅ 154/154 baseline           | ✅ Written (import failed) | ✅ Passed | ✅ 7 cases                    | ✅ Clean |
| 2.3/2.4 mrc.calculator forzadoPorPlan | `mrc.calculator.test.js`     | Unit                                            | ✅ 46/46 pre-existing in file | ✅ Written (72600≠145200)  | ✅ Passed | ✅ 2 cases                    | ✅ Clean |
| 2.6/2.7 security bypass               | `cotizacion.service.test.js` | Integration (mocked repos, real mrc calculator) | N/A (new)                     | ✅ Written                 | ✅ Passed | ✅ 2 cases                    | ✅ Clean |
| 2.14 Auto regression                  | `cotizacion.service.test.js` | Integration                                     | N/A (new)                     | ✅ Written                 | ✅ Passed | ➖ Single scenario sufficient | ✅ Clean |

## Test Summary

- Total tests written: 12
- Total tests passing: 166/166 (154 pre-existing + 12 new) — `npm test --prefix backend`
- Pure functions created: 1 (`resolverDescuentos`)

## Deviations from Design

None — implementation matches `design.md` exactly (Decision 1 service-layer enforcement, Decision 2 user-tope neutralization only, Decision 3 `!cotizacion_combinada` guard).

## Issues Found

None. Task 2.6's security bypass test was implemented at the `calcularPreview` service-layer boundary (the function the controller directly calls) rather than a full HTTP supertest — matches `design.md`'s testing strategy table and the existing convention in this test file (no HTTP-layer tests exist there today).

## Remaining Tasks (PR2 — frontend, separate `sdd-apply` run)

- [ ] 3.1 `frontend/admin/admin.js` — checkbox + badge column for `puede_editar_descuento_plan` in Roles section
- [ ] 3.2 `frontend/cotizar/cotizar.js` — prefill `descuentoPorcentaje` from `plan.descuento_default`
- [ ] 3.3 `frontend/cotizar/cotizar.js` — `renderAjusteField` disabled/lock logic + helper text
- [ ] 4.1–4.2 Manual verification via `run-cotizador` skill
- [ ] 4.3 Update `docs/ESTADO_PROYECTO.md` and `CLAUDE.md`

## Workload / PR Boundary

- Mode: stacked-to-main, PR1 of 2
- Current work unit: Unit 1 (migration + resolverDescuentos + calculator tope guard + role/permission plumbing + backend tests) — COMPLETE
- Boundary: starts from `main` @ `73da353`, ends at commit `e60a35b` on `sdd/mrc-plan-descuento-fijo-backend`. Branch NOT pushed, no PR opened.
- Rollback: revert the single commit; migration is additive and not yet applied to Supabase.

## Status

17/20 Phase 1+2 tasks complete (only 1.6 deliberately deferred — not a failure, an explicit gate). Ready for verify (backend scope) / ready for PR2 apply (frontend scope).
