import * as propuestasRepository from '../../repositories/propuestas.repository.js'
import { httpError } from '../../utils/http-error.js'

import {
  asegurarAccesoBorrador,
  construirDetalleCarta,
  motivoIneligibilidadCarta,
} from './elegibilidad.service.js'
import { evaluarReadiness } from './readiness.service.js'

const ERRORES_RPC = {
  CARTA_NO_ENCONTRADA: [404, 'Carta Oferta no encontrada'],
  COTIZACION_NO_ENCONTRADA: [404, 'Cotización no encontrada'],
  CARTA_SIN_PERMISO: [403, 'No tenés permiso para usar esta Carta Oferta'],
  PRODUCTO_NO_HABILITADO: [409, 'Propuesta Formal está habilitada únicamente para MRC'],
  CARTA_NO_EMITIDA: [409, 'La Carta Oferta debe estar emitida y vigente'],
  CARTA_INCOMPLETA: [409, 'La Carta Oferta no tiene un artefacto documental completo'],
  CARTA_VENCIDA: [409, 'La Carta Oferta está vencida'],
  PF_BORRADOR_NO_ENCONTRADO: [404, 'Borrador no encontrado'],
  PF_BORRADOR_NO_EDITABLE: [409, 'El borrador ya no admite cambios'],
  PF_REVISION_CONFLICT: [
    409,
    'El borrador cambió en otra sesión. Recargá antes de guardar nuevamente.',
  ],
  PF_SELECCION_INVALIDA: [
    400,
    'La variante y la forma de pago deben pertenecer a la cotización de la Carta Oferta',
  ],
  PF_DRAFT_INVALIDO: [400, 'Los datos del borrador no son válidos'],
  PF_DATOS_INCOMPLETOS: [422, 'Faltan datos obligatorios para emitir la Propuesta Formal'],
  PF_TEXTOS_NO_PUBLICADOS: [409, 'No hay textos MRC publicados para emitir la Propuesta Formal'],
  PF_PROPUESTA_YA_EMITIDA: [409, 'La Propuesta Formal ya fue emitida'],
  PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA: [
    409,
    'La Carta Oferta ya tiene una Propuesta Formal emitida',
  ],
  PF_EMISION_EN_PROGRESO: [409, 'La emisión de la Propuesta Formal está en progreso'],
  PF_ANULACION_INVALIDA: [409, 'Solo se puede anular una Propuesta Formal emitida'],
  PF_MOTIVO_ANULACION_REQUERIDO: [400, 'El motivo de anulación es obligatorio'],
  PF_ANULACION_SIN_PERMISO: [403, 'No tenés permiso para anular esta Propuesta Formal'],
}

export function traducirErrorRpc(error) {
  if (error?.code === '23505') {
    const traducido = httpError(409, 'La Carta Oferta ya tiene una Propuesta Formal emitida')
    traducido.code = 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA'
    return traducido
  }
  const codigo = Object.keys(ERRORES_RPC).find((key) => error?.message?.includes(key))
  if (!codigo) return error
  const [status, message] = ERRORES_RPC[codigo]
  const traducido = httpError(status, message)
  traducido.code = codigo
  return traducido
}

function respuestaBorrador(propuesta, carta, motivo) {
  return {
    ...propuesta,
    carta: {
      id: carta.id,
      numero_carta: carta.numero_carta,
      estado: carta.estado,
      producto_codigo: carta.producto_codigo,
      cliente_nombre:
        carta.snapshot_json?.cotizacion?.cliente_nombre ?? carta.cotizaciones?.cliente_nombre,
    },
    carta_detalle: construirDetalleCarta(carta),
    readiness: evaluarReadiness({ propuesta, carta, motivoIneligibilidad: motivo }),
  }
}

export async function crearORecuperarBorrador(cartaId, usuario) {
  try {
    const propuesta = await propuestasRepository.crearORecuperarBorrador({
      p_carta_id: cartaId,
      p_usuario_id: usuario.id,
      p_es_admin: usuario.rol === 'admin',
    })
    const carta = await propuestasRepository.findCartaContextById(cartaId)
    const motivo = await motivoIneligibilidadCarta(cartaId, usuario)
    return respuestaBorrador(propuesta, carta, motivo)
  } catch (error) {
    throw traducirErrorRpc(error)
  }
}

export async function obtenerBorrador(id, usuario) {
  const propuesta = await propuestasRepository.findPropuestaContextById(id)
  const carta = propuesta.cartas_oferta
  const motivo = await motivoIneligibilidadCarta(carta.id, usuario)
  asegurarAccesoBorrador(motivo)
  return respuestaBorrador(propuesta, carta, motivo)
}

export async function actualizarBorrador(id, input, usuario) {
  try {
    const propuesta = await propuestasRepository.actualizarBorrador({
      p_propuesta_id: id,
      p_revision_esperada: input.revision,
      p_cotizacion_variante_id: input.cotizacion_variante_id,
      p_cotizacion_plan_pago_id: input.cotizacion_plan_pago_id,
      p_draft_json: input.draft_json,
      p_usuario_id: usuario.id,
      p_es_admin: usuario.rol === 'admin',
    })
    const carta = await propuestasRepository.findCartaContextById(propuesta.carta_oferta_id)
    const motivo = await motivoIneligibilidadCarta(carta.id, usuario)
    return respuestaBorrador(propuesta, carta, motivo)
  } catch (error) {
    throw traducirErrorRpc(error)
  }
}
