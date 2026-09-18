# Proposal: Listado de Propuestas Formales

## Intent

Hoy no existe pantalla para ver las Propuestas Formales generadas ni para anular una sin entrar a su wizard. Además `motivo_ineligibilidad_carta_propuesta` (migración 069) no excluye Cartas con propuesta ya emitida y `listar_cartas_oferta_aptas_propuesta` sólo expone `propuesta_borrador_id` para borradores activos (069:160), por lo que Historial ofrece "Preparar propuesta" sobre una Carta ya emitida, crea un borrador nuevo y el usuario recién choca con `PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA` (073) al emitir.

## Scope

### In Scope

- Migración `075`: recrear `listar_cartas_oferta_aptas_propuesta` (aditiva: `tiene_propuesta`, `propuesta_actual_id/_estado/_numero`) reaplicando el ACL de `070:325-331`; nueva `listar_propuestas_formales(...)` con scoping `p_es_admin OR c.agente_id = p_usuario_id`, `COUNT(*) OVER () AS total_registros` e índice `propuestas_formales_updated_at_idx`.
- `GET /propuestas`: `busqueda`, `estado` (7 estados + `'activa'`), `carta_oferta_id`, `limit` 1–100, `offset`; respuesta `{ data, count }`; flags `puede_continuar/_descargar/_anular` calculados en el service; `agente_id` removido de la fila.
- Nueva página `frontend/propuestas-listado/` (listado, búsqueda, filtro, paginación, modal de anulación con motivo obligatorio) + ítem de sidebar con clave propia `propuestas-listado`.
- Fix de Historial vía módulo puro `frontend/historial/propuesta-accion.js`.

### Out of Scope

- Tocar `frontend/propuestas/propuestas.{js,css,test.js}` (Codex trabaja ahí en simultáneo).
- Tope de 100 en `cartas-aptas` (preexistente), despliegue a PROD, paginación por cursor.

## Capabilities

### New Capabilities

- `propuestas-formales-listado`: listado, scoping por agente/admin, filtros, paginación y acciones por estado/permiso.
- `historial-accion-propuesta`: decisión Preparar / Reabrir / Ver propuestas según el estado de la propuesta de la Carta.

### Modified Capabilities

- None (no hay spec previa de Propuestas Formales).

## Approach

Una función SQL `SECURITY INVOKER` resuelve la búsqueda cruzada (propuesta ↔ carta ↔ cotización), inexpresable como `OR` de PostgREST sobre embeds y con riesgo de fuga horizontal si falta un `!inner` (ver `coberturas.repository.js:10`). El cambio a la función existente es aditivo: `supabase.rpc()` mapea por nombre de columna, así que el wizard de Codex sigue funcionando sin tocarse. El backend es la única fuente de verdad de permisos; la UI sólo refleja flags. `propuesta-accion.js` degrada al comportamiento actual si faltan los campos de 075.

## Affected Areas

| Área                                                                                             | Impacto  | Descripción                                           |
| ------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------- |
| `backend/migrations/075_*.sql` (+test)                                                           | New      | DROP+CREATE con ACL reaplicado, función nueva, índice |
| `backend/src/services/propuestas/listado.service.js` (+test)                                     | New      | Scoping, expansión `'activa'`, flags                  |
| `backend/src/controllers/propuestas.controller.test.js`                                          | New      | Hoy no existe test de este controller                 |
| `frontend/propuestas-listado/` (5 archivos)                                                      | New      | Página, guard, acciones puras, CSS                    |
| `frontend/historial/propuesta-accion.js` (+test), `historial.test.js`, `shared/sidebar.test.js`  | New      | Unit puros sobre fuente                               |
| `propuestas.routes.js`, `.controller.js`, `.repository.js`, `.schema.js`, `backend/package.json` | Modified | `GET /` + RPC + Zod + test de migración               |
| `frontend/historial/historial.js`, `shared/sidebar.js`, `shared/nav-icons.js`                    | Modified | Ramas de navegación, ítem e ícono                     |

## Risks

| Riesgo                                                                                      | Prob. | Mitigación                                                                                      |
| ------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| DROP FUNCTION borra el ACL → función expuesta a `anon`/`authenticated`                      | Med   | REVOKE/GRANT en la misma migración, test regex y verificación de `pg_proc.proacl` antes/después |
| `propuestas.test.js:18` (Codex) asserta `/\.\.\/propuestas\/\?carta=/` sobre `historial.js` | Med   | Conservar el literal en la rama "Carta sin propuesta"; avisar a Codex antes del merge           |
| Clave `active:'propuestas'` ya usada por el wizard (`propuestas.js:405`)                    | Med   | Clave propia `propuestas-listado` + resaltado compartido, cubierto por test de sidebar          |
| Backend nuevo contra base sin 075 → `PGRST202`                                              | Med   | Desplegar migración primero (el cambio aditivo tolera backend viejo)                            |
| Sobrecarga duplicada de la función en TEST: el DROP se lleva una sola firma                 | Baja  | Preflight con Supabase MCP apuntando a TEST, confirmado explícitamente                          |
| Paginación OFFSET sobre `updated_at DESC`                                                   | Baja  | Desempate por `id DESC`; aceptado igual que `GET /cotizaciones`                                 |

## Rollback Plan

- Frontend/backend: revertir el PR; el listado es aditivo y nada más lo consume.
- Base: migración de reversión que dropea `listar_propuestas_formales` y el índice, y recrea `listar_cartas_oferta_aptas_propuesta` con el cuerpo de 069 más el ACL de 070. Historial vuelve al comportamiento anterior automáticamente por la degradación de `propuesta-accion.js`.

## Dependencies

- Acceso Supabase MCP al proyecto **TEST** (confirmado explícitamente, no PROD) para preflight y verificación del ACL.
- Coordinación con Codex sobre el literal `../propuestas/?carta=` antes del merge.

## Success Criteria

- [ ] Suite backend en verde (270 → ~290 tests) y `npm run test:migrations:pf3` incluye 075.
- [ ] Un agente ve sólo sus propuestas; un admin ve todas; búsqueda por N° propuesta, N° carta y cliente.
- [ ] Continuar borrador, descargar PDF y anular (motivo <3 chars rechazado) funcionan desde el listado en TEST.
- [ ] Carta con propuesta emitida muestra "Ver propuestas" → listado filtrado; Carta sin propuesta sigue abriendo `../propuestas/?carta=`.
- [ ] `pg_proc.proacl` post-migración: sólo `service_role` con EXECUTE en ambas funciones.

## Discrepancias verificadas contra el código

1. `descargarPropuesta` (`emision.service.js:128`) sólo admite `['emitida','anulada']` — **no** `reemplazada`. `puede_descargar` debe espejar eso, corrigiendo el documento de partida.
2. El assert de Codex está en `propuestas.test.js:18`, no en la línea 19.
3. El archivo de la migración 069 es `069_propuestas_formales_borradores.sql`; 074 es la más alta, así que 075 es correcto.
4. `canDownload` (`:10-16`) y `anularPropuesta` (`:141-145`) coinciden con lo descrito.

## Decisiones de producto cerradas (no reabrir)

Página propia + ítem de sidebar (no pestaña en Historial) · Acciones por fila: Continuar / Descargar+Anular / Ver detalle · Rollout primero en TEST (backend, frontend y base separados de PROD).
