# Design: Listado de Propuestas Formales

## Technical Approach

Una función SQL nueva (`listar_propuestas_formales`) resuelve búsqueda + scoping + paginación en un
solo round-trip; el backend agrega solo permisos derivados. El frontend es una página nueva que
calca el patrón real de `frontend/historial/historial.js` (state + `renderApp()` que reescribe
`innerHTML` de `#app` + delegación única sobre `#app`). Nada de lo que Codex edita se toca.

## Architecture Decisions

| Decisión                                        | Elegido                                                       | Alternativa rechazada         | Rationale                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fuente del listado                              | RPC `SECURITY INVOKER`                                        | PostgREST con embeds + `or=`  | La búsqueda cruza `propuestas_formales → cartas_oferta → cotizaciones`; sin `!inner` hay fuga horizontal (ver `coberturas.repository.js:10`) y `or` no se expresa sobre embeds   |
| Total de filas                                  | `COUNT(*) OVER () AS total_registros` en la misma fila        | segundo RPC `contar_*`        | Una sola llamada, snapshot consistente; se desarma en el repository                                                                                                              |
| Cambio a `listar_cartas_oferta_aptas_propuesta` | DROP + CREATE **aditivo** (columnas nuevas al final)          | `CREATE OR REPLACE`           | PostgreSQL rechaza cambiar `RETURNS TABLE`; `supabase.rpc()` mapea por nombre, así que el wizard de Codex sigue leyendo `propuesta_borrador_id`/`propuesta_revision` sin tocarse |
| Permisos                                        | flags calculados en el service, espejando los guards reales   | `CASE` en SQL                 | Una sola fuente de verdad JS: `canDownload`/`anularPropuesta` (`emision.service.js:10-16`, `:128`, `:141-145`)                                                                   |
| Filtro `'activa'`                               | valor sintético expandido a los 4 estados vivos en el service | 4 checkboxes en la UI         | Coincide con `propuestas_formales_borrador_activo_unique` (069:27-29)                                                                                                            |
| Decisión de Historial                           | módulo puro `propuesta-accion.js`                             | `if` inline en `historial.js` | Testeable sin DOM y degradable si la base aún no tiene 075                                                                                                                       |

## Data Flow

    propuestas-listado.js ──GET /propuestas?…──→ controller ──Zod──→ listado.service
           │                                                              │
           │                                             repository.listarPropuestas
           │                                                              │
           │                                              rpc listar_propuestas_formales
           ▼                                                              │
      acciones.js (puro: fila+usuario → botones) ←── { data:[…flags], count }

## Migración 075 (`075_listado_propuestas_formales.sql`)

1. `DROP FUNCTION IF EXISTS public.listar_cartas_oferta_aptas_propuesta(integer, boolean, text, integer);`
   (firma explícita: si TEST tuviera una sobrecarga extra, el DROP se lleva solo esta — preflight con Supabase MCP sobre TEST).
2. `CREATE FUNCTION` con la misma firma y cuerpo de 069:120-169, `RETURNS TABLE` extendida al final con
   `tiene_propuesta BOOLEAN, propuesta_actual_id BIGINT, propuesta_actual_estado TEXT, propuesta_actual_numero BIGINT`,
   alimentadas por un `LEFT JOIN LATERAL` a la última propuesta de la carta en
   `('borrador','en_revision','generando_pdf','error_pdf','emitida')` ordenada por `updated_at DESC, id DESC`.
   `propuesta_borrador_id`/`propuesta_revision` conservan su semántica actual (solo borradores vivos).
3. `CREATE FUNCTION public.listar_propuestas_formales(p_usuario_id INT, p_es_admin BOOLEAN, p_busqueda TEXT DEFAULT NULL, p_estados TEXT[] DEFAULT NULL, p_carta_oferta_id BIGINT DEFAULT NULL, p_limite INT DEFAULT 20, p_offset INT DEFAULT 0)`,
   `LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public`, `RETURNS TABLE (id, numero_propuesta, estado, revision, carta_oferta_id, numero_carta, cotizacion_id, cliente_nombre, moneda, producto_codigo, pdf_storage_path, emitida_at, anulada_at, motivo_anulacion, created_at, updated_at, agente_id, total_registros BIGINT)`.
   Cuerpo: `FROM propuestas_formales pf JOIN cartas_oferta ca ON ca.id = pf.carta_oferta_id JOIN cotizaciones c ON c.id = ca.cotizacion_id`
   `WHERE (COALESCE(p_es_admin, FALSE) OR c.agente_id = p_usuario_id)`
   `AND (p_estados IS NULL OR pf.estado = ANY(p_estados))`
   `AND (p_carta_oferta_id IS NULL OR pf.carta_oferta_id = p_carta_oferta_id)`
   `AND (NULLIF(BTRIM(COALESCE(p_busqueda,'')),'') IS NULL OR pf.numero_propuesta::TEXT ILIKE … OR ca.numero_carta ILIKE … OR c.cliente_nombre ILIKE …)`
   `ORDER BY pf.updated_at DESC, pf.id DESC LIMIT LEAST(GREATEST(COALESCE(p_limite,20),1),100) OFFSET GREATEST(COALESCE(p_offset,0),0)`.
4. `CREATE INDEX IF NOT EXISTS propuestas_formales_updated_at_idx ON propuestas_formales (updated_at DESC, id DESC);`
5. **ACL reaplicado** (obligatorio: el DROP borró el de `070:325-331`), para AMBAS funciones:
   `REVOKE ALL ON FUNCTION public.<fn>(<tipos>) FROM PUBLIC, authenticated, anon, service_role;`
   `GRANT EXECUTE ON FUNCTION public.<fn>(<tipos>) TO service_role;`

**Test** `075_listado_propuestas_formales.test.js` (mismo patrón que `074_*.test.js`: leer el `.sql` y
asertar regex, sin ejecutar SQL): DROP con firma explícita presente; `SECURITY INVOKER` + `SET search_path`
en ambas; `COUNT(*) OVER ()`; el `WHERE` de scoping; el índice; REVOKE+GRANT por función;
`assert.doesNotMatch(sql, /GRANT[\s\S]*TO\s+(anon|authenticated)\b/i)`; y que el REVOKE aparezca **después**
del CREATE de cada función (comparar `indexOf`). Agregar el archivo a `test:migrations:pf3` en `backend/package.json`.

## File Changes

| Archivo                                                                                                                                                   | Acción        | Descripción                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/migrations/075_listado_propuestas_formales.sql` (+`.test.js`)                                                                                    | Create        | DDL + ACL + índice                                                                                                                                                                      |
| `backend/src/repositories/propuestas.repository.js`                                                                                                       | Modify        | `listarPropuestas(...)`: `supabase.rpc('listar_propuestas_formales', …)`; devuelve `{ data: rows.map(({ total_registros, ...r }) => r), count: Number(rows[0]?.total_registros ?? 0) }` |
| `backend/src/services/propuestas/listado.service.js` (+`.test.js`)                                                                                        | Create        | `esAdmin`, expansión de `'activa'`, flags, `delete agente_id`                                                                                                                           |
| `backend/src/controllers/propuestas.controller.js` (+`.test.js`)                                                                                          | Modify/Create | `listar()` con `parsear(listarPropuestasQuerySchema, req.query)`                                                                                                                        |
| `backend/src/routes/propuestas.routes.js`                                                                                                                 | Modify        | `router.get('/', propuestasController.listar)` como primera línea (no colisiona con `/:id`, que no matchea `'/'`)                                                                       |
| `backend/src/schemas/propuestas.schema.js`                                                                                                                | Modify        | `listarPropuestasQuerySchema`                                                                                                                                                           |
| `frontend/propuestas-listado/{index.html, propuestas-listado-guard.js, propuestas-listado.js, acciones.js, propuestas-listado.css}` (+`acciones.test.js`) | Create        | Página nueva                                                                                                                                                                            |
| `frontend/historial/propuesta-accion.js` (+`.test.js`)                                                                                                    | Create        | Decisión pura                                                                                                                                                                           |
| `frontend/historial/historial.js`                                                                                                                         | Modify        | Usa el módulo puro; **conserva el literal `../propuestas/?carta=`**                                                                                                                     |
| `frontend/shared/sidebar.js` (+`sidebar.test.js`), `shared/nav-icons.js`                                                                                  | Modify        | Ítem "Propuestas Formales" + ícono                                                                                                                                                      |

## Interfaces / Contracts

```js
// schemas/propuestas.schema.js
export const listarPropuestasQuerySchema = z.object({
  busqueda: z.string().trim().max(120).optional().default(''),
  estado: z.enum(['activa','borrador','en_revision','generando_pdf','emitida','error_pdf','reemplazada','anulada']).optional(),
  carta_oferta_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

// services/propuestas/listado.service.js
const ESTADOS_VIVOS = ['borrador', 'en_revision', 'generando_pdf', 'error_pdf']
// estado === 'activa' → ESTADOS_VIVOS ; estado definido → [estado] ; undefined → null
puede_continuar = ESTADOS_VIVOS.includes(row.estado)
puede_descargar = ['emitida','anulada'].includes(row.estado) && !!row.pdf_storage_path &&
  (esAdmin || usuario.puede_descargar_propuestas || row.agente_id === usuario.id)  // espeja :10-16 y :128
puede_anular    = row.estado === 'emitida' && (esAdmin || usuario.puede_anular_propuestas) // espeja :141-145
// luego: delete row.agente_id

// frontend/propuestas-listado/acciones.js — puro, sin DOM
export function accionesDeFila(fila) // → [{ action:'continuar'|'descargar'|'anular'|'ver-detalle', label, href? }]

// frontend/historial/propuesta-accion.js — puro, sin DOM
export function decidirAccionPropuesta(cartaApta)
// sin cartaApta → null
// campos de 075 ausentes (tiene_propuesta === undefined) → degradación al comportamiento actual:
//   propuesta_borrador_id ? 'Reabrir propuesta' : 'Preparar propuesta', href `../propuestas/?carta=${id}`
// tiene_propuesta && estado 'emitida'|'reemplazada'|'anulada' → 'Ver propuestas',
//   href `../propuestas-listado/?carta_oferta_id=${id}`
// tiene_propuesta && estado vivo → 'Reabrir propuesta' ; si no → 'Preparar propuesta'
```

Sidebar (`renderSidebarNavLinks`): `const enPropuestas = active === 'propuestas' || active === 'propuestas-listado'`;
link `href = active === 'propuestas-listado' ? './' : '../propuestas-listado/'` con
`${enPropuestas ? 'nav-item--active' : ''}`. El wizard de Codex sigue pasando `active:'propuestas'`
(`propuestas.js:405`) y ahora resalta el ítem sin apuntar a `./` — no requiere tocar su archivo.

Modal de anulación: motivo `required`, `minlength="3"` (el backend valida igual con
`anularPropuestaSchema`); `POST /propuestas/:id/anular`; 403 → "No tenés permiso para anular…",
409 → mensaje del backend (estado ya no anulable / carrera), otro → mensaje genérico; al éxito se
recarga la página actual del listado.

## Testing Strategy

| Capa          | Qué                                                                                                                                                       | Cómo                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Unit SQL      | ACL, scoping, `COUNT(*) OVER ()`, índice, orden CREATE→REVOKE                                                                                             | regex sobre el `.sql` (patrón `074_*.test.js`) |
| Unit backend  | `listado.service`: expansión `'activa'`, 3 flags por estado/rol/permiso, `agente_id` removido                                                             | `node:test` con repository stubeado            |
| Unit backend  | controller `listar`: Zod rechaza `limit=0/101`, `estado` inválido → 400                                                                                   | `node:test`                                    |
| Unit frontend | `acciones.js` y `propuesta-accion.js` (incl. degradación sin campos de 075)                                                                               | `node:test`, funciones puras sin DOM           |
| Unit frontend | `sidebar.test.js`: resaltado con `'propuestas'` y `'propuestas-listado'`; `historial.test.js`: el literal `../propuestas/?carta=` sigue en `historial.js` | regex sobre fuente                             |
| Manual (TEST) | Agente vs admin, búsqueda, paginación, continuar/descargar/anular, `pg_proc.proacl`                                                                       | Supabase MCP sobre TEST + navegador            |

## Threat Matrix

N/A — no hay routing de shell, subprocesos, automatización VCS/PR, clasificación de archivos ejecutables
ni integración de procesos. El único borde nuevo es una ruta HTTP autenticada existente y una función SQL,
cubiertos por scoping explícito y ACL `service_role`-only.

## Migration / Rollout

Orden: **(1) migración 075 en TEST → (2) backend → (3) frontend.** La 075 es aditiva, así que el backend
actual sigue funcionando contra la base nueva; el orden inverso daría `PGRST202` (función inexistente) en
`GET /propuestas`. Verificar `pg_proc.proacl` de ambas funciones antes y después del DROP.

Rollback: revertir el PR (frontend + backend; nada más consume el listado) y aplicar una migración de
reversión que dropee `listar_propuestas_formales` y el índice y recree
`listar_cartas_oferta_aptas_propuesta` con el cuerpo de 069 **más** el bloque ACL de 070. Historial vuelve
solo al comportamiento anterior por la degradación de `propuesta-accion.js`. Si el fallo ocurre entre (1) y (2),
no hace falta rollback de base: el cambio es aditivo y nadie lee las columnas nuevas todavía.

## Open Questions

- [ ] Ninguna que bloquee. Confirmar en preflight que TEST no tiene una sobrecarga extra de
      `listar_cartas_oferta_aptas_propuesta` antes de ejecutar el DROP.
