import { getCalculador } from '../calculators/index.js'
import * as cotizacionesRepository from '../repositories/cotizaciones.repository.js'
import * as ramosRepository from '../repositories/ramos.repository.js'

import { verificarPropiedad } from './cotizacion-authorization.service.js'
import { validarYResolverContexto } from './cotizacion-context.service.js'
import { construirVariantes } from './cotizacion-pricing.service.js'
import { renderOfertaPdf } from './pdf.service.js'

export { verificarPropiedad } from './cotizacion-authorization.service.js'
export {
  resolverContextoRepositorios,
  validarYResolverContexto,
} from './cotizacion-context.service.js'
export { crearCotizacion, actualizarCotizacion } from './cotizacion-persistence.service.js'
export { resolverDescuentos, resolverTasaRpf } from './cotizacion-pricing.service.js'
export { resolverUmbralInspeccion } from './umbral-inspeccion.service.js'

/**
 * Calcula una cotización SIN guardarla — usado para el preview en vivo del frontend.
 * Devuelve todas las variantes (sin/con franquicia si corresponde) con sus 4 formas de pago.
 */
export async function calcularPreview(body, usuario) {
  const { plan, ramo, datosValidados } = await validarYResolverContexto(body)
  const calculador = getCalculador(ramo.calculador)

  return construirVariantes({ calculador, plan, ramo, datosValidados, usuario })
}

export async function listarCotizaciones(query, usuario) {
  return cotizacionesRepository.findCotizaciones({
    ramoId: query.ramo_id,
    estado: query.estado,
    cliente: query.cliente,
    fechaDesde: query.fecha_desde,
    fechaHasta: query.fecha_hasta,
    limit: query.limit,
    offset: query.offset,
    agenteId: usuario.rol === 'admin' ? undefined : usuario.id,
  })
}

export async function obtenerCotizacion(id, usuario) {
  const cotizacion = await cotizacionesRepository.findCotizacionById(id)
  verificarPropiedad(cotizacion, usuario)
  return cotizacion
}

export async function generarPdfOferta(id, usuario) {
  const t0 = Date.now()
  const cotizacion = await cotizacionesRepository.findCotizacionById(id)
  verificarPropiedad(cotizacion, usuario)
  const t1 = Date.now()
  // Las 3 queries siguientes solo dependen de `cotizacion` (ya resuelta arriba), no entre sí —
  // se piden en paralelo en vez de 3 awaits secuenciales.
  const [plan, ramo, planCoberturas] = await Promise.all([
    ramosRepository.findPlanById(cotizacion.plan_id),
    // Sin filtro de `activo`: la cotización ya existe (se creó cuando el ramo estaba activo),
    // así que generar su PDF no debe fallar solo porque el ramo se dio de baja después.
    ramosRepository.findRamoById(cotizacion.ramo_id),
    // Catálogo VIGENTE del plan (montos/incluida_por_defecto actuales) — necesario para que los
    // sub-límites fijos de la Carta Oferta (ej. MRC) reflejen cambios del admin, en vez de quedar
    // hardcodeados con el valor de cuando se cargó la migración original.
    ramosRepository.findCoberturasByPlanId(cotizacion.plan_id),
  ])
  const t2 = Date.now()

  const pdf = await renderOfertaPdf({ cotizacion, plan, ramo, planCoberturas })
  const t3 = Date.now()

  console.log(
    `[perf-oferta] findCotizacionById=${t1 - t0}ms plan+ramo+coberturas(paralelo)=${t2 - t1}ms renderOfertaPdf=${t3 - t2}ms total=${t3 - t0}ms`
  )

  return pdf
}

// ---- Fase 4 ----
export async function aceptarCotizacion(_id, _kyc) {
  throw new Error('Aceptación de cotización + KYC pendiente — Fase 4')
}

export async function generarPdfPropuestaFormal(_id) {
  throw new Error('Generación de Propuesta Formal pendiente — Fase 4')
}
