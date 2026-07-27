# Exploration: Incendio — 3 planes nuevos (Hipotecario, con/sin Inspección) + soporte de moneda USD/Gs.

## Current State

**Calculador (`backend/src/calculators/incendio.calculator.js`)**: un solo calculador por ramo (`ramos.calculador = 'incendio'`, dispatch en `backend/src/calculators/index.js`), que internamente ramifica por **nombre de plan** (`plan.nombre === 'MAQUINARIA BASICO'` → rama tasa fija; cualquier otro nombre → rama "Edificio y Contenido" por rubro). No hay un campo `tipo_mecanica` en `planes`; el nombre del plan es el único discriminador hoy. Dos mecánicas de tasa coexisten:

- **"INCENDIO - EDIFICIO Y CONTENIDO"**: tasa por `rubro_actividad` (tabla `rubros_actividad`, columnas `tasa_edificio`/`tasa_contenido` en ‰), resuelta ya en `cotizacion.service.js` (`resolverContextoRepositorios`) y pasada como `rubro`. Piso `plan.prima_tecnica_minima` (Gs. 409.091, migración 023).
- **"MAQUINARIA BASICO"**: tasa fija única 0,7% (7‰) cargada como fila en `tasas_cobertura_ramo` para el código `incendio_maquinaria`. No usa `rubros_actividad`. Se cotiza en USD (dato dictado, no modelado en schema).

`tasas_cobertura_ramo` está keyed por `(ramo_id, cobertura_id)`, **no por `plan_id`** — funciona porque cada código de catálogo (`incendio_maquinaria`, etc.) hoy es exclusivo de un plan. Relevante para los 3 planes nuevos: si comparten exactamente la misma tasa/mecánica (confirmado por Kevin), pueden compartir códigos de catálogo vía `plan_coberturas`; si alguno diverge a futuro, hará falta separar códigos o añadir `plan_id` a `tasas_cobertura_ramo`.

Piso silencioso (`Math.max(primaCalculada, plan.prima_tecnica_minima)`) — mismo criterio ya usado en MRC — aplicaría igual a los 3 planes nuevos si tienen `prima_tecnica_minima` cargada.

**Schema relevante**:

- `planes` (`002_ramos_planes.sql`): `prima_tecnica_minima`, `cotizacion_combinada`, `tipo_franquicia`, `franquicia_porcentaje`, `descuento_maximo`, `recargo_maximo`, `cuotas_default/maximo`, `activo`. **No hay columna de moneda.**
- `coberturas_catalogo` (`003_coberturas_servicios_ajustes.sql`): `codigo`, `nombre`, `categoria`, `texto_legal`, `texto_exclusiones`, `monto_default`, `franquicia_default`, `es_opcional`, `activo`. **Tampoco tiene moneda.**
- `tasas_cobertura_ramo` (`004_tarifacion.sql`): `ramo_id`, `cobertura_id`, `tasa_valor`, `unidad` (`'permil'` o `'porcentaje'`). Sin moneda ni `plan_id`.
- `cotizaciones` (`005_cotizaciones.sql`): `capital_asegurado NUMERIC(14,2)`, `riesgo_datos JSONB`. Sin moneda. `cotizacion_variantes.prima`, `cotizacion_plan_pago.*_monto`, `cotizacion_coberturas.monto`, todos `NUMERIC` sin unidad de moneda asociada.
- Confirmado por grep: **ninguna tabla del schema tiene columna `moneda`/`currency`** en todo el repo.

**Precedente documentado**: el comentario de `013_seed_incendio.sql` (líneas ~131-137) ya señala este gap exacto para "MAQUINARIA BASICO" y lo deja pendiente de decisión con Kevin — hoy ese pendiente pasa de afectar 1 plan a ser transversal.

**Frontend (`frontend/cotizar/cotizar.js`)**: el campo Capital Maquinaria ya tiene el label `"Capital Maquinaria (USD)"` pero **el valor se formatea con `fmtGs()`** — es decir, la "moneda" hoy es solo un string en el label, no un dato tipado ni propagado al backend. `armarRiesgoDatos()` arma el body sin ningún campo `moneda`. No existe selector de moneda en el formulario.

`frontend/shared/format.js` solo tiene `fmtGs`/`fmtGsConPrefijo`/`fmtGsInput` — no existe `fmtUsd*`.

**Template PDF (`backend/src/templates/oferta/mrc.js`)**: patrón de referencia ya cerrado — deriva coberturas/sublímites EN VIVO desde `planCoberturas` (join `plan_coberturas` + `coberturas_catalogo`), nunca hardcodea montos. Todos los montos se formatean con `fmtGs` de `./layout.js`; el texto de las tablas asume `Gs.` como prefijo literal hardcodeado. Un plan en USD necesitaría o un `fmtUsd` equivalente, o parametrizar el prefijo de moneda por variante.

## Affected Areas

- `backend/src/calculators/incendio.calculator.js` — tercera rama de mecánica (desglose Edificio/Instalaciones/Contenido Mueble y Equipos/Contenido Mercadería) reutilizable entre los 3 planes nuevos, más la regla de umbral de inspección.
- `backend/src/schemas/incendio.schema.js` — `riesgoIncendioSchema` necesita campos para los 4 montos por objeto de riesgo, probablemente `moneda`.
- `backend/migrations/` — migración de schema (columna de moneda) + seed de catálogo/tasas/planes nuevos.
- `backend/src/repositories/` — revisar en fase de diseño qué queries de listado/historial asumen Gs.
- `frontend/cotizar/cotizar.js` — selector de moneda, propagación al body, lógica de con/sin Inspección según umbral.
- `frontend/shared/format.js` — nuevo helper `fmtUsd*` si aplica.
- `backend/src/templates/oferta/*` — nuevo template de Carta Oferta de Incendio (gap ya conocido), con prefijo de moneda dinámico si aplica.
- `historial` — vistas que sumen/listen montos sin distinguir moneda quedarían inconsistentes si se mezclan Gs. y USD.

## Approaches

1. **Moneda fija por plan** (`planes.moneda_default` + `cotizaciones.moneda` como snapshot heredado del plan).
   - Pros: cambio de schema mínimo, consistente con el patrón "todo fijo por plan" ya usado (RPF, franquicia).
   - Cons: no resuelve el pedido real ("el cliente puede pedir la cotización en cualquiera de las dos monedas" = elección libre por cotización, no fija por plan).
   - Effort: Low.

2. **Moneda seleccionable por cotización + tipo de cambio** (`cotizaciones.moneda` elegida al cotizar + tabla/campo de tipo de cambio para convertir capitales/primas).
   - Pros: resuelve el requisito real; las tasas ‰/% no cambian por moneda, solo los montos de salida.
   - Cons: mayor superficie de cambio; abre la pregunta de fuente del tipo de cambio (manual, fijo por cotización, o tabla histórica) — sin confirmar; pisos como `prima_tecnica_minima` necesitan definirse también en USD o convertirse.
   - Effort: Medium-High.

3. **Moneda transversal mínima (solo etiqueta/display, sin conversión)** — igual que el estado actual del campo Maquinaria.
   - Pros: mínimo esfuerzo.
   - Cons: riesgo alto de inconsistencia numérica (mezclar montos en distinta moneda sin conversión). No resuelve el problema, lo posterga.
   - Effort: Low, con deuda técnica.

## Recommendation

Enfoque 2 es el único que cumple el requisito tal como está redactado, pero no se puede diseñar el detalle de conversión sin que Kevin confirme si el tipo de cambio es fijo manual por cotización, una tabla vigente, o si no hay conversión (cada plan/cotización vive en una sola moneda sin mezclar). La mecánica de tasa por objeto de riesgo de los 3 planes nuevos puede proponerse en paralelo, ya que no depende de la decisión de moneda.

## Risks

- Tasas por confirmar: solo Vivienda Familiar/Hipotecario tiene tasa global y desglose confirmados (2,24% global, mín 0,6%, máx 35,48%, desglose 40/40/60/60% → 0,90/0,90/1,34/1,34%). Otros tipos de riesgo siguen en definición.
- Umbral de inspección sin confirmar: monto exacto (~USD 700.000, no final) y su expresión en Gs.
- Regla con/sin Inspección — ubicación ambigua: calculador (validación 422, mismo patrón que "supera responsabilidad máxima cotizable") vs. frontend (autoselección de plan).
- `tasas_cobertura_ramo` sin `plan_id`: si los 3 planes divergen en tasa a futuro, el modelo actual no lo soporta sin duplicar códigos de catálogo.
- Piso `prima_tecnica_minima` en Gs. — un plan en USD necesita su propio piso, no reusar el de Gs. sin conversión.
- Inconsistencia ya existente hoy: Capital Maquinaria etiquetado "(USD)" pero formateado con `fmtGs`.
- Template de Carta Oferta de Incendio sigue sin existir (gap ya conocido en CLAUDE.md).

## Ready for Proposal

**Parcial.** La parte de "3 planes con mecánica de tasa por objeto de riesgo" está lista para `sdd-propose`. La parte de "soporte de moneda transversal" no está lista — falta que Kevin confirme si hay conversión de tipo de cambio o si cada cotización vive en una sola moneda sin mezclar, antes de diseñar el schema de moneda con confianza. Se propone avanzar ambas partes en el mismo `sdd-propose`, marcando la sub-decisión de tipo de cambio como bloqueante de **diseño**, no de propuesta.

---

**Status**: done
**Next Recommended**: sdd-propose (con la pregunta de tipo de cambio marcada como bloqueante de diseño, no de exploración)
