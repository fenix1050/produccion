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

**Última actualización:** 2026-07-23.

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

## Estado actual del proyecto

**Cambio de prioridad (2026-07-10):** el cliente pidió priorizar **MRC, Incendio y Vida/AP** por sobre Auto. Fase 2 de Auto queda **pausada tal cual está** (no se revierte, no se sigue tocando). Hogar y TRO no fueron pedidos todavía — quedan en fase futura, no se suman a este bloque aunque compartan esqueleto con MRC/Incendio.

**Fase 6/7 cerrada a nivel de negocio + iteraciones reales de UX/admin ya commiteadas (último cambio verificado: 2026-07-23)** — MRC operativo, Incendio y Vida/AP listos en datos pero sin calculador, con panel admin/historial implementados y una capa nueva de rediseño visual, navegación post-login y hardening del admin:

- [x] Schema completo de la base de datos para MRC/Incendio/Vida-AP (ver sección 4 de PLAN_DESARROLLO.md), incluyendo el campo `tipo_aplicacion` (`cobertura` vs `sublimite`) en `cotizacion_coberturas` — migración 011 aplicada contra Supabase real (2026-07-10)
- [x] Catálogo de coberturas de MRC (migración 012, 2026-07-10) — tasas reales de "Version 01 - Calculo Varios.xlsx" + textos legales confirmados contra el sistema de escritorio.
- [x] Catálogo de coberturas de Incendio (migración 013, 2026-07-10; RPF completado en migración 023, 2026-07-13) — fuentes: 4 cotizaciones reales de Incendio ya emitidas (GT S.A., Distribuidora Múltiples Productos, COFUDEP, Robin Hut Heil) + pestaña INCENDIO de "Version 01 - Calculo Varios.xlsx" (confirma que el plan simple reutiliza `rubros_actividad.tasa_edificio/tasa_contenido`, ya cargado en la 012) + plan "Maquinaria Básico" dictado por Kevin (tasa fija 0,7%). **Ya no está pendiente el RPF**: quedó confirmado plano, igual a MRC/Vida-AP. Pendientes reales que sí siguen abiertos: nombre exacto del plan en el sistema de escritorio, columna de moneda/tope máximo asegurable para modelar el plan Maquinaria Básico en USD (schema no la tiene todavía), y texto legal completo de las cláusulas "a prorrata"/"cobranza"/"inventario no presentado" (solo se confirmó la frase, no el texto completo).
- [x] Fix de fiabilidad histórico (migración 014, 2026-07-10): plan `INCENDIO - EDIFICIO Y CONTENIDO` se marcó `activo = FALSE` hasta confirmar su RPF — detectado en review-reliability de la migración 013 para que no quedara seleccionable sin forma de pago configurada. **Ese bloqueo ya quedó resuelto** en la migración 023 (2026-07-13), cuando se confirmó el RPF y el plan volvió a quedar habilitado.
- [x] Catálogo de coberturas de Vida y Accidentes Personales (migración 015, 2026-07-12, con fix de fiabilidad en la migración 016) — fuente principal: manual `M-08OP-GT-01 v.02` (con texto extraíble, a diferencia del de Incendio/Hogar/Comercio/TRO), que da tasas oficiales ("tasas obligatorias") para los 5 sub-productos del ramo → 7 planes (Protección de Préstamos Cooperativas/Mercado General, Protección Familiar, Accidentes Personales Cooperativo/Privado, Vida Directivos y Empleados, Aportes y Ahorros), 11 coberturas y 44 filas de tarifa en `tarifas_generico` (JSONB — este ramo no usa `tasas_cobertura_ramo` porque la misma cobertura tiene tasas distintas por plan). Textos/exclusiones de AP confirmados contra 2 cotizaciones reales (ALKA Construcciones, Floriano Kochhan Hoffmann). Los Excels de Vida Colectivo/AP (motor más granular, tabla de mortalidad SISPY 2017) NO se usaron para esta carga — quedan de referencia para el calculador. **Cierra Fase 6/7** — ver `docs/ESTADO_PROYECTO.md` sección 12 para el detalle completo y los pendientes.
- [x] `mrc.calculator.js` implementado end-to-end para el plan `MULTIRRIESGO COMERCIO - NORMAL` (único con RPF/prima técnica mínima confirmados) — prima por línea de cobertura (Edificio/Contenido) con piso en `prima_tecnica_minima`, mismo motor de RPF/IVA/Premio/Cuota que Auto. `COMERCIO PROTECCION TOTAL` corta con error 422 explicativo al cotizar (sin RPF confirmado todavía).
- [x] Flujo de cotización en el frontend (`/frontend/cotizar`, Vanilla JS) conectado a MRC: sidebar con los 5 ramos reales (MRC/Incendio/Vida-AP disponibles, Auto en pausa, Hogar "próximamente"), panel de cotización en vivo con selección explícita de forma de pago (Contado/Cobrador/Boca de Cobranza/Tarjeta) que se conserva al pasar a Detalle del plan. La Carta Oferta de MRC ya se genera en PDF; Incendio y Vida-AP siguen pendientes de template.
- [x] Panel admin — Fase 5 / WU5 completo (MVP): `frontend/admin/admin.js` con las 4 secciones (Usuarios, Coberturas por plan, Tasas, Planes), auth JWT propio, mismo patrón "valor fijo + Editar" en toda la SPA. Verificado end-to-end en navegador (login real, toggle/edición de `plan_coberturas`, alta desde catálogo con exclusión de ya agregadas).
- [x] Coberturas adicionales de MRC repetibles con badge cobertura/sublímite (2026-07-13) — solo Incendio Edificio/Contenido quedan fijos por defecto; el resto (incluidos los 4 sublímites reales: murallas, granizo, agua, equipos electrónicos) lo agrega el agente como líneas explícitas, pudiendo repetir la misma cobertura con distinta suma asegurada (confirmado contra "Version 01 - Calculo Varios.xlsx", hoja MRC/DATOS). Cada línea tarifica de verdad con `tasas_cobertura_ramo` y suma a la prima. Nuevo endpoint `GET /ramos/:id/coberturas-catalogo` (catálogo completo del ramo, distinto de `GET /planes/:id/coberturas`). Cierra el pendiente de "UI para tildar cobertura vs. sublímite".
- [x] **Carta Oferta en PDF** (2026-07-14/15, afinada el 2026-07-22): implementada para MRC con Puppeteer + template HTML, replicando branding Tajy (rojo `#d8132e`, footer con datos reales). El layout de contenido sigue usando split dinámico 3/3 con fallback balanceado, pero el PDF final hoy sale en tamaño Oficio/Legal real (215,9×355,6 mm), no en A4, para que imprima alineado en drivers paraguayos. Incendio y Vida-AP quedan sin template todavía (pendientes de texto oficial de Carta Oferta).
- [x] **Tope de descuento/recargo por usuario** (2026-07-19): cada usuario admin puede tener un tope propio (`usuarios.descuento_maximo_pct` / `recargo_maximo_pct`) más restrictivo que el plan. Si usuario y plan se contradicen, gana el más restrictivo (`MIN`). Enforcement real en `mrc.calculator.js` e `incendio.calculator.js`. No aplicado a `auto.calculator.js` (Fase 2 pausada).
- [x] **Permisos parciales del panel admin por sección** (2026-07-19): antes era todo-o-nada (`rol='admin'`), ahora cada usuario puede tener permisos individuales: `puede_gestionar_usuarios`, `puede_editar_coberturas`, `puede_editar_planes` (adicional a `puede_editar_tasas` ya existente). El sidebar del admin solo muestra secciones para las que el usuario tiene permiso. Acceso a rutas sin permiso devuelve 403.
- [x] **Editor de tasas por Tipo de Riesgo** (2026-07-19): nuevo endpoint `PUT /admin/rubros-actividad/:id` para editar `rubros_actividad.tasa_edificio` / `tasa_contenido` directamente desde el panel admin, sin migración SQL. Visible solo para MRC/Incendio (la tabla es compartida entre ambos). Editorial con UPDATE directo (sin versionado, a diferencia de `tasas_cobertura_ramo`).
- [x] **WU6 cerrado** (2026-07-17): frontend `cotizar.js` refactorizado para leer sublímites fijos de `plan_coberturas` en vez de constante hardcodeada. Verificado que prima de MRC Normal no cambió. Efecto colateral: "Murallas/Cercos" (Gs. 1.000.000) ahora visible en el resumen de Sublímites (ya estaba en la base, la constante vieja no la reflejaba — Kevin confirmó el monto como correcto).
- [x] **Bugfix — usuarios en panel admin sin respuesta** (2026-07-19): botones "Editar"/"Resetear password"/"Desactivar" no hacían nada porque comparaban string (`el.dataset.id`) vs number (`usuarios.id SERIAL`) con `===` estricto. Corregido con `Number()` en el dispatcher. Verificado en vivo.
- [x] **Roles configurables** (2026-07-19): reemplazó el patrón booleano de permisos sueltos en `usuarios`. Tabla `roles` con 4 permisos cada una (`puede_gestionar_usuarios`, `puede_editar_coberturas`, `puede_editar_planes`, `puede_editar_tasas`). Roles `admin`/`agente` del sistema inmutables. CRUD de roles custom (migración 031). Frontend con tabla de roles + modal de creación.
- [x] **Historial y edición de cotizaciones** (2026-07-19): Fase 5 implementada. Listado con filtros, paginación, descarga de PDF, permisos por dueño (IDOR cerrado), edición con ventana de 30 días. Backend con `actualizarCotizacion`, validaciones de ventana + cambio de ramo. 4 lentes review confirmaron correctitud.
- [x] **Migración visual "Diseño 2" completa** (2026-07-21, commits `75791d0`, `2b2e1b7`, `5958c0c`): topbar, sidebar, cards y navegación de `cotizar`, `historial`, `admin` y `configuracion` alineados al mockup aprobado en `docs/mockups/diseno-2-app-shell.html`. Se hizo porque Kevin quería sacar el look "de sistema viejo" y llevar toda la app a una UI más clara para uso real.
- [x] **Rediseño iterativo de `/frontend/cotizar` (MRC)** (2026-07-21/22, commits `c4d5e46`, `5173166`, `1f9b4aa`, `b9746d2`, `70686b9`, `b62355e`): vista Datos con cards + stepper + panel "Cotización en vivo" más claro, ajuste de espaciados para que 1 cobertura adicional no genere scroll, Detalle del plan reorganizado como layout de 2 columnas con resumen fijo, y card de Exclusiones ya visible desde Datos. Motivo: Kevin vio la pantalla real y pidió dejar atrás el fondo gris / look de reporte.
- [x] **Pantalla de bienvenida post-login** (2026-07-22/23, commits `f3e1682`, `e3cd3aa`): nueva ruta `frontend/bienvenida/` entre Login y Cotizar, con selector de acción (Cotizar / Propuesta Formal), selector de ramo y card de acceso al admin visible solo si `tieneAccesoAdmin()` da true. `cotizar.js` ahora lee `?ramo=` para entrar con el ramo ya elegido.
- [x] **Carta Oferta de MRC en tamaño Oficio real** (2026-07-22, commit `f38f0e7`): el PDF pasó de A4 a Legal/Oficio (215,9×355,6 mm), con footer afinado y línea AGENTE/EMAIL. Se hizo porque una medida "casi oficio" dejaba el pie desalineado al imprimir contra drivers reales de impresora paraguayos.
- [x] **Historial — mejora visual de tabla y descarga protegida** (2026-07-22, commit `3dea406`): acciones con jerarquía más clara, colores semánticos por estado, fix del wrap en Número y deshabilitado temporal del botón de Carta Oferta durante la descarga para evitar doble click.
- [x] **Panel admin — acceso desde menú de perfil + borrado controlado + guard anti-admin** (2026-07-23, commit `db8a1d2`): el link al panel sale del sidebar y pasa al dropdown del perfil; usuarios/roles sin uso se pueden eliminar; y ningún rol no-admin puede editar/desactivar/resetear/eliminar a un usuario admin. Se corrigió además `tieneAccesoAdmin()` para contemplar roles custom con permisos parciales, no solo `rol === 'admin'`.
- [x] **Corrección (dato desactualizado, detectado en auditoría integral 2026-07-24)**: `incendio.calculator.js` (245 líneas) y `vida-ap.calculator.js` (294 líneas) YA estaban implementados con lógica de cálculo completa — esta línea decía "pendiente" por error. Lo que sí faltaba y ahora está cerrado: tests unitarios de los 3 calculators (mrc/incendio/vida-ap), agregados el 2026-07-24 (44 casos nuevos, 84/84 tests en verde). Siguen sin template de Carta Oferta propio (requieren texto oficial de cada ramo).
- [x] **Auditoría integral consolidada** (2026-07-24): se corrieron las auditorías de Arquitectura/Código/Performance/UX-UI que faltaban y se cerraron los 2 hallazgos críticos detectados — ver informe en engram (obs #259) y detalle abajo en "Pendientes activos".

**Próximo paso confirmado con Kevin:** agregar templates de Carta Oferta de Incendio y Vida/AP (requieren texto oficial), o retomar Fase 2 (Auto) si se pide.

**Roadmap pre-producción (auditoría integral 2026-07-24, ver detalle y sprints en `docs/ESTADO_PROYECTO.md` sección 30) — Kevin lo va resolviendo antes de lanzar a producción sin restricciones:**
- Sprint 1: navegación por teclado en selección de ramo, fix de contraste `--tajy-text-secondary`, banners de error en los 8 puntos de carga silenciosa de `cotizar.js`.
- Sprint 2: extraer `mostrarBanner()` duplicada a shared/, helper compartido MRC/Incendio, unificar cache de catálogos, reemplazar `confirm()` nativo en admin.
- Sprint 3: punto único de registro de ramo, habilitar RLS en Supabase, cola de concurrencia en Puppeteer, validación inline por campo, breakpoint responsive intermedio.
- Sprint 4: sesión JWT a cookie httpOnly, logging de seguridad centralizado, automatizar npm audit, modularizar cotizar.js/admin.js.

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

- **Calculadores `incendio.js` / `vida-ap.js`**: implementación ya cerrada (contradice una línea vieja de este mismo archivo — corregida 2026-07-24). RPF plano (Contado 0% / Cobrador 1,6% / Boca 1,35% / Tarjeta 1%, fijo para todos los planes), Prima Técnica Mínima (Incendio Gs. 409.091; Vida/AP = sin piso), y ahora con tests unitarios reales (2026-07-24). Falta solo el template de Carta Oferta de cada uno.
- **Sublímites de MRC en el PDF de Carta Oferta desincronizados del catálogo — resuelto (2026-07-24)**: `backend/src/templates/oferta/mrc.js` tenía montos hardcodeados (`TEXTO_DISTRIBUCION_CAPITAL`) y un array `SUBLIMITES_FIJOS_MRC` al que le faltaba `sublimite_murallas_cercos`. Ahora ambos se derivan en vivo de `plan_coberturas` (mismo criterio que ya usaba el frontend desde WU6), con test de regresión en `mrc.test.js`.
- **Templates de Carta Oferta para Incendio y Vida/AP** (Fase 6/7): pendientes de texto oficial de cada ramo. MRC ya implementado con layout dinámico + failover. Los dispatchers de `templates/oferta/index.js` cortan con 422 explicativo mientras no haya template.
- **RPF de "COMERCIO PROTECCION TOTAL"** (MRC, Fase 6/7): no confirmado — plan desactivado (`activo = FALSE`) desde migración 022 (2026-07-13), no aparece en selector. Se reactivaría al confirmar RPF.
- **Auto individual (Fase 1/2, pausada)**: schema y calculador completos, fase pausada por prioridad del cliente. No se retoma hasta que se reactive.
- **Plan Básico de Auto** (Fase 1/2 pausada): no implementado — tasa única fija 1,64% vs. tarifación por capital. Pendiente #4 de sección 11 de `PLAN_DESARROLLO.md`, no bloqueante.
- **RLS en Supabase**: 29 tablas de `public` tienen RLS deshabilitado. Hoy no es explotable (frontend nunca habla directo con Supabase), pero queda como deuda técnica — requiere decisión de Kevin antes de actuar.
- **Modal "Nuevo usuario"**: no tiene campos de tope propio (descuento/recargo máximo) — solo "Editar usuario" los tiene. Usuario recién creado queda sin tope (`NULL`, solo el tope del plan) hasta que se edite a mano (confirmado con Kevin como "revisamos después").
- **Textos legales faltantes en catálogo MRC** (detectado 2026-07-22): `coberturas_catalogo.texto_legal`/`texto_exclusiones` quedaron en `NULL` desde la migración 012 (2026-07-10) para `cristales` (Rotura de Cristales, Vidrios o Espejos), `responsabilidad_civil` y `equipos_electronicos`. La Carta Oferta de MRC (`renderCoberturaItem` en `backend/src/templates/oferta/mrc.js`) solo imprime el bloque de texto legal/exclusiones si esos campos no son null, así que estas 3 coberturas aparecen sin texto en el PDF (solo el nombre) — comportamiento esperado dado el dato faltante, no un bug. Kevin no tiene todavía el texto oficial de estas 3 coberturas; falta cargarlo en una migración nueva cuando esté disponible.
- **Propuesta Formal en bienvenida sigue como placeholder** (2026-07-22): la nueva pantalla `frontend/bienvenida/` ya separa el flujo "Cotizar" de "Elaborar una Propuesta Formal", pero el segundo todavía muestra solo "Próximamente". No confundir esta navegación nueva con Fase 4 cerrada: la Propuesta Formal sigue pendiente a nivel funcional y de PDF.

## Al empezar una sesión nueva

1. Leer `docs/PLAN_DESARROLLO.md` completo si es la primera vez.
2. Leer `docs/ESTADO_PROYECTO.md` para saber qué está hecho y qué decisiones ya se tomaron.
3. Revisar la sección 11 de `docs/PLAN_DESARROLLO.md` (pendientes) por si hay novedades.
4. Confirmar en qué fase estamos antes de avanzar a la siguiente.
