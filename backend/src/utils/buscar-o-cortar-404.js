import { httpError } from './http-error.js'
import { CODIGO_POSTGREST_SIN_FILAS } from './postgres-errors.js'

// `.single()` sin filas llega como error de PostgREST: para el cliente es un recurso inexistente
// (404 en español), no un fallo interno que filtre el código.
export async function buscarOCortar404(buscar, mensaje) {
  try {
    return await buscar()
  } catch (error) {
    if (error?.code === CODIGO_POSTGREST_SIN_FILAS) throw httpError(404, mensaje)
    throw error
  }
}
