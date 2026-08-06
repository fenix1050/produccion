# Verification Report: mrc-plan-descuento-fijo

**Mode**: Full artifact set (proposal, specs, design, tasks, apply-progress all present).
**Branches inspected**: sdd/mrc-plan-descuento-fijo-backend (PR1) + sdd/mrc-plan-descuento-fijo-frontend (PR2, stacked). Diff basis: main...sdd/mrc-plan-descuento-fijo-frontend.
**Verdict: PASS WITH WARNINGS**

## Completeness (tasks.md)

All Phase 1-4 tasks checked except 4.2 (deliberately skipped, justified below). No unchecked CORE task remains. Task 1.6 (apply migration to real Supabase) and 4.1 (live Playwright verification) are both marked done - verified below.

## Test Execution

Ran npm test --prefix backend myself (not trusting the pasted log):

    tests 166
    suites 25
    pass 166
    fail 0
    cancelled 0
    skipped 0
    duration_ms 3647.98

Matches apply-progress.md's claim of 166/166 exactly (154 pre-existing + 12 new).

## Code vs. Design Cross-Check

All diffs read directly (git diff main...sdd/mrc-plan-descuento-fijo-frontend), not inferred from prose.

- Decision 1: resolverDescuentos() helper added to backend/src/services/cotizacion.service.js, exported, wired into construirVariantes. Matches design's code block verbatim, including the !plan.cotizacion_combinada guard and usuario?.puede_editar_descuento_plan short-circuit.
- Decision 2: forzadoPorPlan neutralizes only the user's tope, not the plan's, via topeEfectivo(plan.descuento_maximo, forzadoPorPlan ? null : usuario?.descuento_maximo_pct) in backend/src/calculators/mrc.calculator.js. Exact one-liner, default false.
- Same one-liner applied to backend/src/calculators/incendio.calculator.js "for symmetry, inert today" - present, correctly a no-op (no Incendio plan seeds descuento_default).
- Decision 3: !plan.cotizacion_combinada guard prevents double-discount on Auto PREMIUM/SUPERIOR/FUERTE - present in code and covered by a real dedicated runtime regression test.
- Permission plumbing across roles.repository.js (CAMPOS + crear()), usuarios.repository.js (CAMPOS*ROL + aplanar()), auth.js (req.usuario), admin/roles.service.js (PERMISOS_ROL), admin.schema.js (crear/editarRolSchema), auth.service.js (login response) - all 6 files present, each adds exactly puede_editar_descuento_plan in the same shape as the other 4 existing puede*\* permissions. No partial wiring found.
- Admin Roles checkbox (not on user edit form): frontend/admin/admin.js - checkbox + badge column added to abrirModalRolCrear/Editar/guardarModalRol/renderTablaRoles - confirmed NOT present in the user-edit modal code path.
- Cotizador prefill + lock: frontend/cotizar/cotizar.js - state.data.descuentoPorcentaje set at both selectRamo (~583) and selectPlan (~616); renderAjusteField computes bloqueado and applies it to both Monto/Porcentaje disabled attributes plus the hint-text swap - matches design exactly. usuario is already in scope at that point via the pre-existing auth.getUsuario() call at line 1954.

No deviations from design found. apply-progress.md's "Deviations: None" claim holds up under direct diff inspection.

## Migration File vs. Claimed Applied State

backend/migrations/046_plan_mrc_descuento_fijo.sql read on disk - no placeholder text remains:

- Real plan name 'MULTIRRIESGO COMERCIO - SEGUCOOP' used throughout (INSERT INTO planes, plan_formas_pago WHERE, plan_coberturas JOIN).
- UPDATE roles ... WHERE nombre IN ('admin', 'Analista de Riesgo', 'Jefe de Analisis de Riesgo') - exactly the 2 extra roles apply-progress.md claims Kevin confirmed, plus admin.
- Step 4 INSERT INTO plan_coberturas ... SELECT ... FROM plan_coberturas origen JOIN planes plan_origen ... WHERE plan_origen.nombre = 'MULTIRRIESGO COMERCIO - NORMAL' - present, matches the "coverages inherited from NORMAL" claim.
- Header comment documents the !cotizacion_combinada mutual-exclusivity rationale and the descuento_maximo = 10 no-op-clamp rationale.
- File numbering (046) is correctly the next number after 045 on disk.

No Supabase MCP tool was available in this verification session to independently re-query the live database and confirm plan id 20 / the 3-roles state / the 5 copied plan_coberturas rows exist as claimed. This is a verification gap - the migration file itself is internally consistent and free of placeholders, but the claim that it was actually applied against real Supabase rests on apply-progress.md's narrative plus the live Playwright evidence (badge showing only "Contado", disabled field showing value 10), which is indirect but consistent corroborating evidence.

## Security-Critical Spec Scenario - Real Test Confirmed

Spec scenario "User without permission cannot override via API (security-critical)" has a genuine runtime-executed covering test, not just a task checkbox:

backend/src/services/cotizacion.service.test.js lines 307-317 - calcularPreview() invoked end-to-end (real MRC calculator, mocked repositories only) with usuarioSinPermiso = { puede_editar_descuento_plan: false } and a body requesting 5% discount. Assertion: total_descuentos equals 2950 (10% of 29500), not 1475 (5%). This test ran and passed in the suite executed above.

The counterpart "User with permission can override" scenario also has a real passing test at lines 319-328 (5% respected when puede_editar_descuento_plan is true).

## Spec Scenario Compliance Matrix (11 scenarios in spec.md)

1. New MRC plan seeded with fixed discount - PASS. Migration + applied to real Supabase (plan id 20 per apply-progress.md); descuento_default travels via pre-existing select('\*') in ramos.repository.js; corroborated live by Playwright showing field prefilled to 10.
2. Plan restricted to Contado - PASS. Migration seeds only contado.habilitada=TRUE; live Playwright confirms only "Contado" badge shown.
3. Permission defaults false for non-admin roles - PASS. ALTER ... DEFAULT FALSE plus explicit UPDATE for the 3 confirmed roles; live-verified 3 roles with TRUE.
4. Permission editable from admin Roles section only - PASS. Code inspection: checkbox present only in Roles modal, absent from user-edit form. No frontend test framework exists in this project (pre-existing convention) - compliance is code-review-level, consistent with the rest of the admin panel in this codebase.
5. Backend enforcement description (3 IF-branches) - PASS. resolverDescuentos() unit tests cover all 3 branches plus edge cases (undefined usuario, undefined body, combinado plan never forces) - 7 unit tests, all passing.
6. User without permission cannot override (security-critical) - PASS. Real runtime test, see above.
7. User with permission can override - PASS. Real runtime test, see above.
8. Plans without descuento_default unaffected - PASS. 154 pre-existing tests unchanged and green; dedicated Auto cotizacion_combinada regression test proves no double-discount.
9. Design resolves cap interaction - PASS. mrc.calculator.test.js: forzadoPorPlan=true gives full 10% despite usuario.descuento_maximo_pct=5; forzadoPorPlan=false clamps to 5% (no-regression) - both assertions run and pass.
10. Field prefilled and disabled for restricted user - PASS. Live Playwright verification (task 4.1): disabled confirmed on both inputs, value 10, hint text "Descuento fijo del plan".
11. Field editable for permitted user - WARNING, untested at runtime. Task 4.2 was explicitly skipped. Code review confirms bloqueado correctly evaluates to false when usuario.puede_editar_descuento_plan is true, but no automated frontend test exists in this project and the live manual check was not performed for this specific path.
12. Stale session does not grant permission early - PASS. Architecturally guaranteed: requireAuth (backend/src/middleware/auth.js) re-fetches the user from DB on every request via usuariosRepository.findById() - it never trusts the JWT payload's cached permission claims. No caching layer on the backend side for this field.

## Task 4.2 Skip - Assessment

apply-progress.md justifies skipping the permission-holder frontend manual check because: (a) it would require temporarily granting the permission to a role outside the 3 confirmed roles against real Supabase, then reverting; (b) the underlying override behavior is proven by real backend tests (2.6/2.7).

Assessment: the justification is sound for the backend-enforced part of the guarantee, but leaves scenario 11 (a pure frontend UI scenario) genuinely without runtime coverage. The risk is low because:

- The bloqueado boolean is a trivial one-line negation, already reviewed byte-for-byte in the diff.
- The backend is the actual security boundary (the spec's own "Stale session" scenario explicitly says the frontend disabled attribute is cosmetic and the backend must enforce regardless) - that boundary IS tested at runtime.
- The locked-state path (scenario 10, the higher-risk direction where a restricted user could otherwise submit an arbitrary discount) WAS verified live.

This is a WARNING, not a CRITICAL: it does not block the security guarantee (which is backend-enforced and tested), but it is a real, undischarged manual-verification task that should be closed out - ideally by Kevin logging in as "Analista de Riesgo" or "Jefe de Analisis de Riesgo" (both already have the permission from the applied migration, so no throwaway grant/revert against Supabase is needed) and confirming the field is editable.

## Issues

### CRITICAL

None.

### WARNING

1. Spec scenario "Field editable for permitted user" has no runtime/manual verification (task 4.2 skipped). Low risk given trivial logic and a backend-enforced boundary, but recommend Kevin close this out using an existing permitted role (Analista de Riesgo / Jefe de Analisis de Riesgo) rather than a throwaway grant - no Supabase mutation needed.
2. Live Supabase state (plan id 20, 3 roles, 5 plan_coberturas rows) could not be independently re-queried in this verification pass - no Supabase MCP tool was available in this session. Confidence is high based on migration-file consistency and corroborating live-UI evidence, but this is indirect, not a direct DB read.

### SUGGESTION

1. Consider a dedicated unit/integration test asserting descuento_default is actually present in the GET planes-by-ramo response payload for the new plan (spec scenario 1) - today this passes "by construction" via the pre-existing select('\*') pattern, which is correct but has zero direct test coverage tying the migration to the endpoint contract.
2. No automated frontend test exists in this project for either admin.js or cotizar.js - this is a pre-existing project convention, not a regression introduced by this change, but it is the reason WARNING #1 above cannot be closed with an automated test today.

## Final Verdict: PASS WITH WARNINGS

Implementation matches design.md decisions exactly with zero deviations found under direct diff inspection. The security-critical spec scenario has genuine, real, passing runtime test coverage - not just a checked task box. 166/166 backend tests pass (independently re-run, not just trusted from the log). The two WARNINGs (one frontend scenario without runtime verification, one live-DB claim not independently re-queried) do not block archival but should be tracked; neither represents a security or correctness defect in the implementation itself.
