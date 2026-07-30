# Plan Descuento Fijo Specification

## Purpose

Enable a plan to carry a fixed, non-discretionary commercial discount (`descuento_default`) that is applied automatically at cotización time, and that only users whose role has the `puede_editar_descuento_plan` permission may override. Initial application: a new MRC plan with `descuento_default = 10` and a single enabled payment method (Contado).

## Requirements

### Requirement: Plan-level fixed discount definition

A plan MAY define `descuento_default` (existing `planes.descuento_default` column, reused — not a new column). When set, the plan's discount policy is a business decision, not agent discretion.

#### Scenario: New MRC plan seeded with fixed discount

- GIVEN a migration that inserts a new MRC plan (exact name TBD, placeholder acceptable) with `descuento_default = 10`
- WHEN the plan is queried via `GET` planes-by-ramo endpoints
- THEN `descuento_default` MUST be present in the response payload

#### Scenario: Plan restricted to Contado payment method

- GIVEN the new MRC plan's `plan_formas_pago` rows
- WHEN the cotizador lists available payment methods for this plan
- THEN only Contado MUST be `habilitada = true`; Cobrador, Boca de Cobranza, and Tarjeta de Crédito MUST be `habilitada = false`

### Requirement: Role permission for editing plan discount

The system MUST define permission `puede_editar_descuento_plan` as a column on `roles` (not on `usuarios`), consistent with the role-based permission model established by migration 031.

#### Scenario: Permission defaults to false for non-admin roles

- GIVEN the migration adding `puede_editar_descuento_plan` to `roles`
- WHEN the column is added
- THEN it MUST default to `FALSE` for all existing roles except `admin`, which MUST receive `TRUE`

#### Scenario: Permission editable from admin Roles section

- GIVEN an admin user viewing the Roles section of the admin panel
- WHEN they toggle `puede_editar_descuento_plan` for a role and submit
- THEN the backend MUST persist the change via the roles update endpoint (verify exact route name in `admin.routes.js`/`admin.controller.js` during design; e.g. `PUT /admin/roles/:id` or equivalent)
- AND the permission MUST NOT be editable from the individual user edit form

### Requirement: Backend enforcement of plan-forced discount

When resolving cotización variants (`cotizacion.service.js`, `construirVariantes` or equivalent), the backend MUST evaluate `plan.descuento_default` before invoking the ramo calculator.

- IF `plan.descuento_default IS NOT NULL` AND the requesting user's role lacks `puede_editar_descuento_plan`, the backend MUST discard any discount adjustments present in the request body and MUST substitute a single forced adjustment `{ descripcion: 'Descuento del plan', porcentaje: plan.descuento_default }`.
- IF `plan.descuento_default IS NOT NULL` AND the requesting user's role has `puede_editar_descuento_plan`, the backend MUST behave as today: respect discount adjustments sent in the request body, subject to existing caps.
- IF `plan.descuento_default IS NULL`, behavior MUST be unchanged from current behavior for that plan.

#### Scenario: User without permission cannot override via API (security-critical)

- GIVEN a user whose role has `puede_editar_descuento_plan = false`
- AND the MRC plan with `descuento_default = 10`
- WHEN the user sends `POST /cotizaciones/calcular` with a discount adjustment of a different percentage (e.g. 5%) in the request body
- THEN the backend MUST ignore the submitted discount and apply the plan's 10% discount instead
- AND the resulting prima MUST reflect the 10% discount, not the submitted value

#### Scenario: User with permission can override

- GIVEN a user whose role has `puede_editar_descuento_plan = true`
- AND the MRC plan with `descuento_default = 10`
- WHEN the user sends `POST /cotizaciones/calcular` with a different discount adjustment
- THEN the backend MUST apply the user-submitted discount, subject to existing cap rules

#### Scenario: Plans without descuento_default are unaffected

- GIVEN an existing MRC/Incendio/Vida-AP plan where `descuento_default IS NULL`
- WHEN a cotización is calculated for that plan by any user
- THEN discount resolution behavior MUST be identical to current (pre-change) behavior

### Requirement: Effective discount vs. existing caps — resolution deferred to design

The forced plan discount passes through the same adjustment pipeline used for agent-entered discounts, which today clamps against `plan.descuento_maximo` / `usuario.descuento_maximo_pct` (`topeEfectivo` in the calculator). Whether the plan-forced discount MUST bypass per-user/per-plan caps (business policy, not agent discretion) or MUST remain subject to them is an open design decision, NOT resolved by this spec.

The system MUST guarantee that whichever resolution is chosen produces unambiguous, testable behavior: either (a) the plan discount always applies in full regardless of caps, or (b) the plan discount is silently clamped and this is documented as expected behavior. Silent, undocumented clamping that produces a discount different from `plan.descuento_default` without an explicit, testable rule is NOT acceptable.

#### Scenario: Design resolves the cap interaction (placeholder — resolved in sdd-design)

- GIVEN the plan's `descuento_default = 10` and a `descuento_maximo`/`descuento_maximo_pct` cap lower than 10
- WHEN the forced discount is applied
- THEN the system MUST apply one deterministic, testable rule (either full 10% regardless of cap, or clamped-and-documented) as decided in `sdd-design`
- AND the migration MUST seed `descuento_maximo >= 10` for the new MRC plan regardless of which rule is chosen, to avoid relying on cap behavior for the initial rollout

### Requirement: Frontend prefill and lock

The cotizador frontend MUST prefill the Descuento field with `plan.descuento_default` when such a plan is selected, and MUST disable that field when the current user's role (via `auth.getUsuario()`) lacks `puede_editar_descuento_plan`.

#### Scenario: Field prefilled and disabled for restricted user

- GIVEN a logged-in user without `puede_editar_descuento_plan`
- WHEN they select the new MRC plan in the cotizador
- THEN the Descuento field MUST show 10% precargado
- AND the field MUST be disabled (non-editable)

#### Scenario: Field editable for permitted user

- GIVEN a logged-in user with `puede_editar_descuento_plan`
- WHEN they select the new MRC plan in the cotizador
- THEN the Descuento field MUST be prefilled with 10% but MUST remain editable

#### Scenario: Stale session does not grant permission early

- GIVEN a user's role permission was just granted by an admin
- AND the user's current session token was issued before the grant
- WHEN the user views the cotizador without re-logging in
- THEN the frontend MAY still reflect the cached (pre-grant) permission state
- AND the backend MUST still enforce the current, fresh permission value per request regardless of frontend state
