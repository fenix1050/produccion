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

  const reemplazadaPorPropuesta =
    data.estado === 'anulada' ? await findReemplazoVigenteByPropuestaId(data.id) : null

  return { ...data, reemplazada_por_propuesta: reemplazadaPorPropuesta }
}

async function findReemplazoVigenteByPropuestaId(propuestaId) {
  const { data, error } = await supabase
    .from('propuestas_formales')
    .select('id, numero_propuesta, estado')
    .eq('reemplaza_propuesta_id', propuestaId)
    .eq('estado', 'emitida')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function actualizarBorrador(payload) {
  const { data, error } = await supabase.rpc('actualizar_propuesta_borrador', payload)
  if (error) throw error
  return data
}

export async function findPublishedTexts() {
  const { data, error } = await supabase
    .from('propuesta_textos')
    .select('*')
    .eq('producto_codigo', 'mrc')
    .eq('publicado', true)
    .order('clave')
  if (error) throw error
  return data ?? []
}

export async function publishText(payload) {
  const { data, error } = await supabase.rpc('publicar_texto_propuesta', payload)
  if (error) throw error
  return data
}

export async function iniciarEmision(payload) {
  const { data, error } = await supabase.rpc('iniciar_emision_propuesta_formal', payload)
  if (error) throw error
  return data
}

export async function confirmarEmision(payload) {
  const { data, error } = await supabase.rpc('confirmar_emision_propuesta_formal', payload)
  if (error) throw error
  return data
}

export async function actualizarSnapshotEmision(payload) {
  const { data, error } = await supabase.rpc(
    'actualizar_snapshot_emision_propuesta_formal',
    payload
  )
  if (error) throw error
  return data
}

export async function registrarErrorEmision(payload) {
  const { error } = await supabase.rpc('registrar_error_emision_propuesta_formal', payload)
  if (error) throw error
}

export async function anularPropuesta(payload) {
  const { data, error } = await supabase.rpc('anular_propuesta_formal', payload)
  if (error) throw error
  return data
}

export async function downloadProposalPdf(storagePath) {
  const { data, error } = await supabase.storage
    .from('propuestas-formales-privadas')
    .download(storagePath)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

export async function uploadProposalPdf(storagePath, pdf) {
  const { error } = await supabase.storage
    .from('propuestas-formales-privadas')
    .upload(storagePath, pdf, {
      contentType: 'application/pdf',
      upsert: false,
    })
  if (error) throw error
}

export async function removeProposalPdf(storagePath) {
  const { error } = await supabase.storage
    .from('propuestas-formales-privadas')
    .remove([storagePath])
  if (error) throw error
}
