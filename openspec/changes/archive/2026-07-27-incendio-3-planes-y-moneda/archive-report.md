# Archive Report: Incendio — 3 planes nuevos (Hipotecario, con/sin Inspección) + moneda USD/Gs

**Change**: incendio-3-planes-y-moneda  
**Archived**: 2026-07-27  
**Status**: ✅ COMPLETE

## Executive Summary

The change "incendio-3-planes-y-moneda" has been successfully archived after complete implementation, verification, and delivery to production. All 23 tasks were implemented across 4 PRs (3 feature PRs + 1 critical fix PR), all 100 backend tests pass, live verification completed, and three new Incendio plans with cross-cutting currency support are now operational.

## What Was Archived

- **Proposal**: Three new Incendio plans (Hipotecario, con Inspección, sin Inspección) using objeto_riesgo rate mechanics, plus transversal USD/Gs currency support for all quotes
- **Specs**: Three new requirement specifications merged to main specs (openspec/specs/):
  - `incendio-planes-objeto-riesgo`: Global rate breakdown per risk object, with 4 optional objects
  - `incendio-umbral-inspeccion`: Inspection threshold rule (Hipotecario exempt)
  - `cotizacion-moneda`: Currency selection, exchange-rate snapshotting, persistence
- **Design**: Technical approach, data flow, architecture decisions (object-oriented rate table, threshold validation in backend, on-demand exchange-rate caching)
- **Tasks**: 23 implementation tasks, all marked complete (✅)
- **Apply Progress**: 6 batches of work:
  - Batch 1 (PR #14): Migrations + exchange-rate service
  - Batch 2 (PR #15): Calculador third mechanic + schema
  - Batch 3 (PR #16): Service layer integration + tests
  - Batch 4 (PR 4): Frontend (moneda selector, risk objects, historial)
  - Batch 5: Live verification + data fixes (migrations 039-040)
  - Batch 6 (PR #18 / fix branch): Critical fix — endpoint for Hipotecario legal clauses

## Task Completion

**Status**: All 23 original tasks complete  
**Evidence**: `tasks.md` shows all checkboxes marked [x]  
**Tests**: 100/100 backend tests passing (97 preexisting + 3 new from fix)  
**No unchecked implementation tasks remain**

## Critical Fix Verification

**Issue Found (sdd-verify)**: Spec requirement "Hipotecario legal content" was not satisfiable — 5 mandatory legal clauses were seeded in migration 038 but no API endpoint exposed them.

**Fix Implemented** (PR #18 / branch fix/incendio-hipotecario-clausulas-legales):

- ✅ `backend/src/repositories/ramos.repository.js::findClausulasObligatoriasByPlanId(planId)` — queries `clausulas_catalogo` by plan_id
- ✅ `backend/src/services/ramos.service.js::listarClausulasObligatoriasDePlan(planId)` — service wrapper
- ✅ `backend/src/controllers/ramos.controller.js::listarClausulasObligatoriasDePlan` — controller handler
- ✅ `backend/src/routes/planes.routes.js` — new endpoint `GET /api/planes/:id/clausulas`
- ✅ 3 TDD-red tests in `ramos.repository.test.js` validating clause retrieval, empty plans, error handling
- ✅ Live verification: `GET /api/planes/17/clausulas` (Hipotecario plan) returns 5 clauses correctly

**Status**: ✅ CRITICAL FIX VERIFIED AND MERGED

## Specs Merged to Main

| Domain                          | Action  | Delta → Main                                              | VIVIENDA Correction Applied                                 |
| ------------------------------- | ------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `incendio-planes-objeto-riesgo` | Created | Risk object rate breakdown, 3-plan catalog, legal content | ✅ Changed "VIVIENDA FAMILIAR" → "VIVIENDA" (migration 040) |
| `incendio-umbral-inspeccion`    | Created | Threshold rule, Hipotecario exemption                     | N/A (no risk-type mentions)                                 |
| `cotizacion-moneda`             | Created | Currency selection, exchange-rate snapshot, persistence   | N/A                                                         |

**Delta specs location**: `/openspec/changes/incendio-3-planes-y-moneda/specs/` → **Main specs location**: `/openspec/specs/{domain}/spec.md`  
**Merge strategy**: Direct copy (no existing main specs to merge with — first SDD change)  
**Spec correction**: Risk type name corrected from "VIVIENDA FAMILIAR" (original delta) to "VIVIENDA" (implementation reality, migration 040 fix)

## Archive Contents

✅ proposal.md  
✅ design.md  
✅ exploration.md  
✅ specs/ (3 delta specs)  
✅ tasks.md (23/23 complete)  
✅ apply-progress.md (6 batches documented)  
✅ state.yaml  
✅ archive-report.md (this file)

**Location**: `/openspec/changes/archive/2026-07-27-incendio-3-planes-y-moneda/`

## Implementation Summary

| Component                   | Delivery             | Tests                               | Status                                 |
| --------------------------- | -------------------- | ----------------------------------- | -------------------------------------- |
| Migrations (5+2 data fixes) | PR #14, +batches 5/6 | Schema verification                 | ✅ Applied                             |
| Exchange-rate service       | PR #14               | 7/7 TDD red tests + integration     | ✅ Cached 15min, dolarPy fallback      |
| Calculator third mechanic   | PR #15               | 27/27 (14 new + 13 preexisting)     | ✅ objeto_riesgo dispatch              |
| Schema Zod                  | PR #15               | Validated by integration suite      | ✅ 4 risk objects + currency enum      |
| Service layer integration   | PR #16               | 10/10 (5 cotizacion + 5 coberturas) | ✅ Rate override, threshold resolution |
| Frontend                    | PR #4 (same branch)  | Static validation (no test harness) | ✅ Moneda selector, risk object fields |
| Critical fix                | PR #18               | 3/3 TDD red tests                   | ✅ Clauses endpoint                    |
| **Regression suite**        | **All PRs**          | **100/100 tests**                   | **✅ 0 regressions**                   |

## Open Questions Resolved

- ✅ Exchange-rate source: dolarPy public API, SET quotation, `venta` field (conservative)
- ✅ Inspection threshold applies only to "con Inspección"/"sin Inspección"; Hipotecario exempt
- ✅ Risk objects: 4 fields optional per quote
- ✅ riesgo_datos.rubro_actividad reused as risk-type name (confirmed by Kevin)
- ✅ Prima técnica minima by currency: explicit `prima_tecnica_minima_usd` field, no conversion
- ✅ Exchange-rate snapshot at quote time: immutable, never recalculated
- ✅ No cross-currency aggregation in historial
- ✅ Legacy "MAQUINARIA BASICO" regularized as USD (closure of migration 013 gap)

**Remaining open questions** (do not block change):

- Rates for risk types beyond Vivienda (awaiting Kevin, week of 2026-08-03)
- Manual override UI for exchange rate (marked as salvavidas, lower priority)

## Risks Mitigated

| Risk                                  | Mitigation                                                | Status         |
| ------------------------------------- | --------------------------------------------------------- | -------------- |
| dolarPy third-party SLA               | Cache 15min + fallback to last DB value + stale:true flag | ✅ Implemented |
| Exchange-rate precision               | Snapshot at quote time, immutable                         | ✅ Implemented |
| Currency mixing in historial          | `moneda NOT NULL`, no cross-currency sums                 | ✅ Implemented |
| Implicit currency conversion on floor | Explicit `prima_tecnica_minima_usd`, reject if missing    | ✅ Implemented |
| Schema divergence in future           | `plan_id` nullable in rate table from day 1               | ✅ Implemented |

## Rollback Capability

- **Level 1** (business): `UPDATE planes SET activo=FALSE` for 3 new plans → removed from selector
- **Level 2** (code): Revert all 4 PRs; dispatch by `tipo_mecanica` retains fallback to prior behavior
- **Level 3** (schema): Migrations 034-040 are additive (no DROP, no type changes); can be reverted if no Incendio objeto_riesgo quotes have been emitted in production

## Deployment Evidence

- ✅ 3 PRs merged to main (#14, #15, #16): `git log --oneline` confirms merge commits
- ✅ 1 critical fix PR (#18): merged to main after verification gap discovered
- ✅ Migraciones 034-040 applied to live Supabase: verified with `list_migrations` and live smoke tests
- ✅ Live verification completed 2026-07-27:
  - 3 new plans selectable
  - 4 risk objects render correctly
  - Currency selector works (Gs./USD)
  - Inspection threshold enforced
  - Hipotecario legal clauses retrievable via `/api/planes/17/clausulas`
  - 100% test suite green
  - No regressions on legacy Incendio plans

## Spec Sync Complete

Delta specs have been merged to main specs with the following correction:

**Correction Applied**: Risk type renamed from "VIVIENDA FAMILIAR" (delta spec) to "VIVIENDA" (live implementation, migration 040). This aligns the spec with the actual data and matches the catalog of rubros de actividad that is shared with MRC and used in `findTasasRiesgoObjeto` matching.

**Files Written**:

- `/openspec/specs/incendio-planes-objeto-riesgo/spec.md`
- `/openspec/specs/incendio-umbral-inspeccion/spec.md`
- `/openspec/specs/cotizacion-moneda/spec.md`

These are now the source of truth for future changes to these capabilities.

## Next Steps

The SDD cycle for this change is **complete**. The change is ready for:

- ✅ Documentation (all specs merged)
- ✅ Production use (live verified)
- ✅ Future enhancement (open questions can be addressed independently)

**Recommended next changes** (out of scope):

1. Incendio Carta Oferta PDF template (requires Incendio-specific HTML/CSS layout, currently a known gap)
2. Exchange-rate override UI in admin panel (marked as salvavidas)
3. Additional risk types for Incendio (when Kevin confirms rates)
4. Full RLS implementation on all 30+ tables (currently no RLS, frontend-only security model)

## Archive Audit Trail

- **Created**: 2026-07-27
- **Phase transitions**: explore → design → spec → tasks → apply (6 batches) → verify → archive
- **Artifacts persisted**: proposal.md, design.md, exploration.md, tasks.md, apply-progress.md, 3 delta specs, state.yaml
- **Review/receipt**: OpenSpec mode (no formal review gate in this session, all changes merged to main directly)
- **Traceability**: All task tracking and PR references in apply-progress.md and state.yaml

---

**Status**: ✅ **CHANGE ARCHIVED AND CLOSED**  
**SDD Cycle Complete**: The incendio-3-planes-y-moneda change has fulfilled all requirements, passed verification, been deployed to production, and is now archived as a historical record for future reference and audit.
