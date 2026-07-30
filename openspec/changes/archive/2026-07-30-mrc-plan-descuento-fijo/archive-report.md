# Archive Report: mrc-plan-descuento-fijo

**Date**: 2026-07-30
**Change Name**: mrc-plan-descuento-fijo
**Archive Location**: `openspec/changes/archive/2026-07-30-mrc-plan-descuento-fijo/`
**Main Spec Location**: `openspec/specs/mrc-plan-descuento-fijo/spec.md` (NEW)

## Executive Summary

MRC plan with fixed 10% discount and role-based edit permission has been fully implemented, tested, verified (PASS WITH WARNINGS), and archived. Implementation is complete on two local stacked branches (`sdd/mrc-plan-descuento-fijo-backend` + `sdd/mrc-plan-descuento-fijo-frontend`), not yet pushed to main (Kevin's next step). Migration 046 already applied against real Supabase (plan id 20, 3 confirmed roles with permission, 5 inherited coverages). All 166 backend tests passing (154 pre-existing + 12 new). Two non-blocking warnings documented for follow-up.

## Artifacts Archived

The following SDD phase artifacts have been moved to the archive directory:

| Artifact           | Status      | Location                                                                                                                                        |
| ------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| proposal.md        | Complete    | `openspec/changes/archive/2026-07-30-mrc-plan-descuento-fijo/proposal.md`                                                                       |
| design.md          | Complete    | `openspec/changes/archive/2026-07-30-mrc-plan-descuento-fijo/design.md`                                                                         |
| specs/.../ spec.md | Complete    | `openspec/changes/archive/2026-07-30-mrc-plan-descuento-fijo/specs/plan-descuento-fijo/spec.md`                                                 |
| tasks.md           | Complete    | `openspec/changes/archive/2026-07-30-mrc-plan-descuento-fijo/tasks.md` (20/20 implementation tasks checked + 1 verification task live-verified) |
| apply-progress.md  | Complete    | `openspec/changes/archive/2026-07-30-mrc-plan-descuento-fijo/apply-progress.md`                                                                 |
| verify-report.md   | PASS W/WARN | `openspec/changes/archive/2026-07-30-mrc-plan-descuento-fijo/verify-report.md`                                                                  |

## Specs Synced

| Domain                  | Action | Details                                                                                                                                                   |
| ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mrc-plan-descuento-fijo | Create | Complete spec copied from delta: 12 scenarios (plan seeding, permission model, backend enforcement, frontend UI, cap interaction, stale session handling) |

The delta spec at `openspec/changes/mrc-plan-descuento-fijo/specs/plan-descuento-fijo/spec.md` was a complete specification (not a delta), so it was copied directly to the main specs location at `openspec/specs/mrc-plan-descuento-fijo/spec.md`.

## Implementation Status

### Backend (PR1: sdd/mrc-plan-descuento-fijo-backend)

- **Migration 046**: Written with all 4 steps (permission column, permission update for 3 roles, plan INSERT with real name, plan_formas_pago via CROSS JOIN), applied against real Supabase 2026-07-30, verified post-apply
- **Descuento resolution**: `resolverDescuentos()` helper exported from `cotizacion.service.js`, wired into `construirVariantes`, guards against double-discount with Auto's `cotizacion_combinada` branch
- **Calculator top neutralization**: `forzadoPorPlan` parameter in both `mrc.calculator.js` and `incendio.calculator.js` (inert today); one-liner at `topeEfectivo()` call site
- **Permission plumbing**: All 6 files wired (roles, usuarios, auth, admin/roles service, admin schema, auth service)
- **Test coverage**: 12 new tests (7 unit + 2 security integration + 1 Auto regression + 2 cap scenarios), all 166/166 passing

### Frontend (PR2: sdd/mrc-plan-descuento-fijo-frontend)

- **Admin Roles UI**: Checkbox + badge column for `puede_editar_descuento_plan` in Roles section modal only (NOT user edit form)
- **Cotizador prefill**: `state.data.descuentoPorcentaje` set to `plan.descuento_default` at load and plan-select time
- **Cotizador lock**: `renderAjusteField` disables both Monto and Porcentaje inputs when plan has `descuento_default` and user lacks permission; shows helper text "Descuento fijo del plan"
- **Docs update**: `ESTADO_PROYECTO.md` (section 39) + `CLAUDE.md` updated with migration details and status

### Live Verification (2026-07-30)

- **Task 4.1 (DONE)**: Playwright via `run-cotizador` skill confirmed:
  - Badge shows only "Contado" for the new plan
  - Descuento field disabled and prefilled to 10% for user without permission
  - No console/network errors
- **Task 4.2 (SKIPPED - justified)**: Permission-holder path not manually tested live (would require temporary role grant against Supabase), but backend tests prove the override path works

## Verification Verdict: PASS WITH WARNINGS

From `verify-report.md`:

- **CRITICAL issues**: 0
- **WARNINGs**: 2 (non-blocking)
  1. Spec scenario "Field editable for permitted user" has no runtime/manual verification (task 4.2 skipped). Low risk; code review confirms logic, backend is tested (security boundary), but ideally Kevin logs in as "Analista de Riesgo" or "Jefe de Análisis de Riesgo" (both already have the permission from the applied migration) to verify field becomes editable.
  2. Live Supabase state (plan id 20, 3 roles, 5 plan_coberturas rows) could not be independently re-queried during verification (no Supabase MCP tool available in that session). High confidence based on migration consistency and corroborating live-UI evidence, but this is indirect, not a direct DB read.

### Code/Design Compliance

- All 3 architecture decisions from `design.md` present and correct (service-layer enforcement, user-tope neutralization only, `!cotizacion_combinada` guard to prevent Auto regression)
- Migration file syntax correct, placeholders removed, real plan name and role list applied
- Permission plumbing complete across all 6 required files
- Security-critical test (user without permission cannot override via API) has genuine runtime coverage
- All 166 tests pass (independently re-run, not trusted from log)

## Branch Status (Kevin's Next Step)

- **PR1** (`sdd/mrc-plan-descuento-fijo-backend`): Ready to push and open PR against `main`. Migration 046 is committed and applied. All backend code committed.
- **PR2** (`sdd/mrc-plan-descuento-fijo-frontend`): Ready to push and open PR against PR1 branch (stacked). All frontend code committed.
- **Not yet pushed to GitHub**: Both branches are local; Kevin will push and open chained PRs in a separate session

## Rollback Plan

- **N1 (business)**: `UPDATE planes SET activo = FALSE` for plan id 20
- **N2 (code)**: Revert both PR commits
- **N3 (schema)**: Delete coverage rows, delete plan, drop permission column (all aditional, no `DROP` on pre-existing columns)

## Follow-Up Notes

1. Kevin should verify the permission-holder edit path by logging in as "Analista de Riesgo" or "Jefe de Análisis de Riesgo" (both have `puede_editar_descuento_plan = TRUE` from the applied migration) and confirming the Descuento field becomes editable in the cotizador for the new plan.
2. Minor optimization opportunity: consider adding a dedicated test asserting `descuento_default` is present in the GET planes-by-ramo response payload (spec scenario 1). Today this passes by construction via `select('*')`, which is correct but has zero direct test coverage.
3. Backend of the VPS (`api.cotizador.lat`) may need a manual redeploy to serve the frontend's API calls for the new plan; Vercel auto-deploys the frontend on every push to `main`, so both must be in sync after these PRs merge.

## Observation IDs (for Engram traceability)

This archive report consolidates the SDD planning and tracking artifacts. The following artifacts were created and verified:

- SDD Proposal: `mrc-plan-descuento-fijo/proposal`
- SDD Spec: `mrc-plan-descuento-fijo/spec`
- SDD Design: `mrc-plan-descuento-fijo/design`
- SDD Tasks: `mrc-plan-descuento-fijo/tasks`
- SDD Apply Progress: `mrc-plan-descuento-fijo/apply-progress`
- SDD Verify Report: `mrc-plan-descuento-fijo/verify-report`
- SDD Archive Report (this file): `mrc-plan-descuento-fijo/archive-report`

## Closure

The SDD cycle for `mrc-plan-descuento-fijo` is COMPLETE. The change is fully planned (proposal ✓, spec ✓, design ✓), fully implemented (backend ✓, frontend ✓), fully tested (166/166 tests ✓), and fully verified (PASS WITH WARNINGS, non-blocking ✓). All artifacts are archived and the main spec is now source of truth.

**Next transition**: Kevin pushes both branches, opens the two stacked PRs against `main`, and merges after review. No additional SDD phases required.
