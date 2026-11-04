# Propuesta Formal MRC — renderer visual v4

## Objective

New renderer revision `pf3-mrc-renderer-v4-r1` for the MRC Propuesta Formal PDF, replicating `docs/references/Modelo propuesta formal minimalista.pdf` as faithfully as possible, using the red/black Tajy logo (`frontend/login/assets/logo-rojo-con-negro.svg`). It coexists with v1, v2 and v3 without modifying them; only new proposals use it.

## Approved decisions (Kevin, 2026-11-04)

- Pagination: one page per topic (5 topics, 5 pages minimum). If a topic overflows it continues on an extra page with the same header. No font-fit scaling, no `V3_LAYOUTS`.
- Footer: left "TAJY • Aseguradora Tajy Prop. Coop. S.A."; right "Propuesta N.º <n> · Página X de Y". No mockup texts ("Documento conceptual", "Diseño alternativo B").
- No yellow "NOTA DE REVISIÓN" box at all.
- Renewal cell is hidden until the Sebaout API exists.
- Policy number: optional field `numero_poliza` (max 40 chars) in step 5 of the Propuesta form; the header shows "Póliza N.º" only when filled. Not part of `readiness`.
- Modalidad 1020: literal, as in v3.
- Distribución del capital / sublímites: parsed from the official texts (`coberturas_principales`, `condiciones_mrc`); plain text fallback if parsing fails.
- "Costo total" card: amount only, no mockup note.
- Carry over from v3: vigencia (+6 days, +1 year), hours, phone prefix, migration 078 texts.
- Scope: backend + a small frontend change (T0). No migrations. Deploys with the pending manual PROD deploy (backend first).

## Constraints

- Branch `feat/propuesta-formal-v4`, PR, never push to main. TDD strict (RED, GREEN, REFACTOR); runner: `node --experimental-test-module-mocks --test` from `backend/`, `node --test` from `frontend/` (source: project test scripts, TDD strict enabled in global config).
- TEST access only with Kevin's authorization per step; no PROD access.
- Issued Propuestas keep their immutable PDF/snapshot; v1/v2/v3 must keep resolving.
- ~400 changed lines per task is an advisory heuristic only.

## Tasks

- [x] T0: optional `numero_poliza` in draft schema (`propuestas.schema.js`) and form step 5 (`frontend/propuestas/propuestas.js`). RED observed (schema test + PF-4 frontend test), GREEN: backend schema+propuestas services 56/56, frontend propuestas 19/19.
- [x] T1: `PROPUESTA_FORMAL_V4_RENDERER_REVISION` declared (value `pf3-mrc-renderer-v4-r1`); alias stays v3 so each commit remains deployable. RED (missing export) then GREEN on `document-snapshot.service.test.js`.
- [ ] T1b (moved to the end, with T7/T8): flip `PROPUESTA_FORMAL_RENDERER_REVISION` to v4, add the dispatch branch in `propuesta-pdf.service.js`, update snapshot test (lines 458-479) to assert alias and `renderer_identity.revision` = v4.
- [ ] T2: `mrc-v4.js` skeleton: tokens, styles, cover header, continuation header, footer.
- [ ] T3: page 1 (cover, identification, locations, risk, Suma Asegurada / Prima band).
- [ ] T4: page 2 (sums table, main coverages, capital distribution bars, sublimits).
- [ ] T5: pages 3-4 (declarations, sworn statement, digital policy, particular conditions).
- [ ] T6: page 5 (cost and payment, debit, collection clause, observations, three signatures, ecological row).
- [ ] T7: pagination-with-continuation engine + service print/wait + fallback tests.
- [ ] T8: visual verification (normal + dense snapshot), ESTADO_PROYECTO section 124, Engram, PR.

## Progress

Branch created. T0 done and committed.

## Next step

T1: V4 revision constant, alias, dispatch, snapshot test (RED first).
