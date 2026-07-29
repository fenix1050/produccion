# Tasks: Incendio — tasas de riesgo por rubro (~207 rubros) + pertenencia rubro-ramo

Convención: `[req: <spec>#<requirement>]` liga cada task a la spec que satisface. Tasks marcadas `[P]`
pueden ejecutarse en paralelo con otras `[P]` del mismo grupo (archivos distintos, sin dependencia de
datos); el resto es secuencial dentro del grupo. Strict TDD activo: los tests del núcleo puro y del
repositorio/endpoint se escriben/corrigen en RED antes de la implementación GREEN.

Orden de dependencia entre grupos: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Dentro del grupo 6, las
tasks de backend deben cerrar antes que las de frontend (grupo 7) porque el contrato de API cambia
de forma incompatible (`ramo_id` pasa a ser obligatorio).

## 1. Migración 043 — tabla `rubro_actividad_ramo` + backfill

- [ ] 1.1 Crear `backend/migrations/043_rubro_actividad_ramo.sql`: `CREATE TABLE rubro_actividad_ramo (rubro_id INT NOT NULL REFERENCES rubros_actividad(id) ON DELETE CASCADE, ramo_id INT NOT NULL REFERENCES ramos(id), creado_en TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (rubro_id, ramo_id))` + `CREATE INDEX ix_rubro_actividad_ramo_ramo ON rubro_actividad_ramo (ramo_id)`. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 1.2 En el mismo archivo, BLOQUE 1 — backfill 1:1 de los rubros con `grupo` no-NULL vía `INSERT INTO rubro_actividad_ramo (rubro_id, ramo_id) SELECT ra.id, r.id FROM rubros_actividad ra JOIN ramos r ON r.nombre = lower(ra.grupo) WHERE ra.grupo IS NOT NULL ON CONFLICT DO NOTHING` (nunca una lista escrita a mano) + assert `DO $$` que aborta si el conteo de filas insertadas no coincide con el conteo de rubros con `grupo IS NOT NULL`. Depende de 1.1. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 1.3 En el mismo archivo, BLOQUE 2 — 8 filas explícitas vía `VALUES` + JOIN por nombre para los 5 rubros con `grupo = NULL`: `VIVIENDA→incendio`, `SILOS→incendio`, `CONSULTORIO MEDICO→{mrc,incendio}`, `CHANCHERIAS→{mrc,incendio}`, `GRANJA EN GENERAL→{mrc,incendio}`, `ON CONFLICT DO NOTHING` + assert que las 8 filas existen (nunca un default masivo). Depende de 1.1. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 1.4 Cerrar el archivo con el assert final: 0 filas en `rubros_actividad` sin al menos una fila en `rubro_actividad_ramo`. `grupo` no se toca (ni UPDATE ni DROP). Depende de 1.2 y 1.3. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 1.5 Aplicar 043 contra Supabase real y verificar en vivo: conteo por ramo vía la tabla nueva == conteo previo por `grupo` para `mrc` y `tro`; `count(*)` de `rubros_actividad` con `grupo IS NULL` sigue siendo 5. Depende de 1.1-1.4.

## 2. Núcleo puro `tasas-incendio.service.js` (backend, TDD)

- [ ] 2.1 Escribir tests RED en `backend/src/services/tasas-incendio.service.test.js`: `normalizarNombreRubro` (trim, colapso de espacios dobles, upper, sin acentos); `parsearPivotIncendio` con Zod sobre un workbook ExcelJS en memoria (hoja inexistente/rango vacío → lanza; nombre vacío tras trim → lanza); `derivarTasasPorObjeto(2.24)` → exactamente 0.90/0.90/1.34/1.34 (regresión directa de migración 038); redondeo half-up en un valor `x.xx5`; `cruzarContraCatalogo` (dos filas del pivot que normalizan igual → lista el par en `ambiguos`, nunca "se queda con la última"; un nombre que cruza con más de un rubro existente → lista candidatos; nombre ya presente en `tipos_riesgo_incendio` → va a `yaSembrados`, no a `nuevos`); `generarSqlSeed` escapa `'` duplicándola, es determinista (mismo orden que el pivot), y para un rubro reutilizado emite el nombre EXISTENTE de `rubros_actividad`, nunca el string crudo del pivot. `[req: incendio-planes-objeto-riesgo#Global rate breakdown by risk object]`
- [ ] 2.2 Implementar `backend/src/services/tasas-incendio.service.js` (GREEN de 2.1): `normalizarNombreRubro(nombre)`, `parsearPivotIncendio(workbook, {hoja='Hoja1', filaDesde=5, filaHasta=211})`, `derivarTasasPorObjeto(tasaGlobal)` (Edificio 40%, Instalaciones 40%, Contenido Mueble y Equipos 60%, Contenido Mercadería 60%, 2 decimales half-up), `cruzarContraCatalogo(filasPivot, rubrosExistentes, tiposRiesgoExistentes)` (no lanza; devuelve `{reutilizados,nuevos,yaSembrados,ambiguos,sinPivot,warnings}`, el CLI decide), `generarSqlSeed(cruce, metadatos)`. Depende de 2.1. `[req: incendio-planes-objeto-riesgo#Global rate breakdown by risk object, incendio-planes-objeto-riesgo#Rate table is data-driven, not hardcoded per risk type]`

## 3. Script CLI generador de migración 044

- [ ] 3.1 Crear `backend/scripts/generar-migracion-tasas-incendio.js`: flags `--input --hoja --desde --hasta --out --catalogo` (json offline); lee el `.xlsx` con ExcelJS + `SELECT id,nombre FROM rubros_actividad` + `SELECT nombre FROM tipos_riesgo_incendio` (cero escrituras a la base); usa el núcleo puro del grupo 2 para parsear, cruzar y generar el `.sql`. Aborta (exit 1, sin emitir archivo) ante: hoja inexistente/rango vacío, nombre vacío tras trim, ambigüedad de cruce, `tasa_global` no numérica/nula/<=0, `derivarTasasPorObjeto(2.24) != 0.90/0.90/1.34/1.34`. Emite por stdout un reporte de warnings (cruce por normalización con grafía distinta, `tasa_minima>tasa_maxima` o global fuera de `[min,max]`, `0.4*global < tasa_minima`, nombre ya en `tipos_riesgo_incendio`). Depende de 2.2. `[req: incendio-planes-objeto-riesgo#Global rate breakdown by risk object, incendio-planes-objeto-riesgo#Rate table is data-driven, not hardcoded per risk type]`

## 4. Ejecución del script contra datos reales

- [ ] 4.1 Correr `generar-migracion-tasas-incendio.js` contra `docs/insumos/Tasa sistema Incendio.xlsx` (Hoja1, filas 5-211) y la base real, generando `backend/migrations/044_seed_tasas_incendio_rubros.sql`. Depende de 3.1 y de 1.5 (la tabla `rubro_actividad_ramo` debe existir para que el reporte tenga sentido, aunque el script no la usa directamente). **Bloqueante para Kevin**: revisar el reporte de warnings del script, en particular la lista de rubros donde `0.4*tasa_global < tasa_minima` (activarían el clamp del calculador en toda cotización de ese rubro) — decidir si se ajusta el `tasa_minima` por `UPDATE` antes de aplicar 044 a producción, o si se acepta el clamp por ahora. También revisar el `.sql` generado carácter a carácter (encabezado con fuente/fecha/conteos, asserts finales). `[req: incendio-planes-objeto-riesgo#Global rate breakdown by risk object]`

## 5. Aplicar migración 044

- [ ] 5.1 Aplicar `044_seed_tasas_incendio_rubros.sql` contra Supabase real (`BEGIN;...COMMIT;`, idempotente vía `WHERE NOT EXISTS`/`ON CONFLICT DO NOTHING`) y verificar los asserts: 0 `tipos_riesgo_incendio` sin rubro homónimo carácter a carácter; todo tipo tiene exactamente 4 tasas genéricas; VIVIENDA sigue en 0.90/0.90/1.34/1.34; 0 rubros sin pertenencia en `rubro_actividad_ramo`. Depende de 4.1 (revisión de Kevin completada) y de 1.5. `[req: incendio-planes-objeto-riesgo#Global rate breakdown by risk object, incendio-planes-objeto-riesgo#Rate table is data-driven, not hardcoded per risk type]`

## 6. Backend — filtro por ramo en el catálogo de rubros

- [ ] 6.1 Escribir tests RED en `backend/src/repositories/coberturas.repository.test.js` (o el archivo de test existente del repositorio) mockeando `supabase-js`: el `select` de `findRubrosActividad` lleva `!inner` y filtra por `rubro_actividad_ramo.ramo_id`; la fila devuelta NO trae la propiedad del embed `rubro_actividad_ramo`; un rubro multi-ramo aparece exactamente una vez por ramo consultado. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 6.2 Crear `backend/src/schemas/ramos.schema.js`: `export const rubrosActividadQuerySchema = z.object({ ramo_id: z.coerce.number().int().positive() })`. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 6.3 Modificar `backend/src/repositories/coberturas.repository.js` (`findRubrosActividad`, GREEN de 6.1): cambiar el filtro de `.eq('grupo', …)` al JOIN `!inner` contra `rubro_actividad_ramo` filtrando por `ramo_id`, descartando la propiedad del embed antes de devolver (`data.map(({ rubro_actividad_ramo: _p, ...rubro }) => rubro)`), conservando `.order('id')`. Depende de 6.1, 6.2 y 1.1 (la tabla debe existir para que el embed resuelva). `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 6.4 `[P]` Modificar `backend/src/controllers/ramos.controller.js` y `backend/src/services/ramos.service.js`: parsear `ramo_id` con `rubrosActividadQuerySchema` (400 si falta, no numérico o `<=0`) y pasarlo a `findRubrosActividad`; el `service` sigue siendo pass-through de una línea. Depende de 6.2 y 6.3. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 6.5 `[P]` Modificar `backend/src/controllers/admin.controller.js` (~línea 183) y `backend/src/services/admin/rubros-actividad.service.js`: mismo cambio que 6.4 para `GET /admin/rubros-actividad`, conservando `requireTasasEdit`; el parámetro `grupo` deja de interpretarse (ya no lo llama nadie desde `admin.js`). Depende de 6.2 y 6.3. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 6.6 Ampliar los tests RED/GREEN de endpoint (mock supabase-js) para ambos controllers: sin `ramo_id` → 400; `ramo_id=abc` → 400; `ramo_id<=0` → 400. Depende de 6.4 y 6.5.

## 7. Frontend — pasar `ramo_id` en las llamadas al catálogo

Depende del grupo 6 (el backend ya exige `ramo_id`; desplegar frontend antes rompería el selector).

- [ ] 7.1 `[P]` Modificar `frontend/cotizar/cotizar.js` (~línea 411 y ~579): las dos llamadas a `/ramos/rubros-actividad` pasan a incluir `ramo.id` como query param; borrar el comentario obsoleto que justificaba la lista compartida entre ramos. `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`
- [ ] 7.2 `[P]` Modificar `frontend/admin/admin.js` (~líneas 756-760): `cargarRubrosActividad(ramoId)` recibe y usa el ramo activo; refetch al cambiar de ramo en el panel (la sección ya está gateada por `ramoUsaRubrosActividad`). `[req: incendio-planes-objeto-riesgo#Ramo-scoped risk-type catalog endpoint]`

## 8. Regresión y tests nuevos de integración

- [ ] 8.1 Ejecutar `npm test --prefix backend` completo y confirmar 0 regresiones sobre los 100 tests existentes antes de considerar el cambio listo para `sdd-verify`. Depende de los grupos 2, 6 y sus tests.
- [ ] 8.2 Confirmar que los tests nuevos del grupo 2 (núcleo puro) y del grupo 6 (repositorio/endpoint) quedan en verde como parte de la misma corrida. Depende de 2.2 y 6.3-6.6.

## 9. Verificación en vivo post-deploy

Depende de que backend (grupo 6) y frontend (grupo 7) se desplieguen JUNTOS (el backend exige `ramo_id`; desplegar uno solo rompe el selector).

- [ ] 9.1 Verificar conteo por ramo vía `rubro_actividad_ramo` == conteo previo por `grupo` para `mrc` y `tro`.
- [ ] 9.2 Verificar que `CONSULTORIO MEDICO`, `CHANCHERIAS` y `GRANJA EN GENERAL` aparecen tanto en el selector de MRC como en el de Incendio; `VIVIENDA` y `SILOS` solo en el de Incendio.
- [ ] 9.3 Cotizar 3-4 rubros nuevos del pivot en los 3 planes `objeto_riesgo` de Incendio sin recibir 422.
- [ ] 9.4 Confirmar que un rubro con `grupo IS NULL` original (los 5 casos) sigue siendo 5 tras la migración, y que ningún rubro quedó invisible en todos los ramos.
- [ ] 9.5 Si PostgREST responde "could not find a relationship" tras aplicar 043, ejecutar `NOTIFY pgrst, 'reload schema'` (Supabase recarga el schema cache solo tras DDL; puede necesitar un empujón manual).

## 10. Cierre de documentación

- [ ] 10.1 Actualizar `docs/ESTADO_PROYECTO.md`: registrar el cambio cerrado, el follow-up explícito de `DROP COLUMN rubros_actividad.grupo`, y la revisión pendiente de Kevin sobre los rubros donde `0.4*tasa_global < tasa_minima` (clamp permanente). Depende de 9.1-9.5.
- [ ] 10.2 Actualizar `CLAUDE.md` con el estado del cambio y los mismos dos follow-ups. Depende de 10.1.

## Review Workload Forecast

| Grupo                                      | Archivos                                                                                          | Estimación de líneas cambiadas                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Migración 043 (tabla + backfill)        | 1 archivo nuevo                                                                                   | ~60 líneas (DDL + 2 bloques de backfill + asserts)                                                                                   |
| 2. Núcleo puro `tasas-incendio.service.js` | 2 archivos nuevos (service + test)                                                                | ~220 líneas (5 funciones + tests adversariales de aborto/warning)                                                                    |
| 3. Script CLI                              | 1 archivo nuevo                                                                                   | ~120 líneas (flags, I/O, reporte)                                                                                                    |
| 4. Ejecución del script                    | 1 archivo generado (044) + reporte revisado                                                       | N/A (artefacto generado, no escrito a mano)                                                                                          |
| 5. Aplicar 044                             | 0 archivos nuevos (ejecución)                                                                     | N/A                                                                                                                                  |
| 6. Backend — filtro por ramo               | 1 archivo nuevo (schema) + 4 archivos modificados (repository, 2 controllers, 2 services) + tests | ~150 líneas                                                                                                                          |
| 7. Frontend                                | 2 archivos modificados                                                                            | ~20 líneas                                                                                                                           |
| 8. Tests de regresión                      | ejecución, sin archivos nuevos                                                                    | N/A                                                                                                                                  |
| 9. Verificación en vivo                    | sin archivos, checklist manual                                                                    | N/A                                                                                                                                  |
| 10. Documentación                          | 2 archivos modificados                                                                            | ~30 líneas                                                                                                                           |
| **Total estimado**                         | **~11 archivos de código + 1 migración generada**                                                 | **~600 líneas** (sin contar el `.sql` generado de 044, que es un artefacto auditado, no revisado línea por línea como código a mano) |

**Nota de entrega:** el `.sql` de 044 es voluminoso (~207 tipos + ~828 tasas) pero es un artefacto
determinista generado por el script del grupo 3 — el PR debe revisar el script y una muestra
representativa del `.sql` (encabezado, asserts, 2-3 filas), no las ~1000 líneas completas una por
una. La migración 043 (tabla + backfill), escrita a mano, sí requiere revisión completa línea por
línea por su impacto en el filtro de MRC/TRO existente.
