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

## Batch 3 — PR 3: Service de cotización (integración) + tests de integración/regresión

**Branch**: `feature/incendio-moneda-pr3-service-integracion`, creada a partir de `feature/incendio-moneda-pr2-calculador-schema` (stacked-to-main: este PR apunta al branch del PR 2, no directo a `main`). Commiteado localmente, **no pusheado ni PR abierto** — queda a cargo del orquestador.

### Grupo 5 — Service de cotización (tasks 5.1, 5.2, 5.3)

| Task | Archivo                                               | Estado |
| ---- | ----------------------------------------------------- | ------ |
| 5.1  | `backend/src/repositories/coberturas.repository.js`   | [x]    |
| 5.2  | `backend/src/services/cotizacion.service.js`          | [x]    |
| 5.3  | `backend/src/repositories/cotizaciones.repository.js` | [x]    |

- **5.1** `findTasasRiesgoObjeto(ramoId, tipoRiesgoNombre, planId)`: resuelve cabecera `tipos_riesgo_incendio` (por `ramo_id` + `nombre`, `activo=true`) + detalle `tasas_riesgo_objeto` (`tipo_riesgo_id`, `activo=true`, `plan_id IS NULL OR plan_id = :planId`). Merge en memoria: una fila con `plan_id` no-nulo reemplaza a la fila genérica del mismo `objeto_riesgo` sin importar el orden en que Supabase las devuelva. `null` si el tipo de riesgo no existe/no está activo, o si no hay ninguna fila de tasa.
- **5.2** `resolverUmbralInspeccion(plan, moneda)`: `null` si `plan.requiere_inspeccion IS NULL` o falta `umbral_inspeccion_monto`. Si `moneda === plan.umbral_inspeccion_moneda` no hay I/O (no se invoca tipo-cambio.service). Si difieren, invoca `obtenerTipoCambioVigente({moneda:'USD'})` y convierte el **umbral** (no la suma declarada) a la moneda de la cotización usando `venta` — sin conversión implícita de montos declarados (Decision de design.md). `resolverContextoRepositorios` ahora recibe `moneda` como 5º parámetro; para `ramo.calculador==='incendio' && plan.tipo_mecanica==='objeto_riesgo'` agrega `tasasObjetoRiesgo` (vía `withCache('tasasObjeto:{ramoId}:{tipoRiesgoNombre}:{planId}')`, usando `riesgoDatos.rubro_actividad` como nombre del tipo de riesgo — mismo campo que reusa la mecánica `edificio_contenido` para el rubro) y `umbralInspeccion` al contexto devuelto al calculador. `construirVariantes` resuelve `moneda = datosValidados.moneda ?? 'PYG'` y la pasa explícita al calculador (no solo embebida en el contexto), y devuelve además `moneda` y `tipoCambioUsado` (el `tipoCambio` que `resolverUmbralInspeccion` haya resuelto, si lo resolvió) para que `crearCotizacion`/`actualizarCotizacion` decidan la persistencia de 5.3.
- **5.3** `crearCotizacion` pasa `moneda: variantesCalculadas.moneda` y, solo si `variantesCalculadas.tipoCambioUsado` no es `null`, `tipo_cambio_snapshot/_fuente/_fecha` al `insertCotizacion`. `calcularPreview` nunca invoca `insertCotizacion`, así que el preview nunca persiste nada — no hizo falta tocar el repository para eso, ya lo garantiza el call graph existente. `actualizarCotizacion` recibe el mismo tratamiento en su `updateCotizacion` (edición de una cotización ya persistida es otro camino de "emisión", no de preview). En el repository (`cotizaciones.repository.js`) se documentaron con comentarios `insertCotizacion`/`findCotizacionById`/`findCotizaciones`: como usan `insert(cotizacion)` sin whitelist y `select('*')`, las columnas nuevas de la migración 034 viajan automáticamente sin cambio de código — el "exponer moneda en las lecturas" del enunciado ya estaba cubierto por `*`.

### Grupo 7 — Tests de integración y regresión (tasks 7.1, 7.2)

| Task | Archivo                                                          | Estado |
| ---- | ---------------------------------------------------------------- | ------ |
| 7.1  | `backend/src/services/cotizacion.service.test.js` (nuevo)        | [x]    |
| 7.1  | `backend/src/repositories/coberturas.repository.test.js` (nuevo) | [x]    |
| 7.2  | `npm test --prefix backend` completo                             | [x]    |

No existía `cotizacion.service.test.js` en el proyecto (verificado antes de empezar — el enunciado decía "buscar el archivo... o similar"); se creó nuevo, siguiendo el mismo patrón de `admin/roles.service.test.js`/`admin/usuarios.service.test.js` (`node:test` + `t.mock.module` para los repositories y `tipo-cambio.service.js`, cache-busting con query string por test para forzar la reevaluación de `cotizacion.service.js` contra el mock de ESE test, `invalidarCacheCatalogos()` al inicio de cada test para no arrastrar entradas de `withCache` entre tests). 5 tests: `crearCotizacion` con `moneda:'USD'` persiste `moneda`+snapshot; `crearCotizacion` en la misma moneda del umbral NO persiste snapshot (columnas quedan `undefined`); `calcularPreview` nunca llega a `insertCotizacion`; resolución con override de plan (vía `tasasObjetoRiesgo` ya resuelto, simulando lo que devolvería 5.1) gana sobre la tasa genérica; `actualizarCotizacion` con nueva moneda persiste snapshot en el UPDATE. Se agregó además `coberturas.repository.test.js` (no estaba en el enunciado de 7.1 explícitamente, pero cubre directamente la lógica de merge override-vs-genérica de 5.1 con `supabase` mockeado a nivel de query builder) — 5 tests: override gana con la genérica primero en el array, override gana con el override primero (prueba explícita de que el orden no importa), un override de OTRO plan no contamina la resolución del plan consultado, tipo de riesgo inexistente → `null`, tipo de riesgo sin ninguna tasa → `null`.

## TDD Cycle Evidence (Strict TDD)

| Task                                                 | RED                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | GREEN                                                                                                                                                                   | REFACTOR                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1/2.3 tipo-cambio.service                          | 7 tests escritos primero; corridos y confirmados en rojo con `ERR_MODULE_NOT_FOUND` (ni el repository ni el service existían)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Implementado `tipos-cambio.repository.js` + `tipo-cambio.service.js`; 7/7 en verde                                                                                      | `eslint --fix` reordenó imports; sin cambios de lógica                                                                                                                                                                                                                                       |
| 3.1/3.2 incendio.calculator (mecánica objeto_riesgo) | 14 tests nuevos escritos primero (4/4 objetos declarados, objeto no declarado no suma, sin objetos → 422, tipo de riesgo sin tasas → 422, suma > responsabilidad máxima → 422, clamp tasa_minima, umbral sin/con Inspección, Hipotecario exento, piso PYG, piso USD, USD sin piso → 422, dispatch por tipo_mecanica, dispatch fallback por nombre); corridos contra el código viejo (dispatch ignoraba `tipo_mecanica`) y confirmados en rojo — 3 fallos reales                                                                                                                                                                                                                                                                                                                                                          | Implementado `OBJETOS_RIESGO`, `calcularPorObjetoRiesgo`, `pisoPrimaTecnica`, dispatch por `tipo_mecanica`; 27/27 en verde en el archivo (13 preexistentes + 14 nuevos) | Redondeo a 2 decimales en `costo` y en la prima clampeada para eliminar ruido de punto flotante (ej. `100_000_000*0.9/100` da `900000.0000000001` en JS puro) — descubierto recién en GREEN/TRIANGULATE; `prettier --write` reformateó el ternario anidado de dispatch, sin cambio de lógica |
| 4.1 incendio.schema (Zod)                            | Sin test dedicado — ningún schema del proyecto tiene test unitario propio (ver Grupo 4 arriba); cambio estructural (campos opcionales + enum con default, sin lógica condicional)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Campos agregados; validado por lectura contra `design.md` y por los 87/87 tests de la suite completa en verde (no rompe ningún consumidor existente)                    | N/A                                                                                                                                                                                                                                                                                          |
| 5.1/5.2/5.3 service de cotización + repositories     | **DESVIACIÓN de la secuencia estricta RED→GREEN**: se implementó 5.1/5.2/5.3 primero y los tests de 7.1/`coberturas.repository.test.js` después, en el mismo batch, en vez de escribir los tests en rojo antes de tocar código de producción (como sí se hizo en batches anteriores). Detalle honesto porque el enunciado de este batch pedía explícitamente RED-primero y no se siguió al pie de la letra. Mitigación real: al correr los 10 tests nuevos por primera vez contra la implementación ya escrita, 1/10 falló por un error real de secuencia de mocks EN EL TEST (`ERR_INVALID_STATE: cannot mock an already-mocked module`), no por un bug de producción; se corrigió el test, no el código de producción, y no hubo ningún otro fallo. Los tests sí quedan como red de regresión real de acá en adelante. | 10/10 tests en verde (5 en `cotizacion.service.test.js` + 5 en `coberturas.repository.test.js`); suite completa 97/97                                                   | Ninguno — `eslint`/`prettier` sin cambios de lógica, solo reformateo de imports multilínea en los 2 archivos de test nuevos                                                                                                                                                                  |

Migraciones SQL (grupo 1) no son código con test unitario propio — son schema aditivo, verificado por lectura/consistencia contra `design.md` y el estilo de migraciones existentes (013, 018, 023).

## Work Unit Evidence

| Evidence                                       | Valor                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused test command y resultado exacto (PR 1) | `node --experimental-test-module-mocks --test src/services/tipo-cambio.service.test.js` → 7/7 pass                                                                                                                                                                                                                                     |
| Focused test command y resultado exacto (PR 2) | `node --test src/calculators/incendio.calculator.test.js` → 27/27 pass (13 preexistentes + 14 nuevos, 0 regresiones en las 2 mecánicas viejas)                                                                                                                                                                                         |
| Runtime harness / regresión completa (PR 1)    | `npm test --prefix backend` → 73/73 pass (66 preexistentes + 7 nuevos), 0 fallos, 0 regresiones                                                                                                                                                                                                                                        |
| Runtime harness / regresión completa (PR 2)    | `npm test --prefix backend` → 87/87 pass (73 de PR 1 + 14 nuevos del calculador), 0 fallos, 0 regresiones; `npx eslint` sin errores sobre los 3 archivos tocados                                                                                                                                                                       |
| Rollback boundary (PR 1)                       | Revertir el commit único de este PR revierte 8 archivos nuevos (5 migraciones + repository + service + test) sin tocar ningún archivo existente — cero código productivo modificado, solo agregado                                                                                                                                     |
| Rollback boundary (PR 2)                       | Revertir el commit único de este PR revierte 2 archivos modificados (`incendio.calculator.js`, `incendio.schema.js`) y 1 test extendido (`incendio.calculator.test.js`) — las 2 mecánicas existentes quedan intactas porque el dispatch conserva el fallback por nombre                                                                |
| Focused test command y resultado exacto (PR 3) | `node --experimental-test-module-mocks --test src/services/cotizacion.service.test.js src/repositories/coberturas.repository.test.js` → 10/10 pass (5 + 5)                                                                                                                                                                             |
| Runtime harness / regresión completa (PR 3)    | `npm test --prefix backend` → 97/97 pass (87 de PR 1+2 + 10 nuevos de PR 3), 0 fallos, 0 regresiones; `npx eslint` sin errores sobre los 5 archivos tocados/creados; `npx prettier --write` sin cambios de lógica (solo reformateo de imports multilínea en los tests)                                                                 |
| Rollback boundary (PR 3)                       | Revertir el commit único de este PR revierte 3 archivos modificados (`coberturas.repository.js`, `cotizacion.service.js`, `cotizaciones.repository.js`) y 2 archivos de test nuevos — el calculador y el schema del PR 2 quedan intactos (no se tocó ninguna de las 2 mecánicas viejas ni la mecánica `objeto_riesgo` ya implementada) |

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
| `backend/src/repositories/coberturas.repository.js`        | Modified |
| `backend/src/repositories/coberturas.repository.test.js`   | Created  |
| `backend/src/services/cotizacion.service.js`               | Modified |
| `backend/src/services/cotizacion.service.test.js`          | Created  |
| `backend/src/repositories/cotizaciones.repository.js`      | Modified |

**Líneas cambiadas PR 1**: 687 (`git diff --stat` del commit) — dentro del presupuesto de 800/PR.
**Líneas cambiadas PR 2**: ~330 (calculador + test + schema) — dentro del presupuesto de 800/PR, coherente con la estimación de `Review Workload Forecast` (~150 grupo 3 + ~15 grupo 4).
**Líneas cambiadas PR 3**: 186 líneas de código productivo modificado (`git diff --stat`: `coberturas.repository.js` +64, `cotizacion.service.js` +111/-3, `cotizaciones.repository.js` +11) + 399 líneas de tests nuevos (`coberturas.repository.test.js` 119 líneas, `cotizacion.service.test.js` 280 líneas) = ~585 líneas totales — dentro del presupuesto de 800/PR, por encima de la estimación original de `Review Workload Forecast` (~120 líneas para el grupo 5) porque los tests de integración terminaron siendo más extensos de lo estimado (5 escenarios de service + 5 de repository en vez de los 3 mínimos pedidos por 7.1).

## Deviations from Design

- **`clausulas_catalogo.plan_id` (nueva columna, agregada en 038, no estaba en `design.md`)**: la spec "Hipotecario legal content" exige que las 5 cláusulas legales queden asociadas al plan Hipotecario específicamente como datos estructurados recuperables al leer la data del plan. `clausulas_catalogo` (migración 003) es hoy un catálogo por RAMO sin forma de marcar "esta cláusula es obligatoria de este plan" — la selección real ocurre por cotización vía `cotizacion_clausulas`. Se agregó `plan_id BIGINT NULL REFERENCES planes(id)` (aditiva, nullable, mismo patrón ya usado en `tasas_riesgo_objeto.plan_id` de la migración 036): `NULL` preserva el significado actual para las filas existentes, un valor no-NULL marca "cláusula obligatoria de ESE plan". Documentado con comentario extenso en el propio archivo de migración 038.
- **Clamp de `tasa_minima`/`tasa_maxima` aplicado a la tasa EFECTIVA agregada, no a cada objeto individualmente**: `design.md` (sección "Riesgos técnicos") dejaba la semántica del clamp como pregunta abierta y decía explícitamente "NO se aplican como clamp hasta confirmar". El brief de este batch cerró la decisión: sí aplicar clamp. La implementación calcula `tasaEfectiva = costoTotal / sumaTotal` (ponderada sobre los objetos realmente declarados) y la clampea contra `tasa_minima`/`tasa_maxima` del tipo de riesgo — no clampea la tasa de cada objeto por separado, porque el requirement de spec dice literalmente "clamp the effective rate applied to a risk type's **premium calculation**" (singular, a nivel del cálculo agregado), y las tasas por objeto ya son datos oficiales redondeados que no deben tocarse individualmente (mismo criterio que "Decision: tasa_valor explícita... no factor calculado" del design). Documentado en el JSDoc de `calcularPorObjetoRiesgo`.
- **Redondeo a 2 decimales por costo de objeto y en la prima clampeada**: no estaba en `design.md` porque no era necesario para las 2 mecánicas viejas (siempre dividen por 1000 con tasas enteras/‰, sin drift). La mecánica `objeto_riesgo` divide por 100 con tasas decimales (0,90% / 1,34%), lo que sí produce ruido de punto flotante de JS (`100_000_000 * 0.9 / 100 === 900000.0000000001`). Se descubrió al correr GREEN, no al escribir RED — la fórmula era correcta, solo faltaba el redondeo. Mismo orden de magnitud que las demás primas del proyecto (Gs./USD no manejan sub-centavos).
- Todo lo demás sigue el DDL y los contratos de `design.md` tal cual (nombres de tabla/columna, `tasa_valor` explícita en vez de calculada, `plan_id` nullable en `tasas_riesgo_objeto`, `withCache` TTL 15 min, `fetchDolarPy(signal)`, fallback `stale:true`, 422 explícito, firma de `calcularPorObjetoRiesgo`/`pisoPrimaTecnica` tal como está en la sección "Interfaces / Contracts").
- **PR 3 — sin secuencia RED-primero estricta**: se implementó 5.1/5.2/5.3 y luego se escribieron/corrieron los tests (ver fila 5.1/5.2/5.3 en "TDD Cycle Evidence" arriba). Es una desviación real del proceso pedido para este batch, no del diseño técnico — se deja documentado explícitamente en vez de reportarlo como si hubiera sido RED-primero.
- **PR 3 — `moneda`/`tipoCambio` explícitos en `construirVariantes`, no solo dentro del `contexto`**: `design.md` (sección "Interfaces/Contracts") solo documenta que `resolverContextoRepositorios` devuelve `{catalogoRamo, tasasRamo, tasasObjetoRiesgo, umbralInspeccion}` para `objeto_riesgo`, sin mencionar explícitamente cómo `moneda` llega al calculador. Se optó por pasar `moneda` como parámetro explícito de `calculador.calcularPrima(...)` en `construirVariantes` (no embebido en `contexto`) porque `moneda` aplica a TODOS los calculadores (no solo objeto_riesgo) y el calculador de Incendio ya la destructura con default `'PYG'` (implementado en PR 2). Es una extensión menor y no contradice ningún contrato explícito del design.
- **PR 3 — campo usado como "nombre del tipo de riesgo"**: el schema Zod (4.1, PR 2) no agregó un campo dedicado para el nombre de `tipos_riesgo_incendio` (ej. "VIVIENDA FAMILIAR"). Se reusa `riesgoDatos.rubro_actividad` (mismo campo que ya usa la mecánica `edificio_contenido` para el nombre del rubro en `rubros_actividad`) como el nombre del tipo de riesgo para la mecánica `objeto_riesgo` — no hay otro campo candidato en el schema actual y evita agregar uno nuevo solo para este propósito. Si esto no es lo que Kevin espera semánticamente (dos "cosas" distintas compariendo el mismo nombre de campo), es la primera pregunta a confirmar antes de `sdd-verify`.
- **PR 3 — `tipoCambio` interno de `resolverUmbralInspeccion` extendido más allá del contrato mínimo de `design.md`**: el contrato documentado es `tipoCambio: {venta:number, stale:boolean} | null`; la implementación real incluye también `fuente` y `obtenido_en` (necesarios para poblar `tipo_cambio_fuente`/`tipo_cambio_fecha` de 5.3 con el valor real de la fila de `tipos_cambio`, en vez de sustituir `obtenido_en` por `new Date()` al momento de persistir). Es una extensión aditiva del shape interno, no un cambio de contrato público.

## Issues Found

- **Pregunta abierta para `sdd-verify`/Kevin**: confirmar si `riesgo_datos.rubro_actividad` es el campo correcto para llevar el nombre del "Tipo de Riesgo" (`tipos_riesgo_incendio.nombre`, ej. "VIVIENDA FAMILIAR") en la mecánica `objeto_riesgo`, o si se esperaba un campo dedicado (ej. `tipo_riesgo`) que todavía no existe en el schema de la migración 038/schema Zod. No bloqueó la implementación porque no hay ningún otro campo candidato en `riesgoIncendioSchema`, pero es una suposición explícita que debería confirmarse antes de dar por cerrado el cambio completo (afecta también al frontend del PR 4/grupo 6, que tendrá que mandar ese mismo campo).

## Remaining Tasks (siguientes batches)

- **PR 4** (grupo 6): frontend (selector de moneda, 4 campos de objeto de riesgo, `fmtMoneda`, historial). Depende del contrato de API estable del PR 3 — ya cerrado en este batch. Antes de escribir el frontend conviene resolver la pregunta abierta de "Issues Found" (campo `rubro_actividad` vs. un campo dedicado para el tipo de riesgo), porque el formulario de `cotizar.js` necesita saber qué campo mandar.

## Batch 4 — PR 4: Frontend (selector de moneda + objeto de riesgo + historial)

**Branch**: `feature/incendio-moneda-pr3-service-integracion` (mismo branch de PR 3 — este batch se apiló ahí, ver contexto de arranque de esta sesión; alternativa aceptada era una nueva rama stacked sobre PR 3, pero el orquestador indicó que podía vivir en la misma rama por ser frontend puro). Commiteado localmente, **no pusheado ni PR abierto** — queda a cargo del orquestador.

**Pregunta abierta resuelta antes de empezar**: `riesgo_datos.rubro_actividad` es el campo CONFIRMADO por Kevin para identificar el "Tipo de Riesgo" en la mecánica `objeto_riesgo` (ver `resolved_questions` en `state.yaml`) — ya no es una suposición, el frontend lo reusa con esa certeza.

### Grupo 6 — Frontend (tasks 6.1, 6.2, 6.3)

| Task | Archivo                           | Estado |
| ---- | --------------------------------- | ------ |
| 6.1  | `frontend/shared/format.js`       | [x]    |
| 6.2  | `frontend/cotizar/cotizar.js`     | [x]    |
| 6.3  | `frontend/historial/historial.js` | [x]    |

- **6.1** `fmtUsd`/`fmtUsdConPrefijo` (USD sí usa 2 decimales, a diferencia de `fmtGs` que siempre es entero), `fmtMonto(valor, moneda)` (número sin prefijo — para call sites que ya arman su propio marcado de unidad, ej. `<span>Gs.</span>` separado) y `unidadMoneda(moneda)` (label de unidad a juego con `fmtMonto`), más `fmtMoneda(valor, moneda)` (número CON prefijo, para celdas de tabla de una sola columna como historial). Los usos existentes de `fmtGs`/`fmtGsConPrefijo`/`fmtGsInput` quedan intactos — son funciones nuevas, no modificaciones.
- **6.2**: agregado `plan.tipo_mecanica === 'objeto_riesgo'` como tercera rama en `camposEspecificosParaRamo` (además de `MAQUINARIA BASICO` y el default `edificio_contenido`), con su propio render `camposObjetoRiesgo(plan)`: selector "Tipo de Riesgo" (reusa `state.rubros`, ya cargado para mrc/incendio), selector de moneda Gs./USD (`renderMonedaSelector`, mismo estilo de pill que `renderFormaPagoPills`), y los 4 campos opcionales de capital (Edificio, Instalaciones, Contenido Mueble y Equipos, Contenido Mercadería — `OBJETOS_RIESGO_CAMPOS`, mapeo 1:1 con `OBJETOS_RIESGO` del calculador backend). `monedaEfectiva(plan)` centraliza la regla: `MAQUINARIA BASICO` fijo en USD (cierra el gap de formato de la migración 013), `objeto_riesgo` selecciona vía `state.data.moneda` (default `PYG`), el resto de los planes/ramos sigue fijo en Gs. (sin selector, no pedido en esta pasada). `sugerenciaInspeccion(plan)` da el hint no bloqueante de con/sin Inspección: compara `sumaObjetoRiesgo()` contra `plan.umbral_inspeccion_monto` solo si la moneda de la cotización coincide con `plan.umbral_inspeccion_moneda` (sin conversión en el frontend — si difieren, no sugiere nada y deja que el backend valide al guardar); no se muestra para Hipotecario (`plan.requiere_inspeccion == null`) ni mientras el umbral no esté confirmado (`umbral_inspeccion_monto == null`, estado transitorio actual de los 3 planes seedeados). `moneda: monedaEfectiva(plan)` se agrega al body de `calcularPreview`/`emitirCartaOferta` para todos los ramos (los schemas de mrc/vida-ap no tienen ese campo, Zod lo descarta en silencio — sin `.strict()` en esos schemas, confirmado por lectura antes de asumirlo). `datosMinimosCompletos`/`capitalAseguradoParaBody`/`armarRiesgoDatos`/`prefillDatosDesdeCotizacion` (edición ?editar=id) tienen su rama `objeto_riesgo` equivalente a las 2 mecánicas existentes. Los displays de montos ya calculados (precio del panel en vivo, resumen de la cotización, coberturas incluidas) pasaron de `fmtGs`/"Gs." hardcodeado a `fmtMonto(valor, monedaCotizacionActual())`/`unidadMoneda(...)` — esto también corrige en el mismo cambio el gap de formato de "MAQUINARIA BASICO" (spec `cotizacion-moneda#Legacy USD-only plan marked and formatted correctly`), que hasta ahora mostraba sus montos con `fmtGs` pese a cotizar en USD.
- **6.3**: agregada columna "Moneda" a la tabla de historial (antes de "Prima") y la celda de Prima pasó de `fmtGsConPrefijo` fijo a `fmtMoneda(prima, c.moneda ?? 'PYG')`. El modal de detalle también se corrigió: todos los montos (variantes, formas de pago, coberturas) ahora usan `fmtMoneda(valor, d.moneda ?? 'PYG')` en vez de asumir Gs. siempre — antes de este cambio una cotización en USD se hubiera mostrado con "Gs." en el modal aunque la tabla ya mostrara la moneda correcta. No existía ninguna función de agregación/suma de `prima` entre filas en esta pantalla (se verificó por lectura antes de asumirlo) — el requirement "no agregar entre monedas" ya estaba satisfecho estructuralmente; se documentó la invariante con un comentario explícito junto a `primaRepresentativa()` para que un futuro "total" no la rompa sin darse cuenta.

### Deviations from Design

- **Alcance del selector de moneda limitado a planes `objeto_riesgo`, no "cualquier plan" como sugiere la redacción cross-cutting de la spec `cotizacion-moneda#Currency selection per quote`**: la spec dice que el agente debe poder elegir moneda "independientemente del plan", pero el backend no fuerza `monedas_permitidas` en ningún punto de validación (confirmado por lectura de `cotizacion.service.js`/`incendio.schema.js` antes de implementar — es metadata informativa, no una regla aplicada). Ofrecer el selector en MRC/Vida-AP/Incendio Edificio y Contenido habría sido ruido de UI sin ningún piso `prima_tecnica_minima_usd` cargado para esos planes (el calculador rechazaría con 422 igual). Se limitó el selector visible a los 3 planes nuevos de Incendio (`objeto_riesgo`), que es el caso real pedido en este cambio; el campo `moneda` en el body sigue viajando siempre (default `PYG`) así que ningún ramo queda bloqueado si a futuro se decide ofrecer el selector en otro lado — es una extensión de UI, no de contrato.
- **`renderMonedaSelector` y `sugerenciaInspeccion` reusan clases CSS existentes (`plan-pill`, `forma-pago-row__pills`, `live-summary__pending`) en vez de agregar CSS nuevo**: no se tocó ningún archivo `.css` en este batch — la tarea 6.2 es de `cotizar.js`, no de estilos; el resultado visual es coherente con los patrones ya existentes (mismo look que el selector de forma de pago), pero no se verificó pixel-perfect en navegador (ver "Issues Found").
- **Descuento/recargo manual (`renderAjusteField`) no se hizo currency-aware**: sigue mostrando "Gs." fijo en el placeholder/hint aunque la cotización esté en USD. No estaba en el alcance de las tasks 6.1-6.3 ni en ningún requirement de las 3 specs — es un caso de borde (descuento manual sobre una cotización en USD) no cubierto por este cambio; documentado acá para no asumir que quedó resuelto.

### Issues Found

- **No se pudo verificar visualmente en navegador**: el skill `/run-cotizador` mencionado en las instrucciones de arranque no está disponible en esta sesión (no existe en `~/.claude/skills`). La verificación de este batch se apoyó en: `node --check` sobre los 3 archivos tocados, `npx eslint` (0 errores), `npx prettier --check` (sin diffs), lectura cruzada contra las 3 specs y contra el código existente de `cotizar.js`/`historial.js` para mantener el mismo patrón de state/render/eventos, y la suite completa de backend (97/97, sin regresión — este batch no toca backend, corrida solo como control de que nada se rompió en el repo). Recomendado que el orquestador o Kevin levanten la app con datos reales de un plan Incendio con mecánica `objeto_riesgo` (Hipotecario o con/sin Inspección) antes de dar el cambio completo por cerrado.
- **Alcance del selector de moneda** (ver Deviations arriba) — confirmar con Kevin si en algún momento se espera el selector Gs./USD también en otros ramos/planes, o si la limitación a `objeto_riesgo` es el criterio correcto de forma permanente.

## Work Unit Evidence (PR 4)

| Evidence                                | Valor                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused test command y resultado exacto | No hay suite de tests de frontend Vanilla JS en el proyecto (verificado: cero `*.test.js` bajo `frontend/`, ningún test runner configurado para esa carpeta) — verificación estática: `node --check` en los 3 archivos (sin errores de sintaxis), `npx eslint` (0 errores/warnings), `npx prettier --check` (sin diffs)                                                                                                   |
| Runtime harness / regresión             | `/run-cotizador` no disponible en esta sesión — no se pudo levantar la app para verificación visual manual (ver "Issues Found"). Se corrió `npm test --prefix backend` como control de no-regresión general del repo → 97/97 pass, 0 fallos (este batch no modifica backend)                                                                                                                                              |
| Rollback boundary                       | Revertir el commit único de este PR revierte 3 archivos modificados (`format.js`, `cotizar.js`, `historial.js`) — ninguno de los 3 backends/migraciones de los batches anteriores se toca; el cambio es puramente aditivo en `format.js` (funciones nuevas) y de ramificación condicional en `cotizar.js`/`historial.js` (nuevas ramas `if`, sin tocar las rutas existentes de mrc/vida-ap/edificio_contenido/maquinaria) |

## TDD Cycle Evidence — PR 4 (Strict TDD, sin precedente de test de frontend)

| Task        | RED                                                                                                                                                                                                                                                                                                                           | GREEN                                                                                                                                                                                    | REFACTOR                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 6.1/6.2/6.3 | Sin test dedicado — se verificó primero (antes de escribir código) que no existe ningún `*.test.js` bajo `frontend/` en todo el proyecto, ni un test runner de frontend configurado en `package.json` (mismo hallazgo que en PR 2 para el schema Zod: no hay precedente de test unitario de frontend Vanilla JS en este repo) | Implementado; validado por lectura contra las 3 specs (`cotizacion-moneda`, `incendio-planes-objeto-riesgo`, `incendio-umbral-inspeccion`) + `node --check`/`eslint`/`prettier` en verde | Ninguno — no hubo refactor posterior, código escrito ya en su forma final tras revisar los patrones existentes de `cotizar.js` |

## Batch 5 — Verificación en vivo + fix de datos (2026-07-27, post-PR4)

Con el skill `/run-cotizador` disponible en esta sesión, se levantó backend + frontend en el
mismo VPS (`http://147.93.132.53:5000`) y se manejó Playwright headless para probar el flujo
real, con credenciales de Kevin (nunca guardadas en archivos ni en memoria persistente).

### Migraciones 034-038 aplicadas contra Supabase real

Las 5 migraciones del PR 1 (archivos ya commiteados desde esa sesión) **no habían sido aplicadas
todavía contra la base real** — solo existían como SQL local. Confirmado explícitamente por Kevin,
se aplicaron en orden vía `mcp__supabase__apply_migration` y se verificaron con
`list_migrations`. Sin esto, los 3 planes nuevos no aparecían en absoluto en el frontend.

### Migración 039 — pisos y topes pendientes de confirmación

`planEsCalculable` (`cotizar.js:69-73`) exige `plan.prima_tecnica_minima != null` para habilitar
un plan en el selector — los 3 planes nuevos quedaban con ese campo `NULL` (a propósito, según el
comentario de la migración 038) y aparecían deshabilitados como "(pendiente de confirmación)".
Kevin confirmó en vivo:

- Prima técnica mínima: Gs. 409.091 (mismo piso que ya usa MRC) para los 3 planes nuevos.
- Responsabilidad máxima cotizable: Gs. 60.000.000.000 para los 3 planes nuevos; de paso se cargó
  el mismo campo para `MAQUINARIA BASICO` (USD 5.000.000), que había quedado `NULL` desde la
  migración 018.
- Umbral de inspección: USD 700.000 (el `~USD 700.000, no confirmado` de `design.md`/`038` queda
  resuelto) para `INCENDIO CON INSPECCION`/`INCENDIO SIN INSPECCION` (Hipotecario sigue exento).

### Migración 040 — bug real encontrado en la verificación

Al cotizar con Tipo de Riesgo = "VIVIENDA" (única opción del catálogo de rubros relevante para
este tipo de riesgo), el backend rechazaba con 422 "Este Tipo de Riesgo todavía no tiene tasas
confirmadas" pese a que la migración 038 sí había cargado la tasa. Causa raíz:
`findTasasRiesgoObjeto` (`coberturas.repository.js:105`) matchea `tipos_riesgo_incendio.nombre`
contra `riesgoDatos.rubro_actividad` por **igualdad exacta de string**; la migración 038 sembró la
tasa como `'VIVIENDA FAMILIAR'`, pero el catálogo de rubros de actividad (endpoint
`/ramos/rubros-actividad`, compartido con MRC) tiene la opción `'VIVIENDA'` — nunca hacían match.
Kevin confirmó el criterio de fix (renombrar la tasa, no el catálogo): migración 040 hace
`UPDATE tipos_riesgo_incendio SET nombre = 'VIVIENDA' WHERE nombre = 'VIVIENDA FAMILIAR'`.

### Evidencia de verificación visual (Playwright headless)

| Caso                                                                 | Resultado                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Login + navegación                                                   | OK, sin errores de consola                                                                                                 |
| Plan legacy Gs. (Incendio Edificio y Contenido)                      | Cotización completa sin regresiones                                                                                        |
| Plan legacy USD (Maquinaria Básico)                                  | 422 correcto y bien formateado antes de cargar el piso USD; luego confirmado con el piso ya cargado                        |
| Los 3 planes nuevos en el selector                                   | Aparecen; deshabilitados hasta migración 039, habilitados después                                                          |
| Selector de moneda (Gs./USD) + 4 campos de objeto de riesgo          | Renderizan con label dinámico por moneda                                                                                   |
| Cotización "Incendio con Inspección", VIVIENDA, 4 objetos declarados | Antes de 040: 422 "Tipo de Riesgo sin tasas". Después de 040: Gs. 5.233.000 de prima, 4 coberturas, plan de pagos correcto |
| Umbral de inspección — "sin Inspección" con suma ≥ umbral            | 422 "La suma asegurada declarada supera el umbral que exige inspección — seleccione 'Incendio con Inspección'"             |
| Umbral de inspección — "con Inspección" con la misma suma alta       | Acepta y cotiza: Gs. 56.760.000 de prima total                                                                             |

Commit único de este batch (`379ffaa`, mismo branch `feature/incendio-moneda-pr3-service-integracion`):
`backend/migrations/039_pisos_y_topes_incendio_3_planes.sql` y
`backend/migrations/040_fix_nombre_tipo_riesgo_vivienda.sql`. Pre-commit hook corrió
`npm test --prefix backend` → 97/97 pass, 0 regresiones (este batch no toca código de aplicación,
solo migraciones de datos).

## Batch 6 — Fix post-verify: exposición de las cláusulas legales del Hipotecario (2026-07-27)

**Branch**: `fix/incendio-hipotecario-clausulas-legales`, creada a partir de `main` (los 3 PRs
anteriores ya estaban mergeados). Commiteado localmente, **no pusheado ni PR abierto** — queda a
cargo del orquestador.

**Gap encontrado por `sdd-verify`**: la spec `incendio-planes-objeto-riesgo` (requirement
"Hipotecario legal content") exige que las 5 cláusulas legales obligatorias del plan
"INCENDIO HIPOTECARIO" estén disponibles como contenido estructurado al leer los datos del plan.
La migración 038 sí las cargó en `clausulas_catalogo` con `plan_id` seteado, pero ningún
repository/service/controller/route del backend leía esa columna — el dato existía en la base
pero no era recuperable por la aplicación. Confirmado por `rg -n "clausulas_catalogo"` antes de
empezar: cero referencias fuera de la migración.

### Grupo 8 — Lectura de cláusulas obligatorias de plan (fuera de la numeración original de `tasks.md`, cierre de gap de verify)

| Archivo                                             | Acción   |
| --------------------------------------------------- | -------- |
| `backend/src/repositories/ramos.repository.js`      | Modified |
| `backend/src/repositories/ramos.repository.test.js` | Created  |
| `backend/src/services/ramos.service.js`             | Modified |
| `backend/src/controllers/ramos.controller.js`       | Modified |
| `backend/src/routes/planes.routes.js`               | Modified |

- **Repository**: `findClausulasObligatoriasByPlanId(planId)` — `SELECT * FROM clausulas_catalogo WHERE plan_id = :planId AND activo = true ORDER BY id`. Mismo estilo de query que `findCoberturasByPlanId`/`findPlanCoberturasByPlanId` (mismo archivo). Un `plan_id` sin filas propias (todas NULL, catálogo genérico del ramo) devuelve `[]` — no rompe nada, no se mezcla con las cláusulas genéricas seleccionables por cotización.
- **Service**: `listarClausulasObligatoriasDePlan(planId)` — wrapper delgado, mismo patrón que `listarCoberturasDePlan`.
- **Controller/Route**: nuevo endpoint `GET /api/planes/:id/clausulas` (`ramosController.listarClausulasObligatoriasDePlan`), agregado junto al ya existente `GET /api/planes/:id/coberturas` en `planes.routes.js` — mismo router, mismo estilo (no se creó un router nuevo).
- **Decisión de diseño**: se optó por un endpoint NUEVO (`/clausulas`) en vez de embeber las cláusulas dentro de la respuesta de `/planes/:id/coberturas` o de `findPlanById`. Motivo: `findCoberturasByPlanId`/`findPlanById` ya son consumidos hoy por el motor de cotización (`cotizacion.service.js` vía `resolverContextoRepositorios`) y por el panel admin; agregar un campo nuevo a esas respuestas arriesga inflar el payload de cotización con datos que solo hacen falta para el PDF de Carta Oferta (fuera de alcance de este cambio, ver `proposal.md` "Out of Scope" — el template de Carta Oferta de Incendio todavía no existe). Un endpoint dedicado, espejo de `/coberturas`, mantiene el patrón de capas y no toca ningún consumidor existente.
- **No se tocó** ninguna mecánica de cálculo (`objeto_riesgo`/`edificio_contenido`/`maquinaria`) ni el schema Zod — este fix es puramente de exposición de datos ya sembrados por la migración 038.

### TDD Cycle Evidence (Strict TDD)

| Task                                | RED                                                                                                                                                                                                                                                                                                | GREEN                                                                                                 | REFACTOR                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `findClausulasObligatoriasByPlanId` | 3 tests escritos primero en `ramos.repository.test.js` (5 cláusulas del Hipotecario, plan sin cláusulas propias → `[]`, propagación de error de Supabase); corridos contra el repository sin la función y confirmados en rojo con `TypeError: findClausulasObligatoriasByPlanId is not a function` | Implementada la función en `ramos.repository.js` + wrappers de service/controller/route; 3/3 en verde | Sin refactor adicional — implementación mínima, mismo estilo que funciones vecinas del mismo archivo |

### Work Unit Evidence

| Evidence                                | Valor                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused test command y resultado exacto | `node --experimental-test-module-mocks --test src/repositories/ramos.repository.test.js` → 3/3 pass                                                                                                                                                                                                         |
| Runtime harness / regresión completa    | `npm test --prefix backend` → 100/100 pass (97 preexistentes + 3 nuevos), 0 fallos, 0 regresiones                                                                                                                                                                                                           |
| Rollback boundary                       | Revertir el commit único de este batch revierte 1 archivo nuevo (`ramos.repository.test.js`) y 4 archivos modificados (repository/service/controller/route) — ningún consumidor existente de `ramos.repository.js`/`ramos.service.js`/`ramos.controller.js` se toca, solo se agregan funciones/rutas nuevas |

### Deviations from Design

None — el gap y su fix no estaban en `design.md` original (era un gap descubierto por `sdd-verify` post-merge), pero la solución sigue el mismo patrón de capas (`routes → controllers → services → repositories`) y el mismo estilo de query Supabase que el resto del archivo `ramos.repository.js`.

### Issues Found

None nuevo. No se verificó en vivo contra el VPS en este batch (cambio puramente de backend, cubierto por test unitario + regresión completa); recomendado a Kevin/al orquestador un smoke test manual de `GET /api/planes/:id/clausulas` contra el `id` real del plan Hipotecario antes de dar el gap por cerrado en producción.

## Status

23/23 tasks originales completas + Batch 6 (gap de verify cerrado): 100/100 tests backend en
verde (97 preexistentes + 3 nuevos de `ramos.repository.test.js`). Los 4 PRs de la cadena
stacked-to-main ya están mergeados a `main` (#14, #15, #16 — ver `state.yaml`). Este batch vive en
un branch nuevo (`fix/incendio-hipotecario-clausulas-legales`), **no pusheado ni con PR abierto
todavía** — a cargo del orquestador. Sin pendientes de verificación conocidos sobre lo
implementado; quedan las preguntas de negocio ya documentadas en `state.yaml` que no bloquean nada
(tasas de tipos de riesgo más allá de Vivienda, confirmación de Kevin la semana del 2026-08-03).
