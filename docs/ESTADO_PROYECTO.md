# Estado del proyecto — Cotizador Aseguradora Tajy

Documento de traspaso. Complementa a `CLAUDE.md` (contexto operativo y metodología) y
`PLAN_DESARROLLO.md` (arquitectura completa, schema y reglas de negocio) — no los reemplaza.
Este archivo responde una pregunta puntual: **¿qué se hizo, por qué, y qué falta, en este
momento del desarrollo?**

Última actualización: Fase 6 activa (MRC → Incendio → Vida/AP), Supabase conectado, catálogos
de MRC (012) e Incendio (013) cargados, fix de fiabilidad aplicado (014), migraciones 001→014
corridas. Commit `1661a9f` pusheado a `origin/main` (2026-07-11).

**Nota para trabajar desde otra PC:** `docs/insumos/` (Excels/PDFs con tasas reales y
cotizaciones de clientes) y `.codegraph/` están en `.gitignore` — no vienen en el `git clone`.
Copiá `docs/insumos/` a mano a la otra máquina antes de seguir con Vida/AP, y recreá
`backend/.env` con `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (tampoco se versiona). Corré
`codegraph init .` de nuevo ahí si querés tener el índice disponible.

---

## 1. Resumen ejecutivo

- **Cambio de prioridad (2026-07-10):** el cliente pidió priorizar **MRC, Incendio y Vida/AP**
  por sobre Auto. Fase 2 de Auto queda pausada tal cual está — no se revierte, no se sigue
  tocando hasta que se reactive esa fase.
- Estamos en **Fase 6/7 (activa)**. Orden interno acordado con Kevin: **MRC primero**, después
  Incendio, después Vida/AP. Hogar y TRO no fueron pedidos todavía, quedan en fase futura.
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
    /calculators          auto (completo), + 7 stubs (auto-flota, incendio, hogar, mrc,
                           tro, transporte, vida-ap) que lanzan error explícito si se invocan
    /schemas               auto, tasas
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
| 011 | `cotizacion_coberturas`: agrega `tipo_aplicacion` (`cobertura`/`sublimite`, CHECK constraint), `sublimite_porcentaje`, `sublimite_monto_maximo` — schema de la regla "cobertura vs. sublímite" para MRC/Incendio (sección 4 y pendiente #11 resuelto de `PLAN_DESARROLLO.md`) |

**Estado real contra Supabase (verificado en esta sesión vía MCP):** 001→011 corridas y
confirmadas — `ramos` tiene 8 filas (incluye `mrc`), `planes` 5, `plan_formas_pago` 20,
`recargo_antiguedad_tabla` 13, `correlativos` 8. Las tablas de catálogo de MRC/Incendio
(`coberturas_catalogo`, `tasas_cobertura_ramo`, `rubros_actividad`) están creadas pero **vacías**
— es el próximo paso (sección 8).

## 5. Endpoints implementados

Sin cambios respecto a Fase 1 — no se tocó código de rutas/controllers en esta sesión, solo
schema. Conectados punta a punta:
- `GET /api/ramos`
- `GET /api/ramos/:id/planes`
- `GET /api/planes/:id/coberturas`
- `POST /api/cotizaciones/calcular`
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
- Calculadores `mrc.js` / `incendio.js` / `vida-ap.js` → stubs, bloqueados por el Excel de
  tasas/RPF del dpto. técnico (pendiente #10, sección 11 de `PLAN_DESARROLLO.md`)

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

- **Catálogo de coberturas de MRC** (siguiente paso inmediato) — construir a partir de
  `docs/insumos/M-08OP-GT-01, Manual de Suscripción Riesgos Diversos v.01 301024.pdf` y las
  propuestas manuales reales ya subidas (`GRUPO SEGURIDAD ELECTRONICA PARAGUAY - MULT.
  COMERCIO.pdf`, etc.) — insertar filas en `coberturas_catalogo` y `tasas_cobertura_ramo`.
- **RLS deshabilitado** en las 29 tablas — ver sección 7, requiere decisión de Kevin antes de
  actuar.
- **RPF fijo de MRC, Incendio y Vida/AP** — solicitado al dpto. técnico (2026-07-10), llega vía
  Excel. Bloquea terminar `mrc.calculator.js` / `incendio.calculator.js` / `vida-ap.calculator.js`,
  **no bloquea** schema ni catálogo de coberturas (pendiente #10, sección 11 de
  `PLAN_DESARROLLO.md`).
- Franquicia de Importación Directa (Auto, Fase 1) sigue hardcodeada como constante — pendiente
  de Fase 2, no se toca mientras esa fase esté pausada.
- Plan Básico (Auto, Fase 1) no distinguido en el calculador — mismo estado, pausado con Fase 2.
- Panel admin de edición manual de tasas (Auto, Fase 1/5) — decisión tomada, sin diseñar.

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

## 12. Próximo paso

Catálogo de coberturas de **Vida y Accidentes Personales** (siguiente y último ramo en el orden
MRC → Incendio → Vida/AP), usando `Tajy Cotizador Vida Colectivo 2025-04-04.xlsx` y
`Tajy Cotizador AP 2025-12-18.xlsx` como fuentes principales de tasas, más el manual
`M-08OP-GT-01, Manual de Suscripción Vida y Accidentes Personales v.02 301024.pdf` y cualquier
cotización real de Vida/AP ya emitida que Kevin tenga disponible.