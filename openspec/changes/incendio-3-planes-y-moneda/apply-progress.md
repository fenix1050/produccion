# Apply Progress: Incendio — 3 planes nuevos (Hipotecario, con/sin Inspección) + moneda USD/Gs.

**Artifact store**: OpenSpec only (Engram no disponible en esta sesión).
**Delivery strategy**: `stacked-to-main` — 4 PRs encadenados, cada uno apunta al branch del PR anterior en secuencia (ver "Review Workload Forecast" en `tasks.md`, decisión ya acordada con el usuario).

## Batch 1 (este batch) — PR 1: Migraciones + servicio de tipo de cambio

**Branch**: `feature/incendio-moneda-pr1-migraciones-tipo-cambio` (creada a partir de `origin/main`). Commiteado localmente, **no pusheado ni PR abierto** — queda a cargo del orquestador.

### Grupo 1 — Migraciones SQL (tasks 1.1–1.5)

| Task | Archivo                                                    | Estado |
| ---- | ---------------------------------------------------------- | ------ |
| 1.1  | `backend/migrations/034_moneda_cotizaciones.sql`           | [x]    |
| 1.2  | `backend/migrations/035_planes_tipo_mecanica_y_umbral.sql` | [x]    |
| 1.3  | `backend/migrations/036_tasas_riesgo_objeto.sql`           | [x]    |
| 1.4  | `backend/migrations/037_tipos_cambio.sql`                  | [x]    |
| 1.5  | `backend/migrations/038_seed_incendio_3_planes.sql`        | [x]    |

Todas aditivas (sin `DROP`, sin cambio de tipo de columnas existentes), en el orden fijo 034→035→036→037→038. Estas migraciones **no fueron aplicadas contra la base de Supabase real** en este batch (no hay conexión de DB en esta sesión) — quedan como archivos SQL listos para que el flujo de migraciones del proyecto las aplique.

### Grupo 2 — Servicio de tipo de cambio (tasks 2.1–2.3)

| Task | Archivo                                                  | Estado |
| ---- | -------------------------------------------------------- | ------ |
| 2.1  | `backend/src/services/tipo-cambio.service.test.js` (RED) | [x]    |
| 2.2  | `backend/src/repositories/tipos-cambio.repository.js`    | [x]    |
| 2.3  | `backend/src/services/tipo-cambio.service.js` (GREEN)    | [x]    |

Servicio aislado — todavía no lo consume `cotizacion.service.js` (eso llega en el PR 3, grupo 5).

## TDD Cycle Evidence (Strict TDD)

| Task                        | RED                                                                                                                           | GREEN                                                                              | REFACTOR                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 2.1/2.3 tipo-cambio.service | 7 tests escritos primero; corridos y confirmados en rojo con `ERR_MODULE_NOT_FOUND` (ni el repository ni el service existían) | Implementado `tipos-cambio.repository.js` + `tipo-cambio.service.js`; 7/7 en verde | `eslint --fix` reordenó imports; sin cambios de lógica |

Migraciones SQL (grupo 1) no son código con test unitario propio — son schema aditivo, verificado por lectura/consistencia contra `design.md` y el estilo de migraciones existentes (013, 018, 023).

## Work Unit Evidence

| Evidence                                | Valor                                                                                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused test command y resultado exacto | `node --experimental-test-module-mocks --test src/services/tipo-cambio.service.test.js` → 7/7 pass                                                                                                 |
| Runtime harness / regresión completa    | `npm test --prefix backend` → 73/73 pass (66 preexistentes + 7 nuevos), 0 fallos, 0 regresiones                                                                                                    |
| Rollback boundary                       | Revertir el commit único de este PR revierte 8 archivos nuevos (5 migraciones + repository + service + test) sin tocar ningún archivo existente — cero código productivo modificado, solo agregado |

## Files Changed

| File                                                       | Action  |
| ---------------------------------------------------------- | ------- |
| `backend/migrations/034_moneda_cotizaciones.sql`           | Created |
| `backend/migrations/035_planes_tipo_mecanica_y_umbral.sql` | Created |
| `backend/migrations/036_tasas_riesgo_objeto.sql`           | Created |
| `backend/migrations/037_tipos_cambio.sql`                  | Created |
| `backend/migrations/038_seed_incendio_3_planes.sql`        | Created |
| `backend/src/repositories/tipos-cambio.repository.js`      | Created |
| `backend/src/services/tipo-cambio.service.js`              | Created |
| `backend/src/services/tipo-cambio.service.test.js`         | Created |

**Líneas cambiadas**: 687 (`git diff --stat` del commit) — dentro del presupuesto de 800/PR.

## Deviations from Design

- **`clausulas_catalogo.plan_id` (nueva columna, agregada en 038, no estaba en `design.md`)**: la spec "Hipotecario legal content" exige que las 5 cláusulas legales queden asociadas al plan Hipotecario específicamente como datos estructurados recuperables al leer la data del plan. `clausulas_catalogo` (migración 003) es hoy un catálogo por RAMO sin forma de marcar "esta cláusula es obligatoria de este plan" — la selección real ocurre por cotización vía `cotizacion_clausulas`. Se agregó `plan_id BIGINT NULL REFERENCES planes(id)` (aditiva, nullable, mismo patrón ya usado en `tasas_riesgo_objeto.plan_id` de la migración 036): `NULL` preserva el significado actual para las filas existentes, un valor no-NULL marca "cláusula obligatoria de ESE plan". Documentado con comentario extenso en el propio archivo de migración 038.
- Todo lo demás sigue el DDL y los contratos de `design.md` tal cual (nombres de tabla/columna, `tasa_valor` explícita en vez de calculada, `plan_id` nullable en `tasas_riesgo_objeto`, `withCache` TTL 15 min, `fetchDolarPy(signal)`, fallback `stale:true`, 422 explícito).

## Issues Found

None.

## Remaining Tasks (siguientes batches)

- **PR 2** (grupos 3 y 4 de `tasks.md`): calculador de Incendio (tercera mecánica `objeto_riesgo`, tests RED primero) + schema Zod (`capital_instalaciones`, `capital_contenido_mueble_equipos`, `capital_contenido_mercaderia`, `moneda`). Branch sugerida: apuntar a `feature/incendio-moneda-pr1-migraciones-tipo-cambio` (stacked-to-main).
- **PR 3** (grupo 5 + grupo 7): service de cotización (integra tipo de cambio + calculador + schema), tests de integración/regresión completos.
- **PR 4** (grupo 6): frontend (selector de moneda, 4 campos de objeto de riesgo, `fmtMoneda`, historial).

## Status

8/23 tasks completas (grupos 1 y 2 de 7). Ready for next batch (PR 2 — grupos 3 y 4). No recomendado `sdd-verify` todavía: el cambio completo sigue `partial` hasta cerrar los 4 PRs de la cadena.
