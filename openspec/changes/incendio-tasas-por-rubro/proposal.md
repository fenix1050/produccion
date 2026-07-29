# Proposal: Incendio — carga de tasas de riesgo por rubro de actividad (~207 rubros)

## Intent

Los 3 planes nuevos de Incendio (mecánica `objeto_riesgo`) solo cotizan `VIVIENDA`; cualquier otro rubro falla 422 "Tipo de Riesgo sin tasas confirmadas". El pivot `docs/insumos/Tasa sistema Incendio.xlsx` (Hoja1, filas 5-211) trae la tasa global de ~207 rubros. Cargarlos hace a Incendio cotizable de verdad sin tocar código por rubro.

Kevin confirmó además una regla de negocio transversal: **cada ramo tiene sus propias tasas y no se mezclan**. Hoy el selector de "Tipo de Riesgo" del flujo de cotización lista `rubros_actividad` sin filtrar por `grupo`, mostrando rubros de MRC/TRO como si fueran de Incendio — así apareció el bug original con `CONSULTORIO` (`grupo='MRC'`, sin tasa de Incendio). Corregir eso entra en este cambio.

Al auditar los 5 rubros con `grupo = NULL` apareció un hecho de negocio que invalida el modelo de datos actual: **un rubro puede pertenecer a más de un ramo a la vez**. `CONSULTORIO MEDICO`, `CHANCHERIAS` y `GRANJA EN GENERAL` son, según Kevin, rubros de MRC **e** Incendio simultáneamente. La columna `grupo VARCHAR(10)` de `rubros_actividad` (migración 004/012) solo admite un valor por rubro, así que la pertenencia deja de ser un atributo del rubro y pasa a ser una **relación muchos-a-muchos** entre rubro y ramo.

## Scope

### In Scope

- Cruce programático de ~207 nombres del pivot contra `rubros_actividad.nombre`.
- Alta de rubros faltantes **asociados al ramo `incendio` vía `rubro_actividad_ramo`** (ya no vía la columna `grupo`), sin tocar `tasa_edificio`/`tasa_contenido` de MRC.
- Alta en `tipos_riesgo_incendio` (tasa global + `tasa_minima`/`tasa_maxima`) con nombre idéntico carácter a carácter.
- Alta de 4 filas genéricas en `tasas_riesgo_objeto` por rubro, derivadas 40/40/60/60 (Edificio 40, Instalaciones 40, Cont. Mueble y Equipos 60, Cont. Mercadería 60 — mismo criterio de migración 038).
- **Tabla intermedia `rubro_actividad_ramo`** (nueva): modela la pertenencia rubro↔ramo como muchos-a-muchos. Un rubro tiene N filas, una por cada ramo en el que debe aparecer.
- **Backfill completo de la pertenencia**: (a) migración 1:1 de todos los rubros que hoy tienen `grupo` no-NULL (`BAZAR → mrc`, `COOPERATIVA → tro`, etc., migración 012) para no perder el filtro MRC/TRO existente; (b) alta de las asignaciones confirmadas por Kevin para los 5 rubros que hoy tienen `grupo = NULL`, incluidos los 3 casos multi-ramo; (c) alta de los rubros nuevos que entran desde el pivot, asociados al ramo `incendio`.
- **Filtrado del selector de rubros por ramo**: parámetro de ramo en `GET /ramos/rubros-actividad` (`backend/src/routes/ramos.routes.js`, `ramos.controller`, `services/ramos.service.js`, `services/admin/rubros-actividad.service.js`, `repositories/coberturas.repository.js`) resuelto **por JOIN contra `rubro_actividad_ramo`**, no por igualdad sobre `grupo`; y consumo desde `frontend/cotizar/cotizar.js`, que hoy lo pide sin filtro en dos lugares. Cada ramo muestra solo sus propios rubros, y un rubro multi-ramo aparece en todos los suyos.
- Entrega como migraciones SQL versionadas generadas por script.

### Out of Scope

- Los **27 rubros ya existentes en `rubros_actividad` (migración 012) sin fila de nombre exacto en el pivot** (incluye `CONSULTORIO`, el caso que destapó el bug). Kevin los deja pendientes de definición propia; no se inventan tasas de Incendio para ellos:
  `CONSULTORIO`, `PELUQUERIA`, `VENTA DE COSMETICOS`, `VENTA DE ELECTRODOMESTICOS Y/O EQUIPOS ELECTRONICOS`, `VENTA DE PRENDAS DE VESTIR`, `VENTA DE REPUESTOS`, `VENTAS DE PRODUCTOS DE LIMPIEZA`, `CENTRO MATERNAL Y ESCUELA HOGAR`, `COMPLEJO SOCIAL`, `FUNDACION`, `NEGOCIO - VIVIENDA`, `CONSULTORIO MEDICO`, `LAVADERO DE AUTOS`, `PIZZERIA`, `SANTUARIO`, `LOMITERIA`, `MINIMERCADO`, `CANCHA SINTETICA`, `CASA DE EQUIPAMIENTOS`, `CENTRO LUBRICACION`, `CONFECCION DE PRENDAS DE VESTIR`, `ESTACION DE SERVICIO Y SHOP`, `HOTEL Y RESTAURANT`, `PANADERIAS`, `DEPOSITOS`, `CHANCHERIAS`, `GRANJA EN GENERAL`.
- **Eliminación de la columna `rubros_actividad.grupo`.** Queda **deprecada** por `rubro_actividad_ramo` pero **no se borra ni se toca en este cambio**: hoy la leen `findRubrosActividad` y el panel admin, y borrarla obligaría a migrar de golpe todo consumidor de MRC/TRO. Se deja en paralelo como columna legacy de solo-lectura y el `DROP COLUMN` queda como **follow-up explícito**, una vez que todo el código lea la tabla nueva. Ningún código nuevo de este cambio debe escribir ni leer `grupo`.
- Mecánica MRC: intacta (ningún UPDATE sobre sus tasas).
- Endpoint admin de importación de tasas (sobre-ingeniería para un one-off).
- Overrides de tasa por plan (`plan_id`).
- **UI nueva de admin** para editar tasas de Incendio: el modelo (`tipos_riesgo_incendio`, `tasas_riesgo_objeto`) ya soporta `UPDATE` normal por fila, así que el requisito de "editable después" se cumple vía SQL/panel existente. Este cambio solo debe **no bloquear** esa edición futura (nada de constantes hardcodeadas en el calculador).

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `incendio-planes-objeto-riesgo`: el desglose por objeto pasa de "valores confirmados para VIVIENDA" a regla derivada 40/40/60/60 sobre la tasa global, aplicable a todo tipo de riesgo de Incendio; el catálogo cubre el pivot completo.
- `incendio-planes-objeto-riesgo` (o capability de catálogo equivalente): el listado de rubros de actividad ofrecido al cotizar queda **acotado al ramo**, no compartido entre Incendio/MRC/TRO. La pertenencia rubro↔ramo pasa de atributo simple (`grupo`, un valor) a relación **muchos-a-muchos**: un mismo rubro puede ofrecerse en varios ramos a la vez, cada uno con sus propias tasas.

## Approach

Script one-off en `backend/scripts/` (carpeta nueva): ExcelJS lee el `.xlsx` (mismo patrón que `tasas.service.js` de Auto) → normaliza y cruza nombres contra `rubros_actividad`, fallando ruidosamente ante ambigüedad → valida con Zod → aplica 40/40/60/60 con redondeo a 2 decimales → emite migración idempotente `backend/migrations/043_seed_tasas_incendio_rubros.sql`. El script es la herramienta; la migración es el entregable auditable.

El filtro por ramo va aparte: migración `044_rubro_actividad_ramo.sql` (o el número siguiente que corresponda al mergear la migración anterior), con **cuatro bloques**:

1. **Crear la tabla** `rubro_actividad_ramo`. Forma propuesta (sdd-design puede afinar nombres e índices, no el modelo):

   ```sql
   CREATE TABLE rubro_actividad_ramo (
     rubro_id INT NOT NULL REFERENCES rubros_actividad(id) ON DELETE CASCADE,
     ramo_id  INT NOT NULL REFERENCES ramos(id),
     PRIMARY KEY (rubro_id, ramo_id)
   );
   CREATE INDEX idx_rubro_actividad_ramo_ramo ON rubro_actividad_ramo(ramo_id);
   ```

   **Decisión de tipo: FK `ramo_id INT REFERENCES ramos(id)`, no un `TEXT` nuevo.** `ramos` ya existe (migración 002, `id SERIAL`) y es como referencian el ramo `tipos_riesgo_incendio`, `tasas_cobertura_ramo`, `planes`, `coberturas_catalogo` y `clausulas_catalogo`. Un `TEXT` nuevo introduciría un tercer vocabulario de ramo (hoy ya conviven `ramos.nombre` en minúscula — `'incendio'`, `'mrc'`, `'tro'` — y `grupo` en mayúscula — `'MRC'`, `'TRO'`), sin integridad referencial. `rubros_actividad.id` es `SERIAL` (INT), así que `rubro_id` es `INT`, no `BIGINT`.

2. **Backfill 1:1 de los rubros que ya tienen `grupo`**, mapeando `grupo → ramos.nombre` (`'MRC' → 'mrc'`, `'TRO' → 'tro'`) con un `INSERT ... SELECT ... JOIN ramos` — una fila por rubro, mismo ramo que ya tenía. Sin este bloque, activar el filtro nuevo dejaría los selectores de MRC y TRO vacíos.
3. **Asignaciones confirmadas de los 5 rubros que hoy tienen `grupo = NULL`**, explícitas rubro por rubro (nunca un default masivo):

   | Rubro                | Ramos              | Filas |
   | -------------------- | ------------------ | ----- |
   | `VIVIENDA`           | `incendio`         | 1     |
   | `SILOS`              | `incendio`         | 1     |
   | `CONSULTORIO MEDICO` | `mrc` + `incendio` | 2     |
   | `CHANCHERIAS`        | `mrc` + `incendio` | 2     |
   | `GRANJA EN GENERAL`  | `mrc` + `incendio` | 2     |

4. **Rubros nuevos del pivot** → una fila cada uno contra el ramo `incendio`.

La columna `grupo` **no se toca**: ni se actualiza para los 5 NULL, ni se borra. Queda legacy hasta el follow-up de `DROP COLUMN`.

Luego, el filtro del endpoint pasa de `.eq('grupo', …)` en `findRubrosActividad` (`backend/src/repositories/coberturas.repository.js`) a un JOIN contra la tabla nueva — con supabase-js, un embed `!inner` sobre la relación FK filtrando por `ramo_id`; la firma pública del endpoint pasa a recibir el ramo (slug o id) en vez del `grupo`. Después, su uso en el frontend.

Descartados: INSERT manual (~824 valores), endpoint admin de importación, y **lista de ramos en la misma columna** (`grupo = 'MRC,INCENDIO'`) — ver decisión #7.

## Decisiones confirmadas por Kevin (2026-07-28)

| #   | Pregunta abierta                                                                                                                                                                                                                                                                                                            | Resolución                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ¿`tasa_minima`/`tasa_maxima` del pivot o piso/techo comercial?                                                                                                                                                                                                                                                              | **Resuelta.** Se cargan con el Mín/Máx histórico del pivot **tal cual viene** (incluidos outliers). Deben quedar **editables después** vía SQL/panel admin: no hardcodear, no bloquear el `UPDATE` por fila.                                                                                                                                                                                                                                                                                                      |
| 2   | ¿Redondeo a 2 decimales para todos?                                                                                                                                                                                                                                                                                         | **Resuelta.** Sí, 2 decimales para todos los rubros, igual que se hizo con `VIVIENDA`.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | ¿Todos los rubros `activo=TRUE`?                                                                                                                                                                                                                                                                                            | **Resuelta implícitamente.** Todos los del pivot entran activos; `activo=FALSE` queda como palanca posterior de apetito de riesgo.                                                                                                                                                                                                                                                                                                                                                                                |
| 4   | Los rubros nuevos aparecerían también en el dropdown de MRC (frontend no filtra por `grupo`).                                                                                                                                                                                                                               | **Resuelta — amplía el alcance.** "No deben mezclarse las tasas de las ramas, ya que cada rama tiene sus propias tasas". Se etiquetan los rubros nuevos con el grupo de Incendio y se filtra el selector por ramo dentro de **este** cambio (ya no diferido).                                                                                                                                                                                                                                                     |
| 5   | Rubros del catálogo ausentes del pivot.                                                                                                                                                                                                                                                                                     | **Resuelta.** Los 27 listados en Out of Scope quedan sin tasa de Incendio hasta que Kevin los defina. No se inventan valores.                                                                                                                                                                                                                                                                                                                                                                                     |
| 6   | ¿Qué pasa con los rubros que hoy tienen `grupo = NULL` al filtrar por ramo? Opción A: `NULL` como comodín visible en todos los ramos, sin migrar nada. Opción B: asignar a cada uno su ramo explícito.                                                                                                                      | **Resuelta — Kevin eligió la opción B.** Se audita rubro por rubro y se le asigna ramo explícito. No queda comodín. Asignar ramo **no** implica darle tasa de Incendio a un rubro (`CONSULTORIO MEDICO`, `CHANCHERIAS` y `GRANJA EN GENERAL` siguen en Out of Scope para tasas aunque queden asociados a Incendio).                                                                                                                                                                                               |
| 7   | Al pedir el ramo de los 5 rubros, 3 resultaron pertenecer a **dos ramos a la vez** (`CONSULTORIO MEDICO`, `CHANCHERIAS`, `GRANJA EN GENERAL` → MRC **e** Incendio). ¿Cómo se modela la pertenencia múltiple? Opción A: tabla intermedia muchos-a-muchos. Opción B: lista de valores en la misma columna (`'MRC,INCENDIO'`). | **Resuelta — Kevin eligió la opción A: tabla intermedia.** `rubro_actividad_ramo (rubro_id, ramo_id)`. Razón: el filtro sigue siendo **igualdad estricta en SQL** con integridad referencial e índice, sin `LIKE '%MRC%'` (que además matchearía subcadenas de otros valores) ni parsing/split de string en la aplicación, y sin condenar cada alta o baja de ramo a un `UPDATE` de string. Consecuencia: `rubros_actividad.grupo` queda **deprecada** pero se conserva en paralelo; su eliminación es follow-up. |

## Affected Areas

| Área                                                                                                                                                          | Impacto  | Descripción                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/scripts/`                                                                                                                                            | New      | Script one-off de importación del pivot                                                                                                                               |
| `backend/migrations/043_seed_tasas_incendio_rubros.sql`                                                                                                       | New      | Seed de ~206 tipos de riesgo + ~824 filas de tasas por objeto                                                                                                         |
| `backend/migrations/044_rubro_actividad_ramo.sql`                                                                                                             | New      | Crea `rubro_actividad_ramo` + backfill 1:1 de los rubros con `grupo`, asignaciones confirmadas de los 5 rubros NULL (2 de ellos multi-ramo) y rubros nuevos del pivot |
| `rubro_actividad_ramo`                                                                                                                                        | New      | Tabla intermedia rubro↔ramo (`rubro_id INT`, `ramo_id INT`, PK compuesta)                                                                                             |
| `rubros_actividad`                                                                                                                                            | Modified | Solo INSERT de rubros nuevos. **La columna `grupo` no se modifica ni se elimina** (queda deprecada); sin UPDATE de tasas MRC                                          |
| `tipos_riesgo_incendio`, `tasas_riesgo_objeto`                                                                                                                | Modified | Filas nuevas                                                                                                                                                          |
| `backend/src/repositories/coberturas.repository.js` (`findRubrosActividad`)                                                                                   | Modified | El filtro pasa de `.eq('grupo', …)` a JOIN/embed contra `rubro_actividad_ramo`                                                                                        |
| `backend/src/routes/ramos.routes.js`, `ramos.controller.js`, `services/ramos.service.js`, `services/admin/rubros-actividad.service.js`, `admin.controller.js` | Modified | Filtro por ramo en `GET /ramos/rubros-actividad` (y su gemelo de admin): el parámetro pasa de `grupo` a ramo                                                          |
| `frontend/cotizar/cotizar.js`                                                                                                                                 | Modified | Dos llamadas a `/ramos/rubros-actividad` pasan a filtrar por ramo (y se retira el comentario que justificaba la lista compartida)                                     |
| `docs/ESTADO_PROYECTO.md`, `CLAUDE.md`                                                                                                                        | Modified | Registro de estado                                                                                                                                                    |

## Risks

| Riesgo                                                                                                                                   | Probabilidad | Mitigación                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repetir el bug de migración 040 (mismatch de nombre exacto) a escala                                                                     | Alta         | El script deriva el nombre del mismo string de `rubros_actividad` + test de 0 huérfanos                                                                                                                               |
| Pisar tasas de MRC                                                                                                                       | Media        | Solo `INSERT ... WHERE NOT EXISTS`; ningún UPDATE sobre tasas existentes                                                                                                                                              |
| Nombres duplicados/casi-duplicados en el pivot                                                                                           | Media        | Abortar con reporte, sin adivinar                                                                                                                                                                                     |
| Redondeo divergente del de migración 038                                                                                                 | Media        | Recalcular VIVIENDA y exigir 0,90/0,90/1,34/1,34%                                                                                                                                                                     |
| **Backfill 1:1 incompleto**: si algún rubro con `grupo` no-NULL no recibe su fila, el filtro nuevo lo desaparece del selector de MRC/TRO | **Alta**     | El backfill es un `INSERT ... SELECT` sobre `WHERE grupo IS NOT NULL` (no una lista escrita a mano) + assert de conteo: filas insertadas = rubros con `grupo` no-NULL, y `grupo` mapeado sin residuo a `ramos.nombre` |
| **Doble fuente de verdad** mientras `grupo` sobrevive en paralelo: alguien edita `grupo` y el selector no cambia, o al revés             | Media        | `grupo` queda documentada como legacy de solo-lectura; ningún código nuevo la escribe; el follow-up de `DROP COLUMN` queda registrado en `docs/ESTADO_PROYECTO.md` para que no se olvide                              |
| Mal-clasificar un rubro al ramo equivocado (queda visible donde no corresponde y oculto en el suyo)                                      | Media        | Asignaciones confirmadas por Kevin una por una y transcritas en la tabla del Approach; lista corta (5 rubros); el rollback borra filas, no destruye datos previos                                                     |
| Un rubro multi-ramo aparece duplicado en el selector si el JOIN no deduplica                                                             | Media        | PK compuesta impide filas repetidas y el embed `!inner` filtra por un solo `ramo_id`; test del endpoint por ramo verificando unicidad de rubro                                                                        |
| El filtro nuevo deja a MRC/TRO sin rubros por backfill mal mapeado                                                                       | Media        | Verificar por ramo, después de la migración, que el selector no queda vacío y que su conteo coincide con el conteo previo por `grupo`                                                                                 |
| Rubros fuera del apetito de riesgo quedan cotizables                                                                                     | Baja         | `activo` permite apagarlos                                                                                                                                                                                            |

## Rollback Plan

- **N1 (negocio)**: `UPDATE tipos_riesgo_incendio SET activo=FALSE` para los rubros sembrados.
- **N2 (datos)**: migración down que borra solo lo sembrado, preservando `VIVIENDA` y las ~47 filas de MRC. La pertenencia se revierte con `DROP TABLE rubro_actividad_ramo` — **la columna `grupo` sigue intacta y sigue siendo válida**, así que el rollback del filtro es limpio y no requiere restaurar nada (esta es una ventaja concreta de no borrar `grupo` en este cambio).
- **N3 (código)**: revertir el filtro por ramo en endpoint y frontend (cambio acotado, sin efecto sobre cotizaciones emitidas); `findRubrosActividad` vuelve a `.eq('grupo', …)` sin pérdida de datos.
- Las cotizaciones ya emitidas guardan snapshot de tasa: el rollback no las altera.

## Dependencies

- `docs/insumos/Tasa sistema Incendio.xlsx` estable.
- Definición futura de Kevin para los 27 rubros fuera de alcance — no bloquea este cambio.
- ~~Confirmación de Kevin del ramo de los 5 rubros hoy `NULL`~~ — **resuelta el 2026-07-28**: los 5 están asignados (ver tabla en Approach). Ya no bloquea nada.

## Success Criteria

- [ ] Cualquier rubro presente en el pivot cotiza en los 3 planes de Incendio sin 422.
- [ ] Cero `tipos_riesgo_incendio.nombre` sin su `rubros_actividad.nombre` idéntico carácter a carácter.
- [ ] `VIVIENDA` sigue en 0,90/0,90/1,34/1,34%.
- [ ] Tasas de MRC preexistentes sin cambios.
- [ ] El selector de Tipo de Riesgo en Incendio no muestra rubros exclusivos de MRC/TRO, y viceversa.
- [ ] **Un rubro puede aparecer en más de un selector de ramo a la vez.** Concretamente, `CONSULTORIO MEDICO`, `CHANCHERIAS` y `GRANJA EN GENERAL` aparecen tanto en MRC como en Incendio; `VIVIENDA` y `SILOS` solo en Incendio.
- [ ] `rubro_actividad_ramo` tiene exactamente estas filas para los 5 rubros antes `NULL`: `VIVIENDA→incendio`, `SILOS→incendio`, `CONSULTORIO MEDICO→{mrc, incendio}`, `CHANCHERIAS→{mrc, incendio}`, `GRANJA EN GENERAL→{mrc, incendio}` (8 filas en total).
- [ ] Cero rubros con `grupo` no-NULL sin su fila equivalente en `rubro_actividad_ramo`: el conteo de rubros por ramo vía la tabla nueva coincide con el conteo previo por `grupo` para `mrc` y `tro`.
- [ ] Cero filas en `rubros_actividad` sin al menos una fila en `rubro_actividad_ramo` (ningún rubro invisible en todos los ramos).
- [ ] `rubros_actividad.grupo` sigue existiendo y con los mismos valores que antes del cambio (incluidos los 5 `NULL`): esta migración no la toca.
- [ ] `tasa_minima`/`tasa_maxima` son editables por `UPDATE` sin cambio de código.
- [ ] `npm test --prefix backend` en verde, sin regresión sobre los 100 tests actuales.
