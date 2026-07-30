# Apply Progress: mrc-plan-descuento-fijo (PR1 + PR2 of 2)

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

## PR2 — Frontend (this run)

**Branch**: `sdd/mrc-plan-descuento-fijo-frontend`, created off `sdd/mrc-plan-descuento-fijo-backend` (local, NOT pushed). Not yet committed as of writing this section — see commit hash appended by the same `sdd-apply` run right after this file is saved.

### Completed Tasks (this run)

- [x] 3.1 `frontend/admin/admin.js` — `puede_editar_descuento_plan` checkbox added to `abrirModalRolCrear`/`abrirModalRolEditar`/`guardarModalRol` (Roles section modal, NOT the user edit form — per design.md correction), plus a new "Edita descuento del plan" badge column in the Roles table (`renderTablaRoles`, header + row).
- [x] 3.2 `frontend/cotizar/cotizar.js` — `state.data.descuentoPorcentaje = plan?.descuento_default ?? null` added at initial ramo load (next to `cuotas_default`, ~line 582) and in `selectPlan` (~line 614).
- [x] 3.3 `frontend/cotizar/cotizar.js` — `renderAjusteField`: computed `bloqueado = prefijo === 'descuento' && plan?.descuento_default != null && !usuario?.puede_editar_descuento_plan`, added to `disabled` on both the Monto and Porcentaje inputs, and helper text switches to "Descuento fijo del plan" when `bloqueado` is true (falls back to existing tope text otherwise).
- [x] 4.3 Updated `docs/ESTADO_PROYECTO.md` (new section 39) and `CLAUDE.md` ("Estado actual del proyecto") with the PR1+PR2 summary.

### Deferred (not this run — orchestrator's separate step)

- [ ] 4.1 Manual verification via `run-cotizador` skill: login as test user (no permission), select new MRC plan, confirm field locked at 10%, prima reflects 10%.
- [ ] 4.2 Manual verification: grant `puede_editar_descuento_plan` via admin Roles, re-login, confirm field editable and custom discount respected within caps.

### Safety check

`npm test --prefix backend` re-run after the frontend edits: **166/166 green**, no regressions (frontend-only change, as expected).

### Deviations from Design

None. Badge column in the Roles table (tasks.md 3.1 and design.md's file table both call for it) was included even though the orchestrator's instructions for this run didn't explicitly restate it — kept for consistency with the checked-in task list and to avoid a half-finished permission UI (4 other permissions already show a badge column).

## Workload / PR Boundary

- Mode: stacked-to-main, PR2 of 2, targets `sdd/mrc-plan-descuento-fijo-backend` (not `main`)
- Current work unit: Unit 2 (admin Roles checkbox + cotizador prefill/lock + docs) — COMPLETE except the two manual verification checkboxes (explicitly out of scope for this run)
- Boundary: starts from `sdd/mrc-plan-descuento-fijo-backend` @ `e60a35b`, branch `sdd/mrc-plan-descuento-fijo-frontend` created off it. Neither branch pushed, no PRs opened — Kevin will push/PR both.
- Rollback: revert the PR2 commit; no schema change, purely UI + docs.

## Status

PR1: 17/20 Phase 1+2 tasks complete (1.6 deliberately deferred, explicit gate).
PR2: Phase 3 fully complete (3/3), Phase 4 docs task complete (1/1), manual verification (4.1/4.2) remaining — next step is the orchestrator's `run-cotizador` verification pass, then `sdd-verify`.
