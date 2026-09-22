# CLAUDE.md — Cotizador Aseguradora Tajy

Este archivo es el contexto de arranque para Claude Code en este repositorio. Léelo completo antes de tocar código. El detalle completo de arquitectura, schema SQL y reglas de negocio está en `docs/PLAN_DESARROLLO.md` — este archivo es un resumen operativo, no lo reemplaza. El estado real de avance (qué está implementado, decisiones tomadas y por qué, pendientes abiertos) está en `docs/ESTADO_PROYECTO.md`. La especificación vigente de Propuesta Formal está en `docs/PLAN_PROPUESTA_FORMAL.md` y prevalece sobre resúmenes históricos de ese módulo. Reglas permanentes compartidas con otros agentes IA (Codex, OpenCode) están en `AGENTS.md`.

## Qué es este proyecto

Sistema web para que los agentes de **Aseguradora Tajy** (Paraguay) coticen pólizas de seguro de varios ramos (Auto individual, Auto Flota, Incendio, Multirriesgo Hogar, Multirriesgo Comercio, Todo Riesgo Operativo, Transporte de Mercadería, Vida y Accidentes Personales), generen un PDF de **Carta Oferta** al cotizar y una **Propuesta Formal** (con KYC/PLA-FT) cuando el cliente acepta, y mantengan historial con numeración correlativa.

Es un proyecto **independiente**, separado de otros sistemas de Tajy (Siniestros Tajy, gestion-tajy) que Kevin ya tiene en desarrollo, aunque comparte el mismo stack y convenciones.

## Stack

| Capa                 | Herramienta                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Backend              | Node.js + Express                                                                                      |
| Base de datos        | Supabase (PostgreSQL)                                                                                  |
| Validación           | Zod (un schema por ramo para los datos de riesgo)                                                      |
| Frontend             | Vanilla JS (sin framework) — ver sección "Infraestructura de despliegue" para dónde se sirve           |
| Importación de Excel | SheetJS                                                                                                |
| Generación de PDF    | Puppeteer (HTML/CSS → PDF)                                                                             |
| Deploy backend       | VPS propia (Docker + Caddy), imágenes inmutables por SHA — ver sección "Infraestructura de despliegue" |
| Organización         | Monorepo GitHub                                                                                        |

## Estructura del monorepo

Árbol completo de carpetas y su propósito: ver `AGENTS.md` sección 3. Resumen: `/backend/src` en capas (`routes → controllers → services → repositories`, más `/calculators`, `/schemas`, `/templates`), `/frontend` por flujo (`/cotizar`, `/historial`, `/admin`, `/shared`), `/backend/migrations` para SQL versionado.

**Regla de arquitectura no negociable:** el frontend NUNCA habla directo con Supabase. Todo pasa por la API Express, que valida con Zod antes de tocar la base — mismo patrón que gestion-tajy y Siniestros Tajy (detalle en `AGENTS.md` sección 3, "Invariantes").

## Metodología: desarrollo por fases

**Última actualización:** 2026-07-24.

Este proyecto se construye **fase por fase**, en este orden fijo (detalle completo de cada una en la sección 10 de `PLAN_DESARROLLO.md`):

1. Base del sistema (monorepo, schema, importadores de tasas Auto)
2. Cotizador de Auto end-to-end (individual + flota)
3. Coberturas, Servicios, Descuentos/Recargos y Cláusulas
4. Propuesta Formal (KYC)
5. Historial y administración
6. Incendio / Multirriesgo Hogar / MRC / TRO / Transporte
7. Vida y Accidentes Personales
8. Deploy

**Reglas para Claude Code:**

- No adelantar trabajo de una fase futura aunque parezca rápido de hacer — cada fase se cierra completa antes de pasar a la siguiente, salvo que Kevin pida explícitamente saltar.
- Al empezar una sesión, decir en qué fase se está y qué falta de esa fase antes de escribir código.
- Al terminar una tarea de la fase actual, marcarla como hecha (editar el checklist de este archivo) y decir qué queda pendiente de la fase.
- Si una tarea de la fase actual depende de un pendiente de la sección 11 de `PLAN_DESARROLLO.md` que todavía no está confirmado (ej. RPF de Incendio en Fase 6), avisar y proponer seguir con otra tarea de la misma fase mientras se confirma — no bloquear todo el trabajo por un solo dato faltante.
- No mezclar código de dos fases en el mismo commit/PR cuando se pueda evitar — facilita revisar el avance real.
- Cuando termines una tarea: marcá el checklist de fase correspondiente como hecho, y registrá el detalle completo (qué se hizo, por qué, cómo se verificó) como una entrada nueva en `docs/ESTADO_PROYECTO.md` — no en este archivo. Actualizá el resumen de "Estado actual del proyecto" de acá abajo solo si cambió la fase activa o el próximo paso.
- Despues de cada commit y/o push, **debes** guardalo todo en engram, para no perder contexto por si hay fallas.
- No intentes adivinar, si no sabes algo pregunta.
- Cuando encuentres una suposición errónea, o una mejora posible para este archivo, sugerila explícitamente en la sesión.

## Estado actual del proyecto

**Cambio de prioridad (2026-07-10):** el cliente pidió priorizar **MRC, Incendio y Vida/AP** por sobre Auto. Fase 2 de Auto queda **pausada tal cual está** (no se revierte, no se sigue tocando). Hogar y TRO no fueron pedidos todavía — quedan en fase futura.

**Fase 6/7 cerrada a nivel de negocio.** MRC opera end-to-end (calculador, frontend, Carta Oferta en PDF). Incendio y Vida/AP tienen catálogo y calculador completos — a Vida/AP le falta el template de Carta Oferta (pendiente de texto oficial). Panel admin, historial y el rediseño visual completo ya están commiteados y verificados en vivo.

**El detalle de cada cambio (qué se hizo, por qué, cómo se verificó) vive únicamente en `docs/ESTADO_PROYECTO.md`, en orden cronológico por sección numerada — no se repite acá para no desincronizarse.** Antes de asumir el estado de una feature, revisar ahí la sección más reciente que la mencione.

**Próximo paso confirmado con Kevin:** revisar/commitear el template de Incendio, agregar el de Vida/AP (requiere texto oficial), cerrar cambios abiertos con `sdd-verify`/archivo formal si se pide, o retomar Fase 2 (Auto) si se pide.

## Versionado y despliegue (actualizado 2026-09-17 — corrige info obsoleta, incluye nota sobre Vercel/Render legacy)

- **`release-please`** (`.github/workflows/release-please.yml`, `release-please-config.json`, `release-type: simple`) corre en cada push a `main`: abre/actualiza un PR de release, y al mergearlo genera tag (`vX.Y.Z`), entrada en `CHANGELOG.md` y release de GitHub. Es rutina de CI, no toca ningún servidor — no requiere acción manual salvo mergear ese PR. `backend/package.json` no se actualiza por este mecanismo (queda en `0.1.0`); no confundir esa versión con el tag real del repo.

### Infraestructura de despliegue (VPS, TEST y PROD separados)

**IMPORTANTE — corrige una instrucción anterior de este archivo que ya no es cierta:** NO existe ningún deploy automático a producción por push a `main`. `.github/workflows/deploy-backend.yml` está deshabilitado desde el 2026-09-01 (`if: false`, comentario "LEGACY WORKFLOW - DISABLED" en el propio archivo) — antes hacía `reset --hard` automático a la VPS en cada push, ahora no hace nada. Si alguna sesión anterior (o memoria/Engram) dice lo contrario, es información vieja: verificar siempre el archivo del workflow antes de asumir que un merge a `main` despliega algo.

Arquitectura real en la VPS (`docker-compose.yml` + `Caddyfile` en la raíz del repo):

- **Dos backends independientes, cada uno su propio contenedor**: `backend` (producción, imagen `${BACKEND_IMAGE}`, sirve `api.cotizador.lat`) y `cotizador-test-backend` / servicio `backend-test` (TEST, sirve `test-api.cotizador.lat`). Caddy rutea por hostname a uno u otro — no comparten proceso ni imagen.
- **Dos frontends estáticos independientes**: `frontend-prod` (`cotizador.lat`) y `frontend-test` (`test-web.cotizador.lat`), servidos por Caddy desde carpetas separadas en la VPS.
- **Imágenes inmutables versionadas por SHA-256** (`deploy: require immutable backend image`, 2026-09-02): `docker-compose.yml` exige `BACKEND_IMAGE` explícito, ya no reconstruye sobre la marcha.
- **El deploy a TEST requiere autorización manual explícita en cada paso** (materialización del bundle → preflight de solo lectura → `deploy-test-backend.sh --approve-deploy` → rollback solo tras decisión separada con `--approve-test-rollback`). El script de rollback de TEST está bloqueado por diseño para no poder apuntar nunca a producción.
- **Promover a PROD es un paso separado y manual**, no documentado como workflow de GitHub Actions en este repo — no asumir que existe automatización para esto sin verificarlo primero.
- Mergear un PR a `main` (código, dependencias, o docs) **no despliega nada por sí solo** en ninguno de los dos entornos. Solo actualiza el código fuente en el repositorio.
- `render.yaml` y `frontend/vercel.json` en la raíz del repo son artefactos legacy de una estrategia de deploy anterior (Render.com / Vercel) que precedió a la VPS actual — no reflejan la infraestructura real descrita arriba. No asumir que Render o Vercel siguen desplegando algo relevante para producción sin verificarlo primero.

## Reglas de negocio clave para Auto (resumen — detalle completo en sección 5 de PLAN_DESARROLLO.md)

```
Prima_base = MAX(Capital × Tasa(plan, rango capital), plan.prima_tecnica_minima)
Prima = Prima_base − Σ(Descuentos, tope = plan.descuento_maximo) + Σ(Recargos, tope = plan.recargo_maximo)
RPF% = plan_formas_pago.tasa_rpf   -- FIJA por forma de pago, NO varía por cantidad de cuotas
R.P.F. = REDONDEAR.SUP(Prima × RPF% / 100, 1000)
IVA = (Prima × 10%) + (R.P.F. × 10%)
Premio = Prima + R.P.F. + IVA
Cuota = REDONDEAR.INF(Premio / (cuotas + 1), 1000)   -- hacia ABAJO, no hacia arriba
Inicial = Premio − (cuotas × Cuota)                   -- absorbe el resto, no es igual a la Cuota
Contado: Inicial = Premio completo, Cuota = 0
```

- **4 formas de pago SIEMPRE calculadas en simultáneo**: Contado (RPF=0), Crédito (Cobrador), Boca de Cobranza, Tarjeta de Crédito. No se elige una sola al cotizar.
- **Franquicia dual** depende de `via_importacion` (dato del vehículo) Y `plan.cotizacion_combinada`:
  - Importación Directa → franquicia fija Gs. 350.000 (monto base, puede variar según criterios a definir — ver pendiente #9 en PLAN_DESARROLLO.md), con opción de sacarla sumando un monto fijo a la prima (⚠ ese add-on quedó pendiente de recalcular). Una sola variante.
  - Representante + plan con `cotizacion_combinada = true` (Premium/Superior/Fuerte) → se generan 2 variantes: sin franquicia y con franquicia (20% descuento sobre prima, franquicia = 12% de esa prima).
  - Representante + plan con `cotizacion_combinada = false` (Noble) → una sola variante, sin franquicia.
- **Plan Básico es distinto**: no tarifica por capital del vehículo, usa una tasa única fija (1,64%) sobre la cobertura de RC en vez de Daños Materiales.
- El PDF de Carta Oferta debe replicar el diseño visual del modelo MAPFRE (`MODELO DE COTIZACION AUTO.pdf` en la raíz del proyecto) adaptado al branding de Tajy — ver sección 7 de `docs/PLAN_DESARROLLO.md`.

## Convenciones de código (mismas que gestion-tajy / Siniestros Tajy)

Convenciones generales (capas, Zod en el borde, migraciones versionadas, frontend Vanilla JS): ver `AGENTS.md` secciones 3 y 7. Lo específico de este proyecto — la interfaz que implementa cada calculador de ramo:

```js
interface RamoCalculator {
  calcularPrima(input): { prima: number, detalle: object }
  calcularPlanPago(prima, formaPago, cuotas): { rpf, iva, premio, inicial, cuota }
}
```

## Pendientes activos que pueden afectar el código

Lista corta de lo que un cambio de código puede pisar sin querer. El detalle completo de cada uno (y otros pendientes menores) está en `docs/ESTADO_PROYECTO.md` sección 8 y sección 31 — no se repite acá.

- **Template de Carta Oferta para Vida/AP**: no existe todavía (falta texto oficial). El de Incendio ya está (`backend/src/templates/oferta/incendio.js`, ver `docs/ESTADO_PROYECTO.md` sección 34). El calculador de Vida/AP SÍ está completo y testeado — no asumir que está "pendiente" sin verificar `backend/src/calculators/`.
- **RPF de "COMERCIO PROTECCION TOTAL"** (MRC): no confirmado — plan desactivado (`activo = FALSE`), no aparece en el selector.
- **Auto individual (Fase 1/2)**: pausado por prioridad del cliente, no tocar hasta que se reactive.
- ~~RLS en Supabase: 30 tablas de `public` sin RLS~~ — **resuelto 2026-07-30.** Activado en las 34 tablas marcadas CRITICAL (migración `046_enable_rls_public_tables.sql`, aplicada contra Supabase real), sin policies (default-deny para anon/authenticated). Backend usa `SUPABASE_SERVICE_KEY` (service_role, bypasea RLS) y no hay ningún cliente Supabase en el frontend, así que no rompió nada — advisor de seguridad en 0 CRITICAL, 154/154 tests backend en verde.
- **Migraciones 043/044 (rubro_actividad_ramo + tasas de Incendio por rubro) YA APLICADAS contra Supabase real (2026-07-29)**: el filtro por `ramo_id` ya funciona a nivel de datos. El backend ya exige `ramo_id` en el código y ya está mergeado a `main` (PR #38/#39), junto con el frontend que lo envía. **Falta confirmar que el backend de la VPS (`api.cotizador.lat`) fue redesplegado a mano con este código** — ni el backend ni el frontend de producción tienen CD automático (ver "Infraestructura de despliegue" más abajo; ambos se actualizan a mano en la VPS), así que hay una ventana en la que ambos lados pueden estar desincronizados en producción. Verificación en vivo 9.3 (cotizar rubros nuevos sin 422) ya completada contra un entorno de QA — pendiente confirmar contra la VPS real.
- **Clamp de `tasa_minima` en ~176/184 rubros nuevos de Incendio**: Kevin confirmó "apliquemos tal cual" — se acepta que el calculador clampee la tasa efectiva al mínimo histórico del pivot en vez de usar el desglose 40/60 para la mayoría de los rubros nuevos (no produce error, solo puede distorsionar la prima). Ajustable después por `UPDATE` sobre `tipos_riesgo_incendio.tasa_minima` sin cambio de código, rubro por rubro, si en el uso real aparecen primas raras.
- **Follow-up `DROP COLUMN rubros_actividad.grupo`**: la columna queda legacy de solo lectura desde el cambio `incendio-tasas-por-rubro` (reemplazada por `rubro_actividad_ramo`), pero no se borra en ese cambio — pendiente de un DROP explícito más adelante, una vez confirmado que ningún código la lee.

## Al empezar una sesión nueva

1. Leer `docs/PLAN_DESARROLLO.md` completo si es la primera vez.
2. Leer `docs/ESTADO_PROYECTO.md` para saber qué está hecho y qué decisiones ya se tomaron.
3. Revisar la sección 11 de `docs/PLAN_DESARROLLO.md` (pendientes) por si hay novedades.
4. Confirmar en qué fase estamos antes de avanzar a la siguiente.
5. Para levantar y probar la app localmente, usar el skill `/run-cotizador`.

## Herramientas disponibles

Este repositorio dispone de herramientas de apoyo que deben usarse antes de hacer búsquedas manuales.

### CodeGraph

Utilizar CodeGraph para:

- localizar funciones
- encontrar referencias
- analizar dependencias
- entender el flujo del código

Preferir CodeGraph antes que recorrer archivos manualmente.

### Engram

Utilizar Engram para:

- recuperar decisiones anteriores
- consultar contexto del proyecto
- registrar decisiones importantes de arquitectura
- mantener memoria persistente entre sesiones

### Supabase MCP (actualizado 2026-09-22 — corrige info obsoleta)

**Ya no existe ningún proyecto de Supabase en la nube, ni para PROD ni para TEST.** Ambas bases son
Supabase self-hosted en la misma VPS — corrige cualquier suposición anterior (incluida la de este
mismo archivo) de que hay un MCP de Supabase conectado a un proyecto cloud para PROD. El MCP
`mcp__supabase__*` (que pide OAuth contra `api.supabase.com`) **no aplica a este proyecto** — no
intentar autenticarlo para inspeccionar PROD ni TEST.

- **TEST**: contenedor `cotizador-test-db` en la VPS. Confirmado en sesiones anteriores:
  `docker exec cotizador-test-db psql -U supabase_admin -d postgres -c "..."`.
- **PROD**: self-hosted en la misma VPS (nombre exacto del contenedor sin confirmar todavía en
  este archivo — verificar con `docker ps --format '{{.Names}}' | grep -i db` antes de asumirlo).

Para inspeccionar tablas, esquema, migraciones o validar cambios antes de modificar SQL contra
cualquiera de las dos bases: usar `docker exec <contenedor> psql -U supabase_admin -d postgres -c
"..."` por SSH a la VPS (misma regla de "Remote operation authorization" del bloque de arriba —
lo corre el usuario, nunca la sesión de Claude sin autorización explícita). Evitar recorrer el
proyecto manualmente cuando una consulta de solo lectura contra la base real resuelva la duda más
rápido.
