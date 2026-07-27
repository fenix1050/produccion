# Design: Incendio — 3 planes nuevos (Hipotecario, con/sin Inspección) + moneda USD/Gs.

## Technical Approach

Tres bloques independientes que se integran en el flujo existente `routes → controllers → services → repositories → calculators`, sin romper los 2 planes de Incendio ya productivos:

1. **Mecánica de tasa por objeto de riesgo**: nueva rama en `incendio.calculator.js`, seleccionada por el campo de datos `planes.tipo_mecanica` (no por `plan.nombre`). Las tasas vienen de un par de tablas nuevas (`tipos_riesgo_incendio` + `tasas_riesgo_objeto`), resueltas en `cotizacion.service.js` y pasadas al calculador — el calculador sigue siendo puro (sin `await` a repositories), igual que hoy.
2. **Umbral de inspección**: dato de plan (`planes.requiere_inspeccion` + `umbral_inspeccion_monto/_moneda`), resuelto en el service (necesita tipo de cambio, que es I/O) y **validado en el calculador** con `httpError(422, ...)`, mismo patrón que "supera la Responsabilidad Máx. Cotizable".
3. **Moneda**: `cotizaciones.moneda` NOT NULL DEFAULT `'PYG'` + snapshot de tipo de cambio. **No hay conversión de montos**: las tasas (‰/%) son independientes de la moneda, el agente declara capitales en la moneda de la cotización y la prima sale en esa misma moneda. El tipo de cambio se usa solo para (a) comparar la suma asegurada contra un umbral expresado en otra moneda y (b) dejar trazabilidad en la cotización emitida.

## Data Flow

```
POST /api/cotizaciones[/calcular]  (body incluye moneda + 4 capitales opcionales)
  │
  ▼ controller ──→ schemas/incendio.schema.js (Zod: moneda, capitales por objeto)
  │
  ▼ cotizacion.service.js
  │    validarYResolverContexto()  → plan, ramo, datosValidados
  │    resolverContextoRepositorios(ramo, plan, riesgoDatos, capital, moneda)
  │      ├─ withCache('catalogoRamo:{ramoId}')      → coberturas.repository
  │      ├─ withCache('tasasRamo:{ramoId}')         → coberturas.repository
  │      ├─ withCache('tasasObjeto:{ramoId}:{tipoRiesgo}:{planId}')
  │      │        → coberturas.repository.findTasasRiesgoObjeto()   [NUEVO]
  │      └─ resolverUmbralInspeccion(plan, moneda)  [NUEVO]
  │             └─ tipo-cambio.service.obtenerTipoCambioVigente()  (solo si monedas difieren)
  │                    ├─ withCache('tipo_cambio:USD', ttl 15min)
  │                    ├─ fetch dolarPy (timeout 3s) → INSERT tipos_cambio → valor fresco
  │                    └─ fallback: SELECT último tipos_cambio  → { stale: true } + log warn
  ▼ incendio.calculator.calcularPrima({ ..., tasasObjetoRiesgo, umbralInspeccion, moneda })
  │    dispatch por plan.tipo_mecanica → calcularPorObjetoRiesgo()
  │    · valida umbral   → 422 si "sin Inspección" y suma > umbral
  │    · Σ objetos declarados × tasa; piso prima_tecnica_minima de la moneda
  ▼ construirVariantes() → formas de pago → response
  ▼ crearCotizacion(): persiste moneda + tipo_cambio_snapshot (solo al emitir, no en preview)
```

## Architecture Decisions

### Decision: tablas nuevas (`tipos_riesgo_incendio` + `tasas_riesgo_objeto`), no extender `rubros_actividad`

**Choice**: dos tablas nuevas — cabecera por tipo de riesgo (global/mín/máx) y detalle por objeto de riesgo.
**Alternatives considered**: agregar 4 columnas de tasa a `rubros_actividad`; agregar `plan_id` + filas a `tasas_cobertura_ramo`.
**Rationale**: `rubros_actividad` ya sirve a MRC e Incendio "Edificio y Contenido" con semántica ‰ por par edificio/contenido; agregarle 4 columnas la vuelve un god-table con columnas nulas para la mitad de sus consumidores. `tasas_cobertura_ramo` está keyed por `(ramo_id, cobertura_id)` sin `plan_id` y sin lugar para global/mín/máx. Separar cabecera y detalle evita repetir `tasa_global/minima/maxima` en 4 filas por tipo de riesgo (denormalización que se desincroniza).

### Decision: `tasa_valor` explícita por objeto, no factor 40/60% calculado

**Choice**: guardar la tasa final de cada objeto (0,90 / 0,90 / 1,34 / 1,34) como dato; el factor (`factor_porcentaje`) se guarda solo como documentación de la derivación.
**Alternatives considered**: guardar solo `tasa_global` + factor y calcular en runtime.
**Rationale**: 40% de 2,24 = 0,896, no 0,90 — los valores oficiales de Kevin vienen redondeados. Calcular en runtime produciría primas que no matchean la tabla oficial. El dato de negocio es la tasa final.

### Decision: `plan_id` NULLABLE en `tasas_riesgo_objeto`

**Choice**: `plan_id NULL` = tasa genérica del tipo de riesgo; `plan_id` seteado = override de ese plan. Resolución: override primero, genérica como fallback.
**Alternatives considered**: `plan_id NOT NULL` con 3 filas duplicadas por tipo de riesgo.
**Rationale**: hoy los 3 planes comparten tasa (confirmado). Con `NOT NULL` cada tipo de riesgo nuevo exigiría 12 filas en vez de 4 y mantener 3 copias sincronizadas a mano. El nullable soporta divergencia futura sin refactor (riesgo listado en la propuesta).

### Decision: umbral como columnas de `planes`, no tabla de configuración global

**Choice**: `planes.requiere_inspeccion BOOLEAN NULL` + `umbral_inspeccion_monto` + `umbral_inspeccion_moneda`. `NULL` = la regla no aplica (Hipotecario y todos los planes existentes).
**Alternatives considered**: tabla genérica clave/valor `parametros_negocio`; constante en JS.
**Rationale**: todo lo configurable del negocio ya vive como columna de `planes` (`prima_tecnica_minima`, `responsabilidad_maxima_cotizable`, `descuento_maximo`) y el panel admin ya edita planes → cargar el monto cuando Kevin lo confirme no requiere deploy ni endpoint nuevo. `NULL` como "no aplica" modela la exclusión del Hipotecario sin un flag extra. Una tabla clave/valor agregaría un mecanismo de configuración que el proyecto no tiene todavía, para un solo parámetro.

### Decision: umbral validado en backend (calculador), no en frontend

**Choice**: el service resuelve el umbral y lo inyecta; el calculador tira 422 si "sin Inspección" y suma > umbral. El frontend solo _sugiere_ el plan.
**Alternatives considered**: autoselección de plan en `cotizar.js` sin validación server-side.
**Rationale**: la API es pública para cualquier cliente autenticado; una regla de suscripción que solo vive en JS del navegador se saltea con un POST directo. Mismo criterio que las validaciones existentes de responsabilidad máxima y tasas no confirmadas.

### Decision: snapshot de tipo de cambio = `venta` de la Casa de Cambio SET

**Choice**: persistir `compra` y `venta`, usar `venta` para toda conversión y comparación.
**Alternatives considered**: `compra`; promedio `(compra+venta)/2`.
**Rationale**: `venta` es el precio al que la aseguradora debe **comprar** dólares para respaldar un capital denominado en USD — es el criterio conservador (una suma en Gs. convertida a USD con `venta` da el menor USD, y una suma USD convertida a Gs. da el mayor Gs., ambos a favor de la suscripción prudente). El promedio no tiene contraparte operativa real. Se guardan ambos campos para poder cambiar el criterio sin re-fetch histórico.

### Decision: tipo de cambio on-demand con caché TTL, no cron/interval

**Choice**: `withCache('tipo_cambio:USD', fetcher, 15 min)` (módulo `services/cache.js` ya existente) + tabla `tipos_cambio` append-only como fallback durable.
**Alternatives considered**: `setInterval` de refresh cada 10 min al arrancar el proceso; fetch en cada cotización.
**Rationale**: el deploy es un único proceso Node en Railway/Render con reinicios frecuentes — un `setInterval` agrega ciclo de vida propio, es difícil de testear y se pierde en cada restart. On-demand solo paga el fetch cuando hay una cotización que realmente cruza monedas, alineado con los ~10 min de refresco del scraper de origen. Fetch por cotización pegaría a un tercero sin SLA en cada tecla del preview.

### Decision: piso por moneda explícito, sin conversión implícita

**Choice**: `planes.prima_tecnica_minima` (PYG) + `planes.prima_tecnica_minima_usd` (nullable). Cotización en USD sin piso USD cargado → 422 "piso en USD no confirmado".
**Alternatives considered**: convertir `prima_tecnica_minima` con el tipo de cambio del día.
**Rationale**: el piso es un valor de suscripción negociado, no un monto convertible; convertirlo lo haría fluctuar con el dólar cada día. Fallar explícito reusa el patrón ya establecido de "tasa/RPF no confirmado" (open question 2 de la propuesta se resuelve cargando el dato, no cambiando código).

## Schema (DDL propuesto)

```sql
-- 036: tasas por tipo de riesgo × objeto de riesgo
CREATE TABLE tipos_riesgo_incendio (
  id              BIGSERIAL PRIMARY KEY,
  ramo_id         BIGINT NOT NULL REFERENCES ramos(id),
  nombre          TEXT   NOT NULL,                      -- 'VIVIENDA FAMILIAR'
  tasa_global     NUMERIC(8,4) NOT NULL,                -- 2.2400
  tasa_minima     NUMERIC(8,4),                         -- 0.6000
  tasa_maxima     NUMERIC(8,4),                         -- 35.4800
  unidad          TEXT NOT NULL DEFAULT 'porcentaje'
                    CHECK (unidad IN ('permil','porcentaje')),
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ramo_id, nombre)
);

CREATE TABLE tasas_riesgo_objeto (
  id                BIGSERIAL PRIMARY KEY,
  tipo_riesgo_id    BIGINT NOT NULL REFERENCES tipos_riesgo_incendio(id) ON DELETE CASCADE,
  plan_id           BIGINT NULL REFERENCES planes(id),  -- NULL = tasa generica del tipo de riesgo
  objeto_riesgo     TEXT NOT NULL CHECK (objeto_riesgo IN
                      ('edificio','instalaciones','contenido_mueble_equipos','contenido_mercaderia')),
  tasa_valor        NUMERIC(8,4) NOT NULL,              -- 0.9000 / 1.3400 (dato oficial, ya redondeado)
  factor_porcentaje NUMERIC(5,2),                       -- 40.00 / 60.00 — documenta la derivacion
  unidad            TEXT NOT NULL DEFAULT 'porcentaje'
                      CHECK (unidad IN ('permil','porcentaje')),
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE con NULL: Postgres trata cada NULL como distinto, hacen falta dos indices parciales
CREATE UNIQUE INDEX ux_tasas_riesgo_objeto_generica
  ON tasas_riesgo_objeto (tipo_riesgo_id, objeto_riesgo) WHERE plan_id IS NULL;
CREATE UNIQUE INDEX ux_tasas_riesgo_objeto_plan
  ON tasas_riesgo_objeto (tipo_riesgo_id, objeto_riesgo, plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX ix_tasas_riesgo_objeto_tipo ON tasas_riesgo_objeto (tipo_riesgo_id);
```

```sql
-- 034: moneda
ALTER TABLE cotizaciones
  ADD COLUMN moneda CHAR(3) NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG','USD')),
  ADD COLUMN tipo_cambio_snapshot NUMERIC(12,4),          -- venta, NULL si no hubo conversion
  ADD COLUMN tipo_cambio_fuente   TEXT,                   -- 'dolarpy:set' | 'manual'
  ADD COLUMN tipo_cambio_fecha    TIMESTAMPTZ;

ALTER TABLE planes
  ADD COLUMN monedas_permitidas   TEXT[] NOT NULL DEFAULT ARRAY['PYG'],
  ADD COLUMN prima_tecnica_minima_usd NUMERIC(14,2);

-- backfill explicito del unico plan que ya operaba en USD (gap de la migracion 013)
UPDATE planes SET monedas_permitidas = ARRAY['USD'] WHERE nombre = 'MAQUINARIA BASICO';
UPDATE cotizaciones SET moneda = 'USD'
 WHERE plan_id = (SELECT id FROM planes WHERE nombre = 'MAQUINARIA BASICO');
```

```sql
-- 035: mecanica explicita + umbral de inspeccion
ALTER TABLE planes
  ADD COLUMN tipo_mecanica TEXT NOT NULL DEFAULT 'edificio_contenido'
    CHECK (tipo_mecanica IN ('edificio_contenido','maquinaria','objeto_riesgo')),
  ADD COLUMN requiere_inspeccion      BOOLEAN,            -- NULL = la regla no aplica
  ADD COLUMN umbral_inspeccion_monto  NUMERIC(14,2),      -- pendiente de confirmar (~USD 700.000)
  ADD COLUMN umbral_inspeccion_moneda CHAR(3) CHECK (umbral_inspeccion_moneda IN ('PYG','USD'));

UPDATE planes SET tipo_mecanica = 'maquinaria' WHERE nombre = 'MAQUINARIA BASICO';
```

```sql
-- 037: historial de tipo de cambio (append-only; "vigente" = fila mas reciente)
CREATE TABLE tipos_cambio (
  id          BIGSERIAL PRIMARY KEY,
  moneda      CHAR(3) NOT NULL DEFAULT 'USD',
  fuente      TEXT NOT NULL DEFAULT 'dolarpy:set',
  compra      NUMERIC(12,4),
  venta       NUMERIC(12,4) NOT NULL,
  origen      TEXT NOT NULL DEFAULT 'api' CHECK (origen IN ('api','manual')),
  obtenido_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_tipos_cambio_vigente ON tipos_cambio (moneda, obtenido_en DESC);
```

## Interfaces / Contracts

```js
// backend/src/services/tipo-cambio.service.js  [NUEVO]
/**
 * Devuelve el tipo de cambio vigente. Nunca lanza por falla de red: si el fetch a dolarPy
 * falla, hace timeout o devuelve un shape inesperado, cae al ultimo valor persistido en
 * `tipos_cambio` y lo marca `stale: true` (se loguea WARN, no bloquea la cotizacion).
 * Solo lanza 422 si no hay fetch exitoso NI valor previo en base.
 * @returns {Promise<{venta:number, compra:number|null, obtenido_en:string,
 *                    fuente:string, origen:'api'|'manual', stale:boolean}>}
 */
export async function obtenerTipoCambioVigente({ moneda = 'USD' } = {})

/** Override manual desde el panel admin (salvavidas si dolarPy queda caido). */
export async function registrarTipoCambioManual({ moneda, compra, venta, usuario })

// interno: fetch con AbortController (timeout 3000ms), lee dolarpy.set.compra/.venta
async function fetchDolarPy(signal)
```

```js
// backend/src/repositories/coberturas.repository.js  [MODIFICADO]
/** Cabecera + detalle de tasas. Override por plan tiene precedencia sobre plan_id NULL. */
export async function findTasasRiesgoObjeto(ramoId, tipoRiesgoNombre, planId)
// → { tipo_riesgo: {nombre, tasa_global, tasa_minima, tasa_maxima, unidad},
//     objetos: { edificio: {tasa_valor, unidad}, instalaciones: {...}, ... } } | null

// backend/src/repositories/tipos-cambio.repository.js  [NUEVO]
export async function findUltimoVigente(moneda)
export async function insertTipoCambio({ moneda, fuente, compra, venta, origen })
```

```js
// backend/src/services/cotizacion.service.js  [MODIFICADO]
/**
 * Resuelve el umbral aplicable al plan, convertido a la moneda de la cotizacion.
 * Devuelve null si `plan.requiere_inspeccion IS NULL` (regla no aplica: Hipotecario,
 * Maquinaria, Edificio y Contenido) o si no hay monto cargado todavia.
 */
async function resolverUmbralInspeccion(plan, moneda)
// → { requiereInspeccion:boolean, montoEnMonedaCotizacion:number, moneda:string,
//     tipoCambio: {venta:number, stale:boolean} | null } | null

// resolverContextoRepositorios(ramo, plan, riesgoDatos, capital, moneda)  ← +1 parametro
// devuelve, para tipo_mecanica='objeto_riesgo': { catalogoRamo, tasasRamo,
//   tasasObjetoRiesgo, umbralInspeccion }
```

```js
// backend/src/calculators/incendio.calculator.js  [MODIFICADO]
const OBJETOS_RIESGO = [
  { campo: 'capital_edificio',                   objeto: 'edificio',                 codigo: 'incendio_edificio' },
  { campo: 'capital_instalaciones',              objeto: 'instalaciones',            codigo: 'incendio_instalaciones' },
  { campo: 'capital_contenido_mueble_equipos',   objeto: 'contenido_mueble_equipos', codigo: 'incendio_contenido_mueble_equipos' },
  { campo: 'capital_contenido_mercaderia',       objeto: 'contenido_mercaderia',     codigo: 'incendio_contenido_mercaderia' },
]

// Dispatch con fallback al comportamiento anterior mientras la columna no exista (rollback nivel 2)
const mecanica = plan.tipo_mecanica
  ?? (plan.nombre === NOMBRE_PLAN_MAQUINARIA ? 'maquinaria' : 'edificio_contenido')

/**
 * Tercera mecanica: suma solo los objetos de riesgo DECLARADOS (capital > 0).
 * Prima = Σ capital_i × tasa_i (unidad del tipo de riesgo). Lanza 422 si:
 *  - no se declaro ningun objeto de riesgo
 *  - el tipo de riesgo no existe o no tiene las 4 tasas confirmadas
 *  - suma declarada > responsabilidad_maxima_cotizable
 *  - umbralInspeccion.requiereInspeccion === false && suma > umbral  ("sin Inspeccion" indebido)
 * @returns {{primaBase:number, detalle:object, coberturas:Array<object>}}
 */
async function calcularPorObjetoRiesgo({ plan, riesgoDatos, catalogoPorCodigo,
                                         tasasObjetoRiesgo, umbralInspeccion, moneda })

/** Piso por moneda, sin conversion implicita. 422 si la moneda no tiene piso cargado. */
function pisoPrimaTecnica(plan, moneda)   // 'USD' → plan.prima_tecnica_minima_usd
```

```js
// backend/src/schemas/incendio.schema.js  [MODIFICADO]
export const riesgoIncendioSchema = z.object({
  // ...campos actuales...
  capital_instalaciones: z.number().nonnegative().optional(),
  capital_contenido_mueble_equipos: z.number().nonnegative().optional(),
  capital_contenido_mercaderia: z.number().nonnegative().optional(),
})
// cotizarIncendioSchema += moneda: z.enum(['PYG','USD']).default('PYG')
```

## File Changes

| File                                                       | Action | Description                                                                                                                     |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `backend/migrations/034_moneda_cotizaciones.sql`           | Create | `cotizaciones.moneda` + snapshot, `planes.monedas_permitidas`/`prima_tecnica_minima_usd`, backfill Maquinaria                   |
| `backend/migrations/035_planes_tipo_mecanica_y_umbral.sql` | Create | `tipo_mecanica`, `requiere_inspeccion`, umbral; backfill Maquinaria                                                             |
| `backend/migrations/036_tasas_riesgo_objeto.sql`           | Create | `tipos_riesgo_incendio` + `tasas_riesgo_objeto` + índices                                                                       |
| `backend/migrations/037_tipos_cambio.sql`                  | Create | Historial de tipo de cambio                                                                                                     |
| `backend/migrations/038_seed_incendio_3_planes.sql`        | Create | 3 planes, 4 códigos de catálogo, `plan_coberturas`, RPF plano (0/1,6/1,35/1,0), texto legal Hipotecario, seed VIVIENDA FAMILIAR |
| `backend/src/calculators/incendio.calculator.js`           | Modify | Dispatch por `tipo_mecanica`, `calcularPorObjetoRiesgo`, `pisoPrimaTecnica`, validación de umbral                               |
| `backend/src/calculators/incendio.calculator.test.js`      | Modify | Tests RED de la tercera mecánica, umbral, piso por moneda; sin regresión de los existentes                                      |
| `backend/src/schemas/incendio.schema.js`                   | Modify | 3 capitales nuevos opcionales + `moneda`                                                                                        |
| `backend/src/services/cotizacion.service.js`               | Modify | `resolverUmbralInspeccion`, resolución de tasas por objeto, persistencia de moneda/snapshot                                     |
| `backend/src/services/tipo-cambio.service.js`              | Create | Fetch dolarPy + caché TTL + fallback stale                                                                                      |
| `backend/src/services/tipo-cambio.service.test.js`         | Create | Timeout, 500, JSON malformado, campo ausente, fallback a DB, sin DB                                                             |
| `backend/src/repositories/tipos-cambio.repository.js`      | Create | Lectura/escritura de `tipos_cambio`                                                                                             |
| `backend/src/repositories/coberturas.repository.js`        | Modify | `findTasasRiesgoObjeto`                                                                                                         |
| `backend/src/repositories/cotizaciones.repository.js`      | Modify | Persistir/leer `moneda` y snapshot; historial expone moneda                                                                     |
| `frontend/cotizar/cotizar.js`                              | Modify | Selector de moneda, 4 campos opcionales, sugerencia con/sin Inspección                                                          |
| `frontend/shared/format.js`                                | Modify | `fmtMoneda(valor, moneda)` / `fmtUsd*`                                                                                          |
| `frontend/historial/historial.js`                          | Modify | Mostrar moneda por fila; no sumar cross-moneda                                                                                  |

## Testing Strategy

| Layer                 | What to Test                                                                                                                                                                                                                                                                                                    | Approach                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Unit (calculador)     | Prima con 1/2/3/4 objetos declarados; objeto no declarado no suma; tipo de riesgo sin tasas → 422; suma > responsabilidad máxima → 422; "sin Inspección" sobre umbral → 422; "con Inspección" bajo umbral → OK; piso PYG vs USD; USD sin piso cargado → 422; dispatch por `tipo_mecanica` y fallback por nombre | Vitest, fixtures en memoria (mismo estilo que `incendio.calculator.test.js` actual) |
| Unit (tipo de cambio) | Fetch OK → persiste y devuelve `stale:false`; timeout/500/JSON inválido/campo `set` ausente → fallback DB con `stale:true`; sin fetch ni DB → 422; segundo llamado dentro del TTL no vuelve a fetchear                                                                                                          | `fetch` mockeado + repository stub                                                  |
| Integration           | POST `/api/cotizaciones` con `moneda:'USD'` persiste moneda + snapshot; preview NO persiste snapshot; resolución de tasa con override por plan gana sobre la genérica                                                                                                                                           | Service con repositories stub                                                       |
| Regresión             | Los 84 tests existentes en verde                                                                                                                                                                                                                                                                                | `npm test --prefix backend`                                                         |

## Threat Matrix

N/A para las filas del matrix estándar — este cambio no toca routing, shell, subprocesos, automatización de VCS/PR ni clasificación de archivos ejecutables.

Sí introduce un **límite de dependencia externa** (HTTP saliente a `dolar.melizeche.com`), cubierto con casos adversariales explícitos y tests RED propios:

| Caso                                                              | Comportamiento esperado                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Timeout > 3s                                                      | Abortar, fallback al último valor de `tipos_cambio`, `stale:true`, log WARN |
| HTTP 4xx/5xx                                                      | Ídem, sin reintento en la misma request                                     |
| JSON malformado / campo `dolarpy.set` ausente / valor no numérico | Ídem — nunca propagar `undefined` a un cálculo                              |
| Sin valor previo en base                                          | 422 explícito solo si la cotización realmente necesita conversión           |
| Cotización 100% en una sola moneda                                | El servicio no se invoca (cero I/O externo en el camino feliz)              |

## Migration / Rollout

Migraciones 034–038, todas aditivas (sin `DROP`, sin cambio de tipo de columnas existentes). Orden: 034 (moneda) → 035 (mecánica/umbral) → 036 (tasas) → 037 (tipo de cambio) → 038 (seed). Los 3 planes se seedean con `activo = TRUE` pero sin `umbral_inspeccion_monto` hasta que Kevin confirme el valor; mientras esté NULL la regla no bloquea (se documenta como estado transitorio explícito). Rollback tal como está en la propuesta: nivel 1 `activo = FALSE`, nivel 2 revert de código (el fallback por `plan.nombre` sostiene el comportamiento anterior), nivel 3 `down` solo si no hay cotizaciones USD emitidas.

## Riesgos técnicos del diseño

| Riesgo                                                                                                                       | Mitigación                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semántica de `tasa_minima`/`tasa_maxima` no confirmada (¿banda de suscripción sobre la tasa global, o clamp por objeto?)     | Se persisten y se exponen en `detalle`, **no se aplican como clamp** hasta confirmar — aplicar un clamp adivinado distorsionaría primas silenciosamente. Open question abajo |
| `withCache` es caché de proceso: con >1 instancia cada una tiene su tipo de cambio                                           | Aceptable — divergencia máxima de 15 min sobre un valor que la fuente refresca cada 10 min; el snapshot persistido deja el valor exacto usado                                |
| `invalidarCacheCatalogos()` limpia todo el store, incluido `tipo_cambio:USD`                                                 | Sin impacto funcional (fuerza un re-fetch); si molestara, mover el tipo de cambio a su propio store                                                                          |
| `moneda` en `cotizaciones` pero no en `cotizacion_variantes`/`cotizacion_plan_pago`                                          | Todas las variantes de una cotización comparten moneda por definición; leerla siempre desde la cabecera. Documentado como invariante                                         |
| Los 4 códigos de catálogo nuevos comparten `ramo_id` con los planes viejos y aparecerían en `findCoberturasCatalogoByRamoId` | Ya ocurre hoy con `incendio_maquinaria`; el calculador filtra por código, no por listado completo                                                                            |
| Preview vs. emisión pueden usar tipos de cambio distintos si el TTL vence entre ambos                                        | El snapshot se toma al emitir y es el único valor con valor legal; el preview es indicativo                                                                                  |
| Backfill de `cotizaciones` históricas del plan Maquinaria a USD reinterpreta datos ya emitidos                               | Es el gap conocido de la migración 013; el backfill se limita a ese `plan_id` y va comentado en la migración                                                                 |

## Open Questions

- [ ] Semántica exacta de `tasa_minima` / `tasa_maxima` por tipo de riesgo: ¿banda de validación de la tasa global, o piso/techo aplicable a la tasa efectiva de la cotización? (bloquea solo la aplicación, no el schema)
- [ ] Monto final del umbral y su moneda canónica (el diseño soporta ambas vía `umbral_inspeccion_moneda`).
- [ ] `prima_tecnica_minima` de los 3 planes nuevos y en qué moneda.
- [ ] ¿"Con Inspección" por debajo del umbral se permite (sobre-inspeccionar es seguro) o también se bloquea? El diseño hoy solo bloquea la dirección insegura.
- [ ] ¿El override manual de tipo de cambio necesita UI en el panel admin en este cambio, o alcanza con la fila insertable por SQL como salvavidas?
