import * as ramosRepository from '../repositories/ramos.repository.js'
import { httpError } from '../utils/http-error.js'

import { withCache } from './cache.js'
import { resolverContextoRepositorios } from './cotizacion-context.service.js'

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

/**
 * Arma las variantes (sin/con franquicia) según la regla de negocio de Auto
 * (ver sección 5 de PLAN_DESARROLLO.md). Otros ramos no tienen franquicia dual
 * todavía — devuelven siempre 1 variante sin franquicia hasta que se implementen.
 */
export async function construirVariantes({ calculador, plan, ramo, datosValidados, usuario }) {
  // `moneda` solo existe hoy en el schema de Incendio (grupo 4) — el resto de los ramos cae al
  // default 'PYG' (mismo default que la columna `cotizaciones.moneda` de la migración 034).
  const moneda = datosValidados.moneda ?? 'PYG'

  const contexto = await resolverContextoRepositorios(
    ramo,
    plan,
    datosValidados.riesgo_datos,
    datosValidados.capital_asegurado,
    moneda
  )

  const { descuentos, forzadoPorPlan } = resolverDescuentos({
    plan,
    descuentosBody: datosValidados.descuentos,
    usuario,
  })

  const { prima, detalle, coberturas } = await calculador.calcularPrima({
    planId: plan.id,
    plan,
    capital: datosValidados.capital_asegurado,
    riesgoDatos: datosValidados.riesgo_datos,
    descuentos,
    forzadoPorPlan,
    recargos: datosValidados.recargos,
    usuario,
    moneda,
    ...contexto,
  })

  const formasPagoPlan = await ramosRepository.findFormasPagoDelPlan(plan.id)
  const cuotas = resolverCuotas(plan, datosValidados.cuotas)

  // Solo se pide la curva (cacheada, cambia únicamente desde el admin) para los ramos
  // flagueados (MRC/Incendio/Vida-AP) — Auto y el resto ni la tocan, `resolverTasaRpf` cae
  // directo al escalar legacy sin este `await` de más.
  const curvaRpf = ramo.usa_rpf_por_cuotas
    ? await withCache('rpfCuotas', () => ramosRepository.findCurvaRpf())
    : null

  const tiposFranquicia = resolverTiposFranquicia(plan, datosValidados.riesgo_datos, prima)

  const variantes = tiposFranquicia.map(({ tipo, primaAjustada, franquiciaMonto }) => ({
    tipo_franquicia: tipo,
    prima: primaAjustada,
    franquicia_monto: franquiciaMonto,
    formasPago: formasPagoPlan.map((fp) => ({
      forma_pago_id: fp.forma_pago_id,
      codigo: fp.formas_pago.codigo,
      nombre_display: fp.formas_pago.nombre_display,
      cantidad_cuotas: cuotas,
      ...calculador.calcularPlanPago(
        primaAjustada,
        {
          codigo: fp.formas_pago.codigo,
          tasa_rpf: resolverTasaRpf({ ramo, formaPagoPlan: fp, curva: curvaRpf, cuotas }),
        },
        cuotas
      ),
    })),
  }))

  return {
    prima,
    detalle,
    coberturas,
    variantes,
    moneda,
    // Solo no-null cuando resolverUmbralInspeccion tuvo que convertir (moneda de la cotización
    // distinta de `umbral_inspeccion_moneda`) — `crearCotizacion` lo usa para decidir si persiste
    // tipo_cambio_snapshot/_fuente/_fecha. `calcularPreview` nunca llega a leer este campo.
    tipoCambioUsado: contexto.umbralInspeccion?.tipoCambio ?? null,
  }
}

/**
 * @param {number} primaBase - prima ya calculada (capital × tasa, con piso de prima técnica mínima)
 */
function resolverTiposFranquicia(plan, riesgoDatos, primaBase) {
  // TODO Fase 2: mover a calculators/auto.calculator.js como parte de la interfaz
  // (hoy vive acá porque depende de datos de `plan` Y de `riesgo_datos` a la vez).
  // Ver regla completa en PLAN_DESARROLLO.md sección 5.
  if (riesgoDatos.via_importacion === 'IMPORTACION DIRECTA') {
    // Franquicia fija por defecto en toda cotización. El add-on para sacarla
    // (antes Gs. 909.091) está pendiente de recalcular — ver sección 11, punto 9.
    const FRANQUICIA_BASE = 350000 // TODO: leer de franquicia_auto_importacion_directa
    return [{ tipo: 'con_franquicia', primaAjustada: primaBase, franquiciaMonto: FRANQUICIA_BASE }]
  }

  if (plan.cotizacion_combinada) {
    const primaConDescuento = primaBase * (1 - (plan.descuento_default ?? 0) / 100)
    const franquiciaMonto = primaConDescuento * ((plan.franquicia_porcentaje ?? 0) / 100)
    return [
      { tipo: 'sin_franquicia', primaAjustada: primaBase, franquiciaMonto: 0 },
      { tipo: 'con_franquicia', primaAjustada: primaConDescuento, franquiciaMonto },
    ]
  }

  return [{ tipo: 'sin_franquicia', primaAjustada: primaBase, franquiciaMonto: 0 }]
}
