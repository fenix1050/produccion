# RPF por Cuotas Specification

## Purpose

Replace the flat R.P.F. scalar per (plan, forma de pago) with a rate resolved by (forma de pago, cantidad de cuotas), using one shared 33-cell curve applied to MRC, Incendio, and Vida/AP. Auto and Auto-Flota are explicitly excluded and must keep their current flat-rate behavior unchanged.

## Requirements

### Requirement: Shared RPF-by-cuotas curve

The system MUST define a single RPF rate table, shared by MRC, Incendio, and Vida/AP (not one curve per ramo or per plan), keyed by `(forma_pago, cuotas)` for `cuotas` 1 through 11, seeded verbatim from `docs/insumos/Ajuste MC.xlsx` Hoja4 with 4-decimal precision preserved (e.g. `1.6889`).

#### Scenario: Same curve applies across the three ramos

- GIVEN a plan of MRC, a plan of Incendio, and a plan of Vida/AP, all adhered to the RPF-by-cuotas curve
- WHEN each is cotizado with forma de pago Cobrador and 11 cuotas
- THEN all three MUST resolve to RPF = 9.5%, the same value from the shared curve

#### Scenario: Curve values match the source table exactly

- GIVEN the seeded curve
- WHEN the cell for `(Cobrador, 3 cuotas)` is read
- THEN the value MUST be `1.6889`, matching Hoja4 without rounding loss

### Requirement: Forma de pago mapping to curve columns

The system MUST map `formas_pago.codigo = 'cobrador'` to the "Cobrador" column, `codigo = 'boca_cobranza'` to the "Aquí Pago" column, and `codigo = 'tarjeta_credito'` to the "Tarjeta de Crédito" column. `contado` MUST NOT be looked up in the curve; it always resolves to RPF = 0 as today.

#### Scenario: Boca de Cobranza resolves from the Aquí Pago column

- GIVEN a MRC cotización with forma de pago `boca_cobranza` and 5 cuotas
- WHEN the RPF is resolved
- THEN it MUST equal 3.04%, the "Aquí Pago" value for 5 cuotas

#### Scenario: Contado bypasses the curve

- GIVEN any adhered plan cotizado with forma de pago `contado`
- WHEN the RPF is resolved
- THEN it MUST be 0, without querying the cuotas curve

### Requirement: Tarjeta de Crédito zero RPF at low cuotas

Tarjeta de Crédito MUST resolve to RPF = 0 for 1 and 2 cuotas, per the source table, as a real business rule (not a data gap).

#### Scenario: Tarjeta de Crédito at 1 cuota is zero

- GIVEN an Incendio cotización with forma de pago `tarjeta_credito` and 1 cuota
- WHEN the RPF is resolved
- THEN it MUST be 0

#### Scenario: Tarjeta de Crédito at 3 cuotas is non-zero

- GIVEN a Vida/AP cotización with forma de pago `tarjeta_credito` and 3 cuotas
- WHEN the RPF is resolved
- THEN it MUST be 0.8%, matching the curve

### Requirement: Explicit rejection of out-of-range cuotas

If a cotización requests more than 11 cuotas for a plan adhered to the curve, the system MUST reject the request with HTTP 422 and MUST NOT silently clamp to the 11-cuotas rate.

#### Scenario: 12 cuotas is rejected

- GIVEN an adhered plan whose `cuotas_maximo` was raised above 11 by an admin
- WHEN a cotización is requested with 12 cuotas
- THEN the backend MUST respond 422 and MUST NOT compute a Premio

#### Scenario: 11 cuotas is the maximum accepted

- GIVEN an adhered plan
- WHEN a cotización is requested with 11 cuotas
- THEN the backend MUST resolve RPF from the curve and compute the Premio normally

### Requirement: Admin-editable RPF grid

The system MUST expose an endpoint, gated by the `puede_editar_planes` permission (same gate as the existing `tasa_rpf` scalar edit — not elevated to literal admin), that allows editing all 33 cells (11 cuotas × 3 formas de pago) of the shared curve. The admin UI MUST replace the existing single-scalar `tasa_rpf` input for MRC, Incendio, and Vida/AP with this grid; the old scalar input MUST NOT remain visible, read-only, or editable for these three ramos.

#### Scenario: Permitted role edits a curve cell

- GIVEN a user whose role has `puede_editar_planes`
- WHEN they update the `(Cobrador, 6 cuotas)` cell from 4.8556% to a new value and save
- THEN the change MUST persist
- AND the next cotización using Cobrador at 6 cuotas for any of the 3 ramos MUST reflect the new value without a deploy

#### Scenario: Role without permission cannot edit

- GIVEN a user whose role lacks `puede_editar_planes`
- WHEN they call the grid edit endpoint directly
- THEN the backend MUST respond 403 and MUST NOT persist any change

#### Scenario: Old scalar input removed from admin UI for migrated ramos

- GIVEN an admin viewing the Planes section for a MRC, Incendio, or Vida/AP plan
- WHEN they expand "Formas de pago" for that plan
- THEN the per-forma-de-pago `tasa_rpf` scalar input MUST NOT be rendered
- AND the 33-cell grid MUST be rendered instead

### Requirement: Auto and Auto-Flota keep flat-rate RPF unchanged

Auto and Auto-Flota plans MUST NOT be adhered to the RPF-by-cuotas curve and MUST continue resolving RPF from `plan_formas_pago.tasa_rpf` exactly as before this change, regardless of cuotas selected.

#### Scenario: Auto Premio is unchanged (regression)

- GIVEN an Auto plan cotización with a fixed set of inputs (capital, forma de pago Cobrador, cuotas) that produced a known Premio before this change
- WHEN the same cotización is run after this change
- THEN the Premio MUST be byte-identical to the pre-change value

#### Scenario: Auto RPF does not vary by cuotas

- GIVEN an Auto plan cotizado with forma de pago Cobrador
- WHEN cuotas is changed from 3 to 11
- THEN the RPF percentage MUST remain the same flat value from `plan_formas_pago.tasa_rpf`, not vary per the shared curve

#### Scenario: Auto admin UI keeps the old scalar input

- GIVEN an admin viewing the Planes section for an Auto plan
- WHEN they expand "Formas de pago"
- THEN the existing `tasa_rpf` scalar input MUST still be rendered, unchanged
