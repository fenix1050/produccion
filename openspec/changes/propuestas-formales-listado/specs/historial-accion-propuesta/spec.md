# Historial — Acción sobre Propuesta Specification

## Purpose

Decide, from Historial, whether a carta oferta's action is "Preparar propuesta", "Reabrir" (continue draft), or "Ver propuestas" (view list), based on the carta's current propuesta state — replacing the previous logic that always offered "Preparar propuesta" even when a propuesta was already emitted.

## Requirements

### Requirement: Pure decision module `propuesta-accion.js`

The system MUST provide a pure function module `frontend/historial/propuesta-accion.js` that, given a carta row's fields, decides the action without side effects or DOM access, so it is independently unit-testable.

The module MUST decide among exactly three branches:

1. **Sin propuesta**: the carta has no associated propuesta (`propuesta_borrador_id` and `propuesta_actual_id` both absent/null) → action is "Preparar propuesta", navigating to `../propuestas/?carta=<id>`.
2. **Propuesta activa (borrador)**: the carta has an active draft propuesta (`propuesta_borrador_id` present, or `propuesta_actual_estado` in a non-terminal/draft state) → action is "Reabrir", navigating to continue that draft.
3. **Propuesta emitida, anulada o reemplazada**: `propuesta_actual_estado` is `emitida`, `anulada`, or `reemplazada` → action is "Ver propuestas", navigating to the new listing filtered by that carta's `carta_oferta_id`.

The module MUST preserve the exact literal `../propuestas/?carta=` for the "Sin propuesta" branch, unchanged, because `frontend/propuestas/propuestas.test.js:18` asserts this literal against `historial.js`'s source.

The module MUST degrade to the current (pre-075) behavior — always offering "Preparar propuesta" — whenever the new fields introduced by migración 075 (`tiene_propuesta`, `propuesta_actual_id`, `propuesta_actual_estado`, `propuesta_actual_numero`) are absent from the carta row, so a frontend deployed ahead of the migration does not break.

#### Scenario: Carta without any propuesta

- GIVEN a carta row with `propuesta_borrador_id: null` and `propuesta_actual_id: null`
- WHEN `propuesta-accion.js` decides the action
- THEN it returns "Preparar propuesta" with target `../propuestas/?carta=<id>`

#### Scenario: Carta with an active draft

- GIVEN a carta row with `propuesta_borrador_id` set and no emitted propuesta
- WHEN `propuesta-accion.js` decides the action
- THEN it returns "Reabrir" targeting that draft

#### Scenario: Carta with propuesta emitida

- GIVEN a carta row with `propuesta_actual_estado: 'emitida'` and `propuesta_actual_id` set
- WHEN `propuesta-accion.js` decides the action
- THEN it returns "Ver propuestas" targeting the listing filtered by `carta_oferta_id`

#### Scenario: Carta with propuesta anulada

- GIVEN a carta row with `propuesta_actual_estado: 'anulada'`
- WHEN `propuesta-accion.js` decides the action
- THEN it returns "Ver propuestas" targeting the listing filtered by `carta_oferta_id`

#### Scenario: Carta with propuesta reemplazada

- GIVEN a carta row with `propuesta_actual_estado: 'reemplazada'`
- WHEN `propuesta-accion.js` decides the action
- THEN it returns "Ver propuestas" targeting the listing filtered by `carta_oferta_id`

#### Scenario: Degradation when migration 075 fields are absent

- GIVEN a carta row that lacks `tiene_propuesta`, `propuesta_actual_id`, `propuesta_actual_estado`, and `propuesta_actual_numero` entirely
- WHEN `propuesta-accion.js` decides the action
- THEN it returns "Preparar propuesta" targeting `../propuestas/?carta=<id>`, matching pre-075 behavior

### Requirement: Historial integration without breaking existing wizard tests

`frontend/historial/historial.js` MUST delegate the action decision to `propuesta-accion.js` and MUST NOT inline the branching logic.

The integration MUST NOT alter the sidebar's existing `propuestas` active key used by the wizard; any new sidebar item introduced by this change MUST use the independent key `propuestas-listado`.

#### Scenario: Existing wizard navigation assertion still passes

- GIVEN `frontend/propuestas/propuestas.test.js:18` asserts the regex `/\.\.\/propuestas\/\?carta=/` against `historial.js`'s source
- WHEN this change is applied
- THEN that assertion continues to pass unmodified
