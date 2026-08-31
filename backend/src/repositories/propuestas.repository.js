import { supabase } from '../config/supabase.js'
import { httpError } from '../utils/http-error.js'

export async function listarCartasAptas({ usuarioId, esAdmin, busqueda, limite = 50 }) {
  const { data, error } = await supabase.rpc('listar_cartas_oferta_aptas_propuesta', {
    p_usuario_id: usuarioId,
    p_es_admin: esAdmin,
    p_busqueda: busqueda || null,
    p_limite: limite,
  })
  if (error) throw error
  return data ?? []
}

export async function motivoIneligibilidadCarta({ cartaId, usuarioId, esAdmin }) {
  const { data, error } = await supabase.rpc('motivo_ineligibilidad_carta_propuesta', {
    p_carta_id: cartaId,
    p_usuario_id: usuarioId,
    p_es_admin: esAdmin,
  })
  if (error) throw error
  return data
}

export async function findCartaContextById(id) {
  const { data, error } = await supabase
    .from('cartas_oferta')
    .select('*, cotizaciones(*)')
    .eq('id', id)
    .single()
  if (error?.code === 'PGRST116') throw httpError(404, 'Carta Oferta no encontrada')
  if (error) throw error
  return data
}

export async function findActiveDraftByCartaId(cartaId) {
  const { data, error } = await supabase
    .from('propuestas_formales')
    .select('*')
    .eq('carta_oferta_id', cartaId)
    .in('estado', ['borrador', 'en_revision', 'generando_pdf', 'error_pdf'])
    .maybeSingle()
  if (error) throw error
  return data
}

export async function crearORecuperarBorrador(payload) {
  const { data, error } = await supabase.rpc('crear_o_recuperar_propuesta_borrador', payload)
  if (error) throw error
  return data
}

export async function findPropuestaContextById(id) {
  const { data, error } = await supabase
    .from('propuestas_formales')
    .select('*, cartas_oferta(*, cotizaciones(*))')
    .eq('id', id)
    .single()
  if (error?.code === 'PGRST116') throw httpError(404, 'Borrador no encontrado')
  if (error) throw error
  return data
}

export async function actualizarBorrador(payload) {
  const { data, error } = await supabase.rpc('actualizar_propuesta_borrador', payload)
  if (error) throw error
  return data
}
