import * as propuestasRepository from '../../repositories/propuestas.repository.js'
import { httpError } from '../../utils/http-error.js'

export async function motivoIneligibilidadCarta(cartaId, usuario) {
  return propuestasRepository.motivoIneligibilidadCarta({
    cartaId,
    usuarioId: usuario.id,
    esAdmin: usuario.rol === 'admin',
  })
}

export function asegurarAccesoBorrador(motivo) {
  if (motivo === 'CARTA_SIN_PERMISO')
    throw httpError(403, 'No tenés permiso para ver esta Carta Oferta')
  if (motivo === 'CARTA_NO_ENCONTRADA') throw httpError(404, 'Carta Oferta no encontrada')
  if (motivo === 'COTIZACION_NO_ENCONTRADA') throw httpError(404, 'Cotización no encontrada')
  if (motivo === 'PRODUCTO_NO_HABILITADO') {
    throw httpError(409, 'Propuesta Formal está habilitada únicamente para MRC')
  }
}

export function asegurarCartaApta(motivo) {
  if (!motivo) return
  if (motivo === 'CARTA_SIN_PERMISO')
    throw httpError(403, 'No tenés permiso para usar esta Carta Oferta')
  if (motivo === 'CARTA_NO_ENCONTRADA') throw httpError(404, 'Carta Oferta no encontrada')
  throw httpError(409, `La Carta Oferta no está apta para Propuesta Formal: ${motivo}`)
}

export async function listarCartasAptas({ busqueda, limite }, usuario) {
  return propuestasRepository.listarCartasAptas({
    usuarioId: usuario.id,
    esAdmin: usuario.rol === 'admin',
    busqueda,
    limite,
  })
}

export async function obtenerCartaApta(id, usuario) {
  const carta = await propuestasRepository.findCartaContextById(id)
  const motivo = await motivoIneligibilidadCarta(id, usuario)
  asegurarCartaApta(motivo)
  const propuesta = await propuestasRepository.findActiveDraftByCartaId(id)
  return construirDetalleCarta(carta, propuesta)
}

export function construirDetalleCarta(carta, propuesta = null) {
  const snapshot = carta.snapshot_json ?? {}
  return {
    id: carta.id,
    numero_carta: carta.numero_carta,
    version: carta.version,
    producto_codigo: carta.producto_codigo,
    fecha: carta.cotizaciones?.fecha,
    vigencia_dias: carta.cotizaciones?.vigencia_dias,
    cliente_nombre: snapshot.cotizacion?.cliente_nombre ?? carta.cotizaciones?.cliente_nombre,
    moneda: snapshot.cotizacion?.moneda ?? carta.cotizaciones?.moneda ?? 'PYG',
    plan: snapshot.plan ?? null,
    riesgo_datos: snapshot.cotizacion?.riesgo_datos ?? {},
    variantes: snapshot.cotizacion?.cotizacion_variantes ?? [],
    borrador: propuesta,
  }
}
