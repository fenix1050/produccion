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

function puedeContinuar(row) {
  return ESTADOS_VIVOS.includes(row.estado)
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
    data: data.map(({ agente_id, ...row }) => ({
      ...row,
      puede_continuar: puedeContinuar(row),
      puede_descargar: puedeDescargar({ ...row, agente_id }, usuario),
      puede_anular: puedeAnular(row, usuario),
    })),
    count,
  }
}
