# Delta for Mrc Plan Descuento Fijo

## ADDED Requirements

### Requirement: Role permission for viewing plan discount field

The system MUST define permission `puede_ver_descuento_plan` as a boolean column on `roles`, following the same role-based permission model as `puede_editar_descuento_plan` (migration 031/048 pattern). This permission is purely cosmetic: it controls whether the Descuento field renders in the cotizador UI and MUST NOT influence the discount value applied server-side.

#### Scenario: Permission defaults to true for all roles

- GIVEN a migration adding `puede_ver_descuento_plan` to `roles` as `NOT NULL DEFAULT TRUE`, with no `UPDATE` statement
- WHEN the migration runs
- THEN every existing role, including `agente`, MUST have `puede_ver_descuento_plan = TRUE`
- AND current field-visibility behavior MUST be unchanged immediately after the migration

#### Scenario: Admin can revoke visibility per role

- GIVEN an admin user viewing the Roles section of the admin panel
- WHEN they uncheck the "Ver descuento del plan" checkbox for a role and save
- THEN the backend MUST persist `puede_ver_descuento_plan = false` for that role via the roles update endpoint
- AND the roles table MUST display a badge reflecting the current value for that permission

#### Scenario: Role create modal defaults the checkbox to checked

- GIVEN an admin opens the "create role" modal
- WHEN the modal renders
- THEN the "Ver descuento del plan" checkbox MUST default to checked, matching the DB-level `DEFAULT TRUE`

#### Scenario: Privilege escalation guard covers the new permission

- GIVEN a non-admin requester whose own role has `puede_ver_descuento_plan = false`
- WHEN that requester attempts to create or edit a role with `puede_ver_descuento_plan = true`
- THEN `asegurarPuedeOtorgarPermisos` MUST reject the request with 403, mirroring exactly how it already rejects granting `puede_editar_descuento_plan` (i.e. add `puede_ver_descuento_plan` to the `PERMISOS_ROL` list; do not invent a stricter or looser rule)
- AND a requester whose role is literal `admin` MUST remain exempt from this check, same as today

### Requirement: Cotizador field visibility respects the view permission

For plans where `plan.descuento_default` is set, the cotizador's Descuento field visibility MUST follow a three-state matrix combining `puede_editar_descuento_plan` and `puede_ver_descuento_plan`. This visibility rule MUST be scoped to exactly the same condition that today's `bloqueado` uses (`prefijo === 'descuento' && plan?.descuento_default != null && !usuario?.puede_editar_descuento_plan`) — it MUST NOT be broadened to cover any additional condition.

#### Scenario: Editable role sees the field regardless of the view permission

- GIVEN a user whose role has `puede_editar_descuento_plan = true`
- WHEN they select a plan with `descuento_default` set
- THEN the Descuento field MUST render, editable, and prefilled — identical to current behavior — regardless of the value of `puede_ver_descuento_plan`

#### Scenario: Non-editable role with view permission sees the disabled field (unchanged)

- GIVEN a user whose role has `puede_editar_descuento_plan = false` and `puede_ver_descuento_plan = true` (the default)
- WHEN they select a plan with `descuento_default` set
- THEN the Descuento field MUST render, disabled, prefilled with `plan.descuento_default`, showing the hint "Descuento fijo del plan" — identical to current behavior

#### Scenario: Non-editable role without view permission does not see the field

- GIVEN a user whose role has `puede_editar_descuento_plan = false` and `puede_ver_descuento_plan = false`
- WHEN they select a plan with `descuento_default` set
- THEN `renderAjusteField` MUST NOT render the Descuento field (returns an empty string for that field)
- AND the Recargo field MUST render exactly as it does today, unaffected by this permission

#### Scenario: Visibility hiding does not silently extend beyond the existing bloqueado condition

- GIVEN the pre-existing latent mismatch where `bloqueado` (frontend) does not check `!plan.cotizacion_combinada`, while `resolverDescuentos()` (backend) only force-applies the plan discount when `plan.descuento_default != null && !plan.cotizacion_combinada`
- WHEN implementing the `oculto` derivation for this change
- THEN `oculto` MUST be computed strictly as `bloqueado && usuario?.puede_ver_descuento_plan === false`, reusing `bloqueado` as-is
- AND aligning `bloqueado` with the backend's `cotizacion_combinada` condition is explicitly OUT OF SCOPE for this change — it MUST NOT be silently fixed as a side effect
- AND this mismatch remains currently inert because Auto is paused and `RAMOS_CON_AJUSTES = ['mrc', 'incendio']`

### Requirement: Server-side discount computation remains unaffected by the view permission

`resolverDescuentos()` in `backend/src/services/cotizacion.service.js` MUST NOT read or branch on `puede_ver_descuento_plan`. Its existing behavior — forcing `plan.descuento_default` whenever the requester's role lacks `puede_editar_descuento_plan` (subject to the plan's `cotizacion_combinada` condition, unchanged by this delta) — MUST remain byte-for-byte identical.

#### Scenario: Discount amount is identical whether or not the field is visible

- GIVEN two users on the same non-editable role, one with `puede_ver_descuento_plan = true` and one with `puede_ver_descuento_plan = false`
- WHEN both submit `POST /cotizaciones/calcular` for the same MRC plan with `descuento_default = 10`
- THEN both responses MUST reflect the same 10% discount
- AND the resulting Carta Oferta document MUST show the same discount line for both users

## Non-Goals

- No changes to `resolverDescuentos()` computation logic or its `cotizacion_combinada` condition.
- No changes to Recargo (surcharge) field rendering.
- No backfill beyond `DEFAULT TRUE` at the DB level.
- No fix to the pre-existing `bloqueado`/`cotizacion_combinada` mismatch — documented above as an explicit open point, left untouched by this change.
