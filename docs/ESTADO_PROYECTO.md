# Estado del proyecto — Cotizador Aseguradora Tajy

Documento de traspaso. Complementa a `CLAUDE.md` (contexto operativo y metodología) y
`PLAN_DESARROLLO.md` (arquitectura completa, schema y reglas de negocio) — no los reemplaza.
Este archivo responde una pregunta puntual: **¿qué se hizo, por qué, y qué falta, en este
momento del desarrollo?**

Última actualización: Fase 1, antes de la primera conexión a un proyecto Supabase real.

---

## 1. Resumen ejecutivo

- Estamos en **Fase 1** (Base del sistema). El ramo de referencia es **Auto individual** — es
  el único con datos 100% cerrados.
- La estructura del monorepo, el schema SQL completo (10 migraciones) y el motor de cálculo
  de Auto individual están escritos y auditados. **Nada de esto corrió todavía contra un
  Supabase real** — es el próximo paso.
- No hay bugs de lógica conocidos. Los gaps que quedan son ítems del checklist de Fase 1 que
  todavía no se empezaron (catálogo de coberturas) o casos explícitamente fuera de alcance por
  ahora (variantes SEGUCOOP/Plataforma del Excel de tasas, Plan Básico).

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
  /migrations             001 a 010, ver sección 4

/frontend
  /cotizar /historial /admin /shared    (estructura creada, sin implementación de UI todavía)
```

Coincide con lo que describe `CLAUDE.md`. Falta `backend/src/templates/` (plantillas HTML
para los PDF) — no bloquea Fase 1, se crea en Fase 2/4.

## 3. Motor de cálculo de Auto individual

`backend/src/calculators/auto.calculator.js` implementa la fórmula completa de la sección 5
de `PLAN_DESARROLLO.md`:

```
Prima_base = MAX(Capital × Tasa(plan, rango capital), plan.prima_tecnica_minima)
Prima = Prima_base − Descuentos (tope descuento_maximo) + Recargos (tope recargo_maximo)
RPF% = tasa fija por forma de pago (NO varía por cuotas)
R.P.F. = REDONDEAR.SUP(Prima × RPF% / 100, 1000)
IVA = Prima×10% + RPF×10%
Premio = Prima + RPF + IVA
Inicial = Cuota = REDONDEAR.SUP(Premio / 12, 1000)
```

Las 4 formas de pago (Contado, Cobrador, Boca de Cobranza, Tarjeta) se calculan siempre en
simultáneo, nunca una sola.

`resolverTiposFranquicia` (en `cotizacion.service.js`) implementa la regla dual de franquicia:
- Importación Directa → 1 variante, franquicia fija Gs. 350.000 (**hoy hardcodeada como
  constante**, con TODO explícito en el código para leerla de una tabla — ver pendiente
  abierto en sección 6).
- Representante + `plan.cotizacion_combinada = true` (Premium/Superior/Fuerte) → 2 variantes
  (sin franquicia / con franquicia, 20% descuento + franquicia = 12% de esa prima).
- Representante + `plan.cotizacion_combinada = false` (Noble) → 1 variante, sin franquicia.

**No implementado todavía:** Plan Básico. Usa tasa única fija (1,64% sobre RC) en vez de
`tasas_capital`, y el calculador de Auto hoy no distingue ese caso — está señalado con
comentario explícito en `008_seed_planes_auto.sql` y es el pendiente #4 de la sección 11 de
`PLAN_DESARROLLO.md`.

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
| 009 | Función Postgres `siguiente_correlativo` (incremento atómico, ver sección 6) |
| 010 | Columna `planes.codigo_tasa` + mapeo a los 4 códigos del Excel de tasas |

Orden de FKs verificado sin problemas: ninguna migración referencia una tabla creada en una
migración posterior. **Ninguna corrió todavía contra Supabase real** — se aplican en el SQL
Editor o vía CLI, en orden ascendente 001→010.

## 5. Endpoints implementados

Conectados punta a punta (ruta → controller → service → repository):
- `GET /api/ramos`
- `GET /api/ramos/:id/planes`
- `GET /api/planes/:id/coberturas`
- `POST /api/cotizaciones/calcular`
- `POST /api/cotizaciones`
- `GET /api/cotizaciones`
- `GET /api/cotizaciones/:id`
- `POST /api/admin/tasas/importar` (nuevo — ver sección 6)

Stub / no implementados (esperado en Fase 1, cada uno con TODO explícito en el código, no
fallan silenciosamente):
- `GET /api/planes/:id/servicios`
- `GET /api/ramos/:id/descuentos` `/recargos` `/clausulas`
- `GET /api/cotizaciones/:id/pdf-oferta` → Fase 2
- `POST /api/cotizaciones/:id/aceptar`, `GET /api/cotizaciones/:id/pdf-propuesta` → Fase 4
- CRUD `/api/admin/coberturas` → no existe aún

## 6. Decisiones tomadas en esta sesión (con motivo)

1. **Puppeteer `^23.0.0` → `^24.15.0`.** La versión vieja estaba deprecada. Sin tradeoff, bump
   directo. Chromium ya descargado y verificado (`npx puppeteer browsers list`).

2. **Vulnerabilidad "high" de `xlsx` (SheetJS) — riesgo aceptado.** Prototype Pollution + ReDoS,
   sin fix disponible upstream. Decisión: se mantiene `xlsx` (así lo pide `CLAUDE.md`) porque el
   vector de ataque requiere que quien sube el archivo ya tenga acceso al panel admin — no es
   input de un usuario anónimo. **Complemento acordado con Kevin:** además del importador de
   Excel, va a existir un panel admin para que Tajy pueda editar tasas a mano sin depender de
   volver a subir el archivo completo — reduce la dependencia de `xlsx` en el día a día. Ese
   panel admin **todavía no está diseñado ni implementado** — es Fase 1/5, queda anotado para
   cuando se lo aborde.

3. **Incremento de `correlativos` no era atómico.** El código original hacía
   `select → +1 → update` en dos pasos separados — bajo dos cotizaciones simultáneas del mismo
   ramo, se podían pisar el mismo número. Se resolvió con la función Postgres
   `siguiente_correlativo(ramo_id)` (migración 009), que hace `UPDATE ... RETURNING` en una
   sola sentencia, tomando el lock de fila dentro de la transacción. El repository
   (`cotizaciones.repository.js`) ahora llama a `supabase.rpc('siguiente_correlativo', ...)`
   en vez de hacer los dos pasos a mano.

4. **Workflow de estados de cotización — se evaluó y se descartó ampliarlo.** Se planteó
   externamente (sugerencia de otra IA) agregar estados tipo Suscripción/Inspección/Póliza
   emitida/Renovación. Se verificó contra el schema real: `cotizaciones.estado` ya tiene 5
   valores (`borrador / cotizada / aceptada / vencida / convertida`), y los estados sugeridos
   pertenecen a un sistema de emisión de pólizas — fuera del alcance de este proyecto, que es
   un cotizador (genera Carta Oferta y Propuesta Formal, no pólizas). Kevin confirmó que
   tampoco hace falta un estado intermedio "enviada" para tracking comercial — se maneja fuera
   del sistema. **No se tocó código por esta decisión.**

5. **Importador de tasas de Auto implementado** (`backend/src/services/tasas.service.js` +
   capas asociadas). Detalle:
   - Fuente: `Automovil Listado de Tasa.xlsx` (en la raíz del repo). El archivo tiene 10
     pestañas; se usa **solo la pestaña `Hoja1` como referencia de mapeo, e IGNORA por completo
     su contenido de tasas** (trae 2 columnas de tasa ambiguas sin explicación clara, ratio
     ~103x entre ellas, no se pudo confirmar cuál es la correcta). Las tasas reales se leen de
     las **9 pestañas individuales por código de plan**, que tienen formato limpio
     `[capital_min, capital_max, tasa_porcentaje]` sin ambigüedad.
   - **Alcance confirmado por Kevin: solo los códigos 107 (Premium), 103 (Superior), 102
     (Fuerte), 101 (Noble).** Los códigos 307/303/302/301 (variantes SEGUCOOP) y 648
     (Plataforma) existen en el Excel pero quedan **fuera de alcance por ahora** — no se
     importan.
   - Se agregó `planes.codigo_tasa` (migración 010) porque la tabla `planes` no tenía forma de
     matchear el código de pestaña del Excel contra un plan — antes solo existía `nombre`.
   - El import es atómico: si una sola fila de cualquiera de las 4 pestañas no pasa la
     validación Zod (`tasas.schema.js`), se aborta todo antes de tocar la base. Nunca se
     importa parcialmente.
   - `tasas_capital` se maneja con **borrado + reinserción completa por plan**, sin versionar
     por `vigente_desde` — no hay requisito de histórico de tasas todavía. Si en el futuro Tajy
     necesita comparar tasas de años distintos, hay que revisar este enfoque.
   - Validado localmente: parseo + Zod contra el archivo real, sin Supabase (107→350 filas,
     103/102/101→351 filas c/u, todas válidas). **No probado:** el repository contra Supabase,
     el endpoint `POST /api/admin/tasas/importar` end-to-end, ni la migración 010 corrida de
     verdad — eso es lo que sigue.

## 7. Pendientes abiertos (no bloqueantes para probar Fase 1, pero a tener en cuenta)

- Franquicia de Importación Directa (Gs. 350.000) sigue hardcodeada como constante en
  `cotizacion.service.js` en vez de leerse de una tabla — señalado en la sección 3.
- Plan Básico (tasa única) no distinguido en el calculador — señalado en la sección 3.
- Panel admin de edición manual de tasas — decisión tomada, sin diseñar (sección 6, punto 2).
- Catálogo de coberturas de Auto — todavía no se cargó (siguiente ítem del checklist de Fase 1,
  se arma a partir de `MODELO DE COTIZACION AUTO.pdf`).
- Importador de `Calculo_RPF.xlsx` (mencionado en `PLAN_DESARROLLO.md` sección 10) — no se
  encontró ese archivo en el repo todavía; según el propio plan, los valores de RPF por cuotas
  de ese archivo quedan descartados de todas formas (RPF es fijo por forma de pago, no por
  cuotas), así que probablemente no haga falta un importador para eso — a confirmar antes de
  darlo por innecesario.

## 8. Próximo paso

Conectar un proyecto Supabase real: correr las migraciones 001→010 en orden, cargar
`backend/.env` con las credenciales, y probar de punta a punta el flujo de Auto individual
(cotizar → calcular → guardar → recuperar) más el importador de tasas contra la base real.
