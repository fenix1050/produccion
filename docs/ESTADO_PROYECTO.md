# Estado del proyecto — Cotizador Aseguradora Tajy

Documento de traspaso. Complementa a `CLAUDE.md` (contexto operativo y metodología) y
`PLAN_DESARROLLO.md` (arquitectura completa, schema y reglas de negocio) — no los reemplaza.
Este archivo responde una pregunta puntual: **¿qué se hizo, por qué, y qué falta, en este
momento del desarrollo?**

Última actualización: **2026-07-23 — Fase 6/7 sigue cerrada a nivel de catálogo/datos, pero el
frontend y el panel admin recibieron iteraciones reales ya commiteadas**. Además de lo ya cerrado
hasta 2026-07-20, hoy también están reflejados: migración visual completa al app shell
"Diseño 2" (2026-07-21), rediseño de las vistas Datos/Detalle del plan de MRC, nueva pantalla de
bienvenida post-login con selector de ramo (2026-07-22), Carta Oferta de MRC ajustada a tamaño
Oficio real, pulido visual del Historial, y hardening del panel admin (2026-07-23) con guard real
para que ningún rol no-admin pueda modificar usuarios admin. Pendientes activos: calculadores de
Incendio y Vida/AP, templates de Carta Oferta para esos 2 ramos, y textos legales faltantes en 3
coberturas de MRC.

**Nota (2026-07-31):** este párrafo queda como registro histórico de la sesión en que se escribió
(mismo criterio que las correcciones de las secciones 37 y 40) — no se reescribe para no perder el
contexto de esa fecha. Para el estado real más reciente, ver la sección 40 ("Corrección de estado")
y, antes que nada, `README.md` (tabla de ramos y migraciones) y `CLAUDE.md`, que sí se mantienen
al día en cada sesión.

**Nota para trabajar desde otra PC:** `docs/insumos/` (Excels/PDFs con tasas reales y
cotizaciones de clientes) y `.codegraph/` están en `.gitignore` — no vienen en el `git clone`.
Copiá `docs/insumos/` a mano a la otra máquina, y recreá `backend/.env` con
`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (tampoco se versiona). Corré `codegraph init .` de nuevo
ahí si querés tener el índice disponible.

---

## 1. Resumen ejecutivo

**Base funcional cerrada + iteración visual/operativa activa (último cambio verificado: 2026-07-23)**
— MRC sigue operativo end-to-end; Incendio y Vida/AP siguen listos en datos pero sin calculador;
encima de esa base ya se consolidaron cambios reales de UX, navegación y seguridad/admin.

- **Priorización confirmada (2026-07-10):** MRC → Incendio → Vida/AP (Auto pausado).
- **Catálogos cerrados (2026-07-10/12):** 3 ramos con coberturas, tasas y planes cargados contra
  Supabase (migraciones 012/013/015/016).
- **MRC end-to-end (2026-07-13):** calculador implementado para plan Normal, Carta Oferta en PDF
  con layout dinámico (2026-07-15), coberturas adicionales repetibles, calcular en vivo.
- **Panel admin Fase 5 (2026-07-19):** CRUD de usuarios con roles configurables (migración 031),
  permisos granulares por sección (usuarios/coberturas/planes/tasas), editor de tasas por Tipo
  de Riesgo (rubros_actividad), tope de descuento/recargo por usuario.
- **Historial Fase 5 (2026-07-19):** listado con filtros (ramo/cliente/fecha/estado), paginación,
  detalle, descarga de PDF (MRC), permisos por dueño (IDOR cerrado), edición con ventana de 30 días.
- **Migración visual "Diseño 2" cerrada (2026-07-21):** app shell completo migrado al mockup
  aprobado por Kevin (`75791d0`, `2b2e1b7`, `5958c0c`) — topbar, sidebar, cards y vistas de
  cotizar/historial/admin/configuración. El porqué fue explícito: hacer la app más clara y agradable
  para uso real, no seguir con un look "de sistema viejo".
- **Cotizador MRC rediseñado por iteraciones reales (2026-07-21/22):** vista Datos con cards,
  stepper y panel "Cotización en vivo" más claro (`c4d5e46`, `5173166`, `1f9b4aa`), Detalle del
  plan reordenado en layout 2 columnas y después en card de resumen fija (`b9746d2`, `70686b9`),
  y exclusiones del plan visibles ya desde Datos (`b62355e`). Motivo: Kevin vio la pantalla real,
  la consideró visualmente floja, y pidió dejar de parecer un reporte gris para pasar a una UI más
  legible para el agente.
- **Bienvenida post-login (2026-07-22/23):** nueva pantalla intermedia `frontend/bienvenida/`
  (`f3e1682`, `e3cd3aa`) para separar "Cotizar" de "Propuesta Formal", elegir ramo antes de entrar
  a `/cotizar`, y mostrar acceso al admin solo cuando el usuario tiene permiso real.
- **Carta Oferta MRC afinada para impresión real (2026-07-22):** el PDF pasó a tamaño Oficio/Legal
  (`f38f0e7`) porque A4 no coincidía con la impresión real reportada por drivers paraguayos; se
  ajustó también el footer con agente/email y se limpió texto decorativo sobrante.
- **Panel admin endurecido (2026-07-23):** acceso movido al menú de perfil, borrado de usuarios/
  roles sin uso y guard de seguridad real para proteger al usuario admin (`db8a1d2`). Esto no fue
  cosmético: Kevin detectó un hueco real donde un rol custom con permisos de usuarios podía tocar al
  admin verdadero.
- **Bugfixes críticos (2026-07-18/19):** Inicial/Cuota corregidos (hacia ABAJO), redondeo RPF/IVA
  hacia arriba confirmado, ownership de cotizaciones validado real en 403.
- **Supabase real conectado:** migraciones 001→031 aplicadas, 14 usuarios/planes configurados,
  RLS deshabilitado (no explotable hoy, documentado como deuda técnica).
- **Datos confirmados vs. pendientes:** RPF de Incendio/Vida-AP ✅, Prima Técnica Mínima ✅,
  Calculadores pendientes (solo lógica, datos 100% confirmados).

## 2. Estructura del código

```
/backend
  /src
    /routes            admin-tasas, cotizaciones, planes, ramos
    /controllers        cotizaciones, ramos, tasas
    /services            cotizacion, ramos, tasas
    /repositories         cotizaciones, ramos, tasas
    /calculators          auto y mrc (completos), + 6 stubs (auto-flota, incendio, hogar,
                           tro, transporte, vida-ap) que lanzan error explícito si se invocan
    /repositories/coberturas.repository.js  nuevo (2026-07-13) — coberturas_catalogo,
                           tasas_cobertura_ramo y rubros_actividad para MRC/Incendio
    /schemas               auto, tasas, mrc
    /config                 supabase.js (cliente)
    .env                    local — NO versionado (.gitignore ya lo cubre)
  /migrations             001 a 031, ver sección 4

/frontend
  /bienvenida            pantalla post-login para elegir acción/ramo
  /cotizar               flujo MRC con stepper, panel en vivo y rediseño "Diseño 2"
  /historial             listado real con filtros, detalle y descarga de Carta Oferta
  /admin                 SPA operativa con usuarios, roles, coberturas, tasas y planes
  /configuracion         vista visual alineada al mismo app shell
  /shared                sidebar/topbar, auth/fetch wrappers, iconos y estilos comunes

/docs
  /insumos                manuales de suscripción (Incendio/Hogar/Comercio/TRO, Riesgos
                           Diversos, Vida y AP) + propuestas manuales reales ya recibidas por
                           Kevin (GT S.A., Grupo Seguridad Electrónica Paraguay, COFUDEP, etc.)
                           — insumo para el catálogo de coberturas de MRC/Incendio, próximo paso
```

Coincide con lo que describe `CLAUDE.md`. `backend/src/templates/` YA existe para Carta Oferta de
MRC (layout compartido + template de ramo); siguen pendientes los templates de Incendio/Vida-AP y
la Propuesta Formal.

## 3. Motor de cálculo de Auto individual (Fase 1, sin cambios en esta sesión)

Cerrado y auditado — ver detalle completo en el historial de este documento o en
`PLAN_DESARROLLO.md` sección 5. Resumen: fórmula Prima/RPF/IVA/Premio/Cuota implementada en
`auto.calculator.js`, 4 formas de pago simultáneas, franquicia dual por vía de importación.
Plan Básico (tasa única 1,64%) sigue sin implementar — pendiente #4 de la sección 11 de
`PLAN_DESARROLLO.md`, no bloqueante para Fase 6.

## 4. Schema SQL (`backend/migrations/`)

| #   | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | Usuarios y permisos                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 002 | Ramos, planes, formas de pago, `plan_formas_pago`                                                                                                                                                                                                                                                                                                                                                                                                             |
| 003 | Catálogo de coberturas + FK circular con `planes` (resuelta con ALTER)                                                                                                                                                                                                                                                                                                                                                                                        |
| 004 | Tarifación: `tasas_capital`, `rubros_actividad`, `tasas_cobertura_ramo`                                                                                                                                                                                                                                                                                                                                                                                       |
| 005 | Cotizaciones, variantes, plan de pago, `correlativos`                                                                                                                                                                                                                                                                                                                                                                                                         |
| 006 | Auto Flota (vehículos por cotización)                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 007 | KYC / PLA-FT                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 008 | Seed de los 5 planes de Auto con valores reales confirmados                                                                                                                                                                                                                                                                                                                                                                                                   |
| 009 | Función Postgres `siguiente_correlativo` (incremento atómico)                                                                                                                                                                                                                                                                                                                                                                                                 |
| 010 | Columna `planes.codigo_tasa` + mapeo a los 4 códigos del Excel de tasas                                                                                                                                                                                                                                                                                                                                                                                       |
| 011 | `cotizacion_coberturas`: agrega `tipo_aplicacion` (`cobertura`/`sublimite`, CHECK constraint), `sublimite_porcentaje`, `sublimite_monto_maximo` — schema para la regla "cobertura vs. sublímite" de MRC/Incendio. **Sin uso hoy**: el diseño que representaba se descartó el 2026-07-13 (ver sección 17 y pendiente #11 de `PLAN_DESARROLLO.md`) y la tabla `cotizacion_coberturas` en sí todavía no se escribe desde ningún lado del backend (ver sección 8) |
| 012 | Seed de catálogo de coberturas, tasas y planes de MRC — ver sección 9                                                                                                                                                                                                                                                                                                                                                                                         |
| 013 | Seed de catálogo de coberturas, tasas y planes de Incendio — ver sección 10                                                                                                                                                                                                                                                                                                                                                                                   |
| 014 | Fix de fiabilidad: plan `INCENDIO - EDIFICIO Y CONTENIDO` marcado `activo = FALSE` hasta confirmar su RPF                                                                                                                                                                                                                                                                                                                                                     |
| 015 | Seed de catálogo de coberturas, tasas (`tarifas_generico`, JSONB) y planes de Vida y Accidentes Personales — ver sección 12                                                                                                                                                                                                                                                                                                                                   |
| 016 | Fix de fiabilidad sobre la 015: unifica nombres de clave JSONB inconsistentes, completa un `edad_min` faltante, agrega filas de tarifa para 5 coberturas que no tenían ninguna — ver sección 12                                                                                                                                                                                                                                                               |
| 017 | Agrega `planes.texto_exclusiones_generales` y `planes.texto_sublimites_generales`, cargados para `MULTIRRIESGO COMERCIO - NORMAL` — ver sección 15                                                                                                                                                                                                                                                                                                            |
| 018 | Agrega `planes.responsabilidad_maxima_cotizable` (tope de suma asegurada cotizable), cargado para `MULTIRRIESGO COMERCIO - NORMAL` (Gs. 7.200.000.000) — ver sección 15                                                                                                                                                                                                                                                                                       |
| 019 | Rename de 12 coberturas de MRC a la nomenclatura real del sistema de escritorio, acotado por `ramo_id='mrc'` — ver sección 16                                                                                                                                                                                                                                                                                                                                 |
| 020 | Agrega la cobertura `robo_valores_ventanilla` al catálogo de MRC (tasa 10‰) y la columna `coberturas_catalogo.incluye_en_suma_asegurada_total` — ver sección 17                                                                                                                                                                                                                                                                                               |
| 021 | Corrige `planes.texto_sublimites_generales` de `MULTIRRIESGO COMERCIO - NORMAL`: agrega 3 sub-límites faltantes y corrige el monto de Daños por Granizo — ver sección 17                                                                                                                                                                                                                                                                                      |

**Estado real contra Supabase (verificado 2026-07-13 vía MCP):** 001→021 corridas y confirmadas.
`ramos` 8 filas, `planes` 16 (5 Auto + 2 MRC + 2 Incendio + 7 Vida/AP), `coberturas_catalogo` 31
filas (15 MRC + 5 Incendio + 11 Vida/AP — Auto no usa esta tabla), `tarifas_generico` 44 filas
(todas de Vida/AP — único ramo que usa esta tabla hasta ahora).

## 5. Endpoints implementados

Conectados punta a punta:

- `GET /api/ramos`
- `GET /api/ramos/rubros-actividad` (nuevo, 2026-07-13 — lista `rubros_actividad` para el
  formulario de riesgo de MRC/Incendio, filtrable por `?grupo=`)
- `GET /api/ramos/:id/planes`
- `GET /api/planes/:id/coberturas`
- `POST /api/cotizaciones/calcular` (ramo `mrc` ya calcula real vía `mrc.calculator.js`; Auto
  sigue como en Fase 1; Incendio/Vida-AP siguen en stub)
- `POST /api/cotizaciones`
- `GET /api/cotizaciones`
- `GET /api/cotizaciones/:id`
- `POST /api/admin/tasas/importar`

Stub / no implementados, cada uno con TODO explícito en el código:

- `GET /api/planes/:id/servicios`
- `GET /api/ramos/:id/descuentos` `/recargos` `/clausulas`
- `GET /api/cotizaciones/:id/pdf-oferta` → Fase 2/4
- `POST /api/cotizaciones/:id/aceptar`, `GET /api/cotizaciones/:id/pdf-propuesta` → Fase 4
- CRUD `/api/admin/coberturas` → no existe aún
- Calculadores `incendio.js` / `vida-ap.js` → stubs, bloqueados por el Excel de tasas/RPF del
  dpto. técnico (pendiente #10, sección 11 de `PLAN_DESARROLLO.md`). `mrc.js` ya implementado
  (ver sección 1 y 14).

## 6. Decisiones tomadas en esta sesión (con motivo)

1. **Se armó el schema de MRC extendiendo tablas existentes, no creando tablas nuevas.**
   Al revisar `PLAN_DESARROLLO.md` sección 4 contra el schema real, se confirmó que
   `coberturas_catalogo`, `tasas_cobertura_ramo`, `rubros_actividad` y el ramo `mrc` ya estaban
   creados desde Fase 1 — son genéricos y compartidos entre Incendio/MRC/TRO por diseño. Solo
   faltaba la regla "cobertura vs. sublímite" en `cotizacion_coberturas`, que se agregó con la
   migración 011 (ALTER TABLE, no una tabla nueva).

2. **Se conectó Supabase real y se corrieron las migraciones antes de tocar el catálogo de
   coberturas.** Motivo: si el catálogo se cargaba antes de confirmar que el schema aplica
   limpio, un error de sintaxis en la migración se mezclaría con errores de datos del catálogo,
   complicando el debug. Al conectar, se descubrió que las migraciones 001→010 (Fase 1, Auto)
   **ya estaban aplicadas** contra este proyecto de una sesión anterior no registrada en este
   documento — la migración 011 fue la única pendiente, y también apareció ya aplicada al
   intentar correrla (alguien la había corrido directo contra la base); se verificó columna por
   columna que coincide exacto con la definición del plan.

3. **`backend/.env` se creó con la URL de Supabase, pero la `SUPABASE_SERVICE_KEY` la cargó
   Kevin directamente, sin pasar por el chat.** Motivo: es una service_role key (permiso total,
   bypassea RLS) — pegarla en la conversación queda registrada en logs/transcripts, lo cual es
   una fuga de credenciales evitable. El archivo ya está cubierto por `.gitignore` (`.env` y
   `.env.local`), confirmado antes de escribirlo.

## 7. Riesgo de seguridad detectado — RLS deshabilitado (no resuelto, requiere decisión de Kevin)

Al listar las tablas del proyecto Supabase real vía MCP, las **30 tablas de `public` tienen Row
Level Security deshabilitado** (re-confirmado 2026-07-23 vía `get_advisors`/`list_tables`; sube
de 29 a 30 porque la migración 031 sumó la tabla `roles`, que tampoco tiene RLS). Esto significa
que si alguna vez se usa la clave `anon`/`publishable` de este proyecto desde el frontend (o
cualquier cliente que no sea el backend con la `service_role` key), esa clave podría leer o
escribir cualquier fila de cualquier tabla sin restricción.

**No es explotable hoy:** `CLAUDE.md` establece como regla no negociable que el frontend nunca
habla directo con Supabase, todo pasa por la API Express. Mientras esa regla se respete, el
riesgo es teórico. Se señala igual como deuda técnica porque:

- Es fácil de romper sin darse cuenta (alguien agrega un fetch directo a Supabase desde el
  frontend "para ir más rápido").
- Activar RLS sin políticas bloquea todo el acceso — no se puede aplicar sin diseñar las
  políticas primero, así que requiere una sesión dedicada, no un fix de una línea.

**No se tocó nada de esto todavía.** Queda pendiente decidir con Kevin cuándo abordarlo (no
bloquea Fase 6).

### Migración 033 (2026-07-23) — índices FK e hijacking de `search_path`

Auditoría de schema (30 tablas, 32 migraciones) detectó dos hallazgos adicionales, ambos
corregidos vía `mcp__supabase__apply_migration`:

- **Índices faltantes en foreign keys de alto tráfico**: `cotizaciones.ramo_id`,
  `cotizaciones.estado`, `cotizacion_coberturas.cotizacion_id`,
  `cotizacion_variantes.cotizacion_id`. Para `cotizaciones.agente_id` se usó un índice
  **compuesto** `(agente_id, created_at DESC)` en vez de uno suelto: `findCotizaciones`
  (`backend/src/repositories/cotizaciones.repository.js`) siempre ordena por `created_at DESC`,
  y `cotizacion.service.js` siempre filtra por `agente_id` cuando el usuario no es admin — el
  compuesto cubre filtro + orden sin sort adicional para ese caso, que es el más frecuente
  (agente viendo su propio historial).
- **`siguiente_correlativo` sin `search_path` fijo** (lint de seguridad de Supabase, riesgo de
  hijacking de search_path): `ALTER FUNCTION siguiente_correlativo(int) SET search_path = public`.

Verificado con `get_advisors`: el lint de `search_path` ya no aparece en `security`; los índices
nuevos aparecen como `unused_index` en `performance` (esperado, INFO, recién creados sin tráfico
todavía). RLS sigue igual, sin cambios (ver arriba).

## 8. Pendientes abiertos

- **Carta Oferta de MRC en PDF — implementada (2026-07-14/15)**: el texto oficial recibido el
  2026-07-13 ya se usa en el template de MRC. Ver secciones 18 y 19. Quedan pendientes los
  templates de Carta Oferta para Incendio y Vida/AP, porque requieren su texto oficial específico.
- **RLS deshabilitado** en las 30 tablas — ver sección 7, requiere decisión de Kevin antes de
  actuar.
- **`cotizacion_coberturas` resuelto (2026-07-13)** — `crearCotizacion` ahora persiste ahí el
  detalle de coberturas devuelto por el calculador (snapshot de nombre/texto legal/exclusiones
  desde `coberturas_catalogo`, con guard porque hoy solo `mrc.calculator.js` devuelve
  `coberturas`), incluida la franquicia elegida por el agente por cobertura
  (`riesgo_datos.franquicias_por_cobertura`, codigo -> monto, indexado por código igual que
  `state.franquiciasPorCobertura` en el frontend — si se repite un código con distinta suma
  asegurada, comparten la misma franquicia elegida). Verificado end-to-end contra Supabase.
- **RPF de Incendio y Vida/AP — resuelto (2026-07-13, migración 023).** Kevin confirmó contra
  el sistema real: RPF plano Contado 0% / Cobrador 1,6% / Boca de Cobranza 1,35% / Tarjeta 1%,
  igual para TODOS los planes de ambos ramos, fijo (no varía por cantidad de cuotas) — mismo
  criterio que MRC. El manual de suscripción `M-08OP-GT-01` (Incendio/Hogar/Comercio/TRO, Anexo 3) trae una tabla de R.P.F. distinta por cuotas; Kevin confirmó que NO se usa, prevalece el
  valor plano. Cargado para los 2 planes de Incendio ("Maquinaria Básico" ahora con las 4
  formas de pago habilitadas, antes solo tenía Contado/Cobrador) y los 7 de Vida/AP (ninguno
  tenía `plan_formas_pago` hasta ahora). "INCENDIO - EDIFICIO Y CONTENIDO" se reactivó
  (`activo = TRUE`) con Prima Técnica Mínima Gs. 409.091 — el manual transcribe Gs. 409.909 pero
  Kevin confirmó que el valor correcto es el mismo ya cargado para MRC Normal. **Vida/AP no
  recibió prima técnica mínima**: Kevin confirmó que por el momento ese ramo no maneja ese piso
  (decisión, no dato pendiente) — `vida-ap.calculator.js` no debe exigirla como hace
  `mrc.calculator.js`. Con esto **ya no bloquea** escribir `incendio.calculator.js` /
  `vida-ap.calculator.js` — falta la lógica en sí, no los datos (pendiente #10, sección 11 de
  `PLAN_DESARROLLO.md`, a actualizar). El plan "Comercio Protección Total" de MRC sigue sin RPF
  confirmado (fuera del alcance de esta migración) — ver migración 022, ya desactivado.
- Franquicia de Importación Directa (Auto, Fase 1) sigue hardcodeada como constante — pendiente
  de Fase 2, no se toca mientras esa fase esté pausada.
- Plan Básico (Auto, Fase 1) no distinguido en el calculador — mismo estado, pausado con Fase 2.
- Panel admin de edición manual de tasas (Auto, Fase 1/5) — decisión tomada, sin diseñar.
- **Panel admin para configurar coberturas fijas/tasas por ramo (pedido 2026-07-13, Fase 5)**: tras
  implementar las "coberturas adicionales" de MRC (sección 16), Kevin pidió que un usuario con rol
  admin pueda definir desde el panel admin (a) qué coberturas quedan fijas/predeterminadas por
  ramo (hoy `incendio_edificio`/`incendio_contenido` está hardcodeado en `mrc.calculator.js` vía
  las constantes `CODIGO_INCENDIO_EDIFICIO`/`CODIGO_INCENDIO_CONTENIDO`) y (b) las tasas de
  `tasas_cobertura_ramo` por si varían en el futuro (hoy solo se cargan por migración SQL). No se
  empieza hasta Fase 5 — se decidió explícitamente no adelantarla (ver CLAUDE.md, metodología de
  fases). **Actualización 2026-07-15**: el plan de implementación ya está diseñado y aprobado en
  alcance con Kevin — ver `docs/PLAN_ADMIN_FASE5.md` (auth JWT propio obligatorio para toda la
  app, coberturas por defecto POR PLAN vía `plan_coberturas.incluida_por_defecto`, tasas editadas
  por versionado con INSERT, CRUD de usuarios/roles). Queda pausado hasta llegar a Fase 5.

## 9. Catálogo de coberturas de MRC — CERRADO (migración 012, 2026-07-10)

El manual "Riesgos Diversos" (`docs/insumos/`) resultó no tener sección de MRC/Incendio (es
escaneado, cubre Transporte/Robo/Cristales/RC/Equipos Electrónicos). El catálogo real se
construyó a partir de dos fuentes que sí tenían los datos:

- `docs/insumos/Version 01 - Calculo Varios.xlsx` (pestañas DATOS/MRC/TIPOS DE RIESGOS): tasas
  ‰ reales por cobertura y la tabla completa de `rubros_actividad` (49 rubros, tasa_edificio/
  tasa_contenido/categoría A-I, grupo MRC vs TRO).
- Texto legal y configuración real copiados por Kevin directo del sistema de escritorio de Tajy
  (pantallas "Configuración para Cotizador" y "Coberturas") para los dos planes de MRC.

**Cargado en Supabase:** 49 `rubros_actividad`, 14 `coberturas_catalogo` (9 principales + 5
sublímites), 13 `tasas_cobertura_ramo`, 2 `planes` (`MULTIRRIESGO COMERCIO - NORMAL` y
`COMERCIO PROTECCION TOTAL`), RPF confirmado solo para el plan Normal, montos de sublímite por
plan en `plan_coberturas`.

**Decisión de modelado confirmada con Kevin:** los 6 riesgos nombrados en el texto legal
(Rayo/Explosión, Huracán, Tumulto/Huelga, Caída de Aeronaves, Impacto de Vehículos, Humo y
Hollín) son la redacción de qué cubre la cobertura "Incendio" — no son 6 coberturas cobrables
por separado. El catálogo tiene 3 líneas de Incendio (edificio 1‰, contenido 2‰, mobiliario y
equipos 0,65‰) porque esas sí tienen tasa y suma asegurada propias.

**Pendiente, no bloqueante:**

- Tasa de `sublimite_cctv` (Circuito Cerrado de TV) — no está en el Excel, catálogo cargado sin
  tasa.
- Configuración de cotizador (prima técnica mínima, descuento/recargo máximo, RPF) del plan
  `COMERCIO PROTECCION TOTAL` — el sistema de escritorio no tiene esa pantalla configurada para
  este plan, a confirmar con Kevin cómo se cotiza hoy.
- `rubros_actividad`: 4 rubros (SILOS, CONSULTORIO MEDICO, CHANCHERIAS, GRANJA EN GENERAL)
  quedaron con `grupo = NULL` — su nombre no matcheaba exacto contra la pestaña TIPOS DE
  RIESGOS del Excel, no se adivinó si son MRC o TRO.
- Excepción regional (Itapúa/Alto Paraná: franquicia 10% mín. Gs. 500.000 para Caída de Rayo)
  no está modelada en el catálogo — es una variable de ubicación de la cotización, se resuelve
  en el motor de cálculo cuando se escriba `mrc.calculator.js`, no en el catálogo.

## 10. Catálogo de coberturas de Incendio — CERRADO (migración 013, 2026-07-10)

El ramo `incendio` ya existía (migración 002) y comparte `coberturas_catalogo`,
`tasas_cobertura_ramo` y `rubros_actividad` con MRC — no se creó tabla nueva ni se volvió a
cargar `rubros_actividad` (se reutiliza tal cual, ya tiene 49 filas desde la migración 012).

**Fuentes usadas** (orden de confiabilidad):

- 4 cotizaciones reales de Incendio ya emitidas por Tajy (`docs/insumos/`): GT S.A.
  (2026-05-28, Incendio Contenido, Depósito), Distribuidora Múltiples Productos (2026-07-03,
  Edificio y Contenido, producción de quesos), COFUDEP (2026-07-08, Edificio y Contenido +
  sublímite fenómenos naturales 50% en estacionamiento), Robin Hut Heil (2026-06-18, Edificio y
  Contenido, porqueriza, + sublímite fenómenos naturales 50%). De ahí salieron los textos de
  coberturas/exclusiones reales y la confirmación de que el modelo es "Incendio simple":
  Incendio de Edificio + Incendio de Contenido, tarifado por rubro de actividad.
- Pestaña `INCENDIO` de "Version 01 - Calculo Varios.xlsx": ejemplo de cálculo real (rubro
  NEGOCIO - VIVIENDA, categoría E) que confirma que la tasa sale de
  `rubros_actividad.tasa_edificio` / `tasa_contenido` — la misma tabla ya cargada para MRC, sin
  una tasa fija propia en `tasas_cobertura_ramo` para estas dos coberturas.
- Dato dictado por Kevin en sesión anterior (2026-07-10): plan "Maquinaria Básico" (moneda USD,
  tasa única 0,7% = 7‰, responsabilidad máxima asegurable Usd. 5.000.000, prima técnica mínima
  100, descuento máximo 10%, recargo máximo 100%, RPF Contado 0 / Cobrador 1,6 / Boca de
  Cobranza deshabilitada / Tarjeta deshabilitada). Ninguna de las 4 cotizaciones reales ni el
  Excel muestran este plan — se cargó igual por ser dato dictado directo contra el sistema real
  (mismo criterio ya aplicado a los textos de MRC), pero sin una segunda fuente independiente
  que lo confirme en esta sesión.
- Manual `M-08OP-GT-01, Manual de Suscripción Incendio, Hogar, Comercio y Todo Riesgo Operativo
v.02 301024.pdf`: es un PDF escaneado, sin texto extraíble (confirmado con `pypdf`, 0
  caracteres por página). Se intentó el flujo de render a imagen con `pdftoppm` (poppler) para
  leerlo como PNG, pero no se pudo instalar poppler en este entorno (`winget` no está
  disponible en esta sesión de PowerShell). No se pudo usar este manual como fuente.

**Cargado en Supabase (migración 013):** 5 `coberturas_catalogo` nuevas (`incendio_edificio`,
`incendio_contenido`, `sublimite_fenomenos_naturales`, `incendio_maquinaria`,
`sublimite_vandalismo_maquinaria`), 1 `tasas_cobertura_ramo` (`incendio_maquinaria`, 7‰ = 0,7%
— las otras dos coberturas principales no tienen tasa fija de catálogo, sale de
`rubros_actividad`), 2 `planes` (`INCENDIO - EDIFICIO Y CONTENIDO` y `MAQUINARIA BASICO`), RPF
confirmado solo para `MAQUINARIA BASICO`. No se cargó nada en `plan_coberturas`: los dos
sublímites de este ramo son porcentuales y se definen por cotización (`sublimite_porcentaje` /
`tipo_aplicacion = 'sublimite'` en `cotizacion_coberturas`, migración 011), no como monto fijo
de catálogo por plan (a diferencia de los sublímites de MRC).

**Decisión de modelado confirmada (mismo criterio que MRC):** los riesgos nombrados en el texto
legal (Rayo/Explosión, Huracán/Vendaval/Ciclón/Tornado, Granizo, Impacto de Vehículos, Caída de
Aeronaves, Tumulto/Huelga, "Lock out") son la redacción de qué cubre la cobertura de Incendio —
no son coberturas cobrables por separado.

**Pendiente, no bloqueante:**

- RPF de `INCENDIO - EDIFICIO Y CONTENIDO` (el plan real, no Maquinaria Básico) — ninguna de las
  4 cotizaciones reales desglosa Prima/RPF/IVA por separado, solo Contado y (en 2 casos) un
  total financiado. No se puede derivar sin adivinar. Mismo pendiente ya anotado en la sección 8
  ("RPF fijo de MRC, Incendio y Vida/AP... solicitado al dpto. técnico").
- Nombre exacto del plan `INCENDIO - EDIFICIO Y CONTENIDO` tal como está configurado en el
  sistema de escritorio — es un nombre de trabajo, ninguna fuente lo confirma literal (a
  diferencia de los nombres de MRC).
- Columna de moneda y de tope máximo asegurable por plan — no existen en el schema actual
  (`planes`, `coberturas_catalogo`). Bloquea modelar completo el plan "Maquinaria Básico" (USD,
  tope Usd. 5.000.000). Requiere decisión de Kevin sobre si amerita una migración de schema
  nueva.
- Texto legal completo de las cláusulas "a prorrata", "de cobranza" e "inventario no
  presentado" — Kevin confirmó que existen y la frase "a prorrata" aparece literal en las 4
  cotizaciones reales, pero no el texto legal completo de ninguna de las tres. No se cargaron en
  `clausulas_catalogo` (columna `texto_legal` es NOT NULL, no se puede insertar sin inventar
  contenido).
- Manual de suscripción de Incendio/Hogar/Comercio/TRO sigue sin poder leerse (PDF escaneado,
  falta poppler en este entorno) — si aparece una forma de instalarlo, revisar si agrega
  exclusiones o cláusulas que no estén ya cubiertas por las 4 cotizaciones reales.

## 11. Referencia de UI — cotizador Agentech S.R.L. (video de referencia, 2026-07-10)

Kevin compartió capturas de un video de un cotizador de otra empresa (Agentech S.R.L., construido
en Oracle APEX — no reutilizable como código, nuestro stack es Node/Express + Supabase + Vanilla
JS). Es solo referencia de UX/UI para cuando se ataquen las Fases 2 (frontend Auto), 5
(Historial/Admin) y el diseño general del cotizador — el objetivo explícito de Kevin es que la UI
sea agradable **para todo público, incluida gente sin conocimiento técnico**, así que estas ideas
priorizan claridad visual sobre densidad de datos.

Ideas rescatables (patrón de UI, no de implementación):

1. **Dashboard de inicio**: pie chart "Estadística por Plan" (distribución de emisiones por
   plan/ramo) + barras horizontales "Emisiones por Día" + contadores tipo KPI ("Emisiones
   confirmadas del Mes", "Emisiones del Mes"). Referencia directa para la landing de
   `/historial` en Fase 5.
2. **"Seguimientos del día"**: lista de clientes con cotización pendiente de cerrar y su monto.
   Confirmar con Kevin si los agentes de Tajy necesitan este tracking de seguimiento o si ya lo
   cubre el sistema de escritorio actual — no está en el alcance definido de ninguna fase todavía.
3. **Wizard por pasos en modal** para alta de plan (Info del Plan → Coberturas → Servicios →
   Información/campos obligatorios), guardando cada paso antes de avanzar. Referencia para la
   futura UI de `/admin` (Fase 5): mejor que un formulario largo único.
4. **Grilla de coberturas con columna "Cob padre"** para anidar visualmente un sublímite bajo su
   cobertura principal en la misma tabla. Aplica directo a la UI pendiente de `tipo_aplicacion`
   (cobertura vs. sublímite) — pendiente abierto en la sección 8 y en el checklist de Fase 6 de
   `CLAUDE.md`.
5. **Pantalla de cotización final**: tabla plana `Plan | Cobertura | Valor | Eliminar`, montos
   editables inline por fila, selector "Agregar Plan" arriba para sumar otro plan/ramo al mismo
   carrito. Layout simple, buena base de partida para `/cotizar`.
6. **Servicios y Adicionales en tablas separadas** de la de coberturas, cada fila con precio y
   checkbox "Incluido". Refuerza en la UI la misma separación conceptual que ya existe en el
   schema entre `coberturas` y `servicios` — no mezclarlas visualmente aunque se muestren en la
   misma pantalla.
7. **PDF final agrupado por plan**, con subtítulo de color por bloque (Plan → Coberturas →
   Servicios → Adicionales). Referencia de maquetado para la Carta Oferta, en particular si más
   adelante se confirma que Tajy necesita cotizar varios ramos combinados en un mismo documento
   para un mismo cliente (ver punto 8).

Punto de atención (NO copiar): en la pantalla de costo de ese cotizador, "Forma de Pago" es un
único dropdown (Efectivo/Tarjeta/Débito), no las 4 formas simultáneas que exige la regla de
negocio de Tajy (`CLAUDE.md`, sección de reglas de Auto). Confirma que nuestro diseño ya es más
correcto para el caso real de Tajy en ese punto puntual — no hay que "parecerse" ahí.

Punto abierto para confirmar con Kevin (el cliente, no el usuario de esta sesión): ese cotizador
de referencia permite mezclar planes de distintos ramos (ej. Auto + Incendio) en una misma
cotización/cliente con un solo PDF combinado. Nuestro `PLAN_DESARROLLO.md` no contempla esto hoy
(cada ramo cotiza por separado) — si Tajy lo necesita, afecta el modelo de `cotizaciones` (¿una
cotización = un ramo, o una cotización = N ítems de ramos distintos?). No implementar nada de
esto sin confirmación explícita.

## 12. Catálogo de coberturas de Vida y Accidentes Personales — CERRADO (migración 015, fix en 016, 2026-07-12)

A diferencia de MRC/Incendio, el `RamoCalculator` de este ramo tarifica **por edad de la persona
asegurada**, no por capital de un bien (confirmado en `PLAN_DESARROLLO.md` sección 5) — el
schema no necesitó tablas nuevas: se usó `tarifas_generico` (`ramo_id` + `plan_id` + `variables`
JSONB, ya prevista desde la migración 004) en vez de `tasas_cobertura_ramo`, porque en Vida/AP la
misma cobertura cobra tasas distintas según el plan (algo que no pasaba en MRC/Incendio, donde
una cobertura tenía una sola tasa para todo el ramo).

**Fuentes usadas** (orden de confiabilidad):

- `M-08OP-GT-01, Manual de Suscripción Vida y Accidentes Personales v.02 301024.pdf`: a
  diferencia del manual de Incendio/Hogar/Comercio/TRO, **este sí tiene texto extraíble** (no es
  escaneado). Es la fuente principal — define los 5 sub-productos del ramo (Protección de
  Préstamos, Protección Familiar, Accidentes Personales, Vida Directivos y Empleados, Aportes y
  Ahorros) con sus coberturas/exclusiones, y trae un "Anexo 2 – Tasa" que el manual llama
  textualmente "tasas obligatorias para el presente período" — se usó tal cual, sin cruzarlo
  contra los Excels.
- 2 cotizaciones reales de AP ya emitidas (`2026_06_24 ALKA CONSTRUCCIONES S.A - AP, RC,TRC.pdf`,
  `2026_07_08 Floriano Kochhan Hoffmann - AP.pdf`): confirmaron el texto real de
  coberturas/exclusiones de Accidentes Personales (Muerte a consecuencia de accidente,
  Incapacidad total y permanente, Gastos Médicos, y en el caso de Floriano además Gastos de
  Sepelio).
- `Tajy Cotizador Vida Colectivo 2025-04-04.xlsx` y `Tajy Cotizador AP 2025-12-18.xlsx`: **NO se
  usaron** para cargar el catálogo — son herramientas del dpto. técnico con un motor más
  granular (tabla de mortalidad SISPY 2017 edad por edad para Vida Colectivo; tasas ‰ por
  cobertura + recargos de compañía Utilidad/Gastos Adm./Comisión/Cobranza/IVA para AP) cuyo
  resultado numérico no coincide con la tasa combinada y más simple del manual (ej. AP
  cooperativo 5,5‰ del manual vs. la suma de las 4 tasas del Excel). No se intentó reconciliar
  ambas fuentes. Quedan como referencia para cuando se escriba `vida-ap.js`: a confirmar con
  Kevin si el motor granular del Excel es el que realmente usa el dpto. técnico para pólizas
  colectivas grandes, distinto del cálculo rápido por tasa fija del manual.

**Cargado en Supabase:** 11 `coberturas_catalogo`, 7 `planes` (Protección de Préstamos
Cooperativas / Mercado General, Protección Familiar, Accidentes Personales Sector Cooperativo /
Sector Privado, Vida Directivos y Empleados, Aportes y Ahorros), 44 filas en `tarifas_generico`
(franjas etarias, tasas fijas, recargos y escalas de reducción de capital, todas documentadas con
`cobertura_codigo` dentro del JSON).

**Fix de fiabilidad aplicado (migración 016), detectado en review-reliability antes de cerrar la
fase:**

- Se unificaron 3 nombres de clave JSONB distintos para el mismo concepto de recargo porcentual
  (`recargo_sobre_tasa_normal_pct` / `recargo_pct` / `recargo`) a un único `recargo_pct`, y 2
  nombres distintos para tope de monto asegurable (`limite_suma_asegurada` / `monto_maximo`) a
  `monto_maximo` — para que el futuro `vida-ap.js` no tenga que revisar múltiples nombres de
  clave para la misma idea.
- Se completó un `edad_min` faltante en una fila de Aportes y Ahorros (`pct_capital: 100`, "hasta
  los 54 años inclusive") que había quedado sin ese campo a diferencia de sus filas hermanas —
  una lectura genérica del futuro calculador la habría dejado inalcanzable para cualquier edad.
- Se agregaron filas de tarifa para 5 coberturas del catálogo que no tenían ninguna fila
  `tarifas_generico` que las referenciara (`invalidez_accidente_ap`, `gastos_medicos_accidente`,
  `gastos_sepelio_accidente`, `reembolso_gastos_funerarios`, `perdidas_organicas`) — estaban
  documentadas solo en comentarios SQL como "incluidas en la tasa básica", pero un futuro lookup
  por `cobertura_codigo` habría encontrado cero filas para ellas.

**Pendiente, no bloqueante:**

- **RPF de los 7 planes de Vida/AP**: ninguna fuente (manual, Excels, ni las 2 cotizaciones
  reales) desglosa Prima/RPF/IVA por forma de pago para este ramo. Mismo pendiente ya registrado
  para MRC ("Comercio Protección Total") e Incendio ("Incendio - Edificio y Contenido").
- El manual anota un recargo "+5" para edad superior a 69 años y hasta 80 años en Accidentes
  Personales, sin aclarar si son puntos porcentuales o % por año — se cargó el número tal cual,
  sin interpretar.
- Motor de cálculo grupal (mortalidad SISPY 2017, Excel Vida Colectivo) vs. tasa fija simple del
  manual: a confirmar con Kevin cuál aplica en qué caso antes de escribir `vida-ap.js`.
- Ninguna de las 5 coberturas "incluidas sin tasa propia" (ver fix de la 016) tiene un tope o
  regla de suma asegurada modelada más allá de la nota textual del manual — puede necesitar
  columnas nuevas si el calculador termina necesitando esos topes como dato, no solo como texto.

## 14. Cotizador de MRC end-to-end (plan Normal) — 2026-07-13

Con el catálogo de MRC ya cerrado (sección 9), se implementó el primer calculador real del
bloque priorizado y se conectó al frontend, siguiendo el diseño de referencia de un handoff de
mockup (sumado en el mismo bloque de commits, luego migrado y eliminado tras la implementación de
"Diseño 2") adaptado a los ramos y datos reales del sistema.

- **`mrc.calculator.js`:** cubre solo `MULTIRRIESGO COMERCIO - NORMAL` (único plan con RPF y
  `prima_tecnica_minima` confirmados). Prima = `MAX(Capital_Edificio × Tasa(incendio_edificio) +
Capital_Contenido × Tasa(incendio_contenido), prima_tecnica_minima)`, con descuentos/recargos
  topados igual que Auto, y el mismo motor de RPF/IVA/Premio/Cuota. Las demás coberturas
  obligatorias del ramo (robo, cristales, RC, equipos electrónicos) se muestran informativamente
  en la lista de coberturas pero **no están sumadas a la prima todavía** — no está confirmado
  cómo se reparte el capital entre esas líneas (mismo pendiente ya anotado en la migración 012).
  `COMERCIO PROTECCION TOTAL` corta con error 422 explicativo (`err.publicMessage`) en vez de
  calcular con datos inventados.
- **Nuevo `coberturas.repository.js`** para leer `coberturas_catalogo`, `tasas_cobertura_ramo` y
  `rubros_actividad` — hasta ahora esas tablas solo se habían cargado (migraciones), no leído
  desde código de aplicación.
- **`mrc.schema.js` (Zod):** valida `riesgo_datos` de MRC (cédula, dirección, rubro de actividad,
  ciudad, capital edificio/contenido) — exige al menos uno de los dos capitales mayor a cero.
- **Endpoint nuevo:** `GET /api/ramos/rubros-actividad` (filtrable por `?grupo=`), para poblar el
  selector de rubro de actividad en el formulario de riesgo.
- **Frontend (`/frontend/cotizar`):** sidebar con los 5 ramos reales (MRC/Incendio/Vida-AP
  disponibles, Auto en pausa, Hogar "próximamente"), formulario de datos de riesgo, panel de
  cotización en vivo con selección explícita de forma de pago (Contado/Cobrador/Boca de
  Cobranza/Tarjeta) que se conserva al pasar a la pantalla de Detalle del plan. Incendio, Vida-AP
  y la Carta Oferta (PDF) quedan con estado "pendiente" en la UI — fuera de alcance de esta tarea.
- **Fix incidental:** el manejador de errores de `app.js` tumbaba el proceso entero al loguear un
  `ZodError` con `console.error(err)` (bug de `util.inspect` con errores de Zod); ahora loguea
  `err.stack`.

**Pendiente, no bloqueante:**

- Reparto del capital entre las coberturas obligatorias no-Incendio de MRC (robo, cristales, RC,
  equipos electrónicos) — sin esto, esas coberturas quedan fuera de la prima calculada.
- RPF de `COMERCIO PROTECCION TOTAL` — mismo pendiente de la sección 8/9.

## 15. Ajustes de UI/datos sobre el cotizador de MRC — 2026-07-13 (sesión de pulido)

Serie de ajustes chicos sobre lo cerrado en la sección 14, todos verificados corriendo la app
localmente (backend `npm run dev` + frontend servido estático):

- **Fix de entorno:** `FRONTEND_URL` en `backend/.env` apuntaba a `http://localhost:5173` (puerto
  de Vite) mientras el frontend se sirve en `5000` — CORS bloqueaba silenciosamente todas las
  llamadas a la API. Corregido en el `.env` local de esta máquina (no versionado).
- **"Rubro de actividad" renombrado a "Tipo de Riesgo"** en el formulario, y el desplegable pasó
  de filtrar por `?grupo=MRC` (15 de 49 rubros) a traer los 49 sin filtro — la pantalla real del
  sistema de escritorio muestra los 49 juntos. `coberturas.repository.js` ahora ordena
  `rubros_actividad` por `id` (orden de inserción) en vez de alfabético, para que coincida con el
  orden real de esa pantalla — confirmado ítem por ítem contra una captura del sistema real.
- **Formato de miles en los inputs de capital** (Incendio Edificio / Incendio Contenido, luego
  renombrados así por pedido de Kevin — antes "Capital Edificio/Contenido"): pasaron de
  `type="number"` a texto con máscara de miles en vivo (reusa el helper `fmtGs` ya existente),
  conservando la posición del cursor mientras se tipea.
- **Exclusiones y Sub-límites generales por plan** (migración 017): se agregaron
  `planes.texto_exclusiones_generales` y `planes.texto_sublimites_generales`, cargados para
  `MULTIRRIESGO COMERCIO - NORMAL` con el texto dictado por Kevin contra el sistema real. Se
  muestran como dos tarjetas nuevas en "Detalle del plan", debajo de Coberturas/Resumen.
  **Pendiente, no bloqueante:** el sublímite de "Daños por Granizo" ya cargado en `plan_coberturas`
  (Gs. 5.000.000, migración 012) no coincide con el texto de sub-límites dictado ahora
  (Gs. 2.000.000) — Kevin confirmó que ese monto se usó en otra oferta puntual y que el valor fijo
  definitivo se define después. No se tocó `plan_coberturas`.
- **Selector de cantidad de cuotas:** el service ignoraba cualquier cuota elegida y siempre usaba
  `plan.cuotas_default` (11, fijo). Se agregó `cuotas` (opcional) a `cotizarMrcSchema` y
  `cotizacion.service.js` ahora la respeta, topada por `plan.cuotas_maximo`. **Importante:** el
  monto de cada cuota sigue siendo fijo (`REDONDEAR.SUP(Premio/12, 1000)`, fórmula unificada de
  `PLAN_DESARROLLO.md` sección 5) — elegir menos cuotas no cambia ese monto, solo cuántas cuotas
  totales figuran en el plan de pago guardado. El selector vive en el panel "Cotización en vivo".
- **Bloque "Suma Asegurada total / Costo Contado / Costo Financiado"** en "Detalle del plan"
  (arriba de "Coberturas incluidas"), replicando el formato de la pantalla del sistema real
  (header rojo + filas grises). A diferencia del resto de la vista, este bloque siempre muestra
  Contado y el financiado vía "Crédito (Cobrador)" en simultáneo, sin importar la forma de pago
  elegida en las pills. Fix de contraste: el header perdía el fondo rojo contra una regla
  `:nth-child(odd)` con más especificidad — se resolvió con clases explícitas por fila
  (`--header`/`--contado`/`--financiado`) en vez de depender del orden de las filas.
- **`planes.responsabilidad_maxima_cotizable`** (migración 018): tope de suma asegurada cotizable
  por plan, dato que faltaba modelar — confirmado por Kevin contra la pantalla "Configuración para
  Cotizador" del sistema real (Gs. 7.200.000.000 para `MULTIRRIESGO COMERCIO - NORMAL`).
  `mrc.calculator.js` ahora corta con error 422 explicativo si `Capital Edificio + Capital
Contenido` supera ese tope.
- **Verificación cruzada contra el Excel real** (`docs/insumos/Version 01 - Calculo Varios.xlsx`,
  hoja DATOS): las 13 tasas de coberturas de MRC y los 49 `rubros_actividad` cargados en la
  migración 012 coinciden exacto, tasa por tasa, con el Excel — no se encontró ninguna tasa mal
  cargada.

## 16. Coberturas adicionales de MRC (repetibles) + rename a nomenclatura real — 2026-07-13

- **Rename de 12 coberturas de MRC** (migración 019) a la nomenclatura exacta del sistema de
  escritorio (fuente: "Version 01 - Calculo Varios.xlsx"), sin el sufijo "hasta la suma de..." del
  Excel. Filtrado explícito por `ramo_id='mrc'` porque `coberturas_catalogo.codigo` se comparte con
  Incendio (`incendio_edificio`/`incendio_contenido` existen en ambos ramos con distinto `id`).
- **Coberturas adicionales repetibles**: rediseño completo de "Coberturas incluidas". Antes, el
  calculador auto-incluía Robo contenido/Caja fuerte/Resp. Civil (monto placeholder, NO sumado a
  prima) + sublímites por defecto de `plan_coberturas`. Ahora solo Incendio Edificio/Contenido
  quedan fijos; todo lo demás (incluidos los 4 sublímites reales: murallas, granizo, agua, equipos
  electrónicos) lo agrega el agente como línea explícita desde la pestaña Datos, **pudiendo repetir
  la misma cobertura con distinta suma asegurada** (confirmado por Kevin contra el Excel, hoja
  MRC/DATOS: "Robo contenido" aparece 2 veces en una cotización real). Cada línea tarifica de
  verdad con `tasas_cobertura_ramo` (antes cargada pero sin usar) y suma a la prima total. Cada
  línea muestra un badge "Cobertura"/"Sublímite" tomado directo de `coberturas_catalogo.categoria`
  — no es un toggle que cambia tasa, es la fila de catálogo elegida. "Suma Asegurada total" en
  Detalle del plan ahora suma el monto de todas las líneas, no solo los 2 capitales.
- **Se descartaron 2 diseños alternativos** antes de este: (1) checkbox simple on/off sobre lista
  fija, descartado por no permitir repetición; (2) el mecanismo original de la migración 011
  (`tipo_aplicacion`/`sublimite_porcentaje`/`sublimite_monto_maximo`, pensado como "sublímite = sin
  prima propia, tope de otra cobertura") — descartado porque Kevin confirmó que los 4 sublímites
  reales SÍ tienen tasa y prima propia en el Excel, no son un tope sin costo.
- **Nuevo endpoint `GET /ramos/:id/coberturas-catalogo`** (catálogo completo de `coberturas_catalogo`
  por ramo) — necesario porque `GET /planes/:id/coberturas` (basado en `plan_coberturas`) en MRC
  solo tenía los 4 sublímites por defecto, nunca las coberturas principales.
- **Pendiente anotado para Fase 5**: panel admin para que un usuario admin defina qué coberturas
  quedan fijas por ramo y edite las tasas de `tasas_cobertura_ramo` sin migración SQL — ver
  sección 8.

## 17. Robo valores ventanilla + fix de texto de sub-límites — 2026-07-13

- **"Robo valores ventanilla" agregado al catálogo de MRC** (migración 020) — Kevin confirmó
  contra el dpto. técnico que esta cobertura (y "Valores en tránsito", ya cargada desde la
  migración 019) sí se usan de verdad. Misma tasa que "Valores en caja fuerte" (10‰), categoría
  Sublímites. A diferencia de las demás coberturas, su monto NO cuenta para el "Suma Asegurada
  total" del resumen — es un sub-límite de Caja Fuerte, no una suma asegurada independiente. Se
  agregó la columna `coberturas_catalogo.incluye_en_suma_asegurada_total` (default `TRUE`,
  `FALSE` solo para esta fila) porque las otras 4 coberturas categoría "Sublímites" (murallas,
  granizo, agua, equipos electrónicos) sí cuentan para el total — no es un comportamiento
  genérico de la categoría.
- **Verificación end-to-end contra una Propuesta Formal real**: con Tipo de Riesgo Categoría G
  y los montos reales de la propuesta (Incendio Edificio 250M, Contenido 1000M, Robo contenido
  500M, Caja fuerte 20M, Ventanilla 2M), el "Suma Asegurada total" calculado dio exacto
  Gs. 1.770.000.000, igual que el Excel del cliente. Esto también confirmó que el motor de
  cálculo de MRC (tasa por Tipo de Riesgo + tasas fijas por cobertura + IVA 10% sobre prima
  cuando RPF=0) está correcto — la discrepancia que Kevin veía antes al replicar la propuesta
  era por sustituir "Cristales" (8‰) en lugar de "Robo valores ventanilla" (10‰), no un bug.
- **Fix de `texto_sublimites_generales` del plan Normal** (migración 021): el texto cargado en
  la migración 017 estaba incompleto (solo tenía Murallas/Granizo) y el monto de "Daños por
  Granizo" estaba desactualizado (Gs. 2.000.000, de una oferta puntual). Kevin pasó el texto
  completo real (5 sub-límites) y los 5 montos coincidieron EXACTO con lo que ya estaba en
  `plan_coberturas.monto` desde la migración 012 — solo hacía falta corregir el texto mostrado,
  no la base.
- **Texto oficial completo para la futura Carta Oferta** (Coberturas Principales, Distribución
  del Capital Asegurado, Franquicias, Exclusiones ampliadas, cláusulas del contrato) guardado de
  referencia en Engram y en la sección 8 (pendientes) — no se implementa hasta Fase 2/4/8.

## 18. Carta Oferta en PDF (MRC) + bugfix de Inicial/Cuota en los 4 calculadores — 2026-07-14

- **Carta Oferta de MRC implementada end-to-end** con Puppeteer (`backend/src/services/pdf.service.js`)
  sobre templates en `backend/src/templates/oferta/` (`layout.js` compartido + `mrc.js` específico),
  replicando el layout del modelo MAPFRE adaptado al branding Tajy (rojo `#d8132e`, franja sólida
  compacta, footer con teléfono/web/redes reales de Tajy). `cotizacion.service.js#generarPdfOferta`
  ya no tira el TODO. Incendio y Vida-AP quedan sin template todavía (sin texto oficial confirmado) —
  el dispatcher de `templates/oferta/index.js` corta con 422 explicativo para esos ramos.
- **Bug real encontrado y corregido en `calcularPlanPago`** (duplicado en `auto.js`, `mrc.js`,
  `incendio.js`, `vida-ap.js`): Kevin pasó 2 capturas reales del cotizador de Auto de escritorio
  (cotización Nº 903.662) que mostraban Inicial ≠ Cuota — algo que el código actual no podía producir
  (calculaba `Inicial = Cuota = REDONDEAR.SUP(Premio/12, 1000)`, fórmula documentada en
  PLAN_DESARROLLO.md pero **nunca verificada número por número contra el sistema real**). Reconstruyendo
  la cuenta contra la captura se confirmó que:
  - La Cuota redondea hacia **ABAJO** (`REDONDEAR.INF`), no hacia arriba.
  - El Inicial **absorbe el resto**: `Inicial = Premio − (cuotas × Cuota)`, para que la suma dé
    exacto el Premio (nunca hubo "sobrante" perdido por el redondeo).
  - **Contado** siempre es Inicial = Premio completo y Cuota = 0, sin importar la cantidad de cuotas
    configurada para las formas de pago financiadas — el código viejo ignoraba esto y le aplicaba el
    mismo pago mensual que a las formas financiadas si `cuotas > 0`.
  - De paso se corrigió que el divisor estaba hardcodeado en `/12` ignorando el parámetro `cuotas`
    real elegido por el agente — ahora es `premio / (cuotas + 1)`.
  - Nuevo `redondearInf` en `backend/src/calculators/utils/round.js`, junto al `redondearSup` ya
    existente (que se sigue usando para RPF/IVA).
  - Fórmula corregida también en `PLAN_DESARROLLO.md` (sección 5, las 3 apariciones: Auto individual,
    Auto Flota, Incendio simple) y en `CLAUDE.md`.
  - **Impacto**: afecta a los 4 ramos con calculador implementado (Auto — pausado pero corregido
    igual por ser el mismo bug —, MRC, Incendio, Vida-AP). Cualquier cotización ya persistida antes
    de este fix tiene el Inicial/Cuota calculados con la fórmula vieja — no se re-calculan
    retroactivamente, solo las cotizaciones nuevas usan la fórmula corregida.

## 19. Carta Oferta de MRC — estado actual del PDF (2026-07-15)

Después de la primera implementación end-to-end de la sección 18, la Carta Oferta de MRC quedó en
estado usable y alineada con las reglas de negocio actuales del plan `MULTIRRIESGO COMERCIO -
NORMAL`:

- **Prima Técnica Mínima como piso silencioso:** MRC e Incendio ya no cortan con error 422 cuando
  la prima calculada queda por debajo de `plan.prima_tecnica_minima`. El calculador usa
  `MAX(primaCalculada, prima_tecnica_minima)` y continúa el flujo normal. El valor correcto del
  piso es pre-IVA: Gs. 409.091 produce un Premio final cercano a Gs. 450.000; el intento de subirlo
  directo a Gs. 450.000 quedó revertido por migraciones 025/026.
- **Mínimo de 3 coberturas en MRC:** Incendio Edificio + Incendio Contenido cuentan siempre como
  2 coberturas fijas. Los sub-límites fijos (agua, equipos electrónicos, granizo) no cuentan para
  ese mínimo. Si el agente no agrega al menos una cobertura adicional, el flujo bloquea con el
  mensaje: "Este plan requiere un mínimo de 3 coberturas — agregá al menos una cobertura adicional
  para continuar."
- **CCTV removido de sub-límites:** "Circuito Cerrado de Televisión (CCTV)" salió del texto de
  sub-límites y de la Carta Oferta porque ya está cubierto por "Daños a los Equipos Electrónicos";
  no debe listarse como sub-límite aparte.
- **Plan de Pago más claro:** el PDF muestra "Cuota (N cuotas)" para evitar que Inicial + Cuota
  parezca no cerrar contra el Premio. En Contado, la cuota se muestra como "—" en vez de "Gs. 0".
- **Orden de sumas aseguradas:** la tabla "Sumas Aseguradas por Cobertura" lista primero las
  coberturas y después los sub-límites, independientemente del orden en que se agregaron en el
  formulario.
- **Página de "Coberturas y condiciones" con layout dinámico:** las 6 tarjetas quedaron en este
  orden: Coberturas principales incluidas, Coberturas cotizadas, Distribución del capital
  asegurado, Franquicias, Exclusiones, Forman parte del contrato. El template intenta primero un
  split fijo 3/3 por columna; antes de generar el PDF final, Puppeteer mide si ese candidato entra
  en una hoja A4. Si entra, se usa el 3/3 exacto; si no, cae automáticamente al layout balanceado,
  que pagina correctamente en Chromium. La tarjeta "Coberturas cotizadas" puede fluir entre
  columnas a mitad de lista; las demás tarjetas permanecen atómicas.
- **Footer ajustado:** el footer del PDF subió de 9px a 11px para mejorar legibilidad.

## 20a1. Tope propio de descuento/recargo por usuario — 2026-07-19

Kevin pidió poder limitar, por usuario individual, hasta qué porcentaje de descuento/recargo
puede aplicar un agente al cotizar MRC/Incendio (el ajuste manual de "Ajustes (opcional)" en
Detalle del plan) — hasta ahora el único tope era `planes.descuento_maximo`/`recargo_maximo`,
igual para todos los agentes. Decisión confirmada con Kevin: el tope es **por usuario**
(editable en "Editar usuario"), y cuando el tope del usuario y el del plan no coinciden **gana
el más restrictivo** (`MIN`).

- **Migración 029**: `usuarios.descuento_maximo_pct` / `recargo_maximo_pct` (`NUMERIC(5,2)`,
  ambas nullable). `NULL` = el usuario no tiene tope propio, se respeta el tope del plan tal
  cual — no rompe ninguna cotización existente.
- **Enforcement real en backend**: `mrc.calculator.js` e `incendio.calculator.js` (los únicos
  ramos con ajuste manual, ver `RAMOS_CON_AJUSTES`) agregan `topeEfectivo(topePlan, topeUsuario)`
  — combina ambos topes con `MIN`, duplicada en los dos archivos siguiendo el mismo criterio
  que `sumarAjustes` (ya duplicada 3 veces, en auto/mrc/incendio). `auto.calculator.js` NO se
  tocó (Fase 2 pausada, no usa este ajuste desde el frontend hoy).
- **`req.usuario` ahora completo en todo el pipeline de cotización**: `POST
/api/cotizaciones/calcular` (preview en vivo) no le pasaba `req.usuario` al service — se agregó,
  porque si el preview no aplicara el mismo tope que el guardado final, el agente vería un número
  en pantalla distinto al que realmente se persiste. `middleware/auth.js` ahora incluye
  `descuento_maximo_pct`/`recargo_maximo_pct` en `req.usuario` (se re-lee de la base en cada
  request, no cachea — mismo criterio que el resto de ese objeto).
- **Frontend**: 2 campos nuevos en el modal "Editar {usuario}" del panel admin (vacío = sin
  tope propio). El texto de ayuda bajo los inputs de "Ajustes (opcional)" en `/cotizar` pasó de
  "Tope del plan: X%" a "Tope aplicable: X%" (ya no es necesariamente el del plan) y ahora
  calcula el mismo `MIN` client-side usando el usuario logueado, para no mostrarle al agente un
  número que después el backend va a clampear más.
- **Pendiente menor, no bloqueante**: el hint del tope en `/cotizar` usa el `usuario` cacheado en
  `localStorage` desde el login — si un admin cambia el tope de un agente con sesión activa, el
  hint queda desactualizado hasta el próximo login (el backend igual aplica el valor real y
  fresco en cada cotización, esto es solo un texto de ayuda).
- **Verificado end-to-end contra Supabase real** con Playwright: usuario `test` con tope propio
  5% descuento / 3% recargo (más restrictivo que el 30%/20% del plan Normal), pidiendo 20% de
  descuento manual en una cotización de MRC → `total_descuentos` final dio exacto 5% de la prima
  base (61.140 de 1.222.800), confirmando que ganó el tope del usuario y no el del plan ni el
  valor pedido. Dato de prueba revertido a `NULL` al terminar.
- **Tope máximo del campo: 100%** (confirmado con Kevin, 2026-07-19) — `editarUsuarioSchema`
  ahora valida `.max(100)` en ambos campos, y los inputs del modal tienen `max="100"`.

**Pendientes anotados para afinar más adelante (no bloqueantes, confirmado con Kevin que se
revisan después):**

- El modal "Nuevo usuario" no tiene estos 2 campos (solo "Editar") — un agente recién creado
  queda sin tope propio (`NULL`, solo el tope del plan) hasta que alguien lo edite a mano.
- `auto.calculator.js` no tiene `topeEfectivo` — si se retoma Fase 2 y se expone el ajuste manual
  para Auto, hay que replicar el mismo cambio ahí (hoy no aplicaría el tope por usuario en Auto).
- El hint de tope en `/cotizar` usa el usuario cacheado en `localStorage` desde el login — si un
  admin cambia el tope de un agente con sesión activa, el hint queda desactualizado hasta el
  próximo login (el backend sí aplica siempre el valor real y fresco, es solo el texto de ayuda).

## 20a2. Plan aprobado — permisos parciales de admin por sección (implementado, ver 20a3) — 2026-07-19

Kevin quiere poder darle a un usuario acceso a SOLO una parte del panel admin (ej. Coberturas
por plan, sin darle Usuarios ni Tasas) sin hacerlo admin completo. Hoy `admin.routes.js` tiene
un gate todo-o-nada (`router.use(requireRole('admin'))`, línea 14) — el único precedente de
permiso parcial es `usuarios.puede_editar_tasas` (ya usado por `requireTasasEdit`).

**Decisión de alcance (confirmada con Kevin, 2026-07-19):** por ahora, extender el mismo patrón
de `puede_editar_tasas` con 2-3 columnas booleanas más — NO construir todavía una tabla `roles`
configurable. Un sistema de roles completo (Kevin define el rol y sus permisos desde el panel,
sin tocar código) queda anotado como evolución futura de este mismo diseño — las columnas
booleanas de hoy pasarían a ser filas de una tabla de permisos por rol el día que se aborde.

**Plan concreto para la próxima sesión** (ver prompt guardado — pedirle a Kevin o buscar en
Engram bajo `cotizador-tajy/plan-permisos-admin-por-seccion` si hace falta el texto exacto):

- Migración nueva: `usuarios.puede_gestionar_usuarios`, `puede_editar_coberturas`,
  `puede_editar_planes` (BOOLEAN DEFAULT FALSE) — `puede_editar_tasas` ya existe, no se toca.
- `middleware/auth.js`: sumar los 3 campos nuevos a `req.usuario` (mismo patrón que
  `puede_editar_tasas`), y agregar `requireUsuariosEdit`/`requireCoberturasEdit`/
  `requirePlanesEdit` en `middleware/auth.js` (mismo molde que `requireTasasEdit`).
- `admin.routes.js`: sacar el `router.use(requireRole('admin'))` global y mover el gate a
  nivel de cada grupo de rutas (Usuarios con `requireUsuariosEdit`, Coberturas por plan con
  `requireCoberturasEdit`, Planes con `requirePlanesEdit`, Tasas ya tiene el suyo) — cuidado:
  hoy varias rutas comparten prefijo `/planes/:id/coberturas` con la sección "Coberturas por
  plan" del admin, no confundir con las rutas públicas de `/planes` en `routes/index.js`.
- `admin.schema.js`: sumar los 3 campos a `crearUsuarioSchema`/`editarUsuarioSchema`.
- `frontend/admin/admin.js`: 3 checkboxes nuevos en los modales "Nuevo usuario"/"Editar
  usuario" (mismo patrón que el checkbox "Puede editar tasas" ya existente), y ocultar en el
  sidebar/navegación las secciones para las que el usuario logueado no tenga permiso (hoy
  todas las secciones se muestran siempre a cualquier admin).
- Verificar en vivo con Playwright (mismo enfoque que las pruebas de esta sesión): crear/editar
  un usuario con solo `puede_editar_coberturas=true`, confirmar que entra a esa sección y que
  las demás rutas de `/admin` le devuelven 403.

## 20a3. Implementado — permisos parciales de admin por sección — 2026-07-19

Implementado el plan de la sección 20a2. Migración `030_permisos_admin_por_seccion.sql` (aplicada
contra Supabase real) agrega `usuarios.puede_gestionar_usuarios`, `puede_editar_coberturas`,
`puede_editar_planes` (BOOLEAN NOT NULL DEFAULT FALSE). `admin.routes.js` ya NO tiene el gate
global `requireRole('admin')` — cada grupo de rutas exige su propio permiso booleano
(`requireUsuariosEdit`/`requireCoberturasEdit`/`requirePlanesEdit`/`requireTasasEdit`), mismo molde
para los 4. Se confirmó que el prefijo `/planes/:id/coberturas` del router admin no colisiona con
las rutas públicas de `/planes` (montajes distintos, `/admin` vs `/planes`).

**Decisión de diseño heredada del patrón existente**: igual que `requireTasasEdit` ya hacía, los
middlewares nuevos NO chequean `rol` además del booleano — solo el permiso. No es una relajación
nueva, es el mismo criterio que ya regía Tasas desde antes de esta sesión.

**Paso de compensación no pedido explícitamente en el plan, pero necesario**: como las columnas
nuevas nacen en `FALSE` por default, se corrió un UPDATE puntual para dejar los 3 permisos nuevos
en `TRUE` para el admin real `kevinruiz@tajy.com.py` (que ya tenía `puede_editar_tasas = TRUE`).
Sin este paso, el primer deploy hubiese dejado al único admin real sin acceso a Usuarios/Coberturas/
Planes hasta la próxima edición manual. Cualquier admin nuevo que se cree de acá en más necesita
que alguien con `puede_gestionar_usuarios = TRUE` le tilde los permisos correspondientes — ya no
alcanza con poner `rol = admin`.

**Frontend** (`frontend/admin/admin.js`): `SECCIONES` ahora lleva un campo `permiso` por entrada;
`seccionesVisibles()` filtra contra `auth.getUsuario()` (permisos vienen del login, cacheados en
localStorage — mismo caveat ya documentado en la sección de arriba sobre `descuento_maximo_pct`:
si a un usuario con sesión activa le cambian permisos, no se reflejan hasta el próximo login). Si
un usuario no tiene ninguna sección visible, se muestra un empty state en vez de una pantalla en
blanco. 3 checkboxes nuevos en los modales de Usuarios, mismo patrón que "Puede editar tasas".

**Verificado en vivo con Playwright** contra Supabase real (backend + frontend levantados
localmente): usuario de prueba con SOLO `puede_editar_coberturas = true` ve únicamente la sección
"Coberturas por plan" en el sidebar; llamadas directas a `/admin/usuarios`, `/admin/planes` y
`/admin/ramos/:id/tasas` con su token devuelven 403; `/admin/planes/:id/coberturas` responde 200.
Un usuario con los 4 permisos en `true` ve las 4 secciones (regresión del caso "admin completo" sin
romperse). Usuarios de prueba creados/borrados directo en Supabase para la prueba, ya no existen.

## 20a4. Roles configurables del panel admin (reemplaza el patrón booleano de 20a2/20a3) — 2026-07-19

Kevin pidió reemplazar el rol binario `'agente'`/`'admin'` + los 4 booleanos sueltos por usuario
(`puede_editar_tasas`, `puede_gestionar_usuarios`, `puede_editar_coberturas`, `puede_editar_planes`,
ver 20a2/20a3) por una tabla `roles` configurable con nombre propio: cada rol agrupa esos 4 permisos
como columnas fijas, y cada usuario referencia un rol vía FK (`usuarios.rol_id`). El patrón booleano
directo en `usuarios` — que la memoria previa (Engram #136) ya anotaba como paso intermedio antes de
esta evolución — queda reemplazado, no coexistiendo.

**Migración `031_roles_configurables.sql`** (aplicada contra Supabase real vía MCP): crea `roles`
(`id`, `nombre` UNIQUE, los 4 `puede_*` BOOLEAN, `es_sistema`, `activo`, timestamps), siembra
`admin` y `agente` con `es_sistema = TRUE` y los permisos que ya tenían, agrega `usuarios.rol_id`
(FK), hace backfill 1:1 desde el `rol` string viejo (lossless — solo 3 usuarios reales, ids 1/2/8,
sin divergencias entre el string y sus booleanos, verificado antes de aplicar) y dropea `rol` +
los 4 booleanos de `usuarios`.

**`es_sistema` — por qué existe**: `req.usuario.rol === 'admin'` sigue siendo un string mágico usado
FUERA del panel admin, en `cotizacion.service.js`, para resolver ownership de Historial (ver sección
de Historial de este doc). Si el rol `admin` se pudiera renombrar o despermisionar desde el panel,
ese caso especial se rompe. Kevin decidió explícitamente NO tocar esa lógica de ownership en este
cambio — `admin` y `agente` quedan con `es_sistema = TRUE`, inmutables desde el panel (nombre y los
4 permisos). Intentar editarlos devuelve 409 con mensaje claro. Roles nuevos (`es_sistema = FALSE`)
son totalmente editables (nombre incluido) pero sin endpoint de borrado en esta primera pasada — si
hace falta retirarlos, se desactivan con `activo = FALSE`.

**Backend**: `backend/src/repositories/roles.repository.js` nuevo (`findAll`/`findById`/`crear`/
`actualizar`). `usuarios.repository.js` reescrito para joinear `roles(...)` vía Supabase JS y
APLANAR el resultado (`rol` = `roles.nombre`, los 4 `puede_*` al nivel superior) — así
`middleware/auth.js` (arma `req.usuario`) y `auth.service.js` (login) NO necesitaron cambios, siguen
leyendo `usuario.rol`/`usuario.puede_editar_tasas` como si fueran columnas planas. `admin.schema.js`:
`crearUsuarioSchema`/`editarUsuarioSchema` ahora piden `rol_id` en vez de `rol` + 4 booleanos;
`crearRolSchema`/`editarRolSchema` nuevos. Rutas nuevas `GET/POST /admin/roles`, `PUT
/admin/roles/:id`, gateadas con el mismo `requireUsuariosEdit` que ya protegía Usuarios (roles es
sub-recurso de esa sección).

**Bug de la misma sesión, corregido de paso**: el error handler central (`app.js`) solo expone
`err.publicMessage` al cliente, nunca `err.message` — varios `throw new Error(...)` de
`admin.service.js` (incluidos los nuevos de roles) no seteaban `publicMessage`, así que el 409/404
le llegaba al frontend como "Error interno del servidor" genérico en vez del mensaje real. Corregido
seteando `err.publicMessage = err.message` en los errores nuevos de `crearRol`/`editarRol` (los
preexistentes de usuarios/coberturas/planes quedan con el mismo bug latente, fuera de alcance de
este cambio).

**Frontend** (`frontend/admin/admin.js`): la sección Usuarios carga y cachea `GET /admin/roles` en
memoria. Los modales "Nuevo usuario"/"Editar usuario" pasan de un `<select>` de 2 opciones
hardcodeadas a listar los roles cargados dinámicamente (value = `rol_id`). Botón "+ Crear rol"
separado de "+ Nuevo usuario" (decisión de Kevin), con su propio modal (nombre + 4 checkboxes) y una
tabla de roles debajo de la de usuarios; los roles `es_sistema` se muestran con el botón "Editar"
deshabilitado + `title` explicativo (agregado `.btn-outline:disabled` a `shared/cotizador.css`, que
no tenía esa variante). La tabla de usuarios ya no repite los booleanos crudos (esa info vive ahora
en la tabla de roles) — solo muestra el nombre del rol.

**Verificado en vivo con Playwright** contra Supabase real (backend + frontend levantados
localmente, login como Kevin): crear un rol nuevo con 1-2 permisos → aparece en la tabla de roles y
en el select de "Nuevo usuario" sin recargar; crear un usuario con ese rol → aparece correctamente
en la tabla; editar el rol custom → funciona sin error; intentar `PUT /admin/roles/:id` sobre el rol
`admin` vía fetch directo → 409 con el mensaje `"Este rol es del sistema y no se puede editar"`; los
botones "Editar" de `admin`/`agente` en la tabla de roles están deshabilitados (2/2 confirmado por
selector). Usuarios y roles de prueba borrados de Supabase al terminar; se usó una contraseña
temporal para el usuario 1 durante la prueba de login (restaurada al hash original al finalizar).

## 20a0. Bugfix — botones "Editar"/"Resetear password"/"Desactivar" de Usuarios no hacían nada — 2026-07-19

Kevin reportó que en Admin > Usuarios los botones de acción no reaccionaban. Verificado con
Playwright: "+ Nuevo usuario" sí abría su modal, pero "Editar", "Resetear password" y "Desactivar"
no hacían nada, sin error en consola. Causa raíz: `abrirModalEditar`, `abrirModalPassword` y
`desactivarUsuario` (`frontend/admin/admin.js`) buscaban el usuario con
`state.usuarios.find((u) => u.id === usuarioId)`, comparando con `===` estricto. `usuarioId` venía
de `el.dataset.id` (siempre string), mientras que `u.id` es un número (`usuarios.id SERIAL`) — la
comparación nunca matcheaba y la función cortaba en el primer `if (!usuario) return;` sin avisar.
Bug preexistente de WU5, no introducido en esta sesión. **Fix**: convertir a `Number(el.dataset.id)`
en el dispatcher (`onActionClick`), mismo patrón ya usado en otras acciones del archivo (ej.
`habilitarEdicionRubroActividad`). Verificado en vivo con Playwright: los 3 modales/confirm ahora
abren correctamente.

## 20a. Panel admin — editor de tasas por Tipo de Riesgo (`rubros_actividad`) — 2026-07-19

Kevin señaló, mirando la sección "Tasas" del panel admin, que faltaba poder editar las tasas por
Tipo de Riesgo (`rubros_actividad.tasa_edificio`/`tasa_contenido`, 49 filas) — hasta ahora solo se
podían editar las tasas fijas por cobertura (`tasas_cobertura_ramo`), pero la prima real de
Incendio Edificio/Contenido en MRC e Incendio sale de esta otra tabla, que solo se cargaba por
migración SQL. Este editor había quedado explícitamente fuera del MVP de Fase 5 (ver
`docs/PLAN_ADMIN_FASE5.md:59`, "Después: editor de rubros_actividad...").

- **Backend**: `GET /admin/rubros-actividad` y `PUT /admin/rubros-actividad/:id`, ambas gated por
  `requireTasasEdit` (mismo criterio que el resto de la sección Tasas). Nuevo
  `actualizarRubroActividad` en `coberturas.repository.js`.
- **Decisión de modelado**: a diferencia de `tasas_cobertura_ramo` (versionado por INSERT, con
  `vigente_desde`), `rubros_actividad` NO tiene columna de vigencia — se edita con **UPDATE
  directo**, mismo patrón que `editarPlan`. No se agregó versionado/historial a una tabla que no
  lo tenía.
- **Alcance acotado a propósito**: solo `tasa_edificio`/`tasa_contenido` son editables. `nombre`
  queda de solo lectura porque `findRubroPorNombre` (usado en tiempo de cotización) matchea por
  ese campo — cambiarlo rompería el join.
- **Frontend**: nueva tabla "Tasas por Tipo de Riesgo" dentro de la sección Tasas, visible solo
  cuando el ramo seleccionado es `mrc` o `incendio` (la tabla es compartida entre ambos, no tiene
  `ramo_id` propio) — mismo criterio ya documentado en sección 15 de que el desplegable "Tipo de
  Riesgo" del formulario de cotización muestra las 49 filas sin filtrar por grupo.
- **Pendiente menor, no bloqueante**: el schema (`editarRubroActividadSchema`) no acepta `null`
  (a diferencia de otros campos inline como `monto`/`franquicia`) — no se puede vaciar una tasa
  desde el panel, solo cambiarla a otro número. Ajustar si en algún momento hace falta poder dejar
  una tasa sin definir.

## 20b. Historial de cotizaciones — implementado (2026-07-19)

Fase 5: reemplazado el stub de `frontend/historial/index.html` por la UI completa contra
`GET /api/cotizaciones`.

- **Backend**: sumado el filtro de rango de fecha (`fecha_desde`/`fecha_hasta`, `.gte()`/`.lte()`
  sobre `created_at`) que faltaba en `cotizaciones.repository.js`/`cotizacion.service.js`, mismo
  patrón que los filtros ya existentes (`ramo_id`, `estado`, `cliente`). No se tocó el controller
  (ya reenviaba todo el query sin validar campos individuales).
- **Frontend** (`frontend/historial/index.html`, `historial.js`, `historial.css`): tabla con
  Número/Cliente/Ramo/Plan/Fecha/Estado/Prima, filtros (ramo, cliente, fecha desde/hasta, estado)
  con botón "Buscar" explícito (no reactivo a `change`), paginación con el `count` que ya
  devolvía el backend, modal de detalle (`GET /cotizaciones/:id`) y botón "Descargar Carta
  Oferta" (`GET /cotizaciones/:id/pdf-oferta`) — habilitado solo si `ramos.calculador` está en
  `CALCULADORES_CON_OFERTA_PDF` (hoy solo `'mrc'`), mismo criterio que
  `ofertaDisponibleParaRamo()` en `backend/src/templates/oferta/index.js`.
- **Prima mostrada**: `cotizacion_variantes` puede traer más de una variante (franquicia dual de
  Auto); se prioriza `tipo_franquicia = 'sin_franquicia'` y se cae a la primera si no está — hoy
  siempre hay una sola variante para MRC/Incendio/Vida-AP, así que no afecta el dato mostrado.
- **Verificado end-to-end con Playwright contra Supabase real** (login con usuario real, no
  mock): listado carga, filtro por ramo (MRC) filtra de verdad, filtro de fecha futura devuelve 0
  filas correctamente, modal de detalle abre, descarga de PDF funciona.
- **Bug encontrado y corregido durante la verificación (no introducido por este cambio, pero
  arreglado en la misma sesión)**: `backend/src/services/pdf.service.js` cacheaba
  `browserPromise` a nivel de módulo sin manejar el caso de rechazo — si el primer intento de
  lanzar Puppeteer fallaba (ej. Chrome no instalado en la máquina), **todas las descargas de PDF
  quedaban rotas hasta reiniciar el server**, porque `getBrowser()` seguía devolviendo la misma
  promesa rechazada para siempre. **Fix aplicado**: `getBrowser()` ahora resetea
  `browserPromise = null` tanto si el `puppeteer.launch()` rechaza como si el browser ya lanzado
  se desconecta/crashea más tarde (evento `disconnected`) — el próximo request reintenta el
  lanzamiento en vez de heredar el estado roto. Verificado con una descarga real de PDF tras el
  fix (200 OK, PDF válido).

## 20c. Historial — permisos por dueño + edición con ventana de 30 días (2026-07-19)

Kevin pidió dos cosas más sobre el Historial: que un usuario no-admin solo vea/edite sus propias
cotizaciones (admin ve todas), y poder "editar" una cotización desde el detalle reabriendo el
formulario completo de `/cotizar`, siempre que no hayan pasado más de 30 días desde `created_at`.

- **Ownership**: `findCotizaciones`/`listarCotizaciones` ahora aceptan `agenteId` (filtra
  `.eq('agente_id', ...)`); el controller pasa `agenteId: usuario.rol === 'admin' ? undefined :
usuario.id`. `obtenerCotizacion`/`generarPdfOferta` ahora reciben `req.usuario` y llaman a
  `verificarPropiedad()` — 403 si no sos admin ni el dueño. Esto cierra un IDOR real: antes
  `GET /cotizaciones/:id` (y la descarga de PDF) no validaban dueño aunque el listado sí filtrara,
  así que conociendo un id directo se podía ver/descargar la cotización de otro agente.
- **Editar (`PUT /api/cotizaciones/:id`, `actualizarCotizacion` en `cotizacion.service.js`)**:
  reusa la misma validación/cálculo que `crearCotizacion` (extraído a un helper compartido
  `insertarCoberturasYVariantes`), sobrescribe la misma cotización (mismo `numero_cotizacion`,
  `ramo_id`, `agente_id`) y rechaza con 422 si pasaron más de 30 días de `created_at`.
- **Bugs encontrados por los 4 lentes de review (risk/reliability/readability/resilience) y
  corregidos antes de mergear** — ninguno llegó a producción:
  1. **Cambio de ramo durante una edición corrompía la cotización**: si el agente cambiaba de
     ramo en el sidebar mientras editaba, el `PUT` guardaba `riesgo_datos`/coberturas de un ramo
     distinto bajo el `ramo_id` original (y consumía el correlativo del OTRO ramo). Fix: el
     backend rechaza con 422 si `plan.ramo_id !== existente.ramo_id` (chequeo real, no solo de
     UI); el frontend además resetea `state.editandoId` al usar `selectRamo()` para no dejar
     llenar un formulario entero que iba a rebotar.
  2. **Sin transacción, un fallo a mitad de la edición dejaba la cotización sin variantes ni
     coberturas** (PDF roto, prima en null): la secuencia original era borrar → actualizar
     cabecera → reinsertar. Fix: se invirtió el orden — insertar los datos NUEVOS primero,
     recién después actualizar la cabecera y borrar los IDs viejos (capturados explícitamente
     antes de insertar, no un DELETE ciego por `cotizacion_id`, para no arrastrarse las filas
     recién insertadas). Si el insert falla, la cotización queda 100% intacta.
  3. **404 inconsistente**: `findCotizacionById` ahora detecta el código `PGRST116` de
     PostgREST (fila no encontrada) y lanza un 404 real con `.publicMessage`, en vez de que cada
     caller improvisara su propio manejo (antes `PUT` armaba un try/catch que además tapaba
     errores reales de conexión, y `GET` dejaba pasar el error crudo de Supabase como 500).
  4. **Mensajes de error no llegaban al usuario**: el handler global (`backend/src/app.js`) usa
     `err.publicMessage` para lo que se muestra al cliente, no `err.message` — los errores nuevos
     (403 de dueño, 422 de ventana vencida, 422 de cambio de ramo) solo seteaban `.message` y por
     lo tanto el usuario veía siempre "Error interno del servidor" en vez del motivo real. Se
     corrigió seteando `.publicMessage` en los 4 puntos, siguiendo el patrón ya establecido en
     los calculadores (`mrc.calculator.js`, `incendio.calculator.js`, etc.).
- **Verificado con Playwright + API directa contra Supabase real** (usuario admin real): edición
  end-to-end (MRC-225, id 114) preserva `numero_cotizacion`/`ramo_id`/`plan_id` y termina con 1
  variante + 6 coberturas (no vacío); intento de cambio de ramo devuelve 422 con mensaje claro y
  la cotización queda intacta después del intento; `GET` a un id inexistente devuelve 404
  consistente.
- **No verificado en esta sesión** (anotado, no asumido como probado): el filtro "no-admin solo
  ve lo suyo" no se pudo probar end-to-end porque la única cuenta disponible es admin — la lógica
  se revisó por código (4 lentes independientes la dieron por correcta) pero falta una prueba en
  vivo con una segunda cuenta no-admin. Tampoco se simuló el rechazo por ventana de 30 días
  vencida (hubiera requerido mutar `created_at` de una cotización real en producción).
- **Pendiente, no bloqueante**: no hay tests automatizados para el boundary de ownership ni para
  el endpoint de edición (el backend no tiene suite de tests hoy — ningún otro endpoint la tiene
  tampoco). Señalado por review-reliability como riesgo a futuro si alguien refactoriza
  `verificarPropiedad` o el chequeo de ventana sin darse cuenta de que rompió el control de acceso.

## 20. Próximo paso

Con el catálogo de MRC, Incendio y Vida/AP cargado, el primer calculador (MRC, plan Normal) conectado
end-to-end, y la Carta Oferta de MRC ya generándose en PDF, lo que sigue es uno de estos, a decidir
con Kevin:

- Confirmar el texto oficial de Carta Oferta de Incendio y Vida/AP para sumarles su template de PDF.
- Retomar Fase 2 (Auto end-to-end), si el cliente lo pide.
- Seguir el frontend de `/cotizar` para Incendio/Vida-AP en cuanto tengan calculador, reutilizando
  el mismo App Shell ya construido para MRC.
- Panel admin (Fase 5): coberturas fijas por ramo + edición de tasas — ver sección 8.

**Nota 2026-07-17 — alcance real de WU6 (confirmado leyendo el código, no solo la nota original de PLAN_ADMIN_FASE5.md):**
Con la sección "Coberturas por plan" del admin ya implementada y funcionando (WU5 cerrado), se verificó qué de lo que ahí se edita realmente impacta el cotizador/PDF de MRC hoy:

- **Sí se refleja ya**: `franquicia_default` de las 2 coberturas fijas de Incendio (Edificio/Contenido) — `mrc.calculator.js` la lee en vivo de `coberturas_catalogo` vía `findCoberturasCatalogoByRamoId`.
- **No se refleja (WU6 pendiente, alcance más amplio del que decía la nota original)**:
  - `plan_coberturas.incluida_por_defecto` — `mrc.calculator.js` tiene hardcodeados `CODIGO_INCENDIO_EDIFICIO`/`CODIGO_INCENDIO_CONTENIDO` como fijos siempre (decisión 2026-07-13, ver sección 16); `cotizar.js` nunca llama `GET /planes/:id/coberturas` para MRC.
  - `plan_coberturas.monto` — el frontend usa su propia constante `SUBLIMITES_FIJOS_MRC` hardcodeada en `cotizar.js` en vez de leer este campo.
  - La Carta Oferta (`backend/src/templates/oferta/mrc.js`) no toca `plan_coberturas` directo — solo renderiza lo que ya quedó en `cotizacion_coberturas`, así que se arregla solo en cuanto el calculador use los valores correctos antes de guardar.
- WU6 queda entonces como: reemplazar `CODIGO_INCENDIO_EDIFICIO`/`CODIGO_INCENDIO_CONTENIDO` y `SUBLIMITES_FIJOS_MRC` por lecturas reales de `plan_coberturas` (incluida_por_defecto + monto), verificando que la prima de MRC Normal no cambie antes/después del refactor.

**WU6 — cerrado parcialmente (2026-07-17), premisa del backend corregida al implementar:**
Al leer `plan_coberturas` real del plan "MULTIRRIESGO COMERCIO - NORMAL" (id 6) contra Supabase, las
5 filas que trae son `sublimite_cctv` (false) y 4 sublímites en `incluida_por_defecto = true`
(`sublimite_danos_agua`, `sublimite_equipos_electronicos`, `sublimite_granizo`, y uno que la vieja
constante `SUBLIMITES_FIJOS_MRC` no tenía cargado: `sublimite_murallas_cercos`, Gs. 1.000.000).
**Ninguna fila corresponde a `incendio_edificio`/`incendio_contenido`** — esos 2 códigos no viven en
`plan_coberturas`, se cotizan por Capital Edificio/Capital Contenido (campo propio del formulario,
sin correlato en esa tabla). Por lo tanto:

- **`backend/src/calculators/mrc.calculator.js` NO se tocó** — las constantes
  `CODIGO_INCENDIO_EDIFICIO`/`CODIGO_INCENDIO_CONTENIDO` siguen hardcodeadas a propósito: no existe
  ninguna fuente dinámica real de la que leerlas hoy. Si en el futuro se necesita hacerlas
  configurables desde el admin, hace falta primero decidir con Kevin dónde vive ese dato (¿nueva
  columna en `planes`? ¿fila especial en `plan_coberturas` sin `monto`?), no asumir que ya existe.
- **`frontend/cotizar/cotizar.js` sí se refactorizó**: `SUBLIMITES_FIJOS_MRC` reemplazada por
  `sublimitesFijosMrc()`, que lee `state.planCoberturas` (cargado vía `GET /planes/:id/coberturas`
  al elegir plan). Verificado que la Prima de MRC Normal no cambia (Gs. 423.400, mismo capital de
  prueba antes/después).
- **Efecto colateral esperado, no una regresión — confirmado (2026-07-19)**: el panel "Sublímites"
  de MRC ahora muestra 4 filas en vez de 3 (se suma "murallas/cercos", que ya estaba en la base de
  datos pero la constante vieja no reflejaba). Kevin confirmó que Gs. 1.000.000 es el monto correcto
  para producción — no hace falta ninguna corrección. WU6 queda cerrado del todo.

## 21. Resumen cierre de Fase 6/7 — 2026-07-20

**Fase 6/7 completa y lista para producción en MRC, Incendio y Vida/AP.** Estado por ramo:

**Multirriesgo Comercio (MRC):** 🟢 Operativo. Plan Normal cotiza end-to-end, Carta Oferta genera
PDF, panel admin puede editar tasas, coberturas adicionales repetibles, permisos granulares
implementados. "Comercio Protección Total" desactivado (sin RPF).

**Incendio:** 🟡 Listo para calculador. Catálogo completo (2 planes, 5 coberturas, 49 rubros de
actividad), RPF confirmado (Contado 0% / Cobrador 1,6% / Boca 1,35% / Tarjeta 1%, fijo para todos
los planes). Falta: lógica de cálculo en `incendio.calculator.js` (datos 100% confirmados, no RPF
ni prima técnica mínima incompleta).

**Vida y Accidentes Personales:** 🟡 Listo para calculador. Catálogo completo (7 planes, 11
coberturas, tarifación por edad en 44 filas), RPF confirmado (igual a Incendio, sin prima técnica
mínima). Falta: lógica de cálculo en `vida-ap.calculator.js`.

**Próximos pasos confirmados con Kevin:** (1) Implementar calculadores de Incendio y Vida/AP, (2)
Agregar templates de Carta Oferta para ambos ramos (pendiente texto oficial), (3) Retomar Fase 2
(Auto) si se pide, (4) Hogar/TRO cuando el cliente lo solicite (no incluido aún).

**Migraciones aplicadas:** 001–031 contra Supabase real (28 migraciones de catálogo + motor, 3 de
config/permisos). **Código estable:** auto.calculator (Fase 1), mrc.calculator (Fase 6), backend
robusto con error handling explícito y validaciones Zod, frontend Vanilla JS sin dependencies.

## 22. Migración visual "Diseño 2" + rediseño del cotizador — 2026-07-21/22

Después de cerrar Fase 6/7 a nivel de negocio, Kevin pidió una línea de trabajo NO formal de fase:
mejorar cómo se ve y se usa la app real. La decisión no fue "cambiar por cambiar"; el motivo fue
explícito: el look anterior se sentía demasiado gris, rígido y parecido a un reporte de sistema,
cuando el objetivo es que un agente no técnico pueda usarlo con comodidad.

- **App shell completo migrado a "Diseño 2"** (`75791d0`, `2b2e1b7`, `5958c0c`): topbar, sidebar,
  cards y navegación de `cotizar`, `historial`, `admin` y `configuracion` se alinearon al mockup
  `docs/mockups/diseno-2-app-shell.html`, aprobado por Kevin el 2026-07-21.
- **Convenciones que quedaron fijas** por esta migración: sidebar/topbar de 264px, headers de card
  celestes `#F8FAFF`, acciones dentro del header de card (no en toolbars separados), íconos SVG de
  línea en la navegación, y preferencia por layouts compactos antes que "estirar para llenar".
- **Vista Datos del cotizador MRC** (`c4d5e46`, `5173166`, `1f9b4aa`): "Plan a presentar", "Datos
  del asegurado" y "Cotización en vivo" pasan a cards; aparece un stepper de 3 pasos; el panel en
  vivo muestra la prima total en rojo con ícono informativo y sublímites con íconos propios; y se
  ajustaron paddings/gaps para que con 1 cobertura adicional el formulario todavía no scrollee.
- **Vista Detalle del plan** (`b9746d2`, `70686b9`, `b62355e`): deja atrás la tabla gris tipo
  reporte y se reorganiza como experiencia de checkout — resumen fijo a la derecha, coberturas como
  cards, botón claro para volver a editar datos, y exclusiones del plan visibles ya desde la etapa
  de Datos. El porqué fue directo: Kevin vio la captura real y pidió que "quede bien visualmente",
  no solo que funcione.

## 23. Navegación post-login, PDF MRC en Oficio y hallazgo de textos faltantes — 2026-07-22

- **Pantalla de bienvenida post-login** (`f3e1682`): se agregó `frontend/bienvenida/` como pantalla
  intermedia entre Login y Cotizar. Tiene 3 estados (elegir acción, elegir ramo y placeholder de
  Propuesta Formal) y `/cotizar` ahora acepta `?ramo=` para entrar con el ramo ya preseleccionado.
  Motivo: separar mejor la intención del usuario y no mandar siempre directo al cotizador.
- **Card de "Panel de Administración" en bienvenida** (`e3cd3aa`): se muestra solo si el usuario
  realmente tiene acceso administrativo (`tieneAccesoAdmin()`), incluyendo roles custom con
  permisos parciales. Motivo: el acceso dejó de ser equivalente a `rol === 'admin'`.
- **Carta Oferta de MRC en tamaño Oficio real** (`f38f0e7`): el PDF pasó de A4 a Legal/Oficio
  (215,9 × 355,6 mm), porque ese tamaño coincidió con lo que reporta una impresora física en
  Paraguay; medidas probadas "casi oficio" dejaban el pie desalineado al imprimir. También se sumó
  AGENTE/EMAIL al footer y se limpió el texto "Gracias por confiar en nosotros".
- **Hallazgo documentado, no bug de código**: 3 coberturas de MRC quedaron con
  `texto_legal`/`texto_exclusiones` en `NULL` desde la migración 012: `cristales`,
  `responsabilidad_civil` y `equipos_electronicos`. La Carta Oferta no imprime texto para ellas
  porque el dato no existe; Kevin todavía no tiene el texto oficial. Esto queda como pendiente real
  de datos, no de implementación.
- **Historial más claro al usarlo** (`3dea406`): acciones con jerarquía visual más limpia,
  colores semánticos por estado y bloqueo del botón de descarga mientras se genera el PDF para
  evitar clics duplicados.

## 24. Hardening del panel admin — 2026-07-23

Kevin detectó un problema REAL, no teórico: un rol custom con permisos sobre usuarios podía tocar
al usuario admin verdadero. A partir de eso se hizo un endurecimiento puntual del panel admin.

- **Acceso al panel movido al perfil del topbar** (`db8a1d2`): el link "Panel de administración"
  sale del sidebar y pasa al dropdown del perfil. Esto acompaña el app shell nuevo y evita duplicar
  navegación.
- **`tieneAccesoAdmin()` corregido**: el frontend ahora considera acceso administrativo tanto para
  `rol = admin` como para cualquier usuario con permisos parciales (`puede_gestionar_usuarios`,
  `puede_editar_coberturas`, `puede_editar_tasas`, `puede_editar_planes`). Antes dejaba afuera a
  roles custom válidos, aunque en backend sí tuvieran permiso real.
- **Guard anti-admin a nivel service**: ningún usuario/rol que no sea `admin` puede editar,
  desactivar, resetear password ni eliminar a un usuario admin. Importante: el gate vive en
  `backend/src/services/admin.service.js`, no solo en botones ocultos de UI.
- **Eliminar usuarios/roles sin uso**: se agregaron endpoints y botones de borrado duro. No hay
  `ON DELETE CASCADE`; si existen cotizaciones o usuarios asociados, Postgres devuelve `23503` y el
  backend lo traduce a 409 con mensaje explicativo. Decisión correcta para este dominio: mejor
  fallar explícitamente que borrar historial por accidente.

## 25. Pendientes vigentes después de la sincronización (verificados contra Engram + git)

- **Calculadores `incendio.js` y `vida-ap.js`**: siguen pendientes solo por implementación.
- **Templates de Carta Oferta para Incendio y Vida/AP**: siguen bloqueados por texto oficial.
- **Textos legales faltantes en 3 coberturas de MRC**: siguen pendientes de dato fuente de Kevin.
- **Propuesta Formal**: la bienvenida ya la reserva como flujo futuro, pero sigue siendo placeholder;
  no hay pantalla funcional ni PDF final todavía.

## 26. Auditoría de seguridad — hallazgos corregidos (2026-07-23)

Se corrigieron 6 de 7 hallazgos de una auditoría de seguridad del backend, un commit por
hallazgo, con la suite de tests (`npm test`, 19 tests) verde después de cada uno:

- **[CRÍTICO] Escalada de privilegios en `editarUsuario`** — `asegurarPuedeModificarAdmin` solo
  validaba el rol ACTUAL del usuario objetivo, nunca el rol RESULTANTE de aplicar `cambios.rol_id`
  (sin restricción en el schema Zod). Un usuario con rol custom `puede_gestionar_usuarios=true`
  podía autopromoverse a admin. Fix: nueva `asegurarPuedeAsignarRol` en
  `backend/src/services/admin/usuarios.service.js` resuelve `rol_id` contra la tabla `roles` y
  exige `solicitante.rol === 'admin'` si el destino es admin. Test agregado
  (`usuarios.service.test.js`, con `node:test` + `mock.module`, requiere el flag
  `--experimental-test-module-mocks` ya agregado al script `test` de `package.json`).
- **[ALTO] CORS con fallback wildcard** — `backend/src/app.js` eliminó el `|| '*'`; ahora
  `createApp()` lanza explícito al arrancar si falta `FRONTEND_URL`, mismo patrón que
  `config/supabase.js` para las env vars de Supabase.
- **[MEDIO] Sin cabeceras de seguridad HTTP** — se agregó `helmet()` como middleware global en
  `app.js`, antes de las rutas.
- **[MEDIO] Sin rate limiting en login** — nuevo `backend/src/middleware/rate-limit.js`
  (`express-rate-limit`, key compuesta IP+email vía `ipKeyGenerator` para no penalizar una IP
  compartida por los intentos fallidos de una sola cuenta), aplicado a `POST /login`.
- **[MEDIO] `xlsx@0.18.5` desactualizado (CVEs de prototype pollution/ReDoS)** — se migró
  `backend/src/services/tasas.service.js` (único consumidor real) de `xlsx` a `exceljs`,
  manteniendo el contrato de `parsearYValidarTasasAuto`/`importarTasasAuto`. Verificado
  end-to-end con un workbook de prueba generado con exceljs (4 pestañas, filas con huecos).
  Nota: `exceljs` arrastra una dependencia transitiva de `uuid` con un advisory moderado (no
  relacionado a parseo de archivos); no se forzó el downgrade que sugiere `npm audit fix --force`
  porque instala una versión de `exceljs` más vieja, peor tradeoff que el moderado actual.
- **[BAJO] Import de tasas sin validar tipo de archivo** — `admin-tasas.routes.js` agregó
  `fileFilter` a `multer` (extensión `.xlsx` + mimetype OOXML); si no matchea, `req.file` queda
  `undefined` y el controller ya lo traduce a 400.

**Actualización 2026-07-23 — este hallazgo ya quedó resuelto** (ver sección 27): sigue Bearer en
`localStorage` (decisión explícita de Kevin, no se migró a cookie httpOnly), pero ahora hay TTL
corto (45m) + invalidación server-side vía `token_version` + logout explícito.

## 27. Sesión JWT sin revocación — resuelto (2026-07-23)

Cierra el hallazgo [ALTO] que había quedado explícitamente fuera del batch de la sección 26. Sigue
Bearer en `Authorization` header / `localStorage` (Kevin confirmó no migrar a cookies httpOnly),
pero ahora el token es de corta duración y revocable del lado servidor:

- **TTL acortado**: `JWT_EXPIRES_IN` bajó de `8h` a `45m` en `backend/src/services/auth.service.js`.
  No había convención de env var ya establecida para esto en el proyecto, así que quedó como
  constante top-level (mismo patrón que antes).
- **Invalidación server-side vía `token_version`**: migración `032_token_version.sql` agrega
  `usuarios.token_version INTEGER NOT NULL DEFAULT 0` (aplicada contra Supabase real). El JWT lleva
  ese valor como claim; `requireAuth` (`backend/src/middleware/auth.js`) lo compara contra el valor
  fresco de la DB en cada request y devuelve 401 "Token inválido o expirado" si no coincide.
  `usuariosRepository.incrementarTokenVersion(id)` (lee y reescribe, sin expresión de columna en el
  builder de Supabase JS) se llama en los 4 puntos que deben cerrar sesiones: logout explícito,
  cambio de contraseña propio, reset de contraseña por admin, y desactivación de usuario
  (`editarUsuario` con `activo: false`).
- **Nuevo endpoint `POST /api/auth/logout`**: protegido con `requireAuth`, incrementa
  `token_version` del usuario autenticado y devuelve 204. Capas completas
  (`routes/auth.routes.js` → `controllers/auth.controller.js` → `services/auth.service.js`).
- **Frontend centralizado**: `auth.logout()` en `frontend/shared/api.js` llama al endpoint nuevo
  ANTES de limpiar `localStorage`, best-effort (si falla por red o token ya vencido, igual limpia
  sesión y redirige — no bloquea el logout del cliente). Reemplaza las 6 implementaciones
  duplicadas de `cerrarSesion`/handler de logout que había sueltas en `cotizar.js`, `admin.js`,
  `historial.js`, `configuracion.js` y los dos guards (`configuracion-guard.js`,
  `historial-guard.js`), que antes solo hacían `clearSession()` sin avisarle al backend.
- **Tests nuevos** (`backend/src/services/auth.service.test.js`, mismo patrón `node:test` +
  `mock.module` con estado mutable compartido entre `auth.service.js` y `middleware/auth.js`):
  token con `token_version` vieja rechazado con 401, logout invalida el token con el que se llamó,
  y cambio de contraseña propio invalida tokens emitidos antes del cambio. Suite completa en verde
  (23 tests).

## 28. Logging de eventos de seguridad (A09) + auditoría de mass assignment en admin (A01) — resuelto (2026-07-23)

Cierra los dos hallazgos pendientes de la auditoría de seguridad referenciados en la sección 26.

### A09 — Logging de eventos de seguridad

No había ningún logging de eventos de seguridad en el proyecto. Se agregó
`backend/src/utils/seguridad-logger.js` con `logSeguridad(evento, detalle, nivel)`: escribe a
`console.warn`/`console.error` una línea JSON con `timestamp`, `evento` y `detalle`, filtrando
(`[REDACTED]`) cualquier campo cuyo nombre contenga `token`/`password`/`passwordHash` antes de
loguear — nunca se loguea un token, un `password_hash` ni una contraseña en texto plano.

Instrumentado en:

- `auth.service.js` → `login`: `login_fallido` (email + motivo genérico `credenciales_invalidas` /
  `usuario_inactivo`, nunca la contraseña) y `login_exitoso` (usuarioId + email).
- `admin/usuarios.service.js`:
  - `editarUsuario` → `cambio_rol_usuario` cuando `cambios.rol_id` cambia el rol efectivo
    (solicitante, usuario objetivo, rol anterior → nuevo) y `usuario_desactivado` cuando
    `cambios.activo === false`.
  - `resetearPassword` → `reset_password_por_admin` (quién resetea a quién).
  - `eliminarUsuario` → `usuario_eliminado` (quién, a quién).
  - `asegurarPuedeAsignarRol` → `intento_escalada_rol_admin_rechazado` (nivel `error`) cuando se
    rechaza un intento de asignar el rol admin sin ser admin pleno.
  - `asegurarNoAutoAjustaTope` (nueva, ver A01 más abajo) → `intento_auto_ajuste_tope_rechazado`.
  - `roles.service.js` → `asegurarPuedeOtorgarPermisos` (nueva, ver A01) →
    `intento_escalada_permisos_rol_rechazado` (nivel `error`).

Verificado con tests que espían `console.warn`/`console.error` (`t.mock.method`) en
`auth.service.test.js` (login_fallido no expone password/hash, login_exitoso se dispara) y de forma
indirecta en los tests de escalada de `usuarios.service.test.js`/`roles.service.test.js` (los eventos
aparecen en la salida de `npm test`, confirmando que corren sin romper el flujo).

### A01 — Auditoría de mass assignment en endpoints admin

Se revisaron los 4 puntos pedidos. Dos tenían gap real (mismo patrón de la sección 26: validar
contra el permiso REAL del solicitante, no solo el estado actual del objetivo), dos no:

1. **`crearUsuario` (gap real, corregido)** — a diferencia de `editarUsuario` (que desde la sección
   26 ya llama `asegurarPuedeAsignarRol`), `crearUsuario(datos)` no recibía `solicitante` y no
   validaba `rol_id` en absoluto: un usuario con `puede_gestionar_usuarios = true` podía dar de
   alta directamente un usuario nuevo con `rol_id` del rol admin. Fix: `crearUsuario` ahora recibe
   `solicitante` (`admin.controller.js` pasa `req.usuario`) y corre `asegurarPuedeAsignarRol` antes
   de crear. Test: `crearUsuario rechaza con 403 si un solicitante no-admin intenta dar de alta un
usuario con rol_id del rol admin`.
2. **CRUD de roles custom (gap real, corregido)** — `crearRol`/`editarRol` no validaban los 4
   booleanos de permiso contra el solicitante: cualquier usuario con `puede_gestionar_usuarios`
   (el único gate de ruta para `/admin/roles`) podía crear o editar un rol con los 4 permisos en
   `true` (incluido `puede_gestionar_usuarios`) y después asignárselo a sí mismo vía `editarUsuario`
   — ese endpoint solo bloquea el rol literal `'admin'`, no un rol custom con el mismo efecto
   práctico. Fix: nueva `asegurarPuedeOtorgarPermisos(cambios, solicitante)` en
   `roles.service.js` — un solicitante no-admin no puede setear en `true` ningún permiso que él
   mismo no tenga (`puede_editar_tasas`/`puede_gestionar_usuarios`/`puede_editar_coberturas`/
   `puede_editar_planes`); un `admin` pleno sigue sin restricción. `crearRol`/`editarRol` y sus
   controllers ahora reciben/pasan `solicitante` (`req.usuario`). El chequeo de rol de sistema
   (`es_sistema`) en `editarRol` sigue corriendo primero (409 antes que el 403 de permisos). Tests
   en `roles.service.test.js` (archivo nuevo): rechazo al otorgar un permiso que no se tiene,
   rechazo al auto-otorgarse `puede_gestionar_usuarios`, permitido otorgar un subconjunto que sí se
   tiene, admin sin restricción, y que el 409 de rol de sistema sigue corriendo antes del chequeo
   de permisos.
3. **`planes.service.js` / `rubros-actividad.service.js` (sin gap)** — los schemas Zod
   (`editarPlanSchema`, `editarRubroActividadSchema`, `editarPlanFormaPagoSchema`,
   `editarPlanCoberturaSchema`, `agregarCoberturaAPlanSchema`) están acotados exactamente al
   dominio de su propio permiso (`activo`/`prima_tecnica_minima`, `tasa_edificio`/
   `tasa_contenido`, `tasa_rpf`/`habilitada`, etc.) y Zod usa modo `strip` por defecto: cualquier
   campo fuera del schema (ej. `rol_id`, permisos) se descarta antes de llegar al service. No hay
   overlap hacia otro dominio ni forma de escalar permisos desde estos endpoints.
4. **Tope de descuento/recargo por usuario (gap real menor, corregido)** — no existe ningún otro
   endpoint que escriba `descuento_maximo_pct`/`recargo_maximo_pct` fuera de `editarUsuario`
   (`editarUsuarioSchema` es el único lugar que los declara), así que la pregunta original ("¿por
   algún endpoint que no sea editarUsuario?") tiene respuesta negativa. Pero se detectó, dentro de
   `editarUsuario` mismo, que un solicitante no-admin con `puede_gestionar_usuarios` podía editarse
   a **sí mismo** y subir (o poner en `NULL`, heredando el tope más alto del plan) su propio tope,
   usando el mismo permiso con el que ya gestiona a otros usuarios. Fix: nueva
   `asegurarNoAutoAjustaTope(idObjetivo, cambios, solicitante)` — bloquea con 403 que un solicitante
   no-admin toque `descuento_maximo_pct`/`recargo_maximo_pct` de su **propio** usuario (editar el
   tope de otro usuario sigue permitido, igual que antes). Tests: rechazo de auto-ajuste, admin
   editando su propio tope permitido, y edición del tope de otro usuario permitido para un
   solicitante no-admin.

Suite completa del backend verificada en verde: **36 tests** (los 23 previos + 13 nuevos de esta
sección), corridos con `npm test` desde `/backend`.

## 29. Auditoría integral consolidada + cierre de los 2 hallazgos críticos (2026-07-24)

Kevin pidió un informe ejecutivo consolidado citando 6 auditorías previas (Arquitectura, Código,
Seguridad, Performance, Base de datos, UX/UI). Al verificar contra Engram y este documento, solo
Seguridad (sección 26-28) y una auditoría parcial de schema/índices (migración 033) estaban
realmente documentadas — se le avisó explícitamente y se corrieron las 4 auditorías faltantes vía
sub-agentes de solo lectura antes de consolidar el informe (publicado como Artifact). Score final:
**70/100** (Arquitectura 7.5, Código 7.0, Seguridad 8.5, Performance 8.0, Escalabilidad 6.5,
Mantenibilidad 6.5, UX 6.5, UI 7.5, Accesibilidad 5.5, Documentación 7.5, Testing 5.0/10).

De esa auditoría salieron 2 hallazgos críticos, ambos cerrados el mismo día:

### Sublímites de MRC desincronizados entre el PDF y el catálogo — resuelto

`backend/src/templates/oferta/mrc.js` tenía `SUBLIMITES_FIJOS_MRC` hardcodeado (al que le faltaba
`sublimite_murallas_cercos` — confirmado contra `migrations/012_seed_mrc.sql`, las 4 filas de
`plan_coberturas` para MRC Normal tienen `incluida_por_defecto = TRUE`: agua, equipos_electronicos,
murallas_cercos, granizo) y `TEXTO_DISTRIBUCION_CAPITAL` con montos de sublímites en texto plano.
El frontend ya leía estos montos dinámicamente desde `plan_coberturas` desde WU6 (2026-07-17), pero
el PDF —documento contractual— seguía con los valores viejos: un admin podía cambiar un sublímite y
el PDF seguía mostrando el monto anterior.

Fix: `cotizacion.service.js` (`generarPdfOferta`) ahora también trae
`ramosRepository.findCoberturasByPlanId(plan.id)` y lo pasa como `planCoberturas` a través de
`pdf.service.js` → `templates/oferta/index.js` → `buildMrcOfertaPages`. En `mrc.js`,
`sublimitesFijosMrc(planCoberturas)` deriva el set de sublímites fijos en vivo (mismo criterio que
el frontend: `incluida_por_defecto === true`, excluyendo `incendio_edificio`/`incendio_contenido`),
y `buildTextoDistribucionCapital(...)` arma el texto con los montos reales vía `fmtGs()`. Las líneas
de distribución fija que no vienen del catálogo (Incendio/Robo 50%/50%) quedaron intactas. Test de
regresión nuevo: `backend/src/templates/oferta/mrc.test.js` (4 casos, incluido uno que falla contra
el código viejo para confirmar que el bug quedaba cubierto).

**Deuda residual no tocada, fuera de alcance**: `sublimite_cctv` también quedó marcado
`incluida_por_defecto = TRUE` en la migración 012, pero no tiene tasa cargada en
`tasas_cobertura_ramo` (nunca puede aparecer en una cotización real) — gap de datos preexistente,
no relacionado a este bug.

### Cero tests unitarios en los motores de cálculo — resuelto

Solo existía `ramo-calculator.contract.test.js` (verifica forma, no valores). Se agregaron:
`mrc.calculator.test.js` (16 casos), `incendio.calculator.test.js` (13 casos),
`vida-ap.calculator.test.js` (15 casos) — 44 casos nuevos cubriendo: piso de prima técnica mínima
(activado y no activado), las 4 formas de pago simultáneas con RPF fijo correcto, redondeo de RPF
hacia arriba / Cuota hacia abajo con un caso no redondo, invariante `inicial + cuotas×cuota ===
premio`, tope de descuento/recargo (`MIN` entre plan y usuario en ambos sentidos), casos de error
(rubro sin tasa, capital fuera de rango, mínimo de coberturas MRC, edad fuera de rango en Vida
Directivos), y confirmación explícita de que Vida-AP no tiene piso de prima técnica mínima. No se
encontraron discrepancias entre el código real y las reglas de negocio documentadas.

Suite completa verificada en verde: **84 tests** (40 previos + 44 nuevos), corridos con `npm test`
desde `/backend`, estables en 3 corridas consecutivas.

**Corrección de un dato desactualizado detectado en el camino**: este documento y CLAUDE.md decían
"`incendio.js`/`vida-ap.js` — lógica de cálculo pendiente". Era incorrecto: ambos ya estaban
implementados (245 y 294 líneas respectivamente) desde antes de esta sesión. Corregido en ambos
archivos.

**Pendientes de la auditoría integral que quedan sin agendar**: ver informe completo (score por
dimensión, tabla de priorización, Top 30 ROI) en el Artifact publicado / engram obs #259. Checklist
resumido abajo — Kevin lo va resolviendo antes de lanzar a producción sin restricciones.

## 30. Roadmap pre-producción — pendientes de la auditoría integral (2026-07-24)

Los 2 🔴 críticos ya se cerraron (sección 29). Esto es lo que falta, ordenado igual que el informe
ejecutivo (Sprint 1-4). Marcar con `[x]` a medida que se resuelva cada uno — no mezclar con el
checklist de fases de arriba, este es transversal a fases.

### Sprint 1 — accesibilidad y feedback del flujo principal

- [ ] Selección de ramo navegable por teclado (`cotizar.js:878`, `bienvenida.js:131`) — hoy solo
      funciona con mouse, rompe con teclado/lector de pantalla.
- [ ] Fix de contraste `--tajy-text-secondary` (`cotizador.css:22`, 3.44:1, falla WCAG AA) — mismo
      fix que ya se aplicó a `--tajy-text-muted`.
- [ ] Banners de error reales en los 8 puntos de carga silenciosa de `cotizar.js` (líneas 229, 277,
      285, 420, 437, 477, 491) — hoy solo van a `console.error`, el agente ve un formulario vacío sin
      explicación.
- [ ] **Insert de cotización multi-tabla sin rollback ante fallo parcial** (`cotizacion.service.js`
      líneas 25-46 y 171-249) — si `insertPlanesPago` u otro insert intermedio falla después de que la
      fila principal y una variante ya se guardaron, queda una cotización huérfana en Historial con
      numeración correlativa consumida y sin plan de pago. Solución: envolver todo el conjunto en una
      función Postgres vía `supabase.rpc(...)` (mismo patrón que `siguiente_correlativo`), o agregar
      limpieza compensatoria en el catch. Hallazgo del QA integral del 2026-07-24 (ver artifact/engram).
- [ ] **"Emitir carta oferta" no valida ramo antes de persistir en Incendio/Vida-AP**
      (`cotizar.js:721-752`, a diferencia de `historial.js:28-33` que sí tiene el guard) — cada intento
      fallido hace `POST /cotizaciones` (201, consume correlativo) antes de descubrir con el PDF que el
      ramo no tiene template (422), dejando cotizaciones huérfanas acumulativas. Solución: exponer
      `ofertaDisponibleParaRamo` desde `/api/ramos` y usarlo para deshabilitar el botón en `cotizar.js`
      igual que ya hace Historial. Hallazgo del QA integral del 2026-07-24.
- [ ] **Race condition en el preview de cálculo en vivo de MRC** (`cotizar.js:526-716`,
      `scheduleCalculate`/`calcularPreview`) — el debounce protege el timer pero no las peticiones ya en
      vuelo; con red lenta, una respuesta vieja puede resolver después de una más nueva y pisar
      `state.preview` con una prima incorrecta para los datos actuales en pantalla. Solución: número de
      secuencia incremental o `AbortController` para descartar respuestas obsoletas. Hallazgo del QA
      integral del 2026-07-24.

### Sprint 2 — mantenibilidad puntual

- [ ] Label de rol hardcodeado en sidebar/topbar (`frontend/shared/sidebar.js:52`) — solo contempla
      `admin`/`agente`, cualquier rol custom (creado desde el panel de Admin) muestra siempre el texto
      fijo "Analista comercial" en vez de su nombre real. Cosmético, sin impacto de seguridad ni de
      permisos (los booleanos de permiso sí se leen y aplican bien). Fix: mostrar `usuario.rol`
      capitalizado cuando no matchea los 2 casos especiales. Hallazgo del QA integral del 2026-07-24
      (continuación con usuario admin real).
- [ ] Extraer `mostrarBanner()` (duplicada literal en `cotizar.js:376` y `admin.js:128`) a
      `frontend/shared/`.
- [ ] Helper compartido para el esqueleto repetido de `mrc.calculator.js`/`incendio.calculator.js`
      (guards de piso técnico, tope, capital×tasa).
- [ ] Unificar cache de catálogos: hoy el mismo dato se cachea cuando lo pide el motor de cálculo
      pero no cuando lo piden directo `cotizar.js`/`admin.js`.
- [ ] Reemplazar `confirm()` nativo por el modal propio en las 5 acciones destructivas de admin
      (`admin.js:210,224,364,668,860`).

### Sprint 3 — escalabilidad y hardening restante

- [ ] Punto único de registro de ramo (hoy fragmentado en 4 archivos: `calculators/index.js`,
      `cotizacion.service.js`, `templates/oferta/index.js`, `cotizar.js`) — condición para sumar
      Incendio/Vida-AP/Auto sin fricción creciente.
- [ ] Habilitar RLS en las 30 tablas de Supabase (con revisión de policies).
- [ ] Cola de concurrencia + single-pass render en Puppeteer (`pdf.service.js:20-44`) — hoy N PDFs
      simultáneos abren N páginas sobre un solo proceso Chromium.
- [ ] Validación inline por campo en el formulario de cotizar (hoy solo deshabilita el botón con
      mensaje genérico).
- [ ] Breakpoint intermedio responsive (900-1200px) en `cotizador.css:1281,1830`.

### Sprint 4 — cierre de roadmap de seguridad + modularización

- [ ] Migrar sesión JWT a cookie httpOnly + SameSite (decisión de arquitectura, resuelve CORS/CSRF)
      — ya estaba en el roadmap de seguridad aceptado (sección 27).
- [ ] Logging de seguridad a sink centralizado (Sentry/Logtail) en vez de `console.warn`/`error`.
- [ ] Automatizar `npm audit`/Dependabot en CI.
- [ ] Arrancar modularización de `cotizar.js` (1739 líneas) / `admin.js` (2101 líneas) por
      responsabilidad (fetch/render/estado) — inversión de mediano plazo, no bloqueante por sí sola.

### QA funcional en vivo — continuación con usuario admin real (2026-07-24)

La primera pasada del QA integral (arriba) no había podido verificar el panel de Admin por falta de
credenciales de rol admin. Kevin pasó el usuario admin real (`kevinruiz@tajy.com.py`) y se repitió esa
parte del QA en vivo con Playwright. Resultado: **CRUD de usuarios, roles con permisos granulares,
coberturas por plan, editor de tasas (`rubros_actividad` por UPDATE directo, `tasas_cobertura_ramo`
versionado por INSERT — confirmado, coincide con lo documentado) y tope de descuento/recargo por
usuario funcionan correctamente**, igual que el guard de "ningún rol no-admin puede tocar al admin
real" (commit `db8a1d2`) — confirmado con 403 real vía API directa y con los botones Editar/Eliminar
directamente no renderizados en la fila del admin para un rol custom. Todos los datos de prueba
creados en esta pasada (usuario, rol, versión de tasa, edición temporal) se revirtieron/eliminaron al
cierre. El único hallazgo nuevo fue el bug cosmético del label de rol, ya sumado al Sprint 2 arriba.

**Pendiente de acción manual de Kevin — no resuelto por el QA:** quedó un usuario de prueba huérfano
de una sesión de QA anterior, `qa.test.ownership+1784502107843@tajy.com.py` (rol Agente, inactivo), que
el agente de QA no pudo eliminar porque el clasificador de permisos del entorno bloqueó el DELETE.
Hay que borrarlo a mano desde el panel de Usuarios.

**Condición dura antes de lanzar a producción sin restricciones**: al menos Sprint 1 completo
(accesibilidad + feedback del flujo principal) — el resto es iterable en producción, pero no debería
quedar como "deuda aceptada" indefinida. Ver conclusión completa y veredicto en el informe ejecutivo.

## 31. Pendientes operativos puntuales (movidos desde CLAUDE.md, 2026-07-24)

Detalle de items que CLAUDE.md antes traía completos en "Pendientes activos que pueden afectar el
código" — se centralizan acá para que CLAUDE.md quede corto y este documento siga siendo la única
fuente de detalle histórico/pendiente.

- **Corrección de dato desactualizado (auditoría integral 2026-07-24)**: `incendio.calculator.js`
  (245 líneas) y `vida-ap.calculator.js` (294 líneas) YA estaban implementados con lógica de
  cálculo completa — una línea vieja de CLAUDE.md decía "pendiente" por error. Lo que sí faltaba y
  ahora está cerrado: tests unitarios de los 3 calculators (mrc/incendio/vida-ap), agregados el
  2026-07-24 (44 casos nuevos, 84/84 tests en verde). Siguen sin template de Carta Oferta propio
  (requieren texto oficial de cada ramo).
- **Sublímites de MRC en el PDF de Carta Oferta desincronizados del catálogo — resuelto
  (2026-07-24)**: `backend/src/templates/oferta/mrc.js` tenía montos hardcodeados
  (`TEXTO_DISTRIBUCION_CAPITAL`) y un array `SUBLIMITES_FIJOS_MRC` al que le faltaba
  `sublimite_murallas_cercos`. Ahora ambos se derivan en vivo de `plan_coberturas` (mismo criterio
  que ya usaba el frontend desde WU6), con test de regresión en `mrc.test.js`.
- **Modal "Nuevo usuario" sin campos de tope propio**: no tiene campos de tope propio
  (descuento/recargo máximo) — solo "Editar usuario" los tiene. Usuario recién creado queda sin
  tope (`NULL`, solo el tope del plan) hasta que se edite a mano (confirmado con Kevin como
  "revisamos después").
- **Textos legales faltantes en catálogo MRC** (detectado 2026-07-22):
  `coberturas_catalogo.texto_legal`/`texto_exclusiones` quedaron en `NULL` desde la migración 012
  (2026-07-10) para `cristales` (Rotura de Cristales, Vidrios o Espejos), `responsabilidad_civil` y
  `equipos_electronicos`. La Carta Oferta de MRC (`renderCoberturaItem` en
  `backend/src/templates/oferta/mrc.js`) solo imprime el bloque de texto legal/exclusiones si esos
  campos no son null, así que estas 3 coberturas aparecen sin texto en el PDF (solo el nombre) —
  comportamiento esperado dado el dato faltante, no un bug. Kevin no tiene todavía el texto oficial
  de estas 3 coberturas; falta cargarlo en una migración nueva cuando esté disponible.
- **Propuesta Formal en bienvenida sigue como placeholder** (2026-07-22): la nueva pantalla
  `frontend/bienvenida/` ya separa el flujo "Cotizar" de "Elaborar una Propuesta Formal", pero el
  segundo todavía muestra solo "Próximamente". No confundir esta navegación nueva con Fase 4
  cerrada: la Propuesta Formal sigue pendiente a nivel funcional y de PDF.

## 32. Incendio — 3 planes nuevos (Hipotecario, con/sin Inspección) + moneda USD/Gs. — implementado, verificado en vivo y mergeado a main (2026-07-27)

Cambio SDD `incendio-3-planes-y-moneda` (`openspec/changes/incendio-3-planes-y-moneda/`), 23/23
tasks completas en 3 PRs encadenados (`stacked-to-main`), **mergeados a `main`**:
[#14](https://github.com/fenix1050/produccion/pull/14) (17:40 UTC),
[#15](https://github.com/fenix1050/produccion/pull/15) (17:50 UTC),
[#16](https://github.com/fenix1050/produccion/pull/16) (17:55 UTC). Ramas
`feature/incendio-moneda-pr1/pr2/pr3-*` borradas (local y remota) tras el merge. `main` en verde:
97/97 tests backend.

Nota operativa para futuros PRs stacked: al mergear un PR de la cadena, GitHub retargetea
automáticamente el siguiente PR a `main` pero **no dispara un nuevo run de CI** (el cambio de base
es un evento `edited`, no `synchronize`, y los workflows de este repo solo triggerean en
`opened`/`synchronize`/`reopened`). Los checks quedan en `pending` indefinidamente y bloquean el
merge (`main` tiene branch protection con `quality` y `Analyze JavaScript` como checks
obligatorios). Solución aplicada: un commit vacío (`git commit --allow-empty`) al branch del PR
siguiente fuerza el `synchronize` y dispara los checks.

- **PR 1** (`a6062fa`, mergeado `c6b93fc`): migraciones 034-038 (moneda, `tipo_mecanica`, tasas por
  objeto de riesgo, tipos de cambio, seed de los 3 planes) + servicio de tipo de cambio
  (`tipo-cambio.service.js`, fetch a dolarPy con fallback a último valor persistido, TTL 15 min).
- **PR 2** (`a7583dc`, mergeado `e6f043c`): tercera mecánica del calculador de Incendio
  (`calcularPorObjetoRiesgo`, `pisoPrimaTecnica`) + schema Zod. 27/27 tests del calculador en
  verde.
- **PR 3** (`d217a72` + `7a81a17` + `379ffaa`, combinado con el frontend originalmente planeado
  como PR 4 — quedaron commiteados en el mismo branch, mergeado como `f678b96`):
  `findTasasRiesgoObjeto`, `resolverUmbralInspeccion`, extensión de `resolverContextoRepositorios`
  con `moneda`, persistencia de snapshot de tipo de cambio solo al emitir; frontend —
  `fmtMoneda`, selector de moneda (Gs./USD), 4 campos opcionales de objeto de riesgo, historial con
  columna de moneda; fix post-verificación (ver detalle abajo). 97/97 tests backend en verde.

**Migraciones 034-040 aplicadas contra la base real de Supabase** (no solo archivos SQL locales)
durante esta sesión, con confirmación explícita de Kevin antes de cada tanda.

**Verificación en vivo** (Playwright headless contra `http://147.93.132.53:5000`, backend y
frontend levantados en el mismo VPS): login, los 3 planes nuevos aparecen en el selector de
Incendio, selector de moneda y 4 campos de objeto de riesgo con label dinámico, cotización en
vivo con las 4 formas de pago, umbral de inspección bloqueando "sin Inspección" y aceptando "con
Inspección" con la misma suma alta, plan legacy en Gs. y en USD sin regresiones.

**Dos vacíos de datos cerrados con Kevin durante la verificación** (antes bloqueaban el selector
o el cálculo, no eran bugs de lógica):

- Prima técnica mínima (Gs. 409.091, mismo piso que MRC) y responsabilidad máxima cotizable
  (Gs. 60.000.000.000) para los 3 planes nuevos — sin esto, `planEsCalculable` (`cotizar.js`) los
  dejaba deshabilitados con "(pendiente de confirmación)". De paso se cargó el tope de
  `MAQUINARIA BASICO` (USD 5.000.000, migración 018 lo había dejado en `NULL`) y el umbral de
  inspección (USD 700.000, migración 039).
- **Bug real encontrado en vivo**: `findTasasRiesgoObjeto` matchea `tipos_riesgo_incendio.nombre`
  contra `riesgoDatos.rubro_actividad` por igualdad exacta de string. La migración 038 sembró la
  tasa como `'VIVIENDA FAMILIAR'`, pero el catálogo de rubros de actividad (`/ramos/
rubros-actividad`, compartido con MRC) usa `'VIVIENDA'` — nunca hacían match, cualquier intento
  de cotizar Vivienda con los 3 planes nuevos rechazaba con 422 "Tipo de Riesgo sin tasas
  confirmadas". Corregido en migración 040 (renombra la tasa a `'VIVIENDA'`), confirmado por
  Kevin. Deja como aprendizaje: si se agregan más tipos de riesgo a futuro, el nombre en
  `tipos_riesgo_incendio` debe coincidir exactamente con la opción del catálogo de rubros, no con
  una etiqueta "oficial" distinta.

**Pendiente:** templates de Carta Oferta de Incendio siguen sin texto oficial (gap ya conocido, no
específico de este cambio); tasas de tipos de riesgo más allá de "Vivienda" (Kevin confirma la
semana del 2026-08-03, no bloquea lo ya implementado). El cambio SDD sigue en `phase: apply` /
`status: merged` en `state.yaml` — falta correr `sdd-verify` y archivarlo formalmente si se quiere
cerrar el ciclo SDD completo (no bloquea el uso en producción, el código ya está en `main`).

## 33. Panel admin — eliminar planes + habilitar/deshabilitar ramos del sidebar (2026-07-28)

Dos cambios chicos hechos fuera de un ciclo SDD formal (pedidos puntuales de Kevin en sesión de
chat), commiteados en la rama `fix/admin-badge-colores-rol` (junto con los fixes previos de esa
rama — prima técnica mínima USD, badge de color por rol), pusheados pero **todavía sin PR/merge a
`main`**. 100/100 tests backend en verde en ambos commits.

**a) Eliminar planes desde el panel** (`41500ca`) — botón "Eliminar" en la tabla de Planes
(`frontend/admin/admin.js`), con `confirm()` antes de borrar. Backend: `DELETE
/api/admin/planes/:id` (gate `requirePlanesEdit`, igual que el resto de la sección). Si el plan
tiene cotizaciones asociadas, Postgres rechaza el DELETE por la FK `cotizaciones.plan_id` y el
service (`planes.service.js`) lo traduce a 409 "Este plan tiene cotizaciones asociadas.
Desactivalo en vez de eliminarlo." — mismo patrón que `eliminarRol` en `roles.service.js`. Sin
migración: la tabla `planes` y la FK ya existían.

**b) Habilitar/deshabilitar ramos del sidebar — solo rol admin** (`809f5f5`) — nueva sección
"Ramos" en el panel admin, primera del panel gateada por `usuario.rol === 'admin'` literal en vez
de un permiso booleano delegable (`seccionesVisibles()` en `admin.js` ahora soporta `soloAdmin:
true` además de `permiso: '...'`; backend usa `requireRole('admin')`, middleware que ya existía
sin uso). Decisión de diseño: no se agregó columna nueva — se reusó `ramos.activo` (ya
existía, ya gateaba `findRamoById(id, {soloActivos:true})` en la creación de cotizaciones, pero
nunca se togleaba desde ningún lado). El sidebar de `/cotizar` (`RAMOS_UI` en `cotizar.js`) tenía
el estado "disponible"/"próximamente" hardcodeado por ramo, sin relación con la DB — ahora
`ramoInfo()` lo deriva de `state.ramosActivos` (`GET /ramos`, ya se cargaba, solo no se usaba para
esto). Como **todos** los 8 ramos seedeados en la migración 002 tienen `activo=TRUE` por default de
columna (incluidos `auto`/`hogar`, que la UI mostraba como "próximamente" solo por el hardcode),
hizo falta la migración **041** (`UPDATE ramos SET activo=false WHERE nombre IN ('auto','hogar')`)
para no des-hardcodear a "disponible" de golpe algo que Kevin no pidió — **aplicada contra
Supabase real** con confirmación explícita antes de correrla.

**Verificación en vivo** (Playwright headless): las dos features se probaron contra
`http://147.93.132.53:5000` — confirmado en esta sesión que esa dirección **no es una VPS
separada**, es el mismo sandbox de esta sesión expuesto en una IP pública (nunca hubo un servidor
remoto real; el proceso backend corre local, sin `pm2`/`systemd`, se cae si se reinicia el
sandbox). Ojo con esto en la próxima sesión: no asumir que "el VPS" persiste entre sesiones ni que
alguien lo mantiene — hay que relevantarlo (`skill run-cotizador`) cada vez. Kevin preguntó por
automatizar el deploy (`git pull` + restart vía GitHub Action) — se le explicó que no tiene sentido
mientras el destino sea temporal/indefinido; conviene retomarlo recién en Fase 8 (Deploy) cuando
se decida Railway/Render.

## 34. Template de Carta Oferta de Incendio (2026-07-28)

Sin commitear todavía (trabajo de esta sesión). Kevin pasó el texto legal oficial de los 4 planes
reales de Incendio (confirmados contra `backend/migrations/038_seed_incendio_3_planes.sql` y la
constante `NOMBRE_PLAN_MAQUINARIA` de `incendio.calculator.js`): `INCENDIO HIPOTECARIO`,
`INCENDIO CON INSPECCION`, `INCENDIO SIN INSPECCION` y `MAQUINARIA BASICO` (este último con
mecánica de cálculo `maquinaria`, distinta a los otros 3 que usan `objeto_riesgo`).

Se creó `backend/src/templates/oferta/incendio.js` siguiendo el mismo patrón de
`mrc.js` (`buildIncendioOfertaPages({ cotizacion, plan })` → `{ paginaUno, paginaDosFlex,
paginaDosBalanceada }`), enganchado en `BUILDERS_POR_CALCULADOR` de
`backend/src/templates/oferta/index.js`. A diferencia de MRC (un solo plan, un solo texto legal
fijo), Incendio necesita texto distinto por plan — se armó un mapa `TEXTOS_POR_PLAN` keyeado por
el nombre exacto del plan en DB.

**Decisiones de diseño tomadas por texto incompleto/ambiguo:**

- `MAQUINARIA BASICO` quedó sin secciones "Exclusiones"/"Recomendaciones" — el texto que pasó
  Kevin no las incluía. No se rellenaron con contenido de otro plan; el bloque simplemente se
  omite para ese plan (verificado con test que confirma que esos títulos no aparecen en su HTML).
- El placeholder `INSPECCION DE RIESGO No. XXXX/XXXX realizada en fecha XX de XXXXXXX de XXXX`
  (plan con inspección) queda **literal** en el PDF — no hay campo de número/fecha de inspección
  puntual en `riesgo_datos` ni en el modelo de cotización del que interpolarlo hoy. Si Kevin
  confirma que ese dato se va a cargar en algún lado, esto se puede resolver después.
- Fallback si `plan.nombre` no matchea ninguna key conocida: en vez de romper, muestra un bloque
  único "Texto legal pendiente de carga para el plan «X»" — mismo criterio defensivo que usa
  `mrc.js` para catálogo ausente.
- **Fuera de alcance a propósito** (ya lo estaba desde el cambio `incendio-3-planes-y-moneda`,
  sección 32): las 5 cláusulas obligatorias de Hipotecario que quedaron guardadas en DB
  (`ramosRepository.findClausulasObligatoriasByPlanId`) NO se renderizan en este PDF — es un gap
  conocido, pendiente de un cambio aparte si Kevin lo pide.

Tests: `backend/src/templates/oferta/incendio.test.js` (5/5 verde, uno por plan + fallback).
Commiteado en rama nueva `feat/incendio-carta-oferta-pdf` (creada a propósito, la rama de trabajo
de esta sesión era `fix/node22-supabase-realtime` y no correspondía a este cambio). Verificado en
vivo end-to-end (ver sección 35) — los 3 planes de mecánica `objeto_riesgo` confirmados con PDF
real generado por la API, texto correcto sin mezcla entre planes.

**Correcciones aparte, commiteadas en la misma rama** (no relacionadas al PDF en sí, encontradas
sin querer al verificarlo en vivo):

- `fix(a11y)`: `<main>` semántico en admin + contraste de `--tajy-green-fg` (cambio que ya estaba
  suelto en el working directory al empezar la sesión).
- `fix(cotizaciones)`: ver sección 35 — dos bugs reales de `crearCotizacion`/`numero_variante`.

## 35. Bugs reales encontrados al verificar en vivo el PDF de Incendio (2026-07-28)

Verificar el template de Incendio en vivo (sección 34) reventó dos bugs preexistentes, sin
relación con el PDF en sí — el template estaba bien, lo que rompía era la creación de la
cotización antes de llegar al PDF.

**Bug 1 — `cotizacion_variantes.numero_variante` con `UNIQUE` global en vez de por-cotización.**
La columna se puebla desde `nextNumeroCorrelativo(ramoId)` (RPC `siguiente_correlativo`, un
contador **por ramo**), pero la migración 005 la declaró `UNIQUE` a nivel de toda la tabla. En
cuanto el contador de un ramo alcanza un número que otro ramo ya usó (ej. Incendio llegando a "7"
cuando MRC, que tiene muchísimas más cotizaciones, ya usó ese "7" hace rato), el INSERT revienta
con `duplicate key value violates unique constraint "cotizacion_variantes_numero_variante_key"` —
500 en `Emitir carta oferta`. Confirmado con `rg -n "numero_variante"` que la columna no se
muestra en ningún lado (frontend ni PDF) — es puramente interno, solo necesita ser distinta
dentro de la misma cotización. Corregido con la migración **042**
(`ALTER TABLE ... DROP CONSTRAINT ... numero_variante_key; ALTER TABLE ... ADD CONSTRAINT UNIQUE
(cotizacion_id, numero_variante)`), aplicada contra Supabase real. `nextNumeroCorrelativo` no se
tocó — el bug era solo el scope del constraint, no la generación.

**Bug 2 — `crearCotizacion` no atómico, dejaba cotizaciones huérfanas.** Cuando el Bug 1 (o
cualquier otra falla) rompía `insertarCoberturasYVariantes`, la cabecera de `cotizaciones` ya
insertada quedaba persistida sin ninguna variante — huérfana, con un `numero_cotizacion` quemado
que nunca se reutiliza, y rompiendo cualquier intento posterior de generar su Carta Oferta.
`actualizarCotizacion` ya tenía este problema resuelto (inserta lo nuevo antes de tocar lo viejo,
ver comentario en el código) pero `crearCotizacion` no. Corregido envolviendo la segunda mitad de
`crearCotizacion` en un try/catch: si falla, borra la cabecera recién creada
(`cotizacionesRepository.deleteCotizacion`, nuevo — usa el `ON DELETE CASCADE` ya existente hacia
variantes/coberturas) y relanza el error original sin envolverlo.

**Verificación**: fix hecho con TDD (test rojo→verde en `cotizacion.service.test.js`, mockeando el
segundo fallo). Suite completa: 101/101 verde. Confirmado además en vivo, end-to-end por browser
real: los 3 planes de Incendio (Hipotecario, con/sin Inspección) crean cotización + generan PDF
sin error, con su variante persistida en la base real (antes: 500 consistente en los 3).

**Limpieza de datos**: se encontraron y borraron 4 cotizaciones huérfanas reales en la base
(`INCENDIO-5/7/9/11`, ids 147-150) generadas durante la verificación, antes del fix. Las
cotizaciones de prueba generadas DESPUÉS del fix (`INCENDIO-13/15/17/19`, ids 151-154, cliente
"Cliente QA Incendio", con variante OK) se dejaron sin borrar a pedido de Kevin — mismo criterio
que otras sesiones de QA en vivo.

**Corrección a un dato de `docs/ESTADO_PROYECTO.md` sección 33**: la nota de que
`147.93.132.53` "no es una VPS separada, es el mismo sandbox" quedó desactualizada. Confirmado en
esta sesión: ahora SÍ hay un deploy Docker real y persistente en esa IP (contenedores
`cotizador-tajy-backend` + `cotizador-tajy-caddy`, reverse proxy HTTPS en
`147-93-132-53.sslip.io`, que es a donde apunta el frontend de Vercel) — coincide con los commits
recientes `fix(deploy): usar Node 22 en la imagen de Docker` / `saltar scripts de npm en el build
de Docker`. Lo que sí seguía siendo cierto es que además de eso hay procesos `node
src/server.js` sueltos en el host (fuera de Docker, sin `pm2`/`systemd`), leftover de sesiones QA
anteriores directamente en el puerto 3000 — no forman parte del deploy real, se acumulan sesión
tras sesión si no se matan. Uno de esos procesos tenía cargado un `FRONTEND_URL` viejo que causó
un rato de confusión por CORS al levantar el backend local de esta sesión.

**Pendiente:** mergear `fix/admin-badge-colores-rol` a `main` (Kevin no lo pidió todavía en esta
sesión — solo commit + push). Si se quiere tratar como cambio SDD formal en vez de fix suelto,
faltaría abrir `openspec/changes/` retroactivo o dejarlo así (decisión de Kevin, no crítica).

## 36. Incendio — tasas por rubro de actividad (~207 rubros) + pertenencia rubro-ramo (2026-07-29, migraciones aplicadas y verificadas)

Cambio SDD `incendio-tasas-por-rubro` (ver `openspec/changes/incendio-tasas-por-rubro/`, PR #38).
Código completo y **las dos migraciones SQL (043 y 044) ya fueron aplicadas contra Supabase real**
el 2026-07-29, tras la revisión de Kevin del reporte de warnings (ver bloque de warnings más abajo)
y su confirmación explícita: "apliquemos tal cual".

**Hecho (verificado con `npm test --prefix backend`: 128/128 en verde, sin regresión sobre los
101 previos):**

- Núcleo puro `backend/src/services/tasas-incendio.service.js` (+ 16 tests): normaliza nombres,
  parsea el pivot `docs/insumos/Tasa sistema Incendio.xlsx` con Zod, deriva las 4 tasas por
  objeto (40/40/60/60, regresión de migración 038 confirmada: 2.24% → 0.90/0.90/1.34/1.34), cruza
  contra el catálogo existente y genera el SQL determinista.
- CLI `backend/scripts/generar-migracion-tasas-incendio.js`: cero escrituras a la base (solo
  SELECT de `rubros_actividad`/`tipos_riesgo_incendio`), aborta ante ambigüedad de cruce o
  regresión de redondeo, reporta warnings por stdout.
- `backend/migrations/043_rubro_actividad_ramo.sql` (escrita a mano): tabla
  `rubro_actividad_ramo (rubro_id, ramo_id)` PK compuesta + backfill 1:1 de los rubros con
  `grupo` NOT NULL + las 8 filas explícitas de los 5 rubros antes `grupo = NULL` (VIVIENDA,
  SILOS → incendio; CONSULTORIO MEDICO, CHANCHERIAS, GRANJA EN GENERAL → mrc **e** incendio) +
  asserts. `rubros_actividad.grupo` NO se toca (legacy de solo lectura).
- `backend/migrations/044_seed_tasas_incendio_rubros.sql` (generada, 1652 líneas): corrida real
  del script contra el pivot y la base real (solo lecturas). Resultado: 206 filas de pivot →
  21 reutilizados (cruce por nombre existente), 184 nuevos, 1 ya sembrado (VIVIENDA, correctamente
  omitido del bloque de tasas — su tasa 2.24%/0.90/0.90/1.34/1.34 no se toca), 27 rubros del
  catálogo existente sin fila en el pivot (coincide exacto con los 27 "Out of Scope" de
  `proposal.md`). **Desviación de `tasks.md` 4.1 documentada**: la fila 211 del pivot es
  "Total general" (fila de totales de la tabla dinámica de Excel, no un rubro real) — se corrió
  el script con `--hasta 210`, no 211 como decía literalmente la tarea, para no sembrar un tipo
  de riesgo falso.
- Backend: `coberturas.repository.js` (`findRubrosActividad`) pasa de `.eq('grupo', ...)` a JOIN
  `!inner` contra `rubro_actividad_ramo` filtrando por `ramo_id`; `backend/src/schemas/ramos.schema.js`
  nuevo (`rubrosActividadQuerySchema`); `ramos.controller.js` y `admin.controller.js` (mismo
  endpoint) exigen `ramo_id` (entero positivo) con 400 si falta/inválido — el parámetro legacy
  `grupo` deja de interpretarse en ambos.
- Frontend: `cotizar/cotizar.js` (2 call sites) y `admin/admin.js` (`cargarRubrosActividad`) pasan
  `ramo_id`/`ramoId`; el panel admin ahora refetchea el catálogo al cambiar de ramo (antes lo
  cacheaba una sola vez para toda la sesión, lo cual ya no es válido porque MRC e Incendio dejan
  de compartir la misma lista).

**Decisión de Kevin sobre `tasa_minima` vs. derivación 40/60% (clamp del calculador):** de los 184
rubros nuevos, **176 (~96%) activan el clamp del calculador** (`incendio.calculator.js`) porque
`0.4 × tasa_global < tasa_minima` — la tasa mínima histórica del pivot es, para la enorme mayoría
de los rubros, prácticamente igual a la tasa global (muchos rubros tienen una sola cotización
histórica, así que min = max = global), y el objeto más bajo del desglose (Edificio/Instalaciones
al 40%) cae sistemáticamente por debajo de ese mínimo. Efecto: no rompe (no da 422), pero
distorsiona la prima porque cada cotización de esos rubros queda clampeada al mínimo histórico en
vez de usar la derivación 40/60%. **Kevin confirmó explícitamente "apliquemos tal cual"**: se
acepta el clamp por ahora, sin inventar un piso — queda editable después vía `UPDATE
tasas_riesgo_objeto`/panel admin, sin cambio de código, rubro por rubro si aparecen primas raras en
el uso real. Aparte: 7 warnings de "tasa_global fuera de [min,max]" son ruido de precisión de
punto flotante (diferencias del orden de 1e-15), no una anomalía real de negocio.

**Migraciones aplicadas y verificadas contra Supabase real (2026-07-29):**

- `043_rubro_actividad_ramo.sql`: los 3 asserts en verde (backfill 1:1 sin residuo, 8 filas
  explícitas completas, 0 rubros huérfanos).
- `044_seed_tasas_incendio_rubros.sql`: los 3 asserts en verde. Resultado: 206
  `tipos_riesgo_incendio` (205 nuevos + VIVIENDA preexistente sin cambios: 0.90/0.90/1.34/1.34),
  824 `tasas_riesgo_objeto` (206 × 4, exacto).
- Verificación cruzada independiente contra el `.sql` commiteado (no solo contra los asserts):
  TRACTOR, VIVIENDA y SILOS coinciden byte a byte entre archivo y base real.
- Conteo por ramo tras el cambio: `incendio` 209, `mrc` 18 (15 originales + los 3 multi-ramo:
  CONSULTORIO MEDICO, CHANCHERIAS, GRANJA EN GENERAL), `tro` 29 (sin cambios). CONSULTORIO
  MEDICO/CHANCHERIAS/GRANJA EN GENERAL aparecen en `incendio` **y** `mrc`; VIVIENDA/SILOS solo en
  `incendio`. 0 rubros huérfanos (todos con al menos una fila de pertenencia).
- `rubros_actividad` con `grupo IS NULL` pasó de 5 a 189 — **esperado, no un bug**: las 184 filas
  nuevas nacen con `grupo` NULL a propósito (columna deprecada, no se puebla para filas nuevas).
- Aplicación técnica: la migración 044 (1652 líneas, 483KB) se aplicó en varios chunks idempotentes
  (`WHERE NOT EXISTS`/`ON CONFLICT DO NOTHING`, seguro correrlos de a partes o repetirlos). Un
  chunk de tasas por objeto tuvo un error de transcripción manual al aplicarlo (rollback atómico,
  sin corrupción); se resolvió aplicando la fórmula genérica confirmada (`edificio = instalaciones
= ROUND(tasa_global × 0.4, 2)`, `contenido_mueble_equipos = contenido_mercaderia =
ROUND(tasa_global × 0.6, 2)`) en un solo `INSERT ... SELECT` guardado, verificado sin
  discrepancias contra las 820 filas fuente antes de aplicar.

**Pendiente:**

1. **9.3 de `tasks.md`**: cotizar 3-4 rubros nuevos en vivo sin recibir 422 — requiere credenciales
   de login que no estaban disponibles en la sesión que aplicó las migraciones. Falta que Kevin lo
   confirme con la app corriendo, o pase un usuario de QA.
2. Deploy de backend + frontend JUNTOS a producción (el backend ya exige `ramo_id`, 400 sin él —
   desplegar uno solo rompe el selector de "Tipo de Riesgo"). El código está en la rama
   `sdd/incendio-tasas-por-rubro` (PR #38), sin mergear a `main` todavía.
3. **Follow-up explícito, fuera de este cambio**: `DROP COLUMN rubros_actividad.grupo` (queda
   legacy de solo lectura desde este cambio — ya no la lee ningún código nuevo, pero se conserva
   por ahora para no forzar un `DROP` de golpe); UI de admin dedicada para
   `tipos_riesgo_incendio`/`tasas_riesgo_objeto` (hoy se edita por SQL/`UPDATE` directo, que ya
   cumple el requisito de "editable sin cambio de código"); definir tasas de Incendio para los 27
   rubros fuera de alcance; revisar caso por caso los 176 rubros con clamp activo si en el uso real
   se detectan primas distorsionadas.

## 37. Corrección de estado — PR #38/#39 y PR #21/#22 ya estaban mergeados a `main`; PR #40 mergeado (2026-07-30)

Auditoría automática de rutina (detección de cambios importantes vs. estado documentado). Al
comparar `docs/ESTADO_PROYECTO.md`/`CLAUDE.md` contra `git log` de `main`, se encontraron dos
afirmaciones desactualizadas que quedaron "congeladas" en el texto porque se escribieron en la
misma sesión que preparó el merge, antes de que el merge ocurriera:

- **Sección 36, "Pendiente" ítem 2**: decía "El código está en la rama
  `sdd/incendio-tasas-por-rubro` (PR #38), sin mergear a `main` todavía." — **Falso a partir de
  2026-07-29 08:19**: PR #38 se mergeó (`8f6f1d2`), y una segunda vuelta de la misma rama (un fix
  de test para que CI pasara sin `.env`, `423fc76`) se mergeó como **PR #39** (`c5a1dd2`,
  2026-07-29 14:14). Ambos ya están en `main`.
- **Sección 33**: decía "pusheados pero todavía sin PR/merge a `main`" sobre "eliminar planes" y
  "habilitar/deshabilitar ramos". **Falso**: esos commits se mergearon como **PR #21** (`391b9fc`,
  2026-07-28) y el Dockerfile/`render.yaml` de esa misma rama como **PR #22** (`b71954e`,
  2026-07-28). Ambos ya están en `main`.
- **Sección 34**: decía "Sin commitear todavía" sobre el template de Carta Oferta de Incendio.
  **Desactualizado**: se commiteó (`cb4223e`) y se mergeó como parte de **PR #33**
  (`feat/incendio-carta-oferta-pdf`).

No se reescriben esas secciones (quedan como registro histórico de la sesión en que se escribieron
— mismo criterio que la corrección de la sección 35 sobre la IP `147.93.132.53`), pero a partir de
acá: **PR #21, #22, #33, #38 y #39 están todos mergeados a `main`**. El estado real de Incendio es
el de producción (ver README, tabla de ramos), no "pendiente de merge".

**Commits nuevos en `main` no registrados todavía en este documento (2026-07-29, posteriores a la
sección 36):**

- `423fc76` `fix(test): mockear config/supabase.js en test de admin rubros-actividad` — el test de
  `admin.controller.rubros-actividad.test.js` solo mockeaba `rubros-actividad.service.js`, pero
  `admin.controller.js` importa 6 servicios de forma estática; en CI (sin `backend/.env`) los otros
  5 explotaban al importar su repository real contra Supabase. Pasaba en local (con `.env` real) y
  fallaba en GitHub Actions. Mergeado como parte de PR #39.
- `50a071d` `chore(git): dejar de trackear .atl/` — `.atl/` ya estaba en `.gitignore` pero seguía
  trackeado desde antes; se destrackearon los 2 archivos cacheados. Sin impacto funcional.
- `c2ffa62` `fix(frontend): mostrar nombre real de rol en vez de "Analista comercial" fijo` —
  `frontend/configuracion/configuracion.js` y `frontend/shared/sidebar.js` mostraban el texto fijo
  "Analista comercial" para cualquier usuario no-admin, aunque su rol real fuera "Analista de
  Riesgo" o "Jefe de Análisis de Riesgo". Ahora usan `usuario.rol` tal cual viene del repository.
- `39f6013` `fix(historial): alinear filtros y corregir tamaño de botón Limpiar filtros` (**PR
  #40**, mergeado `5e60309`) — en `frontend/historial/historial.css`, el `<select>` y los
  `<input type="date">` compartían la clase `.field-input` pero el navegador les daba una altura
  intrínseca distinta (desalineados en la fila de filtros), y el botón "Limpiar filtros" (estilo
  outline) colapsaba a 2 líneas de texto al no tener columna propia en el grid `auto-fit` del
  formulario de filtros. Fix puramente CSS, sin cambio de comportamiento.

**Hallazgo de esta auditoría — riesgo de despliegue no verificado (acción recomendada para
Kevin):** PR #38/#39 mergean un cambio de contrato de API: `GET /ramos/rubros-actividad` y
`GET /admin/rubros-actividad` ahora **exigen** `ramo_id` (400 si falta) y el frontend (`cotizar.js`,
`admin.js`) ya lo envía. El frontend se despliega automático en Vercel al pushear a `main`
(`frontend/vercel.json` + integración nativa de Vercel-GitHub); **el backend en la VPS no tiene
pipeline de CD — el redeploy es manual** (`git pull` + `docker compose up --build`, ver
`docker-compose.yml`/`Caddyfile` en la raíz). Si el backend de `api.cotizador.lat` no fue
redesplegado manualmente después de este merge, el selector de "Tipo de Riesgo" puede estar roto en
producción para **todos** los ramos (Incendio, MRC, TRO) — no solo para los rubros nuevos de
Incendio — porque el frontend ya no manda el parámetro legacy `grupo` que el backend viejo
esperaba. No se pudo verificar conectividad a `https://api.cotizador.lat` desde este entorno para
confirmar la versión corriendo.

**Verificado y resuelto (2026-07-30):** se probó `https://api.cotizador.lat/api/ramos/rubros-actividad`
en vivo con un usuario real (login vía `/api/auth/login`). Sin `ramo_id` devuelve `400
{"error":"Expected number, received nan"}` (Zod validando correctamente); con `ramo_id=3`
(Incendio) devuelve `200` con rubros reales (`VIVIENDA`, `BAZAR`, etc.). El backend de la VPS ya
estaba redesplegado con el código de PR #38/#39 al momento de esta verificación — no hubo que
tomar ninguna acción. Riesgo cerrado, no queda pendiente para Kevin en este punto.

## 38. MRC — texto legal de Cristales, exclusiones fuera del primer paso y límite de repetición de coberturas (2026-07-30)

Rama `fix/historial-filtros-alineacion` (PR #43, sin mergear a `main` todavía). Tres cambios chicos e independientes en la misma sesión:

1. **Texto legal de "Cristales" completado**: `coberturas_catalogo.texto_legal` para el código `cristales` (ramo MRC) estaba `NULL` desde el seed original (`012_seed_mrc.sql`) — la Carta Oferta lo mostraba sin texto debajo del título, a diferencia de las demás coberturas. Migración `045_texto_legal_cristales_mrc.sql` aplicada y verificada contra Supabase real. Solo afecta cotizaciones NUEVAS (el texto se persiste como snapshot al cotizar, `texto_legal_snapshot`).
2. **Card de "Exclusiones" sacada del primer paso del cotizador**: `renderExclusionesCard(plan)` se llamaba en "Datos del asegurado" (`renderDatosView`), quedaba redundante ahí — eliminada esa card y el ícono `ICON_X_CIRCLE` que solo la usaba a ella. Queda huérfana la clase CSS `.exclusiones-card` en `cotizador.css` (no se tocó, inofensiva).
3. **Límite de repetición de coberturas adicionales en MRC**: hasta este cambio, cualquier cobertura adicional era repetible sin límite (diseño deliberado del 2026-07-13, confirmado contra "Version 01 - Calculo Varios.xlsx" para `robo_contenido`). Kevin pidió bloquear la repetición al ver "Cristales" cargado 2 veces en captura — **se detectó el conflicto con la decisión previa ANTES de commitear** (el propio comentario de `mrc.calculator.js` lo advertía), se confirmó contra Engram (#177), y Kevin resolvió: `robo_contenido` sigue permitiendo hasta 2 veces (excepción histórica), el resto del catálogo pasa a permitir solo 1. Implementado en frontend (`renderCoberturasAdicionales`, el select de cada fila excluye códigos que ya llegaron a su límite en otras filas) y backend (`mrc.calculator.js`, `LIMITE_REPETICION_COBERTURA_MRC = { robo_contenido: 2 }` con default 1, defensa en profundidad). 3 tests nuevos, 154/154 en verde. Verificado en vivo con Playwright: "Cristales" no aparece en el select de una 2da fila si ya se eligió en otra; "Robo contenido" sí está disponible en una 2da fila pero no en una 3ra.

**Aprendizaje operativo**: antes de bloquear un comportamiento que "parece un bug" en una captura, vale la pena revisar comentarios del código y Engram — en este caso había una decisión de negocio explícita y verificada en vivo (Playwright, 2026-07-13) detrás de lo que a simple vista parecía un descuido.

## 39. MRC — plan con descuento fijo del 10% y permiso de rol para editarlo (2026-07-30, PR 1 de 2, sin mergear todavía)

Cambio SDD `mrc-plan-descuento-fijo`, entregado en 2 PRs encadenados (`stacked-to-main`) por riesgo de presupuesto de revisión (350-450 líneas estimadas, 10+ archivos).

**PR 1 — backend, rama `sdd/mrc-plan-descuento-fijo-backend` (commits `e60a35b` + `4a8ab39`, NO pusheada todavía).** Objetivo: un nuevo plan MRC con un descuento comercial fijo del 10% (política de empresa, no discrecionalidad del agente), editable solo por roles con el permiso nuevo `puede_editar_descuento_plan`.

- Migración `048_plan_mrc_descuento_fijo.sql` (renombrada de `046_...` al mergear a `main`, por colisión con `046_enable_rls_public_tables.sql` — sin cambio de contenido): agrega `roles.puede_editar_descuento_plan` (default `FALSE`, `TRUE` para `admin`, `Analista de Riesgo` y `Jefe de Análisis de Riesgo` — confirmado por Kevin), inserta el plan MRC nuevo **"MULTIRRIESGO COMERCIO - SEGUCOOP"** con `descuento_default = 10`, `descuento_maximo = 10`, `cotizacion_combinada = FALSE`, sus `plan_formas_pago` (solo Contado habilitado) y sus 5 `plan_coberturas` heredadas 1:1 de "MULTIRRIESGO COMERCIO - NORMAL" (confirmado por Kevin — el texto legal de la Carta Oferta de MRC no varía por plan, así que no requiere cambio de template). **Aplicada contra Supabase real el 2026-07-30** (plan id 20) — verificado: 3 roles con el permiso, 5 coberturas copiadas.
- `resolverDescuentos()` nuevo en `cotizacion.service.js`, se ejecuta dentro de `construirVariantes` antes de llamar al calculador: si el plan tiene `descuento_default` y el usuario no tiene el permiso, descarta cualquier ajuste de descuento del body y fuerza `{descripcion: 'Descuento del plan', porcentaje: plan.descuento_default}` — verificado con un test de bypass por API (usuario sin permiso manda 5%, la prima resultante refleja 10%).
- Hallazgo de diseño real (no solo teórico): sembrar `descuento_maximo >= 10` en el plan **no alcanzaba** — `topeEfectivo()` sigue tomando el mínimo entre el tope del plan y el tope propio del usuario (`usuario.descuento_maximo_pct`), así que un agente con tope 5% clampeaba el 10% forzado del plan en silencio. Se agregó un flag `forzadoPorPlan` que neutraliza únicamente el tope del _usuario_ (no el del plan) cuando el descuento viene forzado — `mrc.calculator.js` e `incendio.calculator.js` (inerte hoy, sin `descuento_default` sembrado ahí) por simetría. `auto.calculator.js` no usa `topeEfectivo`, no se tocó.
- Guarda `!plan.cotizacion_combinada` en `resolverDescuentos()`: sin ella, reutilizar `descuento_default` habría forzado un descuento también en los planes Premium/Superior/Fuerte de Auto (que ya usan esa columna para la variante con franquicia, `resolverTiposFranquicia`) — doble descuento. Es la condición exactamente complementaria a esa rama, así que los dos consumidores de la columna quedan mutuamente excluyentes por construcción.
- Plumbing del permiso nuevo (mismo patrón que los otros 4 `puede_*`): `roles.repository.js`, `usuarios.repository.js`, `middleware/auth.js`, `admin/roles.service.js` (`PERMISOS_ROL`), `schemas/admin.schema.js`, y el objeto `usuario` de la respuesta de login en `auth.service.js` (es lo que persiste `setUsuario` en el frontend).
- 166/166 tests backend en verde (154 previos + 12 nuevos, TDD estricto RED→GREEN en todos).

**PR 2 — frontend, rama `sdd/mrc-plan-descuento-fijo-frontend` (sobre `sdd/mrc-plan-descuento-fijo-backend`, sin pushear todavía).**

- `frontend/admin/admin.js`: checkbox `puede_editar_descuento_plan` en el modal de crear/editar rol (Sección Roles, **no** en el formulario de usuario — corrección de diseño respecto de la propuesta original) + columna de badge Sí/No en la tabla de Roles, mismo patrón que los 4 permisos existentes.
- `frontend/cotizar/cotizar.js`: `state.data.descuentoPorcentaje` se precarga con `plan.descuento_default` al cargar el ramo y al cambiar de plan (`selectPlan`), mismo patrón que `cuotas_default`. El campo de Descuento (monto y %, dentro de `renderAjusteField`) queda `disabled` cuando el plan tiene `descuento_default` y el usuario (`auth.getUsuario()`, valor cacheado al loguearse) no tiene el permiso — texto de ayuda "Descuento fijo del plan" en ese caso. El bloqueo real es del backend (`resolverDescuentos`); el `disabled` del input es solo cortesía visual.
- `npm test --prefix backend` re-confirmado en 166/166 verde después de los cambios de frontend (no debía tocar nada backend, verificación de seguridad).

**Verificación en vivo completada (2026-07-30, Playwright vía skill `run-cotizador`)**: login con usuario de test (agente, sin permiso) → seleccionado el plan SEGUCOOP → badge de forma de pago muestra únicamente "Contado" → campo Descuento (monto y %) confirmado `disabled=""` en el DOM con valor precargado `10` y texto de ayuda "Descuento fijo del plan" → sin errores de consola/red en el estado final calculado. **No verificado en vivo** (decisión deliberada, no bloqueante): el camino de un usuario CON el permiso editando el valor — hacerlo hubiera requerido otorgar el permiso a un rol fuera de los 3 confirmados solo para la prueba y luego revertirlo contra datos reales; ese camino ya está cubierto por los tests de backend `resolverDescuentos`/`calcularPreview` (usuario con permiso conserva su valor enviado). Recomendado que Kevin lo confirme una vez logueado con un usuario de rol `admin`, `Analista de Riesgo` o `Jefe de Análisis de Riesgo`.

**Pendiente antes de cerrar el cambio**: `sdd-verify`/archivo formal, y pushear + abrir los 2 PRs (los abre Kevin). Ninguna de las dos ramas está pusheada ni tiene PR abierto todavía.

**Corrección de estado (2026-07-31, ver sección 40):** ambos PRs de esta sección ya están mergeados a `main` — PR #60 (backend, `b22e94f`) y PR #61 (frontend, `6c9378c`). Nada de lo descrito arriba queda pendiente de pushear/abrir; el título de la sección queda desactualizado a propósito como registro histórico, mismo criterio que la corrección de la sección 37.

## 40. Corrección de estado — commits mergeados a `main` no registrados todavía en este documento (2026-07-31)

Sincronización de rutina: los siguientes cambios ya están en `main` (verificado con `git log origin/main`) pero no tenían entrada en este documento.

- **RLS activado en las 34 tablas públicas CRITICAL** (PR #57, `1470c0a` `fix(security): activar RLS en las 34 tablas públicas marcadas CRITICAL`, mergeado en `9f201cf`). Migración `046_enable_rls_public_tables.sql` aplicada contra Supabase real, sin policies (default-deny para `anon`/`authenticated`). El backend usa `SUPABASE_SERVICE_KEY` (rol `service_role`, bypasea RLS) y no hay ningún cliente Supabase en el frontend, así que no rompió nada — advisor de seguridad de Supabase pasó de tener estas 34 tablas en CRITICAL a 0. 154/154 tests backend en verde. Cierra el pendiente que estaba abierto desde la sección 30 (roadmap pre-producción, Sprint 3).
- **Panel admin — editar nombre y eliminar ramo + sidebar ampliado de 5 a 8 ramos** (PR #59, `8abc92e` `feat(admin): editar/eliminar ramo y ampliar sidebar a 8 ramos`, mergeado en `77e73fa`). Sección "Ramos" del admin suma: edición inline de `nombre_display` (mismo patrón que el nombre de plan/tasa RPF, `editarRamoSchema` ahora acepta `activo` y/o `nombre_display` opcionales) y botón "Eliminar" con 409 explícito si el ramo tiene planes o cotizaciones asociadas (`ramosService.eliminarRamo`, mismo criterio que `eliminarPlan`; borra primero valida dependientes y recién después borra `correlativos` y `ramos`, en ese orden, porque `correlativos` tiene FK NOT NULL 1:1 con `ramos`). `RAMOS_UI` en `frontend/cotizar/cotizar.js` pasó de 5 a 8 entradas (suma Auto Flota, TRO y Transporte, con ícono genérico `ICON_SUBLIMITE_GENERICO`) para que el toggle "Activo" del admin controle realmente esos 3 ramos — antes no tenían efecto visual porque no estaban en la lista fija del frontend. Migración `047_ramos_flota_tro_transporte_activo_false.sql` aplicada contra Supabase real, verificada: los 3 quedan en `activo=false` (no habilita cotizar por ellos — sus calculadores existen en `backend/src/calculators/` pero no están en `RAMOS_CON_CALCULO`, mismo placeholder que Auto/Hogar). Ojo: borrar la fila de `ramos` en la base NO saca el ramo del sidebar — `RAMOS_UI` es una lista fija hardcodeada en el frontend, independiente de si la fila existe. Endpoint nuevo `DELETE /admin/ramos/:id` (gate: rol admin literal). 154/154 tests backend en verde (sin tests nuevos: no hay precedente de tests para esta capa fina de admin CRUD).
- **MRC — plan con descuento fijo del 10% (PR 1 y 2 completos)** (PR #60 backend y PR #61 frontend, ver sección 39 — ambos mergeados a `main`). Migración `048_plan_mrc_descuento_fijo.sql` (renombrada de `046` por colisión de numeración, `cdbeb62`/PR #63) aplicada contra Supabase real: plan "MULTIRRIESGO COMERCIO - SEGUCOOP" (id 20) con descuento fijo del 10%, permiso `puede_editar_descuento_plan` otorgado a `admin`, `Analista de Riesgo` y `Jefe de Análisis de Riesgo`. 166/166 tests backend en verde. Verificación en vivo del camino "usuario sin permiso" completa (ver sección 39); el camino "usuario con permiso" sigue sin verificar en vivo (cubierto por tests de backend), pendiente de que Kevin lo confirme con un usuario real de rol habilitado.
- **Fix: remoción de Vercel Analytics/Speed Insights del frontend** (`c837de8`, commit directo a `main`, sin PR, 2026-07-30). Los imports de módulo bare `@vercel/analytics` y `@vercel/speed-insights` (agregados por la integración nativa de Vercel, commit `4a7c707` "Add Vercel Web Analytics integration") solo resuelven en el build de Vercel — en un frontend Vanilla JS sin build step, corriendo local o en cualquier otro entorno, producían `Uncaught TypeError` en consola. Se removieron los `<script>` de `frontend/{admin,bienvenida,configuracion,cotizar,historial,login}/index.html`, los archivos `frontend/shared/{web-analytics,speed-insights}.js`, y las dependencias de `package.json`/`package-lock.json`. Sin impacto funcional — el proyecto es Vanilla JS/Netlify según este mismo documento, así que la integración de analytics de Vercel nunca debió depender de un paso de build inexistente.
- **Releases automáticos de `release-please`**: `0.1.4` (`3afaf7a`, incluye el cambio de RLS y admin ramos) y `0.1.5` (`da67c39`, incluye MRC descuento fijo y el renombre de migración). Rutina de CI, sin cambios de código propios — el detalle línea por línea está en `CHANGELOG.md`, no se repite acá.

Ningún hallazgo nuevo de bug en esta sincronización — es puesta al día de documentación, no una sesión de desarrollo. Los pendientes activos siguen siendo los de la sección 31 y el roadmap de la sección 30, salvo el ítem de RLS que queda cerrado por el primer punto de esta sección.

## 41. Permiso de rol `puede_ver_descuento_plan` — ocultar el campo Descuento por rol, configurable desde el admin (2026-07-31, verificado en vivo, PR sin abrir todavía)

Cambio SDD `permiso-ver-descuento-plan` (proposal → spec → design → tasks → apply, ciclo completo en modo automático). Sigue el mismo patrón exacto que `puede_editar_descuento_plan` (sección 39, migración 048), con una divergencia intencional: `DEFAULT TRUE` en vez de `FALSE`, para que ningún rol pierda visibilidad al migrar.

**Diseño:** el campo Descuento en `renderAjusteField` (`frontend/cotizar/cotizar.js`) ya tenía 2 estados (editable / bloqueado-y-visible con hint "Descuento fijo del plan"). Este cambio agrega un tercer estado: bloqueado-y-oculto (`oculto = bloqueado && usuario?.puede_ver_descuento_plan === false` → la función devuelve `''`, no renderiza el `<div class="field">`). Puramente cosmético — `resolverDescuentos()` en `backend/src/services/cotizacion.service.js` no lee esta columna y sigue forzando `plan.descuento_default` exactamente igual que antes.

**Migración `050_permiso_ver_descuento_plan.sql`** (`ALTER TABLE roles ADD COLUMN puede_ver_descuento_plan BOOLEAN NOT NULL DEFAULT TRUE`) aplicada contra Supabase real — confirmado que los 5 roles quedaron en `true` inmediatamente después. Plumbing de 6 archivos backend (roles.repository.js, usuarios.repository.js, auth.js, roles.service.js, admin.schema.js, auth.service.js) + admin.js (checkbox, badge "VE DESCUENTO DEL PLAN") + cotizar.js, siguiendo el patrón de la sección 39. Dos divergencias intencionales respecto al sibling (verificadas, no copiadas a ciegas): `crearRolSchema.puede_ver_descuento_plan` usa `.default(true)` (sibling: `false`) y `aplanar()` usa `?? true` (sibling: `?? false`), para que el default a nivel app coincida con el `DEFAULT TRUE` de la columna. 166/166 tests backend en verde (sin test nuevo dedicado — mismo precedente que el sibling: la cobertura genérica de `PERMISOS_ROL`/`asegurarPuedeOtorgarPermisos` en `roles.service.test.js` ya cubre el mecanismo).

**Hallazgo real durante la verificación en vivo:** el rol `agente` es `es_sistema = true`, así que su botón "Editar" en el panel admin está deshabilitado (`title="Rol del sistema — no se puede editar"`) — **no es un bug de este cambio**, es el mismo gate que ya bloqueaba editar `puede_editar_descuento_plan` para `agente` desde la migración 048 (ese permiso se dejó en `false` para `agente` por SQL directo en su momento, no por UI). Por consistencia, `puede_ver_descuento_plan` para `agente` también se ajustó por SQL directo, no por el panel. La UI del checkbox sí se verificó de punta a punta contra un rol no-sistema (`Comercial`) sin guardar el cambio, para no tocar un rol en uso real solo para la prueba (mismo criterio que la sección 39).

**Verificación en vivo con Playwright, ambos caminos confirmados:**

- Usuario `test@test.com` (rol `agente`, `puede_ver_descuento_plan = false` en Supabase real desde este cambio): en Detalle del plan del MRC "SEGUCOOP" se ve la sección "Ajustes" con Recargo, pero el campo Descuento no se renderiza.
- Usuario `qatest@test.com` (rol Admin, `puede_editar_descuento_plan = true`): mismo flujo, campo Descuento visible y editable con el 10% precargado.
- Ambos usuarios obtuvieron el mismo "Costo total" (1.084.000 Gs.) para la misma cotización — confirma que ocultar el campo es puramente visual, el 10% se sigue aplicando igual en ambos casos.
- Panel admin: checkbox "Puede ver el descuento fijo de un plan (si no puede editarlo)" presente en el modal de rol y reflejando el estado real de la base.

**Decisión de Kevin (2026-07-31):** dejar `puede_ver_descuento_plan = false` para `agente` en Supabase real como estado final de producción (no revertir a `true`) — este era el objetivo original del pedido, no solo un dato de prueba.

**Corrección de estado (2026-08-02):** mergeado a `main` como PR #74 (commit `0563420`), incluido en el release `0.1.10` de `release-please`. Nada queda pendiente de abrir/pushear.

## 42. Frontend responsive unificado — los 6 módulos, sidebar hamburguesa (2026-07-31, mergeado a `main`)

Rama `feat/responsive-unificado`, creada desde `main` actualizado (post PR #79/#80). Trabajo pedido por Kevin: unificar los 5 breakpoints dispersos que tenía el CSS (720/900/980/1100/640px, desktop-first, sin sistema) en 3 estándar, y agregar un patrón de colapso al sidebar fijo (compartido por cotizar/admin/historial/configuración) que hasta ahora no existía en absoluto.

**Sistema de breakpoints** (documentado como comentario debajo del `:root` en `frontend/shared/cotizador.css`): 1024px (2 columnas → 1, sidebar colapsa a hamburguesa), 768px (densidad: paddings/fuentes/tablas-scroll/modales fluidos), 480px (mobile puro). Remapeo aplicado en los 7 archivos CSS del frontend. Resuelve el pendiente de roadmap "Breakpoint intermedio responsive (900-1200px) en cotizador.css" (Sprint 3) — `.resultado-layout`/`.datos-view` pasaron de 900px a 1024px.

**Sidebar hamburguesa + overlay**, creado desde cero (no había precedente) en `frontend/shared/cotizador.css` y reutilizado idéntico en los 4 módulos con sidebar: clases `.sidebar-toggle-btn`, `.sidebar-overlay`/`.sidebar-overlay--visible`, `.sidebar--abierta`, `data-action="toggle-sidebar"`/`"close-sidebar"`. JS nuevo mínimo por módulo (dos ramas de toggle en el dispatcher de clicks existente, o dos listeners puntuales donde no había dispatcher genérico) — sin lógica de negocio, autorizado explícitamente por Kevin como único HTML/JS nuevo permitido en este trabajo.

**Tablas del admin** (Usuarios, Roles, Coberturas, Tasas, Planes, Ramos): en `@media (max-width: 768px)` cada fila de `.admin-table` pasa a renderizarse como card apilada (`td::before { content: attr(data-label) }`), reemplazando un primer intento de columna sticky que Kevin señaló como mal patrón ("no es una solución ni buena práctica") tras verlo en vivo.

**Bugs reales encontrados y corregidos durante la verificación en dispositivo real de Kevin** (no se detectaron en las pasadas de Playwright headless anteriores — importante: la verificación headless no sustituye probar en un celular real):

- El panel "Cotización en vivo" tapaba el formulario de datos en mobile. Causa raíz: `.datos-view__form` y `.live-summary` competían por la misma altura fija en flexbox (`flex:1` + `overflow:auto` en ambos); como el form tenía `overflow:auto`, su "automatic minimum size" en flexbox caía a 0 y se achicaba a ~16px de alto cediéndole el espacio al panel. Fix: en `@media (max-width: 1024px)`, `.datos-view` pasa a `overflow-y:auto` y ambos hijos a `flex:none; overflow:visible` — el contenedor scrollea como una sola columna larga.
- El topbar compartido se superponía/cortaba en mobile (subtítulo largo "Sistema de Cotización de Pólizas", breadcrumb completo, texto del menú de usuario, todo compitiendo por el mismo ancho). Fix: en `@media (max-width: 768px)` se oculta `.topbar__brand-text`, el breadcrumb colapsa a solo la sección actual, se oculta `.topbar__user-text`/`.topbar__user-chevron` (queda avatar + campana), y el menú de usuario se reposiciona (`right: -12px`) para no clipear contra el borde de pantalla.
- Las tablas anidadas dentro del modal de detalle de historial (`.admin-table--nested`, usadas para "Forma de pago" y "Coberturas") no tenían wrapper de scroll horizontal — en 375px las columnas de la derecha se recortaban en silencio sin ninguna scrollbar visible. Fix: envueltas en `.historial-detalle__tabla-scroll { overflow-x: auto }`.

**Verificación:** 166/166 tests backend en verde. Verificado en vivo con Playwright en 375/480/768/1024/1280px (sidebar en los 4 módulos, `.resultado-layout` de 1 a 2 columnas en el corte de 1024px, formulario de coberturas, modal de admin con `qatest@test.com` — credenciales usadas solo en la sesión de prueba, nunca guardadas en archivos ni en memoria por pedido explícito de Kevin). Verificado también en dispositivo real por Kevin en dos rondas (primera ronda encontró los 3 bugs de arriba; segunda ronda confirmó todo arreglado).

**Corrección de estado (2026-08-02):** PR #81 (`feat/responsive-unificado` → `main`) ya mergeado (commit `4e4598e`), incluido en el release `0.1.13` de `release-please`.

## 43. Sincronización de main tras force-push externo + adopción de `release-please` (2026-08-02)

`main` local estaba desactualizado respecto a `origin/main` — el remoto tuvo un force-push (historia sin ancestro común con la rama local previa, confirmada por Kevin como intencional y ya respaldada). Se hizo `git reset --hard origin/main`; `main` local ahora coincide con la punta `b1035fc` (PR #82, release `0.1.13`).

De paso se detectó que el repo adoptó `release-please` (`release-please-config.json`, `CHANGELOG.md`, tags `v0.1.7`–`v0.1.13`, workflow `.github/workflows/release-please.yml`) y un workflow de CD para el backend (`.github/workflows/deploy-backend.yml`) — ninguno de los dos estaba documentado en `CLAUDE.md`. Se agrega sección nueva ahí. Nota suelta: `backend/package.json` sigue en `"version": "0.1.0"`, desincronizado del tag `v0.1.13` — `release-please` con `release-type: simple` no toca ese archivo, solo `CHANGELOG.md`; no se corrige acá porque no se confirmó con Kevin si conviene mantenerlo sincronizado a mano o dejarlo así.

No se detectaron hallazgos de bug nuevos en esta sincronización — es puesta al día de documentación, no una sesión de desarrollo.

## 44. Retoma de pendientes del issue #83 — los 4 hallazgos mecánicos, uno por PR (2026-08-02)

Issue #83 (auditoría de performance de Claude Routines) había quedado parcialmente resuelto en PR #88 (bug crítico ya corregido, índices FK, fix de mocks — ver CLAUDE.md). En esa sesión se decidió con Kevin dejar 5 hallazgos menores para una sesión dedicada. Esta sección cierra 4 de esos 5 (el quinto, #9, sigue deliberadamente fuera de alcance — mismo criterio que los pendientes de refactor grande del issue #84).

**Orden acordado con Kevin:** una rama y un PR por hallazgo, de menor a mayor riesgo, esperando confirmación de merge antes de arrancar el siguiente.

**#3 — Cache inconsistente en `ramos.service.js` (PR #96, mergeado).** `listarRubrosActividad`/`listarCoberturasCatalogoDeRamo` llamaban al repository directo, sin `withCache`, aunque `cotizacion.service.js` ya cachea las mismas queries. Fix: `listarCoberturasCatalogoDeRamo` reusa la clave `catalogoRamo:${ramoId}` ya existente (hit cruzado con el flujo de cotización); `listarRubrosActividad` usa clave nueva `rubrosActividad:${ramoId}`. Se confirmó que `invalidarCacheCatalogos()` ya cubre las mutaciones de `rubros_actividad`/tasas desde el admin; no hay endpoint de mutación de `coberturas_catalogo`, no aplica.

**#5 — Puppeteer sin cierre limpio (PR #97, mergeado).** `getBrowser()` (`backend/src/templates/oferta/pdf-utils.js`) solo limpiaba su referencia vía el listener `disconnected` (crash o cierre espontáneo) — no había ningún `process.on('SIGTERM'|'SIGINT')` en todo el repo. Como Node corre como PID 1 del contenedor (`Dockerfile`, sin `tini`/`dumb-init`), un shutdown de Docker (deploy automático) mandaba `SIGTERM` sin handler, dejando el Chromium hijo sin cerrar ordenado. Fix: `closeBrowser()` nuevo en `pdf-utils.js`, handlers de `SIGTERM`/`SIGINT` en `server.js` que lo llaman antes de `process.exit(0)`. **Verificación:** la prueba local en Windows fue inconclusa — Node no recibe señales POSIX reales en ese SO, ni `kill -TERM` ni `kill -INT` vía Git Bash llegan al handler registrado. Se verificó en su lugar contra la VPS real (`contabo`, acceso SSH ya configurado): se lanzó un contenedor descartable con la MISMA imagen Docker de producción (`produccion-backend`, nunca se tocó `cotizador-tajy-backend` que sirve tráfico), se copiaron los 2 archivos del fix, se lanzó el browser real y se mandó `kill -TERM` al proceso Node dentro del namespace Linux del contenedor. Resultado: el handler se disparó, `closeBrowser()` resolvió, y los ~8 procesos Chromium (padre + zygote/renderer/crashpad) terminaron limpio sin huérfanos.

**#4 — límite de `/cotizaciones` + `Promise.all` en `generarPdfOferta` (PR #98, mergeado).** `GET /cotizaciones` (historial) no validaba `limit` con ningún schema antes de `.range()` — un cliente podía pedir un límite arbitrario. Nuevo `backend/src/schemas/cotizaciones.schema.js` (`listarCotizacionesQuerySchema`, mismo patrón `safeParse`+`httpError(400,...)` que `rubrosActividadQuerySchema` de `ramos.schema.js`), `limit` acotado 1-100, default 20. Además, `generarPdfOferta` traía `plan`/`ramo`/`planCoberturas` con 3 `await` secuenciales aunque son independientes entre sí (solo dependen de `cotizacion`, ya resuelta) — se paralelizaron con `Promise.all`, mismo patrón que ya usa `resolverContextoRepositorios` en el mismo archivo. Se ajustó el log de instrumentación `[perf-oferta]` (agregado en la sesión original del issue) al nuevo desglose.

**#8 — Catálogo `/ramos` sin cache compartido en frontend (PR #99, mergeado).** `admin.js` reimplementaba un guard de fetch de `/ramos` 3 veces con criterios distintos (uno sin guard, dos con variantes de `state.ramos.length`); `cotizar.js`/`historial.js` cada uno pedía el mismo catálogo por su cuenta. Nuevo `frontend/shared/catalogo.js` con `getRamos()`: memoiza la promesa a nivel de módulo (mismo patrón singleton que `getBrowser()`/`closeBrowser()` del backend, agregado en el fix del #5). Deduplica fetches dentro de la misma carga de página — no persiste entre `/admin`/`/cotizar`/`/historial` porque cada uno es una recarga completa de página, mismo límite que ya existía, documentado explícitamente para no prometer más de lo que da. Los 3 puntos de `admin.js` y los `init()` de `cotizar.js`/`historial.js` reemplazados por `getRamos()`.

**Verificación transversal:** 166/166 tests backend en verde en cada uno de los 4 PRs. `eslint`+`prettier --check` limpios sobre los archivos frontend tocados. #8 verificado en vivo con Playwright (usuario QA `qatest@test.com`, credencial no guardada en memoria ni en archivos por pedido explícito de Kevin): `/cotizar` cotizando MRC con sublímites correctos, `/historial` con filtro de ramo poblado, `/admin` → Tasas/Coberturas/Planes cargando bien (dropdown "Todos los ramos" + tabla con 20 filas), sin errores de consola ni requests fallidos de `/ramos`.

**Hallazgos operativos de la sesión, no relacionados al código en sí:**

- El `backend/.env` local de la máquina Windows de Kevin tiene `FRONTEND_URL` apuntando a producción (`https://cotizador.lat/api`), no a `http://localhost:5000` — rompe CORS para cualquier verificación local con Playwright si se arranca el backend sin overridear la variable (`dotenv` no pisa variables ya seteadas en el proceso, así que `FRONTEND_URL='http://localhost:5000' npm run dev` funciona sin tocar el `.env`, que además está protegido por permisos de la sesión). Relevante para cualquier sesión futura que use el skill `run-cotizador` en esta máquina.
- Confirmado un proceso `node.exe` suelto en el puerto 3000 entre sesiones de QA en esta máquina Windows — mismo patrón que CLAUDE.md ya documenta para la VPS, ahora también observado localmente. Se mató con confirmación explícita de Kevin antes de actuar.

**Pendiente, deliberadamente fuera de esta sesión:** #9 (JS duplicado/módulos grandes de `admin.js`/`cotizar.js`) — mismo criterio que los pendientes grandes del issue #84 (ver sección correspondiente), requiere sesión dedicada.
