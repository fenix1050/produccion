# Coberturas Adicionales UI Specification

## Purpose

Presentation-only redesign of the "Coberturas adicionales" block (MRC only) in both render modes: checkbox mode (`renderCoberturasAdicionalesCheckbox`, roles without `puede_agregar_cobertura_libre`) and free-selector mode (`renderCoberturasAdicionales`, roles with it). The proposal declares **New Capabilities: None** and **Modified Capabilities: None** — no existing `openspec/specs/{domain}/spec.md` covers this UI. This is a new full spec, not a delta, describing the observable markup/interaction contract so the redesign is testable despite this project having no automated frontend test suite (Playwright-only verification, per proposal).

No calculation, limit, preload, backend, or schema behavior changes. `coberturasDisponibles()`, `quedanCoberturasAdicionalesPorAgregar()`, and `state.coberturasAdicionales[].sumaAsegurada` semantics are unchanged.

## Requirements

### Requirement: Card Skin for Checkbox Mode

The system MUST render each catalog coverage in checkbox mode as a card containing an avatar icon, a radio-style indicator that fills when the coverage is checked, and a pencil affordance to edit the amount.

#### Scenario: Unmarked coverage shows dimmed lock instead of pencil

- GIVEN a coverage row in checkbox mode is unchecked (no coverage selected for that row)
- WHEN the card renders
- THEN a dimmed padlock icon replaces the pencil, and the amount input is not directly editable

#### Scenario: Checking a coverage fills the radio indicator

- GIVEN an unchecked coverage row
- WHEN the agent checks the checkbox
- THEN the radio-style indicator fills
- AND the row becomes eligible for amount editing per the auto-open rule below

### Requirement: Free Selector Mode Keeps Its Mechanics Under the New Skin

The system MUST apply the same card visual language to free-selector mode without converting it into a fixed list.

#### Scenario: Selector and remove button persist

- GIVEN a user with `puede_agregar_cobertura_libre`
- WHEN they view a coverage row in the redesigned selector mode
- THEN a `<select>` per row and a "Quitar" button are still present
- AND rows can still be added freely via "+ Agregar cobertura" (subject to the existing capacity limit)

#### Scenario: Row-level lock matches checkbox mode

- GIVEN a selector-mode row with no `<select>` value chosen
- WHEN the card renders
- THEN the row shows the same dimmed padlock as an unchecked checkbox row (identical rule, both modes)

### Requirement: Static View Never Shows the Stored Amount

The static (non-editing) view of a coverage row MUST always render the placeholder "—" for the amount field, regardless of whether `sumaAsegurada` already holds a value. The real number MUST be visible only while that row is in edit mode (after clicking the pencil). This is a display-only rule: `state.coberturasAdicionales[].sumaAsegurada` MUST retain its real value at all times and continue to flow unchanged into the live preview, the calculation request, and the read-only "Detalle del plan" card.

#### Scenario: Amount already set, row not being edited

- GIVEN a coverage row with `sumaAsegurada` already populated (e.g. from a loaded quote)
- WHEN the row is rendered outside edit mode
- THEN the amount field shows "—", not the stored formatted value

#### Scenario: Entering edit mode reveals the real value

- GIVEN a coverage row with a stored `sumaAsegurada`
- WHEN the agent clicks the pencil
- THEN the input switches to edit mode and displays the real, editable value with focus and caret at end

#### Scenario: Preview and Detalle del plan are unaffected by the hiding rule

- GIVEN a coverage row whose static view shows "—"
- WHEN the live preview or "Detalle del plan" is rendered
- THEN both reflect the actual stored `sumaAsegurada`, never the "—" placeholder

### Requirement: Auto-Open Edit Mode When Amount Is Missing

The system MUST automatically open edit mode when a coverage is checked (checkbox mode) or selected (selector mode) and its `sumaAsegurada` is empty, so the amount cannot be silently skipped.

#### Scenario: Checking an empty-amount coverage opens the input

- GIVEN an unchecked coverage row with no prior amount
- WHEN the agent checks it
- THEN edit mode opens automatically and the amount input receives focus

#### Scenario: Checking a coverage that already has an amount does not force edit mode

- GIVEN a coverage row with a previously stored amount
- WHEN the agent (re)checks or selects it
- THEN edit mode is not forced open; the static "—" view is shown per the visibility rule above

### Requirement: Add-Button Lock Chrome in Both Call Sites

The "+ Agregar cobertura" / "Agregar cobertura adicional" button MUST show lock chrome (disabled state with explanatory `title`) whenever `quedanCoberturasAdicionalesPorAgregar(...)` is false, consistently in both `render-datos.js` (Datos step) and `render-detalle-plan.js` (Detalle del plan step).

#### Scenario: Capacity reached in Datos

- GIVEN all catalog coverages are already used at their repetition limit
- WHEN the "Datos" step renders
- THEN the add button in `render-datos.js` is disabled with a `title` explaining the limit

#### Scenario: Capacity reached in Detalle del plan

- GIVEN the same capacity condition as above
- WHEN "Detalle del plan" renders
- THEN the add button in `render-detalle-plan.js` shows the identical disabled/locked chrome

### Requirement: Dedicated Icons for Previously Icon-less Coverages

The system MUST provide a dedicated icon for each of the 6 MRC catalog coverages that previously fell back to a generic icon: `incendio_mobiliario_equipos`, `robo_contenido`, `robo_caja_registradora`, `robo_transito`, `cristales`, `responsabilidad_civil`. These MUST be registered in a new `COBERTURA_ICONOS` map without modifying `SUBLIMITE_ICONOS`.

#### Scenario: Read-only Detalle del plan card is unaffected

- GIVEN the read-only `.cobertura-card` used in "Detalle del plan" for included/sublimit coverages
- WHEN the 6 new icons are added
- THEN that card's icon lookup (`SUBLIMITE_ICONOS`) is unchanged and renders identically to before

#### Scenario: Adicionales cards show the new dedicated icons

- GIVEN a coverage row for one of the 6 previously icon-less codes in either render mode
- WHEN the card renders
- THEN it shows its own icon instead of `ICON_SUBLIMITE_GENERICO`

## Non-Requirements (Explicit)

- No change to `coberturasDisponibles()`, `quedanCoberturasAdicionalesPorAgregar()`, repetition limits, or plan-default preload logic.
- No conversion of the free selector into a fixed checkbox list.
- No change to the read-only `.cobertura-card` styling used elsewhere in "Detalle del plan".
- No backend, schema, or migration changes.
- No new automated frontend tests; verification is Playwright-driven per the proposal's Success Criteria.
