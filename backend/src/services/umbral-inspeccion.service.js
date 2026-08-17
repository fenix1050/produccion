import * as tipoCambioService from './tipo-cambio.service.js'

/**
 * Resuelve el umbral de inspección aplicable al plan, convertido a la moneda de la cotización.
 * Devuelve `null` si `plan.requiere_inspeccion IS NULL` (la regla no aplica: Hipotecario,
 * Maquinaria, Edificio y Contenido — migración 035) o si todavía no se cargó el monto (estado
 * transitorio documentado en design.md/migración 038). Solo invoca al servicio de tipo de
 * cambio (I/O real) cuando la moneda de la cotización difiere de `umbral_inspeccion_moneda` —
 * una cotización 100% en la moneda del umbral no paga ningún fetch externo (Threat Matrix de
 * design.md: "Cotización 100% en una sola moneda → el servicio no se invoca").
 *
 * No hay conversión de montos declarados (ver Decision "sin conversión implícita" en design.md):
 * el tipo de cambio solo se usa acá para poder comparar la suma asegurada (en la moneda de la
 * cotización) contra un umbral expresado en otra moneda.
 *
 * @param {object} plan
 * @param {'PYG'|'USD'} moneda
 * @returns {Promise<{requiereInspeccion:boolean, montoEnMonedaCotizacion:number, moneda:string,
 *   tipoCambio:{venta:number,fuente:string,obtenido_en:string,stale:boolean}|null}|null>}
 */
export async function resolverUmbralInspeccion(plan, moneda) {
  if (plan.requiere_inspeccion == null || plan.umbral_inspeccion_monto == null) return null

  if (moneda === plan.umbral_inspeccion_moneda) {
    return {
      requiereInspeccion: plan.requiere_inspeccion,
      montoEnMonedaCotizacion: plan.umbral_inspeccion_monto,
      moneda,
      tipoCambio: null,
    }
  }

  const tipoCambio = await tipoCambioService.obtenerTipoCambioVigente({ moneda: 'USD' })

  // Umbral en USD, cotización en Gs.: convertir el umbral A Gs. multiplicando por `venta`.
  // Umbral en Gs., cotización en USD: convertir el umbral A USD dividiendo por `venta`.
  const montoEnMonedaCotizacion =
    plan.umbral_inspeccion_moneda === 'USD'
      ? plan.umbral_inspeccion_monto * tipoCambio.venta
      : plan.umbral_inspeccion_monto / tipoCambio.venta

  return {
    requiereInspeccion: plan.requiere_inspeccion,
    montoEnMonedaCotizacion,
    moneda,
    tipoCambio: {
      venta: tipoCambio.venta,
      fuente: tipoCambio.fuente,
      obtenido_en: tipoCambio.obtenido_en,
      stale: tipoCambio.stale,
    },
  }
}
