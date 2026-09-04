import { getCalculador } from '../calculators/index.js'
import * as cotizacionesRepository from '../repositories/cotizaciones.repository.js'
import * as ramosRepository from '../repositories/ramos.repository.js'

import { verificarPropiedad } from './cotizacion-authorization.service.js'
import { validarYResolverContexto } from './cotizacion-context.service.js'
import { construirVariantes } from './cotizacion-pricing.service.js'

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
  const { plan, ramo, datosValidados } = await validarYResolverContexto(body, usuario)
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
  const { generarCartaOfertaPersistida } = await import('./carta-oferta.service.js')
  let pdf
  let t1
  let t2
  let t3

  // A stale snapshot is rejected inside the locked RPC or when a recotization
  // replaces the generating Carta. Retry once from fresh source data; any second
  // concurrent recotization becomes a controlled conflict instead of an obsolete PDF.
  for (let intento = 0; intento < 2; intento += 1) {
    const cotizacion = await cotizacionesRepository.findCotizacionById(id)
    verificarPropiedad(cotizacion, usuario)
    t1 = Date.now()
    const [plan, ramo, planCoberturas] = await Promise.all([
      ramosRepository.findPlanById(cotizacion.plan_id),
      ramosRepository.findRamoById(cotizacion.ramo_id),
      ramosRepository.findCoberturasByPlanId(cotizacion.plan_id),
    ])
    t2 = Date.now()

    try {
      pdf = await generarCartaOfertaPersistida({
        cotizacion,
        plan,
        ramo,
        planCoberturas,
        usuario,
      })
      t3 = Date.now()
      break
    } catch (error) {
      if (error.code !== 'CARTA_OFERTA_SNAPSHOT_OBSOLETO' || intento === 1) throw error
    }
  }

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
