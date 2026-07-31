# Tasks: Permiso de rol para ver el campo Descuento (`permiso-ver-descuento-plan`)

## Review Workload Forecast

| Field                   | Value                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Estimated changed lines | ~180-220 (1 migration ~20, 6 backend files ~2-6 lines each, admin.js ~40-50 lines across 6 anchors, cotizar.js ~4 lines, docs ~10-15) |
| 400-line budget risk    | Low                                                                                                                                   |
| Chained PRs recommended | No                                                                                                                                    |
| Suggested split         | Single PR                                                                                                                             |
| Delivery strategy       | ask-on-risk                                                                                                                           |
| Chain strategy          | pending                                                                                                                               |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal                                                      | Likely PR     | Focused test command        | Runtime harness                                                                     | Rollback boundary                                                                                  |
| ---- | --------------------------------------------------------- | ------------- | --------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1    | Migration + full backend/frontend plumbing + verification | PR 1 (single) | `npm test --prefix backend` | Playwright, `test@test.com` / `a.123456`, rol agente, after admin toggle + re-login | `git revert` the single commit; column stays inert (DEFAULT TRUE) until an explicit N3 DROP COLUMN |

## Phase 0: Pre-flight

- [x] 0.1 Confirmed via orchestrator pre-flight: working tree was clean on `main` except this change's own openspec files (the admin.js/admin.controller.js/admin.routes.js/admin.schema.js uncommitted state noted in git status snapshot was stale — already merged via PR #70). No stash/commit needed; edits anchored on current on-disk state.
- [x] 0.2 Re-listed `backend/migrations/` before writing: max on disk was `049_texto_legal_resp_civil_mrc.sql`, so `050` is free. No collision.

## Phase 1: Migration

- [x] 1.1 Created `backend/migrations/050_permiso_ver_descuento_plan.sql`: `ALTER TABLE roles ADD COLUMN puede_ver_descuento_plan BOOLEAN NOT NULL DEFAULT TRUE;`, no `UPDATE`. Header states COSMETIC nature; N1/N2/N3 rollback block included, mirroring 048's layout.
- [ ] 1.2 **BLOCKED on Kevin's explicit confirmation** — apply migration 050 against real Supabase. NOT applied. After confirmation, verify via Supabase MCP that all existing roles show `puede_ver_descuento_plan = true`.

## Phase 2: Backend plumbing (depends on 1.1 for schema; code itself can be written before 1.2)

- [x] 2.1 `backend/src/repositories/roles.repository.js`: appended `puede_ver_descuento_plan` to `CAMPOS`, `crear()` destructuring, and `.insert({...})` call.
- [x] 2.2 `backend/src/repositories/usuarios.repository.js`: appended `puede_ver_descuento_plan` to `CAMPOS_ROL`; `aplanar()` uses `?? true` (matching column default, diverges intentionally from sibling's `?? false`).
- [x] 2.3 `backend/src/middleware/auth.js`: added `puede_ver_descuento_plan: usuario.puede_ver_descuento_plan,` after `puede_editar_descuento_plan`.
- [x] 2.4 `backend/src/services/admin/roles.service.js`: added `'puede_ver_descuento_plan'` as last element of `PERMISOS_ROL`.
- [x] 2.5 `backend/src/schemas/admin.schema.js`: `crearRolSchema` uses `.default(true)` (diverges from sibling's `.default(false)`); `editarRolSchema` adds `.optional()`, before `activo`.
- [x] 2.6 `backend/src/services/auth.service.js`: added `puede_ver_descuento_plan: usuario.puede_ver_descuento_plan,` in `login()` payload, before `descuento_maximo_pct`.
- [x] 2.7 Ran `npm test --prefix backend` — 166/166 pass. No new dedicated test added (matches 048 precedent: `PERMISOS_ROL` escalation coverage is array-driven/generic).

## Phase 3: Admin panel frontend (`frontend/admin/admin.js`)

- [x] 3.1 `abrirModalRolCrear`: default `puede_ver_descuento_plan: true`.
- [x] 3.2 `abrirModalRolEditar`: populates `Boolean(rol.puede_ver_descuento_plan)`.
- [x] 3.3 `guardarModalRol`: reads `form.puede_ver_descuento_plan.checked` into payload.
- [x] 3.4 Roles table `<th>Ve descuento del plan</th>` added after "Edita descuento del plan", before "Acciones".
- [x] 3.5 Roles table row `<td>` badge cell added, same position as 3.4.
- [x] 3.6 Role modal checkbox added after `puede_editar_descuento_plan` checkbox, label "Puede ver el descuento fijo de un plan".

## Phase 4: Cotizador frontend (`frontend/cotizar/cotizar.js`)

- [x] 4.1 In `renderAjusteField`, added `const oculto = bloqueado && usuario?.puede_ver_descuento_plan === false` right after the `bloqueado` assignment.
- [x] 4.2 Added `if (oculto) return ''` before the `labelId` computation. Recargo path untouched (already gated on `prefijo === 'descuento'`).

## Phase 5: Verification (spec scenarios)

- [ ] 5.1 After 1.2 is applied: confirm every existing role has `puede_ver_descuento_plan = true` and current field-visibility behavior is unchanged (Scenario: defaults to true for all roles).
- [ ] 5.2 Live/Playwright: admin unchecks "Ve descuento del plan" for a chosen non-editable role, saves, confirms badge flips to "No" (Scenario: admin can revoke visibility per role).
- [ ] 5.3 Live/Playwright: open "create role" modal, confirm the checkbox defaults to checked (Scenario: create modal defaults to checked).
- [ ] 5.4 Backend: confirm `crearRol`/`editarRol` reject with 403 when a requester without `puede_ver_descuento_plan` tries to grant it (reuse existing generic escalation test pattern manually or via `npm test --prefix backend`; admin role exempt) (Scenario: privilege escalation guard).
- [ ] 5.5 Live/Playwright with `test@test.com` / `a.123456` (rol agente): after admin disables the permission for `agente` and the test user re-logs in (required — `auth.getUsuario()` is cached), cotizando MRC plan SEGUCOOP no longer shows the Descuento field; Recargo field still renders (Scenario: non-editable + no view → field hidden).
- [ ] 5.6 Live/Playwright: same flow with `puede_ver_descuento_plan = true` (default) and `puede_editar_descuento_plan = false` — Descuento field still renders disabled, prefilled, hint "Descuento fijo del plan" (Scenario: non-editable + view → unchanged).
- [ ] 5.7 Confirm the generated Carta Oferta PDF still shows the 10% discount line for both visibility states (Scenario: server-side computation unaffected by view permission).
- [ ] 5.8 A role that keeps `puede_editar_descuento_plan = true` still sees the field editable regardless of `puede_ver_descuento_plan` (Scenario: editable role unaffected).
- [ ] 5.9 Run `npm test --prefix backend` full suite green as final regression gate.

## Phase 6: Docs

- [ ] 6.1 Update `docs/ESTADO_PROYECTO.md` with a new status entry (migration 050 applied — only after Kevin confirms — plumbing, verification results).
- [ ] 6.2 Update `CLAUDE.md` "Estado actual del proyecto" per project convention.
