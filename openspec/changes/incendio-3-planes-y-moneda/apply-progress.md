# Apply Progress: Incendio — 3 planes nuevos (Hipotecario, con/sin Inspección) + moneda USD/Gs.

**Artifact store**: OpenSpec only (Engram no disponible en esta sesión).
**Delivery strategy**: `stacked-to-main` — 4 PRs encadenados, cada uno apunta al branch del PR anterior en secuencia (ver "Review Workload Forecast" en `tasks.md`, decisión ya acordada con el usuario).

## Batch 1 — PR 1: Migraciones + servicio de tipo de cambio

**Branch**: `feature/incendio-moneda-pr1-migraciones-tipo-cambio` (creada a partir de `origin/main`). Commiteado localmente, **no pusheado ni PR abierto** — quedó a cargo del orquestador.

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

## Batch 2 — PR 2: Calculador (tercera mecánica) + schema Zod

**Branch**: `feature/incendio-moneda-pr2-calculador-schema`, creada a partir de `origin/feature/incendio-moneda-pr1-migraciones-tipo-cambio` (stacked-to-main: este PR apunta al branch del PR 1, no directo a `main`). Commiteado localmente, **no pusheado ni PR abierto** — queda a cargo del orquestador.

### Grupo 3 — Calculador de Incendio (tasks 3.1, 3.2)

| Task | Archivo                                                     | Estado |
| ---- | ----------------------------------------------------------- | ------ |
| 3.1  | `backend/src/calculators/incendio.calculator.test.js` (RED) | [x]    |
| 3.2  | `backend/src/calculators/incendio.calculator.js` (GREEN)    | [x]    |

Nueva mecánica `objeto_riesgo`: `OBJETOS_RIESGO` (mapeo campo→objeto→código de catálogo), dispatch `mecanica = plan.tipo_mecanica ?? (plan.nombre === NOMBRE_PLAN_MAQUINARIA ? 'maquinaria' : 'edificio_contenido')`, `calcularPorObjetoRiesgo({plan, riesgoDatos, catalogoPorCodigo, tasasObjetoRiesgo, umbralInspeccion, moneda})` y `pisoPrimaTecnica(plan, moneda)`. Las 2 mecánicas existentes (`edificio_contenido`, `maquinaria`) no se tocaron salvo el punto de dispatch — sus tests siguen intactos y en verde.

### Grupo 4 — Schema Zod (task 4.1)

| Task | Archivo                                  | Estado |
| ---- | ---------------------------------------- | ------ |
| 4.1  | `backend/src/schemas/incendio.schema.js` | [x]    |

Agregados `capital_instalaciones`, `capital_contenido_mueble_equipos`, `capital_contenido_mercaderia` (todos `z.number().nonnegative().optional()`) a `riesgoIncendioSchema`, y `moneda: z.enum(['PYG','USD']).default('PYG')` a `cotizarIncendioSchema`. Sin test unitario dedicado — no hay precedente de tests de schema Zod en este proyecto (ningún `*.schema.test.js` existe en `backend/src/schemas/`); el schema es declarativo (agregado de campos opcionales + enum con default, sin branching) y su cobertura real vendrá de los tests de integración de `cotizacion.service` en el PR 3 (grupo 7).

## TDD Cycle Evidence (Strict TDD)

| Task                                                 | RED                                                                                                                                                                                                                                                                                                                                                                                                                                                             | GREEN                                                                                                                                                                   | REFACTOR                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1/2.3 tipo-cambio.service                          | 7 tests escritos primero; corridos y confirmados en rojo con `ERR_MODULE_NOT_FOUND` (ni el repository ni el service existían)                                                                                                                                                                                                                                                                                                                                   | Implementado `tipos-cambio.repository.js` + `tipo-cambio.service.js`; 7/7 en verde                                                                                      | `eslint --fix` reordenó imports; sin cambios de lógica                                                                                                                                                                                                                                       |
| 3.1/3.2 incendio.calculator (mecánica objeto_riesgo) | 14 tests nuevos escritos primero (4/4 objetos declarados, objeto no declarado no suma, sin objetos → 422, tipo de riesgo sin tasas → 422, suma > responsabilidad máxima → 422, clamp tasa_minima, umbral sin/con Inspección, Hipotecario exento, piso PYG, piso USD, USD sin piso → 422, dispatch por tipo_mecanica, dispatch fallback por nombre); corridos contra el código viejo (dispatch ignoraba `tipo_mecanica`) y confirmados en rojo — 3 fallos reales | Implementado `OBJETOS_RIESGO`, `calcularPorObjetoRiesgo`, `pisoPrimaTecnica`, dispatch por `tipo_mecanica`; 27/27 en verde en el archivo (13 preexistentes + 14 nuevos) | Redondeo a 2 decimales en `costo` y en la prima clampeada para eliminar ruido de punto flotante (ej. `100_000_000*0.9/100` da `900000.0000000001` en JS puro) — descubierto recién en GREEN/TRIANGULATE; `prettier --write` reformateó el ternario anidado de dispatch, sin cambio de lógica |
| 4.1 incendio.schema (Zod)                            | Sin test dedicado — ningún schema del proyecto tiene test unitario propio (ver Grupo 4 arriba); cambio estructural (campos opcionales + enum con default, sin lógica condicional)                                                                                                                                                                                                                                                                               | Campos agregados; validado por lectura contra `design.md` y por los 87/87 tests de la suite completa en verde (no rompe ningún consumidor existente)                    | N/A                                                                                                                                                                                                                                                                                          |

Migraciones SQL (grupo 1) no son código con test unitario propio — son schema aditivo, verificado por lectura/consistencia contra `design.md` y el estilo de migraciones existentes (013, 018, 023).

## Work Unit Evidence

| Evidence                                       | Valor                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused test command y resultado exacto (PR 1) | `node --experimental-test-module-mocks --test src/services/tipo-cambio.service.test.js` → 7/7 pass                                                                                                                                                                      |
| Focused test command y resultado exacto (PR 2) | `node --test src/calculators/incendio.calculator.test.js` → 27/27 pass (13 preexistentes + 14 nuevos, 0 regresiones en las 2 mecánicas viejas)                                                                                                                          |
| Runtime harness / regresión completa (PR 1)    | `npm test --prefix backend` → 73/73 pass (66 preexistentes + 7 nuevos), 0 fallos, 0 regresiones                                                                                                                                                                         |
| Runtime harness / regresión completa (PR 2)    | `npm test --prefix backend` → 87/87 pass (73 de PR 1 + 14 nuevos del calculador), 0 fallos, 0 regresiones; `npx eslint` sin errores sobre los 3 archivos tocados                                                                                                        |
| Rollback boundary (PR 1)                       | Revertir el commit único de este PR revierte 8 archivos nuevos (5 migraciones + repository + service + test) sin tocar ningún archivo existente — cero código productivo modificado, solo agregado                                                                      |
| Rollback boundary (PR 2)                       | Revertir el commit único de este PR revierte 2 archivos modificados (`incendio.calculator.js`, `incendio.schema.js`) y 1 test extendido (`incendio.calculator.test.js`) — las 2 mecánicas existentes quedan intactas porque el dispatch conserva el fallback por nombre |

## Files Changed

| File                                                       | Action   |
| ---------------------------------------------------------- | -------- |
| `backend/migrations/034_moneda_cotizaciones.sql`           | Created  |
| `backend/migrations/035_planes_tipo_mecanica_y_umbral.sql` | Created  |
| `backend/migrations/036_tasas_riesgo_objeto.sql`           | Created  |
| `backend/migrations/037_tipos_cambio.sql`                  | Created  |
| `backend/migrations/038_seed_incendio_3_planes.sql`        | Created  |
| `backend/src/repositories/tipos-cambio.repository.js`      | Created  |
| `backend/src/services/tipo-cambio.service.js`              | Created  |
| `backend/src/services/tipo-cambio.service.test.js`         | Created  |
| `backend/src/calculators/incendio.calculator.js`           | Modified |
| `backend/src/calculators/incendio.calculator.test.js`      | Modified |
| `backend/src/schemas/incendio.schema.js`                   | Modified |

**Líneas cambiadas PR 1**: 687 (`git diff --stat` del commit) — dentro del presupuesto de 800/PR.
**Líneas cambiadas PR 2**: ~330 (calculador + test + schema) — dentro del presupuesto de 800/PR, coherente con la estimación de `Review Workload Forecast` (~150 grupo 3 + ~15 grupo 4).

## Deviations from Design

- **`clausulas_catalogo.plan_id` (nueva columna, agregada en 038, no estaba en `design.md`)**: la spec "Hipotecario legal content" exige que las 5 cláusulas legales queden asociadas al plan Hipotecario específicamente como datos estructurados recuperables al leer la data del plan. `clausulas_catalogo` (migración 003) es hoy un catálogo por RAMO sin forma de marcar "esta cláusula es obligatoria de este plan" — la selección real ocurre por cotización vía `cotizacion_clausulas`. Se agregó `plan_id BIGINT NULL REFERENCES planes(id)` (aditiva, nullable, mismo patrón ya usado en `tasas_riesgo_objeto.plan_id` de la migración 036): `NULL` preserva el significado actual para las filas existentes, un valor no-NULL marca "cláusula obligatoria de ESE plan". Documentado con comentario extenso en el propio archivo de migración 038.
- **Clamp de `tasa_minima`/`tasa_maxima` aplicado a la tasa EFECTIVA agregada, no a cada objeto individualmente**: `design.md` (sección "Riesgos técnicos") dejaba la semántica del clamp como pregunta abierta y decía explícitamente "NO se aplican como clamp hasta confirmar". El brief de este batch cerró la decisión: sí aplicar clamp. La implementación calcula `tasaEfectiva = costoTotal / sumaTotal` (ponderada sobre los objetos realmente declarados) y la clampea contra `tasa_minima`/`tasa_maxima` del tipo de riesgo — no clampea la tasa de cada objeto por separado, porque el requirement de spec dice literalmente "clamp the effective rate applied to a risk type's **premium calculation**" (singular, a nivel del cálculo agregado), y las tasas por objeto ya son datos oficiales redondeados que no deben tocarse individualmente (mismo criterio que "Decision: tasa_valor explícita... no factor calculado" del design). Documentado en el JSDoc de `calcularPorObjetoRiesgo`.
- **Redondeo a 2 decimales por costo de objeto y en la prima clampeada**: no estaba en `design.md` porque no era necesario para las 2 mecánicas viejas (siempre dividen por 1000 con tasas enteras/‰, sin drift). La mecánica `objeto_riesgo` divide por 100 con tasas decimales (0,90% / 1,34%), lo que sí produce ruido de punto flotante de JS (`100_000_000 * 0.9 / 100 === 900000.0000000001`). Se descubrió al correr GREEN, no al escribir RED — la fórmula era correcta, solo faltaba el redondeo. Mismo orden de magnitud que las demás primas del proyecto (Gs./USD no manejan sub-centavos).
- Todo lo demás sigue el DDL y los contratos de `design.md` tal cual (nombres de tabla/columna, `tasa_valor` explícita en vez de calculada, `plan_id` nullable en `tasas_riesgo_objeto`, `withCache` TTL 15 min, `fetchDolarPy(signal)`, fallback `stale:true`, 422 explícito, firma de `calcularPorObjetoRiesgo`/`pisoPrimaTecnica` tal como está en la sección "Interfaces / Contracts").

## Issues Found

None.

## Remaining Tasks (siguientes batches)

- **PR 3** (grupo 5 + grupo 7): service de cotización (`resolverUmbralInspeccion`, `findTasasRiesgoObjeto`, extensión de `resolverContextoRepositorios` con el parámetro `moneda`, persistencia de `moneda`/snapshot en `cotizaciones.repository.js` solo al emitir), tests de integración/regresión completos. Depende de los grupos 2 (tipo de cambio, PR 1), 3 y 4 (calculador y schema, PR 2) — ya están todos disponibles.
- **PR 4** (grupo 6): frontend (selector de moneda, 4 campos de objeto de riesgo, `fmtMoneda`, historial). Depende del contrato de API estable del PR 3.

## Status

11/23 tasks completas (grupos 1, 2, 3 y 4 de 7). Ready for next batch (PR 3 — grupo 5 + grupo 7). No recomendado `sdd-verify` todavía: el cambio completo sigue `partial` hasta cerrar los 4 PRs de la cadena.
