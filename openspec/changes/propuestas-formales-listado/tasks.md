# Tasks: Listado de Propuestas Formales

## Review Workload Forecast

| Field                   | Value                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Estimated changed lines | ~520–620 (migration+test ~180, backend ~180, frontend ~200, historial/sidebar ~60) |
| 400-line budget risk    | High                                                                               |
| Chained PRs recommended | Yes                                                                                |
| Suggested split         | PR 1 (migration) → PR 2 (backend) → PR 3 (frontend + historial/sidebar)            |
| Delivery strategy       | ask-on-risk                                                                        |
| Chain strategy          | pending (user decision required)                                                   |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                                | Likely PR | Focused test command                                            | Runtime harness                                                       | Rollback boundary                                |
| ---- | --------------------------------------------------- | --------- | --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| 1    | Migration 075 (SQL + regex test)                    | PR 1      | `npm run test:migrations:pf3`                                   | Supabase MCP preflight on TEST project (proacl check)                 | Revert PR; additive, no consumer yet             |
| 2    | Backend: schema/repository/service/controller/route | PR 2      | `node --experimental-test-module-mocks --test src/**/*.test.js` | `GET /propuestas` via curl/Playwright against local backend + TEST DB | Revert PR; route unused by frontend until PR 3   |
| 3    | Frontend listado page + historial fix + sidebar     | PR 3      | `node --test **/*.test.js` (frontend)                           | Manual browser check in TEST per proposal Success Criteria            | Revert PR; page/nav item removable independently |

## Phase 1: Migración (PR 1)

- [x] 1.1 RED: write `backend/migrations/075_listado_propuestas_formales.test.js` asserting DROP with explicit signature, `SECURITY INVOKER`+`SET search_path` on both functions, `COUNT(*) OVER ()`, scoping WHERE, index, REVOKE+GRANT per function (no anon/authenticated grant), REVOKE after CREATE (`indexOf` order). Confirm it fails (file doesn't exist yet).
- [x] 1.2 GREEN: write `075_listado_propuestas_formales.sql` per design.md steps 1-5 (DROP+CREATE additive `listar_cartas_oferta_aptas_propuesta`, new `listar_propuestas_formales`, index, ACL for both).
- [x] 1.3 Add `migrations/075_listado_propuestas_formales.test.js` to `test:migrations:pf3` in `backend/package.json`.
- [ ] 1.4 Preflight + apply migration 075 against TEST: confirm no extra overload of `listar_cartas_oferta_aptas_propuesta`, apply the migration, verify `pg_proc.proacl` before/after (service_role only, both functions). **PENDIENTE — ACCIÓN MANUAL DE KEVIN**: la base de TEST vive en el servidor (VPS), no en un proyecto administrado por el MCP de Supabase de esta sesión (confirmado por Kevin 2026-09-18). Ningún agente de esta sesión puede aplicar esto sin acceso remoto autorizado explícitamente al servidor.

## Phase 2: Backend (PR 2)

- [x] 2.1 RED: `backend/src/schemas/propuestas.schema.test.js` (or existing suite) — `listarPropuestasQuerySchema` rejects `limit=0`, `limit=101`, invalid `estado`.
- [x] 2.2 GREEN: add `listarPropuestasQuerySchema` to `propuestas.schema.js`.
- [x] 2.3 RED: `propuestas.repository.test.js` — `listarPropuestas` calls `supabase.rpc('listar_propuestas_formales', …)` and unwraps `{ data, count }` from `total_registros`.
- [x] 2.4 GREEN: implement `listarPropuestas(...)` in `propuestas.repository.js`.
- [x] 2.5 RED: `services/propuestas/listado.service.test.js` — `'activa'` expands to `ESTADOS_VIVOS`; `puede_continuar/_descargar/_anular` per state/role mirroring `emision.service.js:10-16,128,141-145`; `agente_id` deleted from row.
- [x] 2.6 GREEN: create `listado.service.js`.
- [x] 2.7 RED: `propuestas.controller.test.js` (new file) — `listar()` parses query via Zod, 400 on invalid input, scopes non-admin caller.
- [x] 2.8 GREEN: add `listar` to `propuestas.controller.js`; wire `router.get('/', propuestasController.listar)` as first route in `propuestas.routes.js`.

## Phase 3: Frontend listado page (PR 3a)

- [x] 3.1 RED: `frontend/propuestas-listado/acciones.test.js` — `accionesDeFila` returns correct action set per flag combination (row scenario from spec: `puede_continuar=false,puede_descargar=true,puede_anular=false` → only download).
- [x] 3.2 GREEN: create `acciones.js`, `propuestas-listado.js`, `propuestas-listado-guard.js`, `index.html`, `propuestas-listado.css` — list, search, estado filter, pagination, anular modal (motivo 3–1000 chars), 403/409 mapped to safe messages per spec.

## Phase 4: Historial fix + sidebar (PR 3b)

- [x] 4.1 RED: `frontend/historial/propuesta-accion.test.js` — 6 scenarios from `historial-accion-propuesta` spec (sin propuesta, borrador activo, emitida/anulada/reemplazada, degradación sin campos 075). Assert literal `../propuestas/?carta=` preserved in "sin propuesta" branch.
- [x] 4.2 GREEN: create `propuesta-accion.js` with `decidirAccionPropuesta`.
- [x] 4.3 GREEN: update `historial.js` to delegate to `propuesta-accion.js`. Verify `propuestas.test.js:18` regex still passes unmodified — do not touch `frontend/propuestas/*`.
- [x] 4.4 RED: `shared/sidebar.test.js` — `active:'propuestas'` and `active:'propuestas-listado'` both highlight the same nav group independently; item hrefs per design.md.
- [x] 4.5 GREEN: update `shared/sidebar.js` (`enPropuestas` check, conditional href) and `shared/nav-icons.js` (new icon).

## Phase 5: Verification

- [ ] 5.1 Run full backend suite (`node --experimental-test-module-mocks --test src/**/*.test.js`) and `npm run test:migrations:pf3`; confirm 270 → ~290 tests green.
- [ ] 5.2 Manual TEST pass: agent-scoped vs admin listing, search by número/carta/cliente, continuar/descargar/anular, carta with emitida propuesta shows "Ver propuestas", carta without propuesta still opens `../propuestas/?carta=`.

## Phase 6: sdd-verify fix (C-1)

- [x] 6.1 FIX C-1 (CRITICAL, sdd-verify): the "Ver propuestas" deep link (`propuesta-accion.js:42`, `?carta_oferta_id=<id>`) was functionally inert — `frontend/propuestas-listado/propuestas-listado.js` never read `window.location.search`, so `cargarPropuestas()` never sent `carta_oferta_id` to the backend despite full backend support (schema → service → repository → RPC). RED: `frontend/propuestas-listado/propuestas-listado.test.js` (mounts the page with `?carta_oferta_id=777` via jsdom + mocked `fetch`, asserts the effective `GET /propuestas` call includes `carta_oferta_id=777`); confirmed failing against pre-fix source (`http://localhost:3000/api/propuestas?limit=20&offset=0`, no `carta_oferta_id`). GREEN: added `state.cartaOfertaId` populated from `leerCartaOfertaIdDesdeUrl()` in `init()`, included in `cargarPropuestas()`'s query params, plus a minimal "Mostrando propuestas de la Carta N° X — Ver todas" banner when active. Full frontend suite green (107/107, `node --test **/*.test.js`). Did not touch `frontend/propuestas/*` (Codex's parallel work).
