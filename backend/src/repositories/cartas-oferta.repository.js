import { supabase } from '../config/supabase.js'
import { httpError } from '../utils/http-error.js'

const CARTAS_OFERTA_BUCKET = 'cartas-oferta-privadas'

export async function iniciarCartaOfertaGeneracion(payload) {
  const { data, error } = await supabase.rpc('iniciar_carta_oferta_generacion', payload)
  if (error) throw error
  return data?.[0]
}

export async function emitirCartaOferta(payload) {
  const { data, error } = await supabase.rpc('emitir_carta_oferta', payload)
  if (error) throw error
  return data
}

export async function registrarErrorCartaOferta(payload) {
  const { error } = await supabase.rpc('registrar_error_carta_oferta', payload)
  if (error) throw error
}

export async function descargarPdfCartaOferta(storagePath) {
  const { data, error } = await supabase.storage.from(CARTAS_OFERTA_BUCKET).download(storagePath)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

export async function subirPdfCartaOferta(storagePath, pdf) {
  const { error } = await supabase.storage.from(CARTAS_OFERTA_BUCKET).upload(storagePath, pdf, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (error) throw error
}

export async function eliminarPdfCartaOferta(storagePath) {
  const { error } = await supabase.storage.from(CARTAS_OFERTA_BUCKET).remove([storagePath])
  if (error) throw error
}

export async function findCartaOfertaById(id) {
  const { data, error } = await supabase
    .from('cartas_oferta')
    .select('*, cotizaciones(*)')
    .eq('id', id)
    .single()
  if (error?.code === 'PGRST116') {
    throw httpError(404, 'Carta Oferta no encontrada', 'Carta Oferta no encontrada')
  }
  if (error) throw error
  return data
}
