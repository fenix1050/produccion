import { httpError } from '../../utils/http-error.js'

/**
 * Costo de Edificio + Contenido tarifado por `rubros_actividad.tasa_edificio`/`tasa_contenido`
 * (permil) — compartido entre MRC y la mecánica "edificio_contenido" de Incendio (antes
 * duplicado línea por línea en los dos calculadores, ver issue #84). Solo cubre la parte de
 * capital/tasa/costo: cada calculador arma su propia lista de `coberturas` y `detalle`, porque
 * esas partes sí difieren (MRC agrega coberturas adicionales y franquicias por cobertura;
 * Incendio agrega el sublímite de Fenómenos Naturales).
 *
 * @param {object} params
 * @param {object} params.plan
 * @param {object} params.riesgoDatos - { capital_edificio, capital_contenido, rubro_actividad }
 * @param {object|null} params.rubro - Ya resuelto por cotizacion.service.js (resolverContextoRepositorios)
 * @returns {{capitalEdificio:number, capitalContenido:number, tasaEdificio:number, tasaContenido:number, costoEdificio:number, costoContenido:number}}
 */
export function calcularCostoEdificioYContenido({ plan, riesgoDatos, rubro }) {
  const capitalEdificio = riesgoDatos.capital_edificio ?? 0
  const capitalContenido = riesgoDatos.capital_contenido ?? 0

  if (
    plan.responsabilidad_maxima_cotizable != null &&
    capitalEdificio + capitalContenido > plan.responsabilidad_maxima_cotizable
  ) {
    throw httpError(
      422,
      `La suma de Capital Edificio + Capital Contenido supera la Responsabilidad Máx. Cotizable del plan "${plan.nombre}" (Gs. ${plan.responsabilidad_maxima_cotizable}).`,
      `El capital declarado supera el máximo cotizable para este plan (Gs. ${plan.responsabilidad_maxima_cotizable.toLocaleString('es-PY')}).`
    )
  }

  if (!rubro) {
    throw httpError(
      422,
      `Tipo de Riesgo "${riesgoDatos.rubro_actividad}" no encontrado en rubros_actividad.`,
      `El Tipo de Riesgo seleccionado no es válido.`
    )
  }

  const tasaEdificio = rubro.tasa_edificio
  const tasaContenido = rubro.tasa_contenido

  if (tasaEdificio == null || tasaContenido == null) {
    throw httpError(
      422,
      `Faltan tasa_edificio/tasa_contenido para el Tipo de Riesgo "${rubro.nombre}".`,
      `El Tipo de Riesgo "${rubro.nombre}" todavía no tiene tasas confirmadas.`
    )
  }

  const costoEdificio = capitalEdificio * (tasaEdificio / 1000)
  const costoContenido = capitalContenido * (tasaContenido / 1000)

  return {
    capitalEdificio,
    capitalContenido,
    tasaEdificio,
    tasaContenido,
    costoEdificio,
    costoContenido,
  }
}
