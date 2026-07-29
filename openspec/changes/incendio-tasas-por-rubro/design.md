# Design: Incendio — tasas de riesgo por rubro + pertenencia rubro-ramo

Fuente: openspec/changes/incendio-tasas-por-rubro/proposal.md (aprobada, rev 4).

## Technical Approach

Dos ejes que se cruzan en una tabla nueva:

1. Datos de tarifación: sembrar ~207 tipos en `tipos_riesgo_incendio` + ~828 filas en
   `tasas_riesgo_objeto`, derivadas 40/40/60/60 de la tasa global del pivot. Entregado como
   migración SQL GENERADA POR SCRIPT (no INSERT a mano, no endpoint de importación).
2. Modelo de pertenencia rubro-ramo: reemplazar el escalar `rubros_actividad.grupo` por la relación
   muchos-a-muchos `rubro_actividad_ramo`, y mover el filtro del catálogo de `.eq('grupo', ...)` a
   un JOIN contra la tabla nueva.

Importador partido en núcleo puro + cáscara de I/O (igual que tasas.service.js de Auto). Esto NO es
cosmético: `npm test` del backend corre `src/**/*.test.js`, así que un módulo puro colgado de
backend/scripts/ quedaría SIN cobertura en CI.

- Núcleo puro: `backend/src/services/tasas-incendio.service.js`
- Cáscara CLI: `backend/scripts/generar-migracion-tasas-incendio.js`

El script NUNCA escribe en la base. Salida = .sql versionado + reporte por stdout. El artefacto
auditable en el PR es la migración, no el script.

## Architecture Decisions

### PK compuesta, sin id sustituto

`PRIMARY KEY (rubro_id, ramo_id)`. La fila ES la relación. La PK da gratis la unicidad que evita el
rubro duplicado en el selector y hace de `ON CONFLICT DO NOTHING` la primitiva de idempotencia.
Rechazado: `id BIGSERIAL + UNIQUE` (clave que nadie usa, deja puerta abierta a duplicados).
`ON DELETE CASCADE` en `rubro_id`; SIN cascade en `ramo_id` (los ramos no se borran, se apagan con
`activo=FALSE`, migración 041).

### ramo_id INT (FK a ramos), no TEXT

Verificado: `rubros_actividad.id` es SERIAL (migr. 004) y `ramos.id` es SERIAL (migr. 002) — ambos
INT. BIGINT (como usan `tipos_riesgo_incendio`/`tasas_riesgo_objeto`) crearía mismatch de tipo.

### DECISION #1: el filtro viaja como `?ramo_id=<int>`, NO como slug

Elegido: `ramo_id` numérico, query param, en ambos endpoints.

- Toda la superficie HTTP de este backend identifica ramos por id: `GET /ramos/:id/planes`,
  `/ramos/:id/coberturas-catalogo`, `/admin/ramos/:ramoId/tasas`, `PUT /admin/ramos/:id`. El slug
  (`ramos.nombre`) se usa en migraciones SQL y en ramas de lógica del frontend
  (`ramo.nombre === 'mrc' || 'incendio'`), NUNCA como identificador de recurso en la API.
- Los dos call sites ya tienen el id: `cotizar.js` lo usa a dos líneas
  (`/ramos/${ramo.id}/planes`, `cargarCoberturasCatalogo(ramo.id)`); `admin.js` recibe `ramoId` y lo
  resuelve en `ramoUsaRubrosActividad(ramoId)`. Ningún frontend hardcodea ids (los saca de
  `GET /ramos`).
- Cero round-trips extra: `rubro_actividad_ramo` guarda `ramo_id` →
  `.eq('rubro_actividad_ramo.ramo_id', id)`. Con slug haría falta un SELECT previo contra `ramos` o
  un embed anidado de 2 niveles, más frágil ante el schema cache de PostgREST.
- La propuesta advierte contra introducir un TERCER vocabulario de ramo; `ramo_id` no introduce
  ninguno.

Rechazado slug `?ramo=incendio`: rompe simetría y obliga a resolver el slug en cada request.
Rechazado path param `/ramos/:id/rubros-actividad`: sería lo más consistente con `/ramos/:id/planes`,
pero cambia la forma de la ruta, arrastra al gemelo de admin y rompe la simetría del rollback N3
(hoy "volver `findRubrosActividad` a `.eq('grupo',...)`" sin tocar rutas). Refactor opcional futuro.

CONTRATO: `ramo_id` es OBLIGATORIO. Sin él → 400, no la lista completa. Fallar cerrado es el punto
del cambio: un default permisivo reintroduce el bug original.

### DECISION #2: el endpoint de admin migra en este mismo cambio

Elegido: sí, `GET /admin/rubros-actividad` también filtra por `ramo_id` acá.

- Es la ÚNICA forma de que `grupo` quede sin lectores. Ambos endpoints comparten
  `coberturasRepository.findRubrosActividad`; dejar admin en `grupo` obliga al repositorio a
  soportar los dos mecanismos, contradice el "ningún código nuevo lee ni escribe grupo" y BLOQUEA
  el follow-up de `DROP COLUMN`.
- `req.query.grupo` en admin YA ES CÓDIGO MUERTO: `frontend/admin/admin.js:760` llama a
  `/admin/rubros-actividad` SIN ningún parámetro. No se remueve capacidad en uso.
- Sin filtro el panel se degrada de golpe: la tabla pasa de ~49 a ~256 filas, y las ~207 nuevas
  tienen `tasa_edificio`/`tasa_contenido` NULL (columnas de semántica MRC).
- Costo mínimo: la sección ya está gateada por ramo (`ramoUsaRubrosActividad`) y
  `cargarRubrosActividad` ya se dispara al cambiar de ramo.

Consecuencia aceptada: al elegir Incendio el panel mostrará ~207 rubros con las columnas de tasa
MRC vacías y editables (inocuo pero inútil). UI de admin para `tipos_riesgo_incendio`/
`tasas_riesgo_objeto` está fuera de alcance por la propuesta; queda como follow-up junto al
`DROP COLUMN`.

### El repositorio devuelve la misma forma de fila que hoy

El embed agrega `rubro_actividad_ramo: [...]`; el repositorio LO DESCARTA antes de devolver, para
que la respuesta sea compatible con la actual y ningún consumidor cambie por transporte.

```js
export async function findRubrosActividad(ramoId) {
  const { data, error } = await supabase
    .from('rubros_actividad')
    .select('*, rubro_actividad_ramo!inner(ramo_id)')
    .eq('rubro_actividad_ramo.ramo_id', ramoId)
    .order('id')
  if (error) throw error
  return data.map(({ rubro_actividad_ramo: _p, ...rubro }) => rubro)
}
```

`!inner` convierte el embed en JOIN real (sin él PostgREST devuelve todo con array vacío). La PK
compuesta garantiza <=1 fila por (rubro, ramo): el JOIN no puede duplicar, no hace falta DISTINCT.
Se conserva `.order('id')` (orden de la pantalla del sistema de escritorio, migración 012).

### El nombre canónico sale siempre de UNA sola variable

Causa raíz del bug 040 ('VIVIENDA FAMILIAR' vs 'VIVIENDA'): el nombre se escribió en dos lugares.
El generador lo hace imposible: por fila del pivot resuelve UN solo `nombreCanonico`

- si cruza con rubro existente → el `rubros_actividad.nombre` EXISTENTE carácter a carácter
- si no cruza → nombre del pivot con trim + colapso de espacios, SIN tocar mayúsculas ni acentos

y ese mismo valor se interpola en los 3 lugares (`rubros_actividad`, `tipos_riesgo_incendio`, JOIN
de `tasas_riesgo_objeto`). La normalización (upper/sin acentos) es SOLO clave de cruce, nunca valor
emitido. La migración cierra con un `DO $$` que aborta si algún `tipos_riesgo_incendio.nombre` no
tiene `rubros_actividad.nombre` idéntico.

### tasa_minima/tasa_maxima se siembran tal cual y NO se toca el calculador

Verificado en `backend/src/calculators/incendio.calculator.js`: NO hay ningún valor de tasa
hardcodeado en la mecánica `objeto_riesgo`. Todo sale de `findTasasRiesgoObjeto` (`tasa_valor`,
`unidad`, `tasa_minima`, `tasa_maxima`); las únicas constantes son el mapeo `OBJETOS_RIESGO` y los
divisores 100/1000 de la unidad. Criterio de éxito "editables sin cambio de código": CUMPLIDO POR
CONSTRUCCIÓN, sin trabajo.

### Migración generada idempotente y transaccional, no TRUNCATE+INSERT

`INSERT ... WHERE NOT EXISTS` / `ON CONFLICT DO NOTHING` contra la clave natural
(`rubros_actividad.nombre`; `tipos_riesgo_incendio(ramo_id,nombre)`;
`ux_tasas_riesgo_objeto_generica`). Correrla dos veces es no-op; VIVIENDA se salta sola.
`BEGIN;...COMMIT;` con asserts al final. Rechazado el reemplazo atómico estilo `tasas.service.js`
de Auto: borraría VIVIENDA y cualquier ajuste manual de Kevin sobre las bandas min/max, que son
justamente lo que debe seguir siendo editable.

## Schema — 043_rubro_actividad_ramo.sql (escrita a mano)

```sql
CREATE TABLE rubro_actividad_ramo (
  rubro_id  INT NOT NULL REFERENCES rubros_actividad(id) ON DELETE CASCADE,
  ramo_id   INT NOT NULL REFERENCES ramos(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rubro_id, ramo_id)
);
CREATE INDEX ix_rubro_actividad_ramo_ramo ON rubro_actividad_ramo (ramo_id);
```

BLOQUE 1 — backfill 1:1 de los rubros con `grupo` (`INSERT..SELECT`, no lista a mano):

```sql
INSERT INTO rubro_actividad_ramo (rubro_id, ramo_id)
SELECT ra.id, r.id FROM rubros_actividad ra
JOIN ramos r ON r.nombre = lower(ra.grupo)
WHERE ra.grupo IS NOT NULL
ON CONFLICT DO NOTHING;
```

- assert: 0 rubros con `grupo NOT NULL` sin ramo equivalente (mapeo sin residuo) → `RAISE
EXCEPTION`.

BLOQUE 2 — los 5 rubros con `grupo = NULL`, 8 filas explícitas vía `VALUES` + JOIN por nombre:
VIVIENDA→incendio; SILOS→incendio; CONSULTORIO MEDICO→{mrc,incendio};
CHANCHERIAS→{mrc,incendio}; GRANJA EN GENERAL→{mrc,incendio}. `ON CONFLICT DO NOTHING`.

- assert: las 8 filas existen (si un nombre no matcheó, el JOIN las descartaría en silencio).

ASSERT FINAL: 0 rubros sin ninguna fila en `rubro_actividad_ramo` (nadie invisible en todos los
ramos).

`grupo` NO se toca: ni UPDATE ni DROP. Legacy de solo-lectura.

## Schema — 044_seed_tasas_incendio_rubros.sql (generada)

Encabezado con script, fuente (xlsx + hoja + rango de filas), fecha y conteos. `BEGIN; ... COMMIT;`

1. `INSERT INTO rubros_actividad (nombre) SELECT ... FROM (VALUES ...) WHERE NOT EXISTS ...`
   `grupo`/`categoria`/`tasa_edificio`/`tasa_contenido` quedan NULL a propósito.
2. `INSERT INTO rubro_actividad_ramo`: TODOS los rubros del pivot (nuevos y preexistentes) → ramo
   'incendio'. Un rubro que ya era 'mrc' conserva esa fila y suma la de incendio: el pivot es la
   autoridad sobre qué rubros ofrece Incendio.
3. `INSERT INTO tipos_riesgo_incendio (ramo_id,nombre,tasa_global,tasa_minima,tasa_maxima,unidad)`
   con Min/Max del pivot TAL CUAL, unidad 'porcentaje', `WHERE NOT EXISTS`.
4. `INSERT INTO tasas_riesgo_objeto (tipo_riesgo_id, plan_id NULL, objeto_riesgo, tasa_valor,
factor_porcentaje, unidad)`: 4 filas por tipo (edificio 40, instalaciones 40,
   contenido_mueble_equipos 60, contenido_mercaderia 60), `WHERE NOT EXISTS` sobre la genérica.

ASSERTS: (a) 0 `tipos_riesgo_incendio` sin rubro homónimo; (b) todo tipo tiene exactamente 4 tasas
genéricas; (c) VIVIENDA sigue en 0.90/0.90/1.34/1.34; (d) 0 rubros sin pertenencia.

## Interfaces / Contracts

**GET /ramos/rubros-actividad**

- Query: `ramo_id`, entero positivo, OBLIGATORIO.
- 200: `Array<{id,nombre,categoria,grupo,tasa_edificio,tasa_contenido}>` ordenado por id asc;
  misma forma que hoy; un rubro aparece UNA sola vez aunque sea multi-ramo; `[]` si el ramo no
  tiene rubros (no 404).
- 400: `ramo_id` ausente/no numérico/<=0 (error Zod por el middleware existente).
- El parámetro `grupo` deja de interpretarse. No queda ruta para pedir el catálogo completo sin
  ramo.

**GET /admin/rubros-actividad**: idéntico contrato y validación; conserva `requireTasasEdit`;
comparte `findRubrosActividad(ramoId)`. Un solo mecanismo de filtrado, no dos.

Validación: archivo nuevo `backend/src/schemas/ramos.schema.js`

```js
export const rubrosActividadQuerySchema = z.object({ ramo_id: z.coerce.number().int().positive() })
```

(`ramos.controller.js` hoy no valida nada, y `admin.schema.js` es del dominio admin: no corresponde
importarlo desde `ramos.controller.js`). Ambos controllers parsean y pasan el número al service; los
services siguen siendo pass-through de una línea (grupo → ramoId).

**Núcleo puro** (`backend/src/services/tasas-incendio.service.js`):

- `normalizarNombreRubro(nombre)` — trim + colapso espacios + upper + sin acentos; SOLO clave de
  cruce.
- `parsearPivotIncendio(workbook, {hoja='Hoja1', filaDesde=5, filaHasta=211})` — Zod; lanza.
- `derivarTasasPorObjeto(tasaGlobal)` — 4 objetos, 2 decimales half-up.
- `cruzarContraCatalogo(filasPivot, rubrosExistentes, tiposRiesgoExistentes)` —
  → `{reutilizados,nuevos,yaSembrados,ambiguos,sinPivot,warnings}`; no lanza, el CLI decide.
- `generarSqlSeed(cruce, metadatos)` — string determinista (orden del pivot).

**CLI** (`backend/scripts/generar-migracion-tasas-incendio.js`):
flags `--input --hoja --desde --hasta --out --catalogo` (json offline).
Lecturas: el xlsx + `SELECT id,nombre FROM rubros_actividad` + `SELECT nombre FROM
tipos_riesgo_incendio`. CERO escrituras a la base.

ABORTA (exit 1, sin emitir archivo): hoja inexistente/rango vacío; nombre vacío tras trim; dos
filas del pivot que normalizan igual (lista el par, nunca "se queda con la última"); un nombre que
cruza con MÁS DE UN rubro existente (lista candidatos); `tasa_global` no numérica/nula/<=0;
`derivarTasasPorObjeto(2.24) != 0.90/0.90/1.34/1.34` (el redondeo divergió de la migración 038).

WARNINGS (no abortan, se listan y quedan en el encabezado del .sql): cruce por normalización con
grafía distinta (se reutiliza el nombre EXISTENTE); `tasa_minima>tasa_maxima` o global fuera de
`[min,max]` (se carga igual, decisión #1); `0.4*global < tasa_minima` (clamp permanente, ver
riesgos); nombre ya presente en `tipos_riesgo_incendio` (se omite del bloque de tasas pero se emite
su pertenencia a incendio).

Escapado: `'` → `''` en todo nombre; números con `toFixed(4)` para `NUMERIC(8,4)`.

## File Changes

NEW: `migrations/043_rubro_actividad_ramo.sql`; `migrations/044_seed_tasas_incendio_rubros.sql`
(generada); `src/services/tasas-incendio.service.js` (+ .test.js);
`scripts/generar-migracion-tasas-incendio.js`; `src/schemas/ramos.schema.js`

MOD: `src/repositories/coberturas.repository.js` (`findRubrosActividad` por JOIN `!inner`,
descarta embed); `src/services/ramos.service.js`; `src/services/admin/rubros-actividad.service.js`;
`src/controllers/ramos.controller.js`; `src/controllers/admin.controller.js` (~183);
`frontend/cotizar/cotizar.js` (~411 y ~579, + borrar el comentario que justificaba la lista
compartida); `frontend/admin/admin.js` (~756-760, `cargarRubrosActividad(ramoId)` + refetch por
ramo); `docs/ESTADO_PROYECTO.md`; `CLAUDE.md`

## Testing Strategy

- Unitarios del núcleo puro (workbook ExcelJS en memoria, sin leer el xlsx real):
  `derivarTasasPorObjeto(2.24)` → 0.90/0.90/1.34/1.34 (regresión directa de 038); half-up en
  x.xx5; `normalizarNombreRubro` (acentos, doble espacio, mayúsculas); cada fila de la tabla de
  aborto lanza nombrando la fila culpable; `generarSqlSeed` escapa `'`, es determinista, y para un
  rubro reutilizado emite el nombre EXISTENTE, no el del pivot.
- Repositorio/endpoint (mock supabase-js): el select lleva `!inner` y filtra por
  `rubro_actividad_ramo.ramo_id`; la fila devuelta NO trae la propiedad del embed; sin `ramo_id` →
  400; `ramo_id=abc` → 400; un rubro multi-ramo aparece exactamente una vez por ramo.
- Regresión: `npm test --prefix backend` en verde sobre los 100 tests actuales.
- Verificación en vivo post-migración: conteo por ramo vía tabla nueva == conteo previo por `grupo`
  para mrc y tro; CONSULTORIO MEDICO/CHANCHERIAS/GRANJA EN GENERAL en MRC _y_ Incendio, VIVIENDA y
  SILOS solo en Incendio; cotizar 3-4 rubros nuevos en los 3 planes objeto_riesgo sin 422;
  `count(*)` de `rubros_actividad` con `grupo IS NULL` sigue siendo 5.

## Threat Matrix

Sin filas del matrix estándar (no toca shell, subprocesos, VCS/PR ni archivos ejecutables). Dos
límites reales: (a) xlsx no confiable usado para generar SQL → inyección vía nombre con `'` o `--`;
control: única vía es el script, escapa duplicando `'`, números con `toFixed(4)` (nunca texto crudo
en posición numérica), y el .sql se revisa en el PR antes de aplicarse. (b) `ramo_id` arbitrario
expone rubros de otro ramo; control: no hay dato sensible en `rubros_actividad`, el gate
`requireTasasEdit` no cambia, `ramo_id` se valida como entero positivo y supabase-js parametriza.

## Migration / Rollout

ÚLTIMA MIGRACIÓN REAL VERIFICADA: `042_fix_numero_variante_unique_por_cotizacion.sql` → las nuevas
son 043 y 044.

SE INVIERTE el orden de la propuesta (que numeraba 043=seed, 044=tabla): 043 = tabla + backfill;
044 = seed. Razón: cada migración queda coherente por sí sola. Con solo 043 aplicada el filtro por
ramo funciona con el catálogo de hoy, sin regresión. Con el orden original la ventana entre 043 y
044 dejaría el catálogo inflado a ~256 rubros y todavía SIN filtrar — estrictamente peor que el
estado actual, que es justo el bug que se está arreglando. 044 depende de 043; la inversa no.

Despliegue: 1) aplicar 043 + verificar asserts y conteos por ramo; 2) correr el script y revisar el
.sql generado en el PR; 3) aplicar 044 + verificar asserts; 4) deploy de backend y frontend JUNTOS
(el backend pasa a exigir `ramo_id`, 400 sin él; desplegar uno solo rompe el selector); 5) ops: si
PostgREST responde "could not find a relationship" tras 043 es el schema cache (Supabase recarga
solo tras DDL; si no, `NOTIFY pgrst, 'reload schema'`).

Rollback: N1 `activo=FALSE` de lo sembrado; N2 borrar lo de 044 (preservando VIVIENDA y MRC) y/o
`DROP TABLE rubro_actividad_ramo` — `grupo` sigue intacta y válida, no hay nada que restaurar
(razón concreta para no borrarla en este cambio); N3 revertir el filtro a `.eq('grupo',...)`, diff
acotado porque no se cambió la forma de las rutas. Las cotizaciones emitidas guardan snapshot de
tasa.

## Riesgos técnicos del diseño

1. **EL CLAMP PUEDE ANULAR LA DERIVACIÓN 40/60.** `incendio.calculator.js` clampea la tasa
   EFECTIVA del conjunto contra `tasa_minima`/`tasa_maxima`. Como los objetos se derivan al 40-60%
   de la global, la efectiva siempre cae en `[0.4*global, 0.6*global]`; en cualquier rubro cuyo Min
   del pivot supere `0.4*global` el clamp se activaría EN TODA COTIZACIÓN (VIVIENDA no sufre esto:
   0,6 < 0,90). Mitigación: no se toca el calculador ni se inventan valores; el script LISTA en el
   reporte los rubros con `0.4*global < tasa_minima` para que Kevin decida (ajustar el Min por
   UPDATE, que es lo que la decisión #1 habilitó). Riesgo de prima distorsionada, no de error: no
   produce 422.
2. Rubros asociados a Incendio SIN tasa (CONSULTORIO MEDICO, CHANCHERIAS, GRANJA EN GENERAL) salen
   en el selector y dan 422. Aceptado por Kevin (decisión #6). Follow-up: marcar qué rubros tienen
   tasa confirmada.
3. El embed `!inner` depende del schema cache y del nombre de la relación → nombre = el de la
   tabla (estable), test de repositorio verifica el select, nota de ops para el reload.
4. Deploy desacoplado rompe el selector (400 sin `ramo_id`) → se despliegan juntos; se elige igual
   fallar cerrado.
5. `grupo` y `rubro_actividad_ramo` divergen mientras conviven → `grupo` documentada como legacy de
   solo-lectura; tras este cambio no queda NINGÚN lector (por eso admin migra acá); `DROP COLUMN`
   registrado como follow-up en `docs/ESTADO_PROYECTO.md`.
6. El panel admin muestra ~207 rubros de Incendio con columnas MRC vacías → aceptado; sin el
   filtro sería peor (también aparecerían en MRC).
7. Regenerar 044 sobre una base ya migrada → es idempotente; cambiar valores requiere una migración
   nueva de UPDATE, no regenerar 044.

## Open Questions

Ninguna. Las dos abiertas quedaron resueltas: filtro = `?ramo_id=<int>` obligatorio en ambos
endpoints; el endpoint de admin migra en este mismo cambio.

Follow-ups (fuera de alcance, no bloquean): `DROP COLUMN rubros_actividad.grupo`; UI de admin para
`tipos_riesgo_incendio`/`tasas_riesgo_objeto`; definir tasas para los 27 rubros ausentes del pivot;
revisar con Kevin los rubros donde `0.4*tasa_global < tasa_minima`.
