import { redondearSup, redondearInf, calcularCuotaInicial } from './round.js'

const IVA_PORCENTAJE = 10

/**
 * @param {number} prima
 * @param {{tasa_rpf: number, codigo: string}} formaPago
 * @param {number} cuotas - cantidad de cuotas financiadas (no cuenta el Inicial)
 */
export function calcularPlanPago(prima, formaPago, cuotas) {
  const rpfPorcentaje = formaPago.codigo === 'contado' ? 0 : formaPago.tasa_rpf
  const rpf = rpfPorcentaje > 0 ? redondearSup(prima * (rpfPorcentaje / 100)) : 0

  const iva = prima * (IVA_PORCENTAJE / 100) + rpf * (IVA_PORCENTAJE / 100)
  // El Premio se redondea al millar hacia abajo — a pedido de Kevin (2026-07-17), el asegurado
  // ve siempre un monto redondo (Contado y Financiado), no solo la Cuota/Inicial. La diferencia
  // con el Premio teórico (Prima+RPF+IVA sin redondear) la absorbe la aseguradora.
  const premio = redondearInf(prima + rpf + iva)

  // Premio sin IVA (Prima+RPF) — pedido de Kevin (2026-08-07): el panel "Cotización en vivo"
  // pasa a mostrar el costo SIN IVA (coherente con la "Tasa efectiva" del panel, que ya usa la
  // Prima cruda) y solo la Carta Oferta suma el IVA vía `premio`/`inicial`/`cuota` de arriba, que
  // quedan sin tocar. Mismo redondeo hacia abajo que el Premio con IVA, por consistencia visual.
  const premioSinIva = redondearInf(prima + rpf)

  // Contado se paga de una sola vez — Inicial = Premio completo, sin Cuotas, sin importar
  // la cantidad de cuotas elegida para las formas de pago financiadas (confirmado contra
  // captura real del sistema de escritorio, cotización Nº 903.662).
  if (formaPago.codigo === 'contado' || !cuotas) {
    return {
      rpf_porcentaje: rpfPorcentaje,
      rpf,
      iva,
      premio,
      inicial: premio,
      cuota: 0,
      premio_sin_iva: premioSinIva,
      inicial_sin_iva: premioSinIva,
      cuota_sin_iva: 0,
    }
  }

  // Cuota e Inicial redondeados al millar hacia abajo (ver calcularCuotaInicial) — el asegurado
  // paga siempre montos redondos; la diferencia con el Premio teórico la absorbe la aseguradora.
  const { cuota, inicial } = calcularCuotaInicial(premio, cuotas)
  const { cuota: cuotaSinIva, inicial: inicialSinIva } = calcularCuotaInicial(premioSinIva, cuotas)

  return {
    rpf_porcentaje: rpfPorcentaje,
    rpf,
    iva,
    premio,
    inicial,
    cuota,
    premio_sin_iva: premioSinIva,
    inicial_sin_iva: inicialSinIva,
    cuota_sin_iva: cuotaSinIva,
  }
}
