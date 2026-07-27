# Proposal: Incendio — 3 planes nuevos (Hipotecario, con/sin Inspección) + moneda USD/Gs.

## Intent

Hoy Incendio solo cotiza 2 planes con 2 mecánicas ad hoc discriminadas por **nombre de plan**, y el sistema no modela moneda en ningún lado: "MAQUINARIA BASICO" se cotiza en USD por acuerdo verbal pero se formatea con `fmtGs` (gap documentado desde la migración 013). Kevin necesita vender 3 planes nuevos — **Incendio Hipotecario**, **Incendio con Inspección**, **Incendio sin Inspección** — cuya tasa se desglosa por **objeto de riesgo** (Edificio, Instalaciones, Contenido Mueble y Equipos, Contenido Mercadería), y que el agente pueda emitir cualquier cotización en Gs. o USD a pedido del cliente.

## Scope

### In Scope

- Tercera mecánica de tasa en `incendio.calculator.js`: tasa global por **tipo de riesgo**, desglosada en 4 objetos de riesgo (Edificio 40%, Instalaciones 40%, Contenido Mueble y Equipos 60%, Contenido Mercadería 60% de la tasa global), con tasa mínima y máxima por tipo de riesgo.
- Modelo de datos **genérico** de tasas: tabla `tipo de riesgo × objeto de riesgo`, no hardcode de "VIVIENDA FAMILIAR" (única confirmada hoy: global 2,24%, mín 0,6%, máx 35,48% → 0,90 / 0,90 / 1,34 / 1,34%).
- Alta de los 3 planes (catálogo, coberturas, tasas, texto legal confirmado del Hipotecario: primer riesgo absoluto, exigencia de edificio terminado, exclusión de vendaval sin 4 costados, informe de tasación, recomendaciones de mantenimiento eléctrico y aviso a la compañía).
- **Regla de umbral de inspección**: si la suma asegurada supera el umbral (≈USD 700.000, valor final por confirmar), la cotización debe ser "con Inspección"; por debajo, "sin Inspección".
- **Moneda transversal**: `moneda` por cotización (Gs. | USD), propagada desde el frontend, validada en Zod, persistida como snapshot y respetada en formateo/historial. Incluye regularizar "MAQUINARIA BASICO".
- Frontend: selector de moneda, campos de los 4 objetos de riesgo, helper `fmtUsd*` en `shared/format.js`.

### Out of Scope

- Template de Carta Oferta en PDF para Incendio (gap conocido, fase posterior del roadmap).
- Ramo TRO / Transporte (se trabaja aparte con Marcia).
- Fase 2 de Auto (pausada).
- Reexpresión de cotizaciones históricas ya emitidas: se asumen Gs. salvo el plan Maquinaria.

## Capabilities

### New Capabilities

- `incendio-planes-objeto-riesgo`: cotización de Incendio con tasa global por tipo de riesgo desglosada en 4 objetos de riesgo, pisos/topes de tasa, y los 3 planes nuevos.
- `incendio-umbral-inspeccion`: regla de negocio que determina si una cotización es "con Inspección" o "sin Inspección" según la suma asegurada.
- `cotizacion-moneda`: soporte transversal de moneda (Gs./USD) por cotización — selección, validación, persistencia y presentación.

### Modified Capabilities

- None (`openspec/specs/` está vacío; este es el primer cambio bajo SDD).

## Approach

1. **Tasas por objeto de riesgo (nueva tabla)**: crear `tasas_riesgo_objeto` con `(ramo_id, tipo_riesgo_id, objeto_riesgo, tasa_valor, unidad)` más `tasa_global`, `tasa_minima`, `tasa_maxima` por tipo de riesgo. Se descarta extender `rubros_actividad` con 4 columnas más porque la tabla ya sirve a MRC e Incendio simple con semántica distinta.
2. **Selección de mecánica**: reemplazar el discriminador `plan.nombre === 'MAQUINARIA BASICO'` por un campo explícito `planes.tipo_mecanica` (`edificio_contenido` | `maquinaria` | `objeto_riesgo`). Los 3 planes nuevos comparten `objeto_riesgo` sin duplicar código.
3. **Divergencia futura entre los 3 planes**: `tasas_cobertura_ramo` no tiene `plan_id`. La tabla nueva SÍ debe permitir override por plan (`plan_id` nullable) para que con/sin Inspección puedan divergir sin refactor.
4. **Umbral de inspección**: la regla vive en el **backend** (calculador/servicio), como validación 422 con mensaje de usuario — mismo patrón que "supera la Responsabilidad Máx. Cotizable". El frontend puede sugerir el plan, pero la fuente de verdad es el backend.
5. **Moneda**: `cotizaciones.moneda NOT NULL DEFAULT 'PYG'` + `planes.monedas_permitidas`. Las tasas (‰/%) son independientes de la moneda; solo cambian los montos de salida y los pisos (`prima_tecnica_minima` necesita valor propio por moneda, no conversión implícita).
6. **Tipo de cambio**: tabla `tipo_cambio_historico` (o similar) poblada automáticamente desde una fuente externa — API pública de [dolarPy](https://github.com/melizeche/dolarPy) (`GET https://dolar.melizeche.com/api/1.0/`, campo `dolarpy.set.compra`/`dolarpy.set.venta`, cotización Casa de Cambio SET, confirmada por Kevin como la referencia de la empresa). Sin auth, JSON, actualizado cada pocos minutos. Cada cotización guarda el tipo de cambio vigente al momento como snapshot (no se recalcula después). Riesgo de disponibilidad de un servicio de terceros sin SLA — ver Risks.

## Affected Areas

| Área                                             | Impacto  | Descripción                                                                              |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------- |
| `backend/migrations/`                            | New      | Tabla de tasas por objeto de riesgo, columna `moneda`, `tipo_mecanica`, seed de 3 planes |
| `backend/src/calculators/incendio.calculator.js` | Modified | Tercera rama de mecánica + dispatch por `tipo_mecanica`                                  |
| `backend/src/schemas/incendio.schema.js`         | Modified | 4 capitales por objeto de riesgo + `moneda`                                              |
| `backend/src/services/cotizacion.service.js`     | Modified | Resolución de tasas por tipo/objeto de riesgo; regla de umbral                           |
| `backend/src/repositories/`                      | Modified | Query de tasas nueva; listados que asumen Gs.                                            |
| `frontend/cotizar/cotizar.js`                    | Modified | Selector de moneda, 4 campos de capital, sugerencia con/sin Inspección                   |
| `frontend/shared/format.js`                      | New      | `fmtUsd` / prefijo de moneda parametrizable                                              |
| `frontend/historial/`                            | Modified | Mostrar moneda por fila; no sumar montos de monedas distintas                            |

## Alternativas consideradas

| Alternativa                                                                   | Por qué se descarta                                                                            |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Moneda fija por plan (`planes.moneda_default` únicamente)                     | No cumple el requisito: el cliente elige la moneda **por cotización**, no está atada al plan   |
| Moneda como etiqueta de display sin dato tipado (estado actual de Maquinaria) | Perpetúa la inconsistencia numérica; el historial mezclaría Gs. y USD sin poder distinguirlos  |
| Un calculador separado por cada uno de los 3 planes                           | Los 3 comparten mecánica confirmada; triplicaría el código y el mantenimiento de tasas         |
| Reusar `rubros_actividad` agregando 4 columnas de tasa                        | Sobrecarga una tabla ya compartida con MRC; no modela tasa global/mín/máx ni override por plan |

## Risks

| Riesgo                                                                                                                                    | Prob. | Mitigación                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tasas de tipos de riesgo distintos de Vivienda Familiar sin confirmar (Kevin confirma semana del 2026-08-03)                              | Alta  | Modelo genérico por tabla; se seedea solo lo confirmado y el resto falla con 422 "tasa no confirmada" (patrón ya usado)                                                                             |
| Umbral de inspección sin monto final                                                                                                      | Alta  | Parametrizar el umbral en configuración/plan, nunca hardcodear                                                                                                                                      |
| Los 3 planes divergen a futuro pese a compartir mecánica hoy                                                                              | Media | `plan_id` nullable en la tabla de tasas desde el día 1                                                                                                                                              |
| Mezclar Gs. y USD en historial/reportes                                                                                                   | Media | `moneda` NOT NULL y prohibición de agregar totales cross-moneda                                                                                                                                     |
| `prima_tecnica_minima` en Gs. aplicada a cotización USD                                                                                   | Media | Piso por moneda, explícito; sin conversión implícita                                                                                                                                                |
| Migración de datos históricos sin moneda                                                                                                  | Baja  | `DEFAULT 'PYG'` + backfill explícito del plan Maquinaria a USD                                                                                                                                      |
| `dolar.melizeche.com` es un servicio de terceros no oficial, sin SLA (puede caerse, cambiar de formato, o devolver datos desactualizados) | Media | Cachear el último valor conocido y usarlo como fallback si el fetch falla; loguear cuándo se usa un valor stale; considerar override manual en el panel admin como salvavidas (a definir en diseño) |

## Rollback Plan

- Cambios de schema entregados como migraciones aditivas: nuevas tablas/columnas nullable o con default, sin `DROP` ni cambio de tipo de columnas existentes.
- Rollback nivel 1 (negocio): `UPDATE planes SET activo = FALSE` para los 3 planes nuevos — desaparecen del selector sin tocar código (mismo patrón usado con "COMERCIO PROTECCION TOTAL").
- Rollback nivel 2 (código): revertir el commit; el dispatch por `tipo_mecanica` conserva el fallback al comportamiento anterior mientras la columna exista.
- Rollback nivel 3 (schema): migración `down` que dropea la tabla de tasas nueva y las columnas `moneda` / `tipo_mecanica`; las cotizaciones emitidas en USD quedarían sin marca de moneda → ejecutar solo si no hay cotizaciones USD emitidas.

## Dependencies

- Confirmación de Kevin de tasa global/mín/máx para tipos de riesgo distintos de Vivienda Familiar (esperada semana del 2026-08-03) — no bloquea implementar el mecanismo.
- Confirmación del monto final del umbral de inspección.
- Confirmación del monto final del umbral de inspección.

## Decisiones confirmadas por Kevin (2026-07-27, tras revisar esta propuesta)

- **Tipo de cambio**: tabla de cotización vigente, poblada automáticamente desde la API pública de dolarPy (fuente SET) — ver Approach punto 6. Ya NO es una pregunta abierta.
- **Umbral de inspección**: aplica solo a "Incendio con Inspección" / "Incendio sin Inspección". **"Incendio Hipotecario" queda fuera de esta regla** — es un plan independiente, el agente lo elige directamente sin condición de suma asegurada.
- **Objetos de riesgo**: los 4 campos (Edificio, Instalaciones, Contenido Mueble y Equipos, Contenido Mercadería) son **opcionales** — el agente declara solo los que aplican al riesgo del cliente (p. ej. una vivienda familiar sin mercadería no carga ese campo). El cálculo de prima suma solo los objetos declarados.

## Open Questions (pendientes, no bloquean diseño)

1. **Monto exacto del umbral de inspección** y en qué moneda se expresa canónicamente (¿USD siempre, o el equivalente en Gs. cuando la cotización es en Gs.?). Pendiente de confirmación de Kevin.
2. ¿Los 3 planes nuevos tienen `prima_tecnica_minima` propia, y en qué moneda? Pendiente junto con las tasas de otros tipos de riesgo (semana del 2026-08-03).
3. Si una cotización en USD supera el umbral expresado en USD pero el cliente la pidió en Gs., ¿qué manda: el monto declarado o el equivalente convertido usando el tipo de cambio vigente al cotizar? Sugerido para diseño: convertir usando el tipo de cambio snapshot de esa cotización.
4. ¿Un agente puede cambiar la moneda de una cotización ya emitida, o requiere una cotización nueva? Sugerido: requiere cotización nueva (mismo criterio que otros ramos, las cotizaciones emitidas no se editan).
5. Frecuencia de actualización del tipo de cambio consumido desde dolarPy: ¿en cada cotización en tiempo real, o cacheado por un intervalo (ej. cada 10-30 min, alineado con el scraper de origen que actualiza cada 10 min)? A definir en diseño.

Supuestos asumidos en esta propuesta y que el usuario debería corregir si están mal: (a) los 3 planes comparten tasas hoy pero deben poder divergir; (b) la regla de inspección se valida en backend; (c) no se reexpresan cotizaciones históricas; (d) el tipo de cambio se snapshotea por cotización, no se recalcula retroactivamente.

## Success Criteria

- [ ] Un agente puede cotizar los 3 planes nuevos declarando los 4 objetos de riesgo y obtener prima correcta con las tasas de Vivienda Familiar (0,90 / 0,90 / 1,34 / 1,34%).
- [ ] Agregar un tipo de riesgo nuevo con su tasa global solo requiere una fila de seed, sin tocar código.
- [ ] Una suma asegurada por encima del umbral no puede emitirse como "sin Inspección".
- [ ] Toda cotización nueva persiste su moneda; el historial la muestra y nunca suma montos de monedas distintas.
- [ ] "MAQUINARIA BASICO" queda marcado en USD y se formatea como USD (gap de la migración 013 cerrado).
- [ ] Tests unitarios del calculador en verde (`npm test --prefix backend`), sin regresión en los 84 existentes.
