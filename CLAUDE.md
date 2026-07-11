# CLAUDE.md — Cotizador Aseguradora Tajy

Este archivo es el contexto de arranque para Claude Code en este repositorio. Léelo completo antes de tocar código. El detalle completo de arquitectura, schema SQL y reglas de negocio está en `docs/PLAN_DESARROLLO.md` — este archivo es un resumen operativo, no lo reemplaza. El estado real de avance (qué está implementado, decisiones tomadas y por qué, pendientes abiertos) está en `docs/ESTADO_PROYECTO.md`.

## Qué es este proyecto

Sistema web para que los agentes de **Aseguradora Tajy** (Paraguay) coticen pólizas de seguro de varios ramos (Auto individual, Auto Flota, Incendio, Multirriesgo Hogar, Multirriesgo Comercio, Todo Riesgo Operativo, Transporte de Mercadería, Vida y Accidentes Personales), generen un PDF de **Carta Oferta** al cotizar y una **Propuesta Formal** (con KYC/PLA-FT) cuando el cliente acepta, y mantengan historial con numeración correlativa.

Es un proyecto **independiente**, separado de otros sistemas de Tajy (Siniestros Tajy, gestion-tajy) que Kevin ya tiene en desarrollo, aunque comparte el mismo stack y convenciones.

## Stack

| Capa | Herramienta |
|---|---|
| Backend | Node.js + Express |
| Base de datos | Supabase (PostgreSQL) |
| Validación | Zod (un schema por ramo para los datos de riesgo) |
| Frontend | Vanilla JS (sin framework), Netlify |
| Importación de Excel | SheetJS |
| Generación de PDF | Puppeteer (HTML/CSS → PDF) |
| Deploy backend | Railway o Render (Puppeteer necesita más RAM/CPU que serverless) |
| Organización | Monorepo GitHub |

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

## Estado actual del proyecto

**Cambio de prioridad (2026-07-10):** el cliente pidió priorizar **MRC, Incendio y Vida/AP** por sobre Auto. Fase 2 de Auto queda **pausada tal cual está** (no se revierte, no se sigue tocando). Hogar y TRO no fueron pedidos todavía — quedan en fase futura, no se suman a este bloque aunque compartan esqueleto con MRC/Incendio.

Estamos en **Fase 6/7 (activa)** — orden interno: **MRC primero**, después Incendio, después Vida/AP:

- [x] Schema completo de la base de datos para MRC/Incendio/Vida-AP (ver sección 4 de PLAN_DESARROLLO.md), incluyendo el campo `tipo_aplicacion` (`cobertura` vs `sublimite`) en `cotizacion_coberturas` — migración 011 aplicada contra Supabase real (2026-07-10)
- [x] Catálogo de coberturas de MRC (migración 012, 2026-07-10) — tasas reales de "Version 01 - Calculo Varios.xlsx" + textos legales confirmados contra el sistema de escritorio.
- [x] Catálogo de coberturas de Incendio (migración 013, 2026-07-10) — fuentes: 4 cotizaciones reales de Incendio ya emitidas (GT S.A., Distribuidora Múltiples Productos, COFUDEP, Robin Hut Heil) + pestaña INCENDIO de "Version 01 - Calculo Varios.xlsx" (confirma que el plan simple reutiliza `rubros_actividad.tasa_edificio/tasa_contenido`, ya cargado en la 012) + plan "Maquinaria Básico" dictado por Kevin (tasa fija 0,7%, RPF confirmado). Catálogo de Vida/AP todavía pendiente (sigue el orden MRC → Incendio → Vida/AP). Pendiente de Incendio: RPF de "Incendio - Edificio y Contenido" (no confirmado en ninguna fuente), nombre exacto de ese plan en el sistema de escritorio, columna de moneda/tope máximo asegurable para modelar el plan Maquinaria Básico en USD (schema no la tiene todavía), y texto legal completo de las cláusulas "a prorrata"/"cobranza"/"inventario no presentado" (solo se confirmó la frase, no el texto completo).
- [x] Fix de fiabilidad (migración 014, 2026-07-10): plan `INCENDIO - EDIFICIO Y CONTENIDO` marcado `activo = FALSE` hasta confirmar su RPF — detectado en review-reliability de la migración 013, evita que quede seleccionable desde la API sin forma de pago configurada.
- [ ] Calculadores `mrc.js` / `incendio.js` / `vida-ap.js` con la tasa como parámetro configurable (sin hardcodear) — RPF de MRC (plan Normal) y de Incendio (plan Maquinaria Básico) ya confirmados; falta el RPF de "Comercio Protección Total", de "Incendio - Edificio y Contenido" y de Vida/AP (pendiente #10, sección 11 de PLAN_DESARROLLO.md)
- [ ] UI para tildar cobertura vs. sublímite por ítem en la cotización

**Fase 1 de Auto (schema base, importador de tasas) sigue como estaba** — no se retoma hasta que se reactive esa fase.

## Reglas de negocio clave para Auto (resumen — detalle completo en sección 5 de PLAN_DESARROLLO.md)

```
Prima_base = MAX(Capital × Tasa(plan, rango capital), plan.prima_tecnica_minima)
Prima = Prima_base − Σ(Descuentos, tope = plan.descuento_maximo) + Σ(Recargos, tope = plan.recargo_maximo)
RPF% = plan_formas_pago.tasa_rpf   -- FIJA por forma de pago, NO varía por cantidad de cuotas
R.P.F. = REDONDEAR.SUP(Prima × RPF% / 100, 1000)
IVA = (Prima × 10%) + (R.P.F. × 10%)
Premio = Prima + R.P.F. + IVA
Inicial = Cuota = REDONDEAR.SUP(Premio / 12, 1000)
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

Antes de implementar Incendio/Hogar/MRC/TRO, confirmar con Kevin (ver sección 11 de PLAN_DESARROLLO.md, ítems 2, 5, 6, 8 — los valores de RPF fijo para esos ramos y algunos máximos de descuento/recargo todavía no están confirmados). Auto individual no tiene pendientes bloqueantes.

## Al empezar una sesión nueva

1. Leer `docs/PLAN_DESARROLLO.md` completo si es la primera vez.
2. Leer `docs/ESTADO_PROYECTO.md` para saber qué está hecho y qué decisiones ya se tomaron.
3. Revisar la sección 11 de `docs/PLAN_DESARROLLO.md` (pendientes) por si hay novedades.
4. Confirmar en qué fase estamos antes de avanzar a la siguiente.
