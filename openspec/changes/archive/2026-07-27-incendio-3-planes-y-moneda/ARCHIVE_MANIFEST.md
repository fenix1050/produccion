# Archive Manifest: incendio-3-planes-y-moneda

This archive contains the complete SDD artifacts for the change "incendio-3-planes-y-moneda", which has been fully implemented, verified, and deployed to production.

## Files in This Archive

- **proposal.md** — Original proposal with intent, scope, capabilities, approach, risks
- **design.md** — Technical design with data flow, architecture decisions, DDL, interfaces
- **exploration.md** — Current state analysis and affected areas
- **tasks.md** — 23 implementation tasks with decomposition and workload forecast
- **apply-progress.md** — 6 implementation batches with TDD evidence, PR details, deviations, issues
- **state.yaml** — Change metadata and phase tracking
- **archive-report.md** — Final archive report with all findings and verification evidence

## Key Artifacts Referenced (Not Duplicated)

The following artifacts are stored in their primary location and referenced by this archive:

### Main Specs (Merged)

- `/openspec/specs/incendio-planes-objeto-riesgo/spec.md` — Risk object rate mechanics
- `/openspec/specs/incendio-umbral-inspeccion/spec.md` — Inspection threshold rule
- `/openspec/specs/cotizacion-moneda/spec.md` — Currency support specification

### Implementation (Merged to main)

- PR #14 (2026-07-27T17:40:41Z): Migrations + exchange-rate service
- PR #15 (2026-07-27T17:50:16Z): Calculator third mechanic + schema
- PR #16 (2026-07-27T17:55:35Z): Service layer integration + tests
- PR #18 (fix/incendio-hipotecario-clausulas-legales): Critical fix for Hipotecario legal clauses

### Backend Code (All in main)

- `backend/src/calculators/incendio.calculator.js` — objeto_riesgo mechanic (27 tests passing)
- `backend/src/services/tipo-cambio.service.js` — Exchange-rate service (7 tests passing)
- `backend/src/repositories/ramos.repository.js::findClausulasObligatoriasByPlanId` — Clauses endpoint
- All supporting repositories, services, controllers, routes

### Frontend Code (All in main)

- `frontend/cotizar/cotizar.js` — Currency selector + risk objects UI
- `frontend/shared/format.js` — fmtMoneda / fmtUsd formatters
- `frontend/historial/historial.js` — Moneda column + safe aggregation

### Migrations (All applied to production)

- 034: Currency fields + legacy plan backfill
- 035: Mechanic + inspection threshold
- 036: Risk type × object rate tables
- 037: Exchange-rate history table
- 038: Seed 3 new plans + Hipotecario legal clauses
- 039: Confirm minimum premiums + max responsibility
- 040: Fix risk type name VIVIENDA FAMILIAR → VIVIENDA

## Archive Location

`/openspec/changes/archive/2026-07-27-incendio-3-planes-y-moneda/`

## Change Status

✅ **COMPLETE** — Archived 2026-07-27

- All 23 tasks implemented and verified
- 4 PRs merged to main
- 100/100 tests passing
- Live verification completed
- No known issues blocking production use

## Next Steps

This change is ready for:

1. Future reference and auditing
2. Enhanced with additional risk types (when rates are confirmed)
3. Served as a template for similar SDD changes in the project

No further action required. The SDD cycle is closed.
