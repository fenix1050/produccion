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

**Panel admin — eliminar planes + habilitar/deshabilitar ramos del sidebar (2026-07-28), mergeado a `main` (PR #21, PR #22).** Rama `fix/admin-badge-colores-rol`. Botón Eliminar en Planes (409 si el plan tiene cotizaciones asociadas). Nueva sección "Ramos" en el panel, primera gateada por rol admin literal (no permiso delegable) para togglear `ramos.activo` — el sidebar de `/cotizar` ya no hardcodea "próximamente", lo deriva de esa columna. Migración 041 aplicada contra Supabase real (fija `auto`/`hogar` en `activo=false` para no cambiar el comportamiento actual). Detalle completo en `docs/ESTADO_PROYECTO.md` sección 33. **Corrección (2026-07-28, ver sección 35):** la nota anterior de que `147.93.132.53` "no es una VPS separada" quedó desactualizada — ahora SÍ hay un deploy Docker real y persistente ahí (`cotizador-tajy-backend` + Caddy en `147-93-132-53.sslip.io`, a donde apunta Vercel). Lo que sigue siendo cierto: además de eso se acumulan procesos `node src/server.js` sueltos en el host entre sesiones de QA, fuera de Docker — no confundirlos con el deploy real.

**Template de Carta Oferta de Incendio agregado (2026-07-28), sin commitear todavía.** `backend/src/templates/oferta/incendio.js` + `incendio.test.js`, enganchado en `BUILDERS_POR_CALCULADOR` (`backend/src/templates/oferta/index.js`). Cubre los 4 planes reales del calculador (`INCENDIO HIPOTECARIO`, `INCENDIO CON INSPECCION`, `INCENDIO SIN INSPECCION`, `MAQUINARIA BASICO`) con texto legal verbatim provisto por Kevin, uno distinto por plan (a diferencia de MRC que tiene un solo texto fijo). `MAQUINARIA BASICO` quedó sin secciones de Exclusiones/Recomendaciones porque el texto provisto no las incluía — no se rellenaron con contenido de otro plan. El placeholder `INSPECCION DE RIESGO No. XXXX/XXXX` del plan con inspección queda literal (no hay campo de número/fecha de inspección en el modelo de datos actual para interpolarlo). Tests: 5/5 verde, suite completa de backend 100/100 verde. Vida/AP sigue pendiente de texto oficial.

**Próximo paso confirmado con Kevin:** revisar/commitear el template de Incendio, agregar el de Vida/AP (requiere texto oficial), cerrar el cambio con `sdd-verify`/archivo formal si se pide, o retomar Fase 2 (Auto) si se pide.

**Frontend responsive unificado — 6 módulos, PR #81 abierto (2026-07-31).** Rama `feat/responsive-unificado`. Breakpoints unificados a 1024/768/480px (antes 5 valores distintos sin sistema), sidebar hamburguesa/overlay creado desde cero y reutilizado en cotizar/admin/historial/configuración, tablas del admin convertidas a cards apiladas en mobile, resuelto el pendiente de roadmap del breakpoint intermedio en `.resultado-layout`/`.datos-view`. Verificado en Playwright headless Y en dispositivo real de Kevin (dos rondas — la verificación headless sola no detectó 3 bugs reales de layout que sí aparecieron en el celular: panel de cotización en vivo tapando el formulario, topbar superpuesto, tablas anidadas del modal de historial sin scroll). 166/166 tests backend en verde. Detalle completo en `docs/ESTADO_PROYECTO.md` sección 42.

**MRC — plan con descuento fijo del 10% y permiso de rol (2026-07-30), PR1 mergeado a `main` (PR #60), PR2 abierto (PR #61).** Cambio SDD `mrc-plan-descuento-fijo`. PR1 (mergeado): migración `048_plan_mrc_descuento_fijo.sql` **aplicada contra Supabase real** — plan "MULTIRRIESGO COMERCIO - SEGUCOOP" (id 20), permiso otorgado a `admin`, `Analista de Riesgo` y `Jefe de Análisis de Riesgo`, coberturas heredadas de "MULTIRRIESGO COMERCIO - NORMAL" — más `resolverDescuentos()` en `cotizacion.service.js` (fuerza el 10% del plan si el usuario no tiene `puede_editar_descuento_plan`, neutralizando solo el tope del usuario, no el del plan), guarda `!cotizacion_combinada` para no pisar el descuento de franquicia de Auto, plumbing del permiso nuevo en 6 archivos backend. 166/166 tests verde. **Nota de numeración:** al mergear quedó colisionando con `046_enable_rls_public_tables.sql` (mismo número, dos archivos distintos en `main`) — **resuelto (2026-07-30):** renombrado de `046_plan_mrc_descuento_fijo.sql` a `048_plan_mrc_descuento_fijo.sql` (siguiente libre tras el `047` de Ramos), sin cambio de contenido — ya estaba aplicada contra Supabase real bajo el nombre lógico anterior. PR2 (`sdd/mrc-plan-descuento-fijo-frontend`, ahora apuntando directo a `main`): checkbox del permiso en Roles del panel admin (no en usuario), precarga y bloqueo visual del campo Descuento en `cotizar.js` cuando el plan tiene `descuento_default` y el usuario no tiene el permiso. **Verificado en vivo con Playwright** (usuario sin permiso: solo Contado, campo bloqueado en 10%, sin errores de consola/red); el camino "usuario CON permiso" queda sin verificar en vivo (cubierto por tests de backend, ver sección 39) por no tocar permisos de roles reales fuera de los 3 confirmados solo para la prueba. Detalle completo en `docs/ESTADO_PROYECTO.md` sección 39.

**Panel admin — editar nombre y eliminar ramo (2026-07-30), sin commitear todavía.** Sección "Ramos" del admin ahora permite: (1) editar `nombre_display` inline (mismo patrón que el nombre de plan/tasa RPF — `editarRamoSchema` ahora acepta `activo` y/o `nombre_display`, ambos opcionales); (2) botón "Eliminar" con borrado seguro — 409 explícito si el ramo tiene planes o cotizaciones asociadas (`ramosService.eliminarRamo`, mismo criterio que `eliminarPlan`). Detalle importante: `correlativos` tiene una fila 1:1 por ramo con FK NOT NULL, así que el borrado primero valida planes/cotizaciones en el service y recién después borra `correlativos` y `ramos` en el repository — si se borrara `correlativos` antes de confirmar que el ramo no tiene dependientes, un fallo posterior lo dejaría huérfano. Nuevo endpoint `DELETE /admin/ramos/:id` (gate: rol admin literal, igual que el resto de Ramos). Ojo: borrar la fila de `ramos` NO la saca del sidebar del cotizador — `RAMOS_UI` en `frontend/cotizar/cotizar.js` es una lista fija de 5 ramos hardcodeada en el frontend, independiente de si la fila existe en la base; el botón de borrar es para limpiar ramos mal cargados sin uso real, no para dar de baja Auto/MRC/Incendio/etc. 154/154 tests backend en verde (sin tests nuevos: no hay precedente de tests para esta capa fina de admin CRUD — `planes.service.js`/`eliminarPlan` tampoco los tiene). Alineación del botón "Editar" corregida en el mismo cambio (columna propia, `justify-content: space-between`, en vez de compartir `<td>` con el nombre).

**Panel admin — editar tope de descuento/recargo máximo por plan (2026-07-31), rama `feat/admin-topes-plan`, PR #72 abierto.** Sección "Planes" ahora expone `planes.descuento_maximo`/`planes.recargo_maximo` (ya existían en la base, editados hasta ahora solo por SQL directo — ver el plan "MULTIRRIESGO COMERCIO - SEGUCOOP", ambos en 10%). Decisión clave confirmada con Kevin: el tope se edita por endpoint propio `PUT /admin/planes/:id/topes` gateado por rol admin literal (`requireRole('admin')`, `editarPlanTopesSchema`), **no** por el permiso delegable `puede_editar_planes` — ese permiso ya lo tienen `Jefe de Análisis de Riesgo` y `Analista de Riesgo` (los mismos 3 roles que tienen `puede_editar_descuento_plan`), así que si el tope fuera editable por ese mismo permiso, esos roles podrían subir el techo que los limita a ellos mismos. El endpoint `PUT /admin/planes/:id` existente (nombre/activo/prima_tecnica_minima) queda intacto. Frontend: nueva columna en la tabla de Planes, inline-editable (mismo patrón Editar/Guardar/Cancelar que prima técnica mínima), botón "Editar" solo visible si `auth.getUsuario()?.rol === 'admin'` — Jefe/Analista ven el valor pero no el botón. 166/166 tests backend en verde (sin tests nuevos: mismo criterio que `eliminarPlan`/Ramos, no hay precedente de tests para esta capa fina de admin CRUD). Verificado en vivo con Playwright: admin ve y edita el tope y persiste tras reload; Analista de Riesgo (con `puede_editar_planes`) ve el valor pero sin botón "Editar"; un `PUT` directo por API con su sesión (bypaseando la UI) confirma el gate también en el servidor (403, sin cambios en la base). **Fix visual (2026-07-31):** la columna nueva apretaba la tabla y hacía que el botón "Formas de pago" envolviera a 2 líneas mientras "Eliminar" quedaba en 1, desalineando la fila — se agregó `white-space: nowrap` a `.admin-table th` y a los botones de `<td>` (mismo criterio que el resto de la tabla, que ya scrollea horizontal via `.admin-table-scroll`), y se acortó el header a "Topes desc./recargo (%)". **Segundo fix visual (2026-07-31):** "Desc." y "Rec." se movieron a 2 líneas apiladas en vez de un string con " / " en el medio (Kevin lo pidió tras ver el primer fix) — primer intento con `display:flex; flex-direction:column` en una clase nueva no se aplicó por especificidad CSS (`.admin-valor-fijo span` ya fijaba `display:inline-block` con más peso que una clase sola); resuelto prefijando el selector (`.admin-valor-fijo .admin-valor-fijo__lineas`). 166/166 tests backend en verde tras ambos fixes. Pendiente: decidir si se commitea/PR ahora o junto con otro cambio.

**`RAMOS_UI` del cotizador ampliado de 5 a 8 ramos (2026-07-30), migración 047 aplicada contra Supabase real.** Kevin notó que Todo Riesgo Operativo aparecía en el panel admin (sección Ramos) pero nunca en el sidebar de `/cotizar` — confirmado: `RAMOS_UI` en `frontend/cotizar/cotizar.js` era una lista fija de solo 5 ramos, así que el toggle "Activo" de auto-flota/tro/transporte en el admin no tenía ningún efecto visual (aunque sus calculadores ya existen en `backend/src/calculators/`, no están en `RAMOS_CON_CALCULO` — mismo estado que auto/hogar hoy). Se agregaron las 3 entradas a `RAMOS_UI`/`RAMO_ICONOS` (ícono genérico `ICON_SUBLIMITE_GENERICO`, sin diseño propio todavía) para que el toggle del admin los controle de verdad. Antes de aplicar, se verificó el estado real en Supabase: `auto-flota` y `transporte` estaban `activo=true` (`tro` ya en `false`) — sin este UPDATE (mismo patrón que 041 para auto/hogar), el deploy los hubiera mostrado como "disponibles" de un día para el otro sin haber sido pedido. Migración aplicada y verificada contra Supabase real: los 3 quedan en `activo=false`. Esto es solo visual/administrable — no habilita cotizar por esos ramos (no están en `RAMOS_CON_CALCULO`, mismo placeholder que ya usan auto/hogar). **Nota de numeración:** el archivo se creó primero como `046_...` pero se detectó que otras dos ramas sin mergear (`sdd/mrc-plan-descuento-fijo-frontend` con `046_plan_mrc_descuento_fijo.sql`, y `fix/enable-rls-public-tables` con `046_enable_rls_public_tables.sql`) ya usaban ese número — se renombró a `047_ramos_flota_tro_transporte_activo_false.sql` para evitar la colisión cuando las tres se mergeen a `main` (que sigue en `045`). Esa previsión funcionó a medias: `mrc-plan-descuento-fijo` se mergeó igual bajo `046`, colisionando con `046_enable_rls_public_tables.sql` — resuelto renombrando esa a `048_plan_mrc_descuento_fijo.sql` (ver nota de numeración en la entrada de MRC arriba). 154/154 tests backend en verde.

**Incendio — tasas por rubro de actividad (~207 rubros) + pertenencia rubro-ramo (2026-07-29), migraciones APLICADAS contra Supabase real.** Cambio SDD `incendio-tasas-por-rubro` (rama `sdd/incendio-tasas-por-rubro`, PR #38). Implementado: núcleo puro `tasas-incendio.service.js` (16 tests), CLI `generar-migracion-tasas-incendio.js`, migración `043_rubro_actividad_ramo.sql` (tabla nueva `rubro_actividad_ramo`, muchos-a-muchos rubro↔ramo, reemplaza el filtro por el escalar legacy `rubros_actividad.grupo`), migración `044_seed_tasas_incendio_rubros.sql`, filtro `ramo_id` obligatorio en `GET /ramos/rubros-actividad` y `GET /admin/rubros-actividad`, y los dos call sites de frontend actualizados. `npm test --prefix backend`: 128/128 verde. Kevin revisó el reporte de warnings del script (176/184 rubros nuevos activarían el clamp del calculador por `tasa_minima` del pivot) y confirmó "apliquemos tal cual" — se acepta el clamp por ahora, ajustable después por `UPDATE` sin cambio de código. Ambas migraciones aplicadas y verificadas 2026-07-29: 206 `tipos_riesgo_incendio`, 824 `tasas_riesgo_objeto`, los 3 asserts de 044 en verde, VIVIENDA sin cambios (0.90/0.90/1.34/1.34), MRC 18 rubros (15 originales + los 3 multi-ramo: CONSULTORIO MEDICO/CHANCHERIAS/GRANJA EN GENERAL), TRO 29 sin cambios, 0 rubros huérfanos. Detalle completo en `docs/ESTADO_PROYECTO.md` sección 36. **Verificación en vivo 9.3/9.5 completa (2026-07-29, con usuario QA):** TRACTOR y SILOS cotizan sin 422 (ambos con clamp activo, tasa efectiva = tasa_minima del pivot, tal como predijo el reporte de warnings); CHANCHERIAS (fuera de alcance) da 422 correctamente; filtro por ramo confirmado (Incendio 209 rubros incluye TRACTOR, MRC 18 no lo incluye). De paso se detectó y corrigió que el backend de la sesión de QA local era un proceso `node --watch` viejo que no había recogido el código nuevo — reiniciado. **Cambio completo, 29/29 tasks, mergeado a `main` (PR #38 y PR #39 — una segunda vuelta con un fix de test para CI). Sin confirmar todavía que el backend de la VPS (`api.cotizador.lat`, redeploy manual, sin CD) ya corre este código — el frontend en Vercel se auto-despliega en cada push a `main`, así que hasta que se redespliegue el backend a mano el selector de "Tipo de Riesgo" puede estar roto en producción para todos los ramos. Ver `docs/ESTADO_PROYECTO.md` sección 37.**

**MRC — texto de Cristales, exclusiones fuera del primer paso y límite de repetición de coberturas (2026-07-30), pusheado en `fix/historial-filtros-alineacion` (PR #43), sin mergear a `main` todavía.** Migración `045_texto_legal_cristales_mrc.sql` aplicada contra Supabase real (texto legal de "Cristales" que estaba `NULL`). Card de "Exclusiones" sacada del primer paso del cotizador (quedaba redundante). Límite de repetición de coberturas adicionales en MRC: por defecto 1 (antes era ilimitado), `robo_contenido` sigue permitiendo hasta 2 (excepción de negocio confirmada el 2026-07-13, no tocar sin que Kevin lo confirme explícitamente). 154/154 tests backend en verde, verificado en vivo con Playwright. Detalle completo en `docs/ESTADO_PROYECTO.md` sección 37.

**Nuevo permiso de rol `puede_ver_descuento_plan` (2026-07-31), verificado en vivo, PR sin abrir todavía.** Cambio SDD `permiso-ver-descuento-plan`, mismo patrón que `puede_editar_descuento_plan` (migración 048, ver arriba) con una divergencia intencional: `DEFAULT TRUE` en vez de `FALSE` — ningún rol pierde visibilidad al migrar. Migración `050_permiso_ver_descuento_plan.sql` aplicada contra Supabase real. Cuando un rol tiene `puede_editar_descuento_plan = false` (campo bloqueado) Y `puede_ver_descuento_plan = false`, el campo Descuento directamente no se renderiza en `frontend/cotizar/cotizar.js` (antes solo existía el estado bloqueado-y-visible con el hint "Descuento fijo del plan"). Puramente cosmético — `resolverDescuentos()` no lee esta columna. Checkbox nuevo en el modal de rol del panel admin. **Hallazgo real:** el rol `agente` es `es_sistema = true`, así que el panel admin bloquea editar sus permisos por UI (mismo gate que ya aplicaba a `puede_editar_descuento_plan`) — se ajustó por SQL directo, no por el panel, igual que se hizo en su momento con el sibling. Verificado en vivo con Playwright: usuario `agente` no ve el campo, usuario Admin sí lo ve editable, ambos obtienen el mismo premio calculado (el ocultamiento no afecta el cálculo). Kevin confirmó dejar `puede_ver_descuento_plan = false` para `agente` como estado final de producción. Detalle completo en `docs/ESTADO_PROYECTO.md` sección 41. Pendiente: abrir PR desde `sdd/permiso-ver-descuento-plan` (commit `36223f7`) hacia `main`.

**Roadmap pre-producción (auditoría integral 2026-07-24, detalle y sprints en `docs/ESTADO_PROYECTO.md` sección 30):** 4 sprints pendientes antes de lanzar sin restricciones — accesibilidad/errores silenciosos, mantenibilidad puntual, RLS/concurrencia/responsive, y sesión httpOnly + logging + modularización. Sprint 1 es condición dura antes de producción sin restricciones.

**Auditoría de performance de Claude Routines — issue #83 (2026-08-02), cerrado — PRs #88/#96/#97/#98/#99 mergeados a `main`.** El bug 🔴 más grave que reportó el issue (`actualizarCotizacion` sin rollback ante fallo parcial) resultó ya corregido desde el commit `e9a2e11` (2026-07-28) — el issue quedó desactualizado, analizó un snapshot previo a ese fix. PR #88: migración `051_indices_ramo_id_variante_id.sql` aplicada contra Supabase real (índices en `coberturas_catalogo.ramo_id`, `tasas_cobertura_ramo.ramo_id`, `cotizacion_ajustes.variante_id` — FKs de alto tráfico que la 033 no cubrió), fix de 9 tests que usaban `exports` en vez de `namedExports` en `t.mock.module` (Node 24). **Sesión de retoma (misma fecha, sesión posterior), los 4 hallazgos mecánicos restantes resueltos uno por PR:** #3 cache inconsistente (PR #96, `ramos.service.js` ahora usa `withCache` para rubros/catálogo de coberturas por ramo); #5 Puppeteer sin cierre limpio (PR #97, `closeBrowser()` + handlers `SIGTERM`/`SIGINT` en `server.js` — verificado en vivo contra la imagen real de producción en la VPS, contenedor descartable, no la Windows local que no recibe señales POSIX reales); #4 límite de `/cotizaciones` + `Promise.all` en `generarPdfOferta` (PR #98, nuevo `backend/src/schemas/cotizaciones.schema.js` con `limit` acotado 1-100); #8 cache compartido de `/ramos` en frontend (PR #99, nuevo `frontend/shared/catalogo.js` con `getRamos()` memoizado, reemplaza los 3 guards ad-hoc de `admin.js` y los fetches sueltos de `cotizar.js`/`historial.js` — verificado en vivo con Playwright). 166/166 tests backend en verde en cada PR. **Pendiente, deliberadamente fuera de esta sesión** (mismo criterio que `issue-84/pendientes`): #9, JS duplicado/módulos grandes en frontend (`admin.js`/`cotizar.js`).

**Auditoría de calidad de código — issue #84 (2026-08-02), cerrado por ahora — PRs #90/#91/#92/#93/#94 mergeados a `main`.** Resuelto: 3 archivos sin referencias eliminados, doc de CD corregida (README.md/docs/ARCHITECTURE.md), traducción de errores Postgres centralizada (`backend/src/utils/postgres-errors.js`), `calcularCostoEdificioYContenido` extraída a helper compartido entre `mrc.calculator.js`/`incendio.calculator.js` (duplicación verbatim, mismo patrón que el bug histórico VIVIENDA/VIVIENDA FAMILIAR), y `renderBanner`/shell del topbar extraídos a `frontend/shared/dom.js`/`shared/sidebar.js` (ya no duplicados en cotizar/historial/admin/configuración). Verificado en vivo con Playwright en cada paso. **Pendiente, decidido explícitamente NO abordar en modo rápido** (requiere sesión dedicada, más superficie de riesgo — ver memoria Engram `issue-84/pendientes`): `admin.js` `onActionClick` (~195 líneas, ~40 ramas) — **abordado 2026-08-02, ver entrada "Refactor — `onActionClick` de `admin.js` a dispatch table" más abajo** — y `renderModal` (~85 líneas) — **abordado 2026-08-02, PR #102** —, y funciones largas de `cotizar.js`/`historial.js` (`camposEspecificosParaRamo`, `renderResultadoView`, `armarRiesgoDatos`, `renderModalDetalle`) — **abordado 2026-08-02, PR #104, ver entrada más abajo. Con esto los 4 refactors grandes del issue #84 quedan cerrados.**

**Refactor — dividir `renderModal` en un renderer por tipo de usuario (2026-08-02), PR #102 mergeado a `main`.** Segundo de los 4 refactors grandes pendientes del issue #84. `renderModal` en `frontend/admin/admin.js` armaba los 3 cuerpos del modal de usuario (crear/editar/password) en un if/else de ~85 líneas — extraídos `renderCuerpoModalCrear`/`renderCuerpoModalEditar`/`renderCuerpoModalPassword` más un mapa `RENDERERS_MODAL_USUARIO`, `renderModal` queda como wrapper delgado. Sin cambios de comportamiento. Verificado en vivo con Playwright (usuario admin real): los 3 modales renderizan título y campos idénticos al previo. 166/166 tests backend en verde (frontend-only). Detalle completo en `docs/ESTADO_PROYECTO.md` sección 46.

**Refactor — `onActionClick` de `admin.js` a dispatch table (2026-08-02), PR #103 mergeado a `main`.** Tercero de los 4 refactors grandes pendientes del issue #84. `onActionClick` en `frontend/admin/admin.js` era un if/else en cascada de ~195 líneas sobre `el.dataset.action` (~40 ramas) — reemplazado por un objeto `ACTION_HANDLERS` (clave = nombre de acción, valor = handler) más `handleSeleccionarSeccion` extraída aparte (la rama más grande, con efectos secundarios de carga de datos por sección). `onActionClick` queda como un lookup + invocación de una línea. Sin cambios de comportamiento: mismos data-action, mismos efectos. 166/166 tests backend en verde (frontend-only). **Verificado en vivo con Playwright** contra usuario admin real (`qatest@test.com`, rol admin) tras reiniciar el backend local con `FRONTEND_URL=http://localhost:5000` como override de entorno (el `.env` real apunta a `https://cotizador.lat`, sin CORS para localhost — el backend se restauró a su configuración original al terminar, sin tocar el archivo `.env`): navegación entre las 5 secciones reales del sidebar (usuarios/coberturas/tasas/planes/ramos — `roles` NO es una sección propia, vive dentro de "usuarios"), apertura/cierre de modales (crear-usuario, crear-rol) vía Escape, `toggle-plan-activo`, `toggle-ramo-activo`, editar/cancelar nombre de ramo inline, y select de ramo en Coberturas — todo OK. De paso se detectó (no corregido, fuera de alcance) un 404 preexistente de `frontend/shared/config.js` (falta el archivo, solo existe `config.example.js`) sin relación con este refactor. Queda pendiente del issue #84: las funciones largas de `cotizar.js`/`historial.js` (`camposEspecificosParaRamo`, `renderResultadoView`, `armarRiesgoDatos`, `renderModalDetalle`) — próxima sesión continúa por ahí. CI falló una vez por formato (Prettier, línea de `cancelar-tasa-edificio-contenido`), corregido con `npx prettier --write frontend/admin/admin.js` (un solo archivo, no el repo completo).

**Refactor — unificar "editar inline" en `admin.js` (2026-08-02), PR #101 mergeado a `main`.** Cierra el ítem #6 del issue #84 (el más grande de los 5 pendientes, el único abordado hasta ahora). Las 6 variantes duplicadas de "editar inline" (nombre de ramo, prima técnica mínima, topes desc./recargo, tasa RPF, monto/franquicia, tasa edificio/contenido) quedaron unificadas en dos helpers compartidos — `campoInlineInput` (renderiza un `<input>`/`<select>` a partir de una descripción declarativa) y `renderCampoInline` (arma el wrapper de lectura o el `<form>` de edición según el estado) — más `habilitarEdicionInline`/`cancelarEdicionInline` para el toggle del Set de edición. Las funciones `guardar*` (validación, payload, endpoint) quedaron sin tocar a propósito, una por variante — ahí vive el comportamiento real distinto entre variantes. 6 commits, uno por variante, en orden de menor a mayor riesgo. Sin cambios de comportamiento observable: mismos permisos, mismo manejo de null, mismo formato, mismos endpoints. 166/166 tests backend en verde (cambio frontend-only). **Verificado en vivo con Playwright** contra 3 roles (admin literal, un rol con `puede_editar_planes`/`puede_editar_tasas` sin ser admin, y un rol sin `puede_editar_tasas`) — 19/19 aserciones en verde, incluyendo el caso de mayor riesgo (dos filas de monto/franquicia editadas simultáneamente sin cruce de `data-id`). **Nota de proceso:** la verificación en vivo mutó temporalmente datos reales de Supabase (plan "PLAN TAJY PREMIUM", id=1) por un bug en el script de QA (locators de Playwright que perdían la fila correcta al entrar en modo edición) — se detectó, se restauró el valor de seed original (migración `008_seed_planes_auto.sql`) y se confirmó por SQL que todo quedó como estaba antes de la prueba. CI falló una vez por formato (Prettier) — corregido en un commit aparte, sin tocar otros archivos (ver nota de gotcha: `npx prettier . --write` sin acotar a un archivo reformatea el repo entero de forma no intencional, usar siempre `npx prettier --write <archivo>` para cambios puntuales).

**Refactor — funciones largas de `cotizar.js`/`historial.js` (2026-08-02), PR #104 mergeado a `main`.** Cuarto y último de los 4 refactors grandes del issue #84 — con este PR el issue queda completamente cerrado. `armarRiesgoDatos`/`camposEspecificosParaRamo` en `frontend/cotizar/cotizar.js` (dispatch if/else por ramo `mrc`/`incendio`/`vida-ap`) extraídos a una función por ramo, invocadas desde un `switch` con `case` literales (no un dispatch table por objeto — ver el gotcha de CodeQL más abajo). `renderResultadoView` dividida en `renderResultadoVacio`/`renderResultadoCompleto` (no era dispatch por ramo, sino dos estados del mismo template — vacío/sin preview vs. resultado calculado). `renderModalDetalle` en `frontend/historial/historial.js` dividida en `renderCuerpoModalDetalle` (cuerpo: loading/error/cargado, variantes y coberturas) + el wrapper que arma el shell del modal, mismo patrón que el refactor de modal de `admin.js` (PR #102). Sin cambios de comportamiento. 166/166 tests backend en verde (frontend-only). **Verificado en vivo con Playwright** cubriendo los 8 branches de ramo reales (MRC-NORMAL/SEGUCOOP, Incendio en sus 4 variantes — HIPOTECARIO y CON INSPECCION del tipo `objeto_riesgo`, MAQUINARIA BASICO, y el plan legacy "INCENDIO - EDIFICIO Y CONTENIDO" que ejercita el branch default edificio/contenido — y Vida-AP en sus 3 variantes: PROTECCION FAMILIAR, ACCIDENTES PERSONALES con y sin el checkbox de renta diaria) más el modal de detalle en Historial — cero errores de consola en cualquiera de los casos (los únicos rechazos fueron validaciones de negocio esperadas por valores de prueba fuera de rango: capital máximo de Maquinaria, mínimo de 3 coberturas de SEGUCOOP, tope de renta diaria del 1‰ — no bugs del refactor). **Hallazgo de la sesión:** Incendio y Vida y Accidentes Personales estaban con `ramos.activo = false` en la base real (quedaron así de otra sesión de QA, no es el estado de negocio real — ver "Fase 6/7 cerrada a nivel de negocio" más arriba, ambos ramos operan end-to-end) — se activaron temporalmente vía el panel admin para poder probarlos en vivo y se revirtieron a su estado original al terminar; el intento de togglearlos fue bloqueado una vez por el clasificador de auto-mode (acción sobre datos reales de producción) hasta confirmación explícita de Kevin. **Gotcha nuevo de rate limit:** `loginRateLimiter` (`backend/src/middleware/rate-limit.js`) permite 10 logins/15min por IP+email — un script de Playwright que se loguea de cero en cada caso de prueba lo agota rápido; la solución es loguearse una sola vez y reusar la misma sesión de browser para todos los casos de una corrida. **Gotcha nuevo de CI — CodeQL rechaza dispatch tables por objeto.** El primer intento de este refactor (como los de `admin.js`) usó dispatch tables (`ARMAR_RIESGO_DATOS_POR_RAMO`/`CAMPOS_ESPECIFICOS_POR_RAMO`) — el check `CodeQL` (regla `js/unvalidated-dynamic-method-call`) lo marcó como severidad alta porque `state.ramoId`/`ramo.nombre` cuentan como "user-controlled" para su análisis de taint (aunque en la práctica solo pueden ser los valores fijos hardcodeados en `RAMOS_UI`). Se probaron 3 mitigaciones — `hasOwnProperty`, tabla con `Object.create(null)` + `typeof === 'function'` — y ninguna satisfizo el check; la única que pasó fue reemplazar el dispatch table por un `switch` con `case` literales (llama directo a la función nombrada, sin invocación dinámica por clave). Para cualquier dispatch futuro sobre un valor con origen en `dataset`/DOM, preferir `switch`/if-else con comparaciones literales por sobre un objeto de lookup.

**Plan `admin-module-split` — dividir `frontend/admin/admin.js` en 10 PRs (issue #83/#84 finding #9, distinto de la auditoría de calidad ya cerrada arriba).** PR1-4 mergeados a `main` (`state.js`+`secciones.js`, `render/campos-inline.js`, `render/usuarios.js`, `render/modales-usuario.js`). **PR5 — `render/planes.js` extraído (2026-08-02), PR #110 mergeado a `main`.** Pure move de `renderPlanes` (exportada) + 7 funciones privadas (`renderTablaPlanes`, `renderFormasPagoDelPlan`, `esPlanSoloUsd`, `renderCampoNombrePlan`, `renderCampoPrimaTecnicaMinima`, `renderCampoTopes`, `renderCampoTasaRpf`), sacado el import muerto de `fmtUsd` que quedó sin uso en `admin.js`. Sin cambios de comportamiento. 166/166 tests backend en verde. **Verificado en vivo con Playwright** (usuario admin real): tabla de Planes, filtro por ramo, expandir Formas de pago, edición inline de Prima técnica mínima y de Topes desc./recargo — todo OK, cero errores de consola reales. Mismo gotcha de CORS que PR3/PR4 (backend local con `FRONTEND_URL` de producción, reiniciado con override y restaurado al terminar). Sigue PR6 (`render/tasas.js` + `render/ramos.js`) del plan de 10. Detalle completo en `docs/ESTADO_PROYECTO.md` sección 49.

**Fase 1 de Auto (schema base, importador de tasas) sigue como estaba** — pausado, no se retoma hasta que el cliente lo pida.

## Versionado y despliegue automáticos (agregado 2026-08-02)

- **`release-please`** (`.github/workflows/release-please.yml`, `release-please-config.json`, `release-type: simple`) corre en cada push a `main`: abre/actualiza un PR de release, y al mergearlo genera tag (`vX.Y.Z`), entrada en `CHANGELOG.md` y release de GitHub. Es rutina de CI — no requiere acción manual salvo mergear ese PR. `backend/package.json` no se actualiza por este mecanismo (queda en `0.1.0`); no confundir esa versión con el tag real del repo.
- **`.github/workflows/deploy-backend.yml`** despliega el backend automáticamente a la VPS en cada push a `main` (`reset --hard`, no `merge --ff-only` — decisión tomada tras un fix de CI, ver `docs/ESTADO_PROYECTO.md`). Esto reemplaza el flujo anterior de redeploy manual — verificar este workflow antes de asumir que un cambio de backend no llegó a producción.

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
- ~~RLS en Supabase: 30 tablas de `public` sin RLS~~ — **resuelto 2026-07-30.** Activado en las 34 tablas marcadas CRITICAL (migración `046_enable_rls_public_tables.sql`, aplicada contra Supabase real), sin policies (default-deny para anon/authenticated). Backend usa `SUPABASE_SERVICE_KEY` (service_role, bypasea RLS) y no hay ningún cliente Supabase en el frontend, así que no rompió nada — advisor de seguridad en 0 CRITICAL, 154/154 tests backend en verde.
- **Migraciones 043/044 (rubro_actividad_ramo + tasas de Incendio por rubro) YA APLICADAS contra Supabase real (2026-07-29)**: el filtro por `ramo_id` ya funciona a nivel de datos. El backend ya exige `ramo_id` en el código y ya está mergeado a `main` (PR #38/#39), junto con el frontend que lo envía. **Falta confirmar que el backend de la VPS (`api.cotizador.lat`) fue redesplegado a mano con este código** — no hay CD automático para el backend, y Vercel sí auto-despliega el frontend en cada push a `main`, así que hay una ventana en la que ambos lados pueden estar desincronizados en producción. Verificación en vivo 9.3 (cotizar rubros nuevos sin 422) ya completada contra un entorno de QA — pendiente confirmar contra la VPS real.
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

### Supabase MCP

Existe un MCP conectado al proyecto de Supabase.

Utilizarlo para:

- inspeccionar tablas
- consultar esquema
- revisar migraciones
- validar cambios antes de modificar SQL

Evitar recorrer el proyecto manualmente cuando estas herramientas proporcionen la información necesaria.
