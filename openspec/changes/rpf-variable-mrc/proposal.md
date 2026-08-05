# Proposal: RPF variable por cantidad de cuotas (MRC, Incendio, Vida/AP)

> El slug del cambio (`rpf-variable-mrc`) se conserva por continuidad. El alcance real es **3 ramos**, no solo MRC — ver "Corrección de alcance".

## Intent

Hoy el R.P.F. es un **escalar fijo por (plan, forma de pago)**: `plan_formas_pago.tasa_rpf` (migración 002), leído en `construirVariantes` (`backend/src/services/cotizacion.service.js:~485`) y aplicado en `calcularPlanPago` (`calculators/utils/plan-pago.js`). La cantidad de cuotas **no influye** en el RPF: solo parte el Premio en Inicial + Cuotas.

Análisis de Riesgo (Parte B del pedido "Ajuste MC"; la Parte A quedó cerrada 8/8, ver `ESTADO_PROYECTO.md` 53-54) pide que el RPF pase a depender de la **cantidad de cuotas**, con la tabla real que el negocio **ya usa hoy fuera del sistema**. Consecuencia: el sistema cobra de menos en plazos largos y de más en plazos cortos respecto de la tarifa vigente en la aseguradora.

**Esto revierte explícitamente una decisión previa.** `002_ramos_planes.sql:38-39` y `023_rpf_incendio_y_vida_ap.sql:2-7` documentan que la tabla de RPF por cuotas del manual M-08OP-GT-01 **fue evaluada y descartada** (2026-07-13) en favor del valor plano, para todos los ramos. La reversión se justifica en un pedido nuevo, explícito y con datos, y debe quedar **escrita en la migración**, no inferida.

### Corrección de alcance

Kevin confirmó (2026-08-05, Engram #387, con foto de la tabla real) que **la tabla de RPF por cuotas es LA MISMA para MRC, Incendio y Vida/AP** — no hay tablas separadas por ramo — y que **debe quedar editable desde el panel admin**. Esto invalida el alcance "solo MRC" de la versión anterior de esta propuesta, que se basaba en una nota desactualizada de `CLAUDE.md`.

### Tabla confirmada (`docs/insumos/Ajuste MC.xlsx`, Hoja4)

| Cuotas | Cobrador | Aquí Pago (`boca_cobranza`) | Tarjeta de Crédito |
| -----: | -------: | --------------------------: | -----------------: |
|      1 |      1.2 |                           1 |                  0 |
|      2 |     1.55 |                        1.24 |                  0 |
|      3 |   1.6889 |                      1.3511 |                0.8 |
|      4 |   2.7444 |                      2.1956 |                1.3 |
|      5 |      3.8 |                        3.04 |                1.8 |
|      6 |   4.8556 |                      3.8844 |                2.3 |
|      7 |   5.9111 |                      4.7289 |                2.8 |
|      8 |   7.1778 |                      5.7422 |                3.4 |
|      9 |   8.2333 |                      6.5867 |                3.9 |
|     10 |   8.8667 |                      7.0933 |                4.2 |
|     11 |      9.5 |                         7.6 |                4.5 |

`contado` tiene `formas_pago.tiene_rpf = FALSE` y `calcularPlanPago` ya lo cortocircuita a 0 — fuera de la tabla, sin cambios.

## Scope

### In Scope

- **Modelo de datos nuevo** para el RPF por (forma de pago, cuotas), **compartido por los 3 ramos** (una sola curva, no una por ramo ni por plan), con las 33 celdas como seed versionado en `backend/migrations/`. Forma concreta (tabla nueva vs. JSON; cómo se marca la pertenencia de un plan a la curva) la decide `sdd-design`.
- **Aplicación a MRC + Incendio + Vida/AP** en la misma entrega. Los 3 dejan de usar el valor plano (1.6 / 1.35 / 1.0 de la migración 023) para todas sus formas de pago con RPF.
- **Mecanismo de exclusión explícito para Auto/Auto-Flota**, que conservan el valor plano actual (`plan_formas_pago.tasa_rpf`) sin cambio de comportamiento observable. Preferentemente por datos (opt-in del plan/ramo a la curva) antes que por un `if (ramo === ...)` hardcodeado.
- **Resolución de la tasa efectiva antes del calculador**: `construirVariantes` ya resuelve `cuotas` y arma `{ codigo, tasa_rpf }`. La tasa por cuotas se resuelve **ahí**, no dentro de `calcularPlanPago`.
- **Edición desde el panel admin de la grilla completa (11 cuotas × 3 formas de pago)**. Hoy la superficie existe pero es **un solo valor escalar por (plan, forma de pago)**: `PUT /admin/plan-formas-pago/:id` (gate `requirePlanesEdit`) + edición inline en la subfila "Formas de pago" de la tabla de Planes (`frontend/admin/render/planes.js:232-251`, `renderCampoTasaRpf`). Este cambio **extiende o reemplaza** esa superficie por una grilla; no la crea de cero.
- Comportamiento de fallback/clamp cuando no hay fila para la combinación pedida.
- Actualización de `PLAN_DESARROLLO.md` (sección 5, fórmula de RPF), `CLAUDE.md`, `ESTADO_PROYECTO.md`.

### Out of Scope

- **Auto y Auto-Flota**: fuera del pedido de Análisis de Riesgo y con Fase 2 pausada. Deben quedar con RPF plano y **cero diff de Premio**, verificado por test de regresión.
- **`calculators/utils/plan-pago.js` (`calcularPlanPago`)**: compartida por los 4 calculadores, con test de contrato cruzado (`ramo-calculator.contract.test.js`). **No se toca su firma ni su cuerpo.** Sigue recibiendo un `tasa_rpf` ya resuelto.
- **Recálculo de cotizaciones ya emitidas.** Las variantes persisten `rpf_porcentaje` como snapshot; nada retroactivo.
- Fórmula de RPF, redondeo (`redondearSup` al millar), IVA, Premio, Cuota/Inicial: sin cambios.
- Planes con `cuotas_maximo = 0` (ej. `MULTIRRIESGO COMERCIO - SEGUCOOP`, migración 048): solo Contado, quedan naturalmente fuera.
- Borrado de `plan_formas_pago.tasa_rpf` (queda al menos como fallback/legacy y como valor vivo de Auto).
- Curvas distintas por plan o por ramo (la confirmación dice una sola tabla; si más adelante hacen falta, el modelo no debe impedirlo pero no se implementan acá).

## Capabilities

### New Capabilities

- `rpf-por-cuotas`: el R.P.F. deja de ser un escalar por (plan, forma de pago) y pasa a resolverse por (forma de pago, cantidad de cuotas) para MRC/Incendio/Vida-AP, con fallback definido, exclusión explícita de Auto y edición administrable de la grilla.

### Modified Capabilities

- None. Ninguna spec existente (`cotizacion-moneda`, `mrc-plan-descuento-fijo`, `incendio-*`, `auth-*`) define hoy el comportamiento del RPF.

## Approach

Resolver la tasa efectiva en `construirVariantes`, entre `resolverCuotas` y el `map` de `formasPago`: donde hoy se pasa `tasa_rpf: fp.tasa_rpf`, pasar `tasa_rpf: resolverTasaRpf({ plan, formaPago: fp, cuotas })`. Función pura, testeable sin mockear repositories — mismo patrón que `resolverDescuentos` (precedente directo del cambio `mrc-plan-descuento-fijo`).

Ventajas: (a) `calcularPlanPago` y su test de contrato quedan intactos; (b) Auto no cambia porque `resolverTasaRpf` cae al valor plano cuando el plan no está adherido a la curva; (c) el alcance por ramo es un dato, no una rama de código.

Descartado: mover la resolución dentro de `calcularPlanPago` — obliga a tocar la función compartida por los 4 ramos y su contrato, sin ganancia.

## Affected Areas

| Área                                                                                                                | Impacto         | Descripción                                                     |
| ------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------- |
| `backend/migrations/0XX_rpf_por_cuotas.sql`                                                                         | New             | Modelo + seed de 33 celdas + adhesión de MRC/Incendio/Vida-AP + comentario de reversión de 002/023 |
| `backend/src/services/cotizacion.service.js`                                                                        | Modified        | `resolverTasaRpf` (nueva, pura) + `construirVariantes`          |
| `backend/src/repositories/ramos.repository.js`                                                                      | Modified        | Lectura de la curva (candidata a `withCache`)                    |
| `backend/src/calculators/utils/plan-pago.js`                                                                        | **Sin cambios** | Contrato compartido preservado                                   |
| `backend/src/schemas/admin.schema.js`, `admin.routes.js`, `admin.controller.js`, `services/admin/planes.service.js`  | Modified        | Endpoint(s) de edición de la grilla                              |
| `frontend/admin/render/planes.js`, `frontend/admin/planes.js`                                                        | Modified        | UI de la grilla (extiende `renderCampoTasaRpf`)                  |
| `docs/PLAN_DESARROLLO.md`, `CLAUDE.md`, `docs/ESTADO_PROYECTO.md`                                                    | Modified        | Fórmula de RPF y registro de estado                              |

## Risks

| Riesgo                                                                                       | Prob.    | Mitigación                                                                                                    |
| ---------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| Cambio silencioso de primas en **Auto** por tocar la ruta compartida                          | **Alta** | `calcularPlanPago` intacto + fallback al valor plano + test de regresión que fija el Premio actual de un caso de Auto |
| Salto fuerte de prima a 11 cuotas en los 3 ramos (1.6% → 9.5%, ~6x)                           | **Alta** | Es el efecto buscado; verificar en vivo contra un cálculo manual de Análisis de Riesgo **por cada ramo** antes de mergear |
| El alcance de 3 ramos multiplica la superficie de verificación en vivo                        | Media    | Matriz mínima explícita: 3 ramos × (Cobrador, Boca, Tarjeta) × (1, 3, 11 cuotas) + Contado                     |
| "Aquí Pago" no es exactamente `boca_cobranza` → columna mal mapeada en los 3 ramos            | Media    | Confirmación explícita de Kevin (pregunta #1) antes de escribir el seed                                        |
| Un plan con `cuotas_maximo > 11` (el admin puede subirlo) pide una fila inexistente            | Media    | Regla de clamp/fallback explícita en el diseño; hoy todos los planes están en ≤ 11                             |
| La grilla editable (33 celdas) rompe el patrón inline de una celda del admin                  | Media    | Decisión de UI en `sdd-design`; el gate de permisos debe seguir siendo el mismo (`requirePlanesEdit`) o subirse a admin literal si Kevin lo pide |
| Precisión: la tabla trae 4 decimales (1.6889); `tasa_rpf` es `NUMERIC(10,6)`                  | Baja     | Cabe sin pérdida; conservar el mismo tipo                                                                     |
| Se reintroduce a futuro el valor plano por desconocer que fue reemplazado                     | Media    | La migración documenta la reversión de 002/023 y `PLAN_DESARROLLO.md` sección 5 se actualiza en el mismo cambio |
| Colisión de numeración de migración (precedente 046/048)                                      | Baja     | `npm run verify:migrations` ya corre en CI                                                                    |

## Rollback Plan

- **N1 (negocio, sin deploy)**: `UPDATE` de la curva dejando todas las cuotas con el valor plano actual por forma de pago (Cobrador 1.6 / Boca 1.35 / Tarjeta 1.0), o desadherir los 3 ramos → comportamiento idéntico al de hoy sin tocar código.
- **N2 (código)**: revertir el commit. `resolverTasaRpf` desaparece y `construirVariantes` vuelve a `fp.tasa_rpf`; `plan_formas_pago.tasa_rpf` **nunca se borra ni se pisa**, así que el dato original sigue intacto para los 4 ramos.
- **N3 (schema)**: `DROP` de la estructura nueva. Cambio 100% aditivo: sin `DROP COLUMN`, sin cambio de tipo, sin `UPDATE` destructivo sobre columnas preexistentes.
- Cotizaciones ya emitidas guardan `rpf_porcentaje` como snapshot — ningún rollback las altera.

## Dependencies

- Aplicar migraciones contra Supabase real requiere confirmación explícita de Kevin (convención del proyecto).
- Respuesta a la pregunta #1 ("Aquí Pago") antes de congelar el seed en `sdd-design`.

## Success Criteria

- [ ] Cotizando **MRC, Incendio y Vida/AP** a 11 cuotas por Cobrador, el RPF aplicado es 9.5% (no 1.6%) en los tres, y coincide con el cálculo manual de Análisis de Riesgo.
- [ ] Las 33 celdas quedan cargadas verbatim, con la precisión de 4 decimales intacta.
- [ ] Contado en cualquier plan sigue con RPF = 0.
- [ ] Tarjeta de Crédito a 1 y 2 cuotas da RPF = 0 (regla de la tabla).
- [ ] Cotizar **Auto** produce exactamente el mismo Premio que antes del cambio (test de regresión con valores fijados).
- [ ] Planes de solo Contado (SEGUCOOP) no cambian.
- [ ] La grilla completa es editable desde el panel admin y el cambio se refleja en la siguiente cotización sin deploy.
- [ ] `npm test --prefix backend` en verde, sin regresión sobre los 194 tests actuales.
- [ ] `calculators/utils/plan-pago.js` no aparece en el diff.

## Proposal question round

Por `openspec/config.yaml` (`rules.proposal`), quedan como **bloqueantes de diseño, no de propuesta**: `sdd-spec` y `sdd-design` pueden arrancar, pero #1 debe responderse antes de congelar el seed.

1. **"Aquí Pago" = "Boca de Cobranza".** ¿Es el mismo concepto con otro nombre comercial (mapeo a `boca_cobranza`), o es un medio de cobro distinto que hoy no existe en `formas_pago`?
2. **Tarjeta de Crédito a 1-2 cuotas en 0.** ¿Es una regla real ("hasta 2 cuotas con tarjeta no se cobra RPF") o son celdas que quedaron vacías en la planilla? Si es lo segundo, no deberíamos cargarlas como 0.
3. **Cuotas fuera de la tabla.** La tabla llega a 11 y hoy todos los planes tienen `cuotas_maximo ≤ 11`. Si alguien sube el tope a 12 desde el admin: ¿se clampea al RPF de 11, se rechaza la cotización, o se bloquea el tope en el admin?
4. **Quién edita la grilla.** Hoy `tasa_rpf` lo edita cualquier rol con `puede_editar_planes` (Jefe/Analista de Riesgo, además de admin). Con una sola curva compartida por 3 ramos, un error afecta todo el negocio a la vez: ¿se mantiene ese permiso o se sube a rol admin literal (precedente: topes de plan, sección Ramos)?
5. **Destino del escalar viejo.** `plan_formas_pago.tasa_rpf` queda como valor vivo de Auto y como fallback. ¿Se sigue mostrando y editando en el admin para los 3 ramos migrados (donde ya no se usa), o se oculta ahí para evitar confusión?

**Supuestos asumidos si no hay corrección**: (a) una sola curva global para MRC/Incendio/Vida-AP, Auto excluido por datos; (b) "Aquí Pago" = `boca_cobranza`; (c) los 0 de Tarjeta a 1-2 cuotas son regla de negocio real; (d) `contado` nunca entra en la tabla; (e) `plan_formas_pago.tasa_rpf` sobrevive como fallback y como valor real de Auto; (f) nada se recalcula retroactivamente; (g) el gate de edición sigue siendo `requirePlanesEdit`.
