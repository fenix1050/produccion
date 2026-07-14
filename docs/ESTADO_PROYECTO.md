# Estado del proyecto — Cotizador Aseguradora Tajy

Documento de traspaso. Complementa a `CLAUDE.md` (contexto operativo y metodología) y
`PLAN_DESARROLLO.md` (arquitectura completa, schema y reglas de negocio) — no los reemplaza.
Este archivo responde una pregunta puntual: **¿qué se hizo, por qué, y qué falta, en este
momento del desarrollo?**

Última actualización: **Fase 6/7 con catálogo cerrado en los 3 ramos priorizados (MRC → Incendio
→ Vida/AP)** y **cotizador end-to-end funcionando para MRC** (plan Normal), incluyendo
"coberturas adicionales" repetibles (2026-07-13, ver sección 16-17). Supabase conectado,
catálogos de MRC (012, con rename a nomenclatura real en 019 y "Robo valores ventanilla"
agregado en 020), Incendio (013) y Vida/AP (015, con fix de fiabilidad en 016) cargados, fix de
Incendio aplicado (014), migraciones 001→022 corridas (022 desactiva el plan MRC "Comercio
Protección Total", sin RPF confirmado). `mrc.calculator.js` implementado y conectado al frontend
de `/cotizar`. `crearCotizacion` ya persiste el detalle de coberturas en `cotizacion_coberturas`,
incluida la franquicia elegida por el agente por cobertura (2026-07-13, verificado end-to-end
contra Supabase). Incendio y Vida/AP siguen con calculador pendiente (bloqueados por RPF sin
confirmar). Pendiente activo: panel admin para coberturas fijas/tasas por ramo (Fase 5) — ver
sección 8.

**Nota para trabajar desde otra PC:** `docs/insumos/` (Excels/PDFs con tasas reales y
cotizaciones de clientes) y `.codegraph/` están en `.gitignore` — no vienen en el `git clone`.
Copiá `docs/insumos/` a mano a la otra máquina, y recreá `backend/.env` con
`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (tampoco se versiona). Corré `codegraph init .` de nuevo
ahí si querés tener el índice disponible.

---

## 1. Resumen ejecutivo

- **Cambio de prioridad (2026-07-10):** el cliente pidió priorizar **MRC, Incendio y Vida/AP**
  por sobre Auto. Fase 2 de Auto queda pausada tal cual está — no se revierte, no se sigue
  tocando hasta que se reactive esa fase.
- **Fase 6/7 — catálogo cerrado en los 3 ramos priorizados (2026-07-12):** MRC → Incendio →
  Vida/AP ya tienen su catálogo de coberturas, tasas y planes cargado contra Supabase real.
- **`mrc.calculator.js` implementado (2026-07-13):** cubre el único plan de MRC con RPF/prima
  técnica mínima confirmados (`MULTIRRIESGO COMERCIO - NORMAL`) — prima por línea de cobertura
  (Edificio/Contenido), mismo motor de RPF/IVA/Premio/Cuota que Auto. `COMERCIO PROTECCION TOTAL`
  corta con error 422 explicativo al intentar cotizarlo (sin RPF confirmado). `incendio.js` y
  `vida-ap.js` siguen bloqueados por RPF sin confirmar en todos sus planes (ver sección 8).
- **Frontend de `/cotizar` conectado a MRC (2026-07-13):** sidebar con los 5 ramos reales
  (MRC/Incendio/Vida-AP disponibles, Auto en pausa, Hogar "próximamente"), panel de cotización en
  vivo con selección explícita de las 4 formas de pago que se conserva al pasar a Detalle del
  plan. Incendio, Vida-AP y la generación de Carta Oferta (PDF) quedan con estado "pendiente" en
  la UI — fuera de alcance de esta tarea.
- Hogar y TRO no fueron pedidos todavía, quedan en fase futura.
- **Supabase real ya está conectado** (`backend/.env` cargado con `SUPABASE_URL` y
  `SUPABASE_SERVICE_KEY`). Las migraciones 001→011 corrieron contra ese proyecto — algunas
  (001→010, de Fase 1 Auto) ya estaban aplicadas de una sesión anterior; la 011 se aplicó en
  esta sesión.
- El **schema de MRC está completo**: no hizo falta ninguna tabla nueva — `coberturas_catalogo`,
  `tasas_cobertura_ramo`, `rubros_actividad` y el ramo `mrc` ya existían desde Fase 1 (son
  genéricos, compartidos con Incendio/TRO). Solo faltaba `tipo_aplicacion` /
  `sublimite_porcentaje` / `sublimite_monto_maximo` en `cotizacion_coberturas` — ver sección 4.
- **Riesgo de seguridad detectado, no resuelto:** las 29 tablas de `public` tienen RLS (Row
  Level Security) deshabilitado — ver sección 7. No es explotable hoy porque el frontend nunca
  habla directo con Supabase (regla no negociable de `CLAUDE.md`), pero queda como deuda a
  decidir con Kevin.
- No hay bugs de lógica conocidos en Auto (motor de cálculo cerrado en Fase 1, sección 3 de
  este documento en su versión anterior — no se tocó en esta sesión).

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
    .env                    creado en esta sesión — NO versionado (.gitignore ya lo cubre)
  /migrations             001 a 011, ver sección 4

/frontend
  /cotizar /historial /admin /shared    (estructura creada, sin implementación de UI todavía)

/docs
  /insumos                manuales de suscripción (Incendio/Hogar/Comercio/TRO, Riesgos
                           Diversos, Vida y AP) + propuestas manuales reales ya recibidas por
                           Kevin (GT S.A., Grupo Seguridad Electrónica Paraguay, COFUDEP, etc.)
                           — insumo para el catálogo de coberturas de MRC/Incendio, próximo paso
```

Coincide con lo que describe `CLAUDE.md`. Falta `backend/src/templates/` (plantillas HTML
para los PDF) — no bloquea Fase 6, se crea en Fase 4/8.

## 3. Motor de cálculo de Auto individual (Fase 1, sin cambios en esta sesión)

Cerrado y auditado — ver detalle completo en el historial de este documento o en
`PLAN_DESARROLLO.md` sección 5. Resumen: fórmula Prima/RPF/IVA/Premio/Cuota implementada en
`auto.calculator.js`, 4 formas de pago simultáneas, franquicia dual por vía de importación.
Plan Básico (tasa única 1,64%) sigue sin implementar — pendiente #4 de la sección 11 de
`PLAN_DESARROLLO.md`, no bloqueante para Fase 6.

## 4. Schema SQL (`backend/migrations/`)

| # | Contenido |
|---|---|
| 001 | Usuarios y permisos |
| 002 | Ramos, planes, formas de pago, `plan_formas_pago` |
| 003 | Catálogo de coberturas + FK circular con `planes` (resuelta con ALTER) |
| 004 | Tarifación: `tasas_capital`, `rubros_actividad`, `tasas_cobertura_ramo` |
| 005 | Cotizaciones, variantes, plan de pago, `correlativos` |
| 006 | Auto Flota (vehículos por cotización) |
| 007 | KYC / PLA-FT |
| 008 | Seed de los 5 planes de Auto con valores reales confirmados |
| 009 | Función Postgres `siguiente_correlativo` (incremento atómico) |
| 010 | Columna `planes.codigo_tasa` + mapeo a los 4 códigos del Excel de tasas |
| 011 | `cotizacion_coberturas`: agrega `tipo_aplicacion` (`cobertura`/`sublimite`, CHECK constraint), `sublimite_porcentaje`, `sublimite_monto_maximo` — schema para la regla "cobertura vs. sublímite" de MRC/Incendio. **Sin uso hoy**: el diseño que representaba se descartó el 2026-07-13 (ver sección 17 y pendiente #11 de `PLAN_DESARROLLO.md`) y la tabla `cotizacion_coberturas` en sí todavía no se escribe desde ningún lado del backend (ver sección 8) |
| 012 | Seed de catálogo de coberturas, tasas y planes de MRC — ver sección 9 |
| 013 | Seed de catálogo de coberturas, tasas y planes de Incendio — ver sección 10 |
| 014 | Fix de fiabilidad: plan `INCENDIO - EDIFICIO Y CONTENIDO` marcado `activo = FALSE` hasta confirmar su RPF |
| 015 | Seed de catálogo de coberturas, tasas (`tarifas_generico`, JSONB) y planes de Vida y Accidentes Personales — ver sección 12 |
| 016 | Fix de fiabilidad sobre la 015: unifica nombres de clave JSONB inconsistentes, completa un `edad_min` faltante, agrega filas de tarifa para 5 coberturas que no tenían ninguna — ver sección 12 |
| 017 | Agrega `planes.texto_exclusiones_generales` y `planes.texto_sublimites_generales`, cargados para `MULTIRRIESGO COMERCIO - NORMAL` — ver sección 15 |
| 018 | Agrega `planes.responsabilidad_maxima_cotizable` (tope de suma asegurada cotizable), cargado para `MULTIRRIESGO COMERCIO - NORMAL` (Gs. 7.200.000.000) — ver sección 15 |
| 019 | Rename de 12 coberturas de MRC a la nomenclatura real del sistema de escritorio, acotado por `ramo_id='mrc'` — ver sección 16 |
| 020 | Agrega la cobertura `robo_valores_ventanilla` al catálogo de MRC (tasa 10‰) y la columna `coberturas_catalogo.incluye_en_suma_asegurada_total` — ver sección 17 |
| 021 | Corrige `planes.texto_sublimites_generales` de `MULTIRRIESGO COMERCIO - NORMAL`: agrega 3 sub-límites faltantes y corrige el monto de Daños por Granizo — ver sección 17 |

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

Al listar las tablas del proyecto Supabase real vía MCP, las **29 tablas de `public` tienen Row
Level Security deshabilitado**. Esto significa que si alguna vez se usa la clave `anon`/
`publishable` de este proyecto desde el frontend (o cualquier cliente que no sea el backend con
la `service_role` key), esa clave podría leer o escribir cualquier fila de cualquier tabla sin
restricción.

**No es explotable hoy:** `CLAUDE.md` establece como regla no negociable que el frontend nunca
habla directo con Supabase, todo pasa por la API Express. Mientras esa regla se respete, el
riesgo es teórico. Se señala igual como deuda técnica porque:
- Es fácil de romper sin darse cuenta (alguien agrega un fetch directo a Supabase desde el
  frontend "para ir más rápido").
- Activar RLS sin políticas bloquea todo el acceso — no se puede aplicar sin diseñar las
  políticas primero, así que requiere una sesión dedicada, no un fix de una línea.

**No se tocó nada de esto todavía.** Queda pendiente decidir con Kevin cuándo abordarlo (no
bloquea Fase 6).

## 8. Pendientes abiertos

- **Texto oficial para Carta Oferta de MRC (Fase 2/4/8, no empezar todavía)** — Kevin pasó
  (2026-07-13) el texto completo tal como sale del cotizador de pólizas nuevas: Coberturas
  Principales, Distribución del Capital Asegurado (Incendio y Robo, 50%/50% Mercaderías/
  Contenido General), Franquicias (incluye la excepción de Itapúa/Alto Paraná para Caída de
  Rayo con 10%/mín. Gs. 500.000, ya mencionada como "variable de la cotización, no del
  catálogo" en la migración 012), Exclusiones ampliadas y las 3 cláusulas que forman parte del
  contrato (adecuación al código penal, endoso de garantía Segucoop, cobranza). Guardado en
  Engram (`type: reference`, buscar "texto Carta Oferta MRC") para cuando se encare la
  generación de PDF — no se tocó código de templates todavía, es fuera de Fase 6/7.
- **RLS deshabilitado** en las 29 tablas — ver sección 7, requiere decisión de Kevin antes de
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
  criterio que MRC. El manual de suscripción `M-08OP-GT-01` (Incendio/Hogar/Comercio/TRO, Anexo
  3) trae una tabla de R.P.F. distinta por cuotas; Kevin confirmó que NO se usa, prevalece el
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
  fases). Cuando se encare, definir con Kevin si "cobertura fija" es una propiedad por ramo o por
  plan (MRC solo tiene 1 plan calculable hoy, pero Incendio/Vida-AP van a tener varios).

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
bloque priorizado y se conectó al frontend, siguiendo el diseño de referencia de
`design_handoff_cotizador/` (handoff sumado en el mismo bloque de commits) adaptado a los ramos y
datos reales del sistema.

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

## 19. Próximo paso

Con el catálogo de MRC, Incendio y Vida/AP cargado, el primer calculador (MRC, plan Normal) conectado
end-to-end, y la Carta Oferta de MRC ya generándose en PDF, lo que sigue es uno de estos, a decidir
con Kevin:
- Confirmar el texto oficial de Carta Oferta de Incendio y Vida/AP para sumarles su template de PDF.
- Retomar Fase 2 (Auto end-to-end), si el cliente lo pide.
- Seguir el frontend de `/cotizar` para Incendio/Vida-AP en cuanto tengan calculador, reutilizando
  el mismo App Shell ya construido para MRC.
- Panel admin (Fase 5): coberturas fijas por ramo + edición de tasas — ver sección 8.