import { httpError } from '../utils/http-error.js'

/**
 * Resuelve el descuento efectivo ANTES de invocar al calculador (cambio SDD
 * `mrc-plan-descuento-fijo`, ver design.md Decisión 1). Cuando `plan.descuento_default` está
 * seteado, `plan.cotizacion_combinada` es `false` (la franquicia dual de Auto es la otra rama
 * que lee `descuento_default` — mutuamente excluyentes, Decisión 3) y el usuario NO tiene
 * `puede_editar_descuento_plan`, se descarta cualquier descuento del body y se fuerza un único
 * ajuste `{ descripcion: 'Descuento del plan', porcentaje: plan.descuento_default }`. En
 * cualquier otro caso el body pasa intacto (comportamiento actual, sin cambios).
 *
 * `forzadoPorPlan` viaja junto al array resuelto porque el calculador lo necesita para decidir
 * si neutraliza el tope del USUARIO (`topeEfectivo`, Decisión 2) — es política de empresa, no
 * discrecionalidad del agente, así que el descuento forzado del plan no debe quedar clampeado
 * por `usuario.descuento_maximo_pct` en silencio.
 *
 * Función pura, exportada para test directo sin mockear repositories.
 *
 * @param {object} params
 * @param {object} params.plan
 * @param {Array<{monto?: number, porcentaje?: number}>|undefined} params.descuentosBody
 * @param {object|undefined} params.usuario
 * @returns {{descuentos: Array<object>, forzadoPorPlan: boolean}}
 */
export function resolverDescuentos({ plan, descuentosBody, usuario }) {
  const aplicaDescuentoDelPlan = plan.descuento_default != null && !plan.cotizacion_combinada

  if (!aplicaDescuentoDelPlan || usuario?.puede_editar_descuento_plan) {
    return { descuentos: descuentosBody ?? [], forzadoPorPlan: false }
  }

  return {
    descuentos: [{ descripcion: 'Descuento del plan', porcentaje: plan.descuento_default }],
    forzadoPorPlan: true,
  }
}

/**
 * Resuelve la tasa de R.P.F. a usar para UNA forma de pago de plan, ANTES de invocar
 * `calculador.calcularPlanPago()` (cambio SDD `rpf-variable-mrc`, ver design.md — Data Flow).
 * `calcularPlanPago` no se toca: sigue recibiendo `{ codigo, tasa_rpf }`, solo cambia de dónde
 * sale ese número.
 *
 * - `contado` siempre 0 (mismo bypass que ya aplica `calcularPlanPago`, pero explícito acá para
 *   no tocar la curva ni el escalar sin necesidad).
 * - Ramo SIN `usa_rpf_por_cuotas`: devuelve el escalar legacy `formaPagoPlan.tasa_rpf` sin
 *   tocar la curva — Auto queda byte-idéntico.
 * - Ramo CON el flag y `cuotas` falsy (0/null): resuelve a 0 por regla de negocio (design.md
 *   Decisión 4 — cambio de comportamiento real y deliberado frente al escalar, que hoy cobra
 *   el RPF plano aunque `cuotas` sea 0).
 * - Ramo CON el flag y `cuotas` dentro de la curva: valor de `rpf_cuotas` para
 *   `(forma_pago.codigo, cuotas)`.
 * - Ramo CON el flag y `cuotas` fuera de rango: `httpError(422)` explícito, sin clamp
 *   (design.md Decisión 5 / Engram #391).
 *
 * Función pura, exportada para test directo sin mockear repositories.
 *
 * @param {object} params
 * @param {object} params.ramo
 * @param {{tasa_rpf: number, formas_pago: {codigo: string}}} params.formaPagoPlan
 * @param {Array<{cuotas: number, tasa_rpf: number, formas_pago: {codigo: string}}>|null} params.curva
 * @param {number} params.cuotas
 * @returns {number}
 */
export function resolverTasaRpf({ ramo, formaPagoPlan, curva, cuotas }) {
  const codigo = formaPagoPlan.formas_pago.codigo

  if (codigo === 'contado') return 0
  if (!ramo.usa_rpf_por_cuotas) return formaPagoPlan.tasa_rpf
  if (!cuotas) return 0

  const fila = curva?.find((c) => c.formas_pago.codigo === codigo && c.cuotas === cuotas)
  if (!fila) {
    const mensaje = `No existe tasa de R.P.F. para ${cuotas} cuotas (forma de pago '${codigo}').`
    throw httpError(422, mensaje, mensaje)
  }

  return fila.tasa_rpf
}

/**
 * Cantidad de cuotas a usar: la que eligió el agente, topada por `plan.cuotas_maximo` si viene
 * seteado, o `plan.cuotas_default` si el agente no eligió ninguna (compatibilidad con
 * cotizaciones ya guardadas, que no mandaban este campo).
 */
export function resolverCuotas(plan, cuotasElegidas) {
  if (cuotasElegidas == null) return plan.cuotas_default
  if (plan.cuotas_maximo != null) return Math.min(cuotasElegidas, plan.cuotas_maximo)
  return cuotasElegidas
}
