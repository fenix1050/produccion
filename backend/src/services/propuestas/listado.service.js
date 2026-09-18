import * as propuestasRepository from '../../repositories/propuestas.repository.js'

const ESTADOS_VIVOS = ['borrador', 'en_revision', 'generando_pdf', 'error_pdf']

function resolverEstados(estado) {
  if (estado === 'activa') return ESTADOS_VIVOS
  if (estado) return [estado]
  return null
}

// Mirrors emision.service.js:10-16 (canDownload) exactly, using the row shape returned
// by listar_propuestas_formales (agente_id already flattened, no cartas_oferta nesting).
function puedeDescargar(row, usuario) {
  const autorizado =
    usuario.rol === 'admin' || usuario.puede_descargar_propuestas || row.agente_id === usuario.id
  return autorizado && ['emitida', 'anulada'].includes(row.estado) && !!row.pdf_storage_path
}

// Mirrors emision.service.js:141-145 (anularPropuesta guard) exactly.
function puedeAnular(row, usuario) {
  const autorizado = usuario.rol === 'admin' || !!usuario.puede_anular_propuestas
  return autorizado && row.estado === 'emitida'
}

// A live draft whose Carta already has ANOTHER propuesta_formales row in estado
// 'emitida' can never be emitted — the backend blocks it with a 409
// PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA. These orphaned drafts are leftover data from
// before the 075 Historial fix (which stopped creating new ones), but existing rows
// must still not offer a dead-end "Continuar".
function puedeContinuar(row) {
  return ESTADOS_VIVOS.includes(row.estado) && !row.otra_propuesta_emitida
}

export async function listarPropuestas(query, usuario) {
  const esAdmin = usuario.rol === 'admin'
  const { data, count } = await propuestasRepository.listarPropuestas({
    usuarioId: usuario.id,
    esAdmin,
    busqueda: query.busqueda || null,
    estados: resolverEstados(query.estado),
    cartaOfertaId: query.carta_oferta_id ?? null,
    limit: query.limit,
    offset: query.offset,
  })

  return {
    data: data.map(({ agente_id, otra_propuesta_emitida, ...row }) => ({
      ...row,
      puede_continuar: puedeContinuar({ ...row, otra_propuesta_emitida }),
      puede_descargar: puedeDescargar({ ...row, agente_id }, usuario),
      puede_anular: puedeAnular(row, usuario),
    })),
    count,
  }
}
