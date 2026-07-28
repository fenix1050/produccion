# CLAUDE.md — Cotizador Aseguradora Tajy

Este archivo es el contexto de arranque para Claude Code en este repositorio. Léelo completo antes de tocar código. El detalle completo de arquitectura, schema SQL y reglas de negocio está en `docs/PLAN_DESARROLLO.md` — este archivo es un resumen operativo, no lo reemplaza. El estado real de avance (qué está implementado, decisiones tomadas y por qué, pendientes abiertos) está en `docs/ESTADO_PROYECTO.md`.

## Qué es este proyecto

Sistema web para que los agentes de **Aseguradora Tajy** (Paraguay) coticen pólizas de seguro de varios ramos (Auto individual, Auto Flota, Incendio, Multirriesgo Hogar, Multirriesgo Comercio, Todo Riesgo Operativo, Transporte de Mercadería, Vida y Accidentes Personales), generen un PDF de **Carta Oferta** al cotizar y una **Propuesta Formal** (con KYC/PLA-FT) cuando el cliente acepta, y mantengan historial con numeración correlativa.

Es un proyecto **independiente**, separado de otros sistemas de Tajy (Siniestros Tajy, gestion-tajy) que Kevin ya tiene en desarrollo, aunque comparte el mismo stack y convenciones.

## Stack

| Capa                 | Herramienta                                                      |
| -------------------- | ---------------------------------------------------------------- |
| Backend              | Node.js + Express                                                |
| Base de datos        | Supabase (PostgreSQL)                                            |
| Validación           | Zod (un schema por ramo para los datos de riesgo)                |
| Frontend             | Vanilla JS (sin framework), Netlify                              |
| Importación de Excel | SheetJS                                                          |
| Generación de PDF    | Puppeteer (HTML/CSS → PDF)                                       |
| Deploy backend       | Railway o Render (Puppeteer necesita más RAM/CPU que serverless) |
| Organización         | Monorepo GitHub                                                  |

## Estructura del monorepo

```
/backend
  /src
    /routes          -- definición de endpoints Express
    /controllers      -- reciben request, llaman a services, devuelven response
    /services         -- lógica de negocio (motor de cotización, generación de PDF)
    /repositories      -- acceso a Supabase
    /calculators       -- un archivo por ramo: auto.js, auto-flota.js, incendio.js,
                          hogar.js, mrc.js, tro.js, transporte.js, vida-ap.js
                          (todos implementan la misma interfaz RamoCalculator)
    /schemas           -- validaciones Zod, una por ramo para riesgo_datos
    /templates         -- plantillas HTML para los 3 documentos PDF
  /migrations          -- SQL de Supabase, un archivo por cambio de schema

/frontend
  /cotizar             -- flujo de cotización (selección ramo → plan → coberturas → pago)
  /historial           -- listado y búsqueda
  /admin               -- gestión de planes, coberturas, tasas
  /shared              -- componentes/utilidades comunes (sidebar, fetch wrapper, etc.)

docs/PLAN_DESARROLLO.md  -- arquitectura completa, schema SQL, motor de cálculo por ramo
docs/ESTADO_PROYECTO.md  -- estado real de avance: qué está hecho, decisiones y por qué, pendientes
CLAUDE.md                -- este archivo
```

**Regla de arquitectura no negociable:** el frontend NUNCA habla directo con Supabase. Todo pasa por la API Express, que valida con Zod antes de tocar la base — mismo patrón que gestion-tajy y Siniestros Tajy.

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
- Cuando termines una tarea, **debes** actualizar este archivo para reflejar el progreso realizado.
- Despues de cada commit y/o push, **debes** guardalo todo en engram, para no perder contexto por si hay fallas.
- No intentes adivinar, si no sabes algo pregunta.
- Cuando termines una tarea, **debes** actualizar el check de la tarea en este archivo, y el plan de desarrollo. Hasta dar por finalizado el plan de desarrollo.
- Cuando termines una tarea, **debes** actualizar el estado de desarrollo del proyecto en este archivo y el del .md del proyecto.
- Cuando encuentres una suposición errónea durante una sesión, sugiere una corrección en CLAUDE.md.
- Revisa este archivo CLAUDE.md y sugiere mejoras.

## Estado actual del proyecto

**Cambio de prioridad (2026-07-10):** el cliente pidió priorizar **MRC, Incendio y Vida/AP** por sobre Auto. Fase 2 de Auto queda **pausada tal cual está** (no se revierte, no se sigue tocando). Hogar y TRO no fueron pedidos todavía — quedan en fase futura.

**Fase 6/7 cerrada a nivel de negocio (último cambio verificado: 2026-07-24).** MRC opera end-to-end (calculador, frontend, Carta Oferta en PDF). Incendio y Vida/AP tienen catálogo, calculador y tests unitarios completos (84/84 en verde) — solo les falta el template de Carta Oferta (pendiente de texto oficial de cada ramo). Panel admin (usuarios/roles/coberturas/tasas/planes), historial de cotizaciones y una migración visual completa ("Diseño 2" + pantalla de bienvenida post-login) ya están commiteados y verificados en vivo. El detalle completo de cada hito, con fechas y commits, vive en `docs/ESTADO_PROYECTO.md` — no se repite acá para no desincronizarse (ver sección 30 para el historial reciente).

**Cambio `incendio-3-planes-y-moneda` mergeado a `main` y cerrado (2026-07-27).** 23/23 tasks, verificado en vivo, PRs #14/#15/#16 mergeados (ramas borradas). 3 planes nuevos de Incendio (Hipotecario, con/sin Inspección), moneda USD/Gs. por cotización, tipo de cambio con fallback, umbral de inspección. Migraciones 034-040 aplicadas contra Supabase real. `main` en verde: 97/97 tests backend. Detalle completo, incluyendo un bug real encontrado y corregido en la verificación (mismatch de nombre `'VIVIENDA FAMILIAR'` vs `'VIVIENDA'` en la tasa de tipo de riesgo), en `docs/ESTADO_PROYECTO.md` sección 32.

**Panel admin — eliminar planes + habilitar/deshabilitar ramos del sidebar (2026-07-28), commiteado y pusheado, sin mergear a `main` todavía.** Rama `fix/admin-badge-colores-rol`. Botón Eliminar en Planes (409 si el plan tiene cotizaciones asociadas). Nueva sección "Ramos" en el panel, primera gateada por rol admin literal (no permiso delegable) para togglear `ramos.activo` — el sidebar de `/cotizar` ya no hardcodea "próximamente", lo deriva de esa columna. Migración 041 aplicada contra Supabase real (fija `auto`/`hogar` en `activo=false` para no cambiar el comportamiento actual). Detalle completo en `docs/ESTADO_PROYECTO.md` sección 33 — incluye una aclaración importante: `147.93.132.53` **no es una VPS separada**, es el mismo sandbox de cada sesión expuesto en IP pública, no persiste entre sesiones.

**Template de Carta Oferta de Incendio agregado (2026-07-28), sin commitear todavía.** `backend/src/templates/oferta/incendio.js` + `incendio.test.js`, enganchado en `BUILDERS_POR_CALCULADOR` (`backend/src/templates/oferta/index.js`). Cubre los 4 planes reales del calculador (`INCENDIO HIPOTECARIO`, `INCENDIO CON INSPECCION`, `INCENDIO SIN INSPECCION`, `MAQUINARIA BASICO`) con texto legal verbatim provisto por Kevin, uno distinto por plan (a diferencia de MRC que tiene un solo texto fijo). `MAQUINARIA BASICO` quedó sin secciones de Exclusiones/Recomendaciones porque el texto provisto no las incluía — no se rellenaron con contenido de otro plan. El placeholder `INSPECCION DE RIESGO No. XXXX/XXXX` del plan con inspección queda literal (no hay campo de número/fecha de inspección en el modelo de datos actual para interpolarlo). Tests: 5/5 verde, suite completa de backend 100/100 verde. Vida/AP sigue pendiente de texto oficial.

**Próximo paso confirmado con Kevin:** revisar/commitear el template de Incendio, agregar el de Vida/AP (requiere texto oficial), cerrar el cambio con `sdd-verify`/archivo formal si se pide, o retomar Fase 2 (Auto) si se pide.

**Roadmap pre-producción (auditoría integral 2026-07-24, detalle y sprints en `docs/ESTADO_PROYECTO.md` sección 30):** 4 sprints pendientes antes de lanzar sin restricciones — accesibilidad/errores silenciosos, mantenibilidad puntual, RLS/concurrencia/responsive, y sesión httpOnly + logging + modularización. Sprint 1 es condición dura antes de producción sin restricciones.

**Fase 1 de Auto (schema base, importador de tasas) sigue como estaba** — pausado, no se retoma hasta que el cliente lo pida.

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

- Backend en capas: `routes → controllers → services → repositories`. No lógica de negocio en los controllers.
- Validación de entrada con Zod en el borde de la API, antes de llegar a los services.
- Cada ramo tiene su propio calculador en `/calculators`, todos implementando:
  ```js
  interface RamoCalculator {
    calcularPrima(input): { prima: number, detalle: object }
    calcularPlanPago(prima, formaPago, cuotas): { rpf, iva, premio, inicial, cuota }
  }
  ```
- Frontend Vanilla JS, sin build step complejo — mismo patrón de Siniestros Tajy (sidebar, fetch wrapper simple).
- SQL de Supabase versionado como migraciones individuales en `/backend/migrations`, nunca editar el schema a mano en producción.
- `pip`/`npm`: nada especial, usar los gestores estándar de cada carpeta.

## Pendientes activos que pueden afectar el código

Lista corta de lo que un cambio de código puede pisar sin querer. El detalle completo de cada uno (y otros pendientes menores) está en `docs/ESTADO_PROYECTO.md` sección 8 y sección 31 — no se repite acá.

- **Template de Carta Oferta para Vida/AP**: no existe todavía (falta texto oficial). El de Incendio ya está (`backend/src/templates/oferta/incendio.js`, ver sección "Estado actual del proyecto"). El calculador de Vida/AP SÍ está completo y testeado — no asumir que está "pendiente" sin verificar `backend/src/calculators/`.
- **RPF de "COMERCIO PROTECCION TOTAL"** (MRC): no confirmado — plan desactivado (`activo = FALSE`), no aparece en el selector.
- **Auto individual (Fase 1/2)**: pausado por prioridad del cliente, no tocar hasta que se reactive.
- **RLS en Supabase**: 30 tablas de `public` sin RLS. No explotable hoy (frontend nunca habla directo con Supabase), pero requiere decisión de Kevin antes de actuar — no activar sin diseñar policies primero.

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

### Supabase MCP

Existe un MCP conectado al proyecto de Supabase.

Utilizarlo para:

- inspeccionar tablas
- consultar esquema
- revisar migraciones
- validar cambios antes de modificar SQL

Evitar recorrer el proyecto manualmente cuando estas herramientas proporcionen la información necesaria.
