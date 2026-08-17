import { httpError } from '../utils/http-error.js'

/**
 * Lanza un error 403 (mismo patrón que `requireRole` en middleware/auth.js: mensaje + `.status`
 * seteado a mano) si el usuario no es admin y no es el dueño de la cotización. Compartido entre
 * `obtenerCotizacion`, `generarPdfOferta` y `actualizarCotizacion` para no repetir la condición.
 */
export function verificarPropiedad(
  cotizacion,
  usuario,
  mensaje = 'No tenés permiso para ver esta cotización'
) {
  if (usuario.rol !== 'admin' && cotizacion.agente_id !== usuario.id) {
    throw httpError(403, mensaje, mensaje)
  }
}
