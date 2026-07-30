import * as ramosRepository from '../../repositories/ramos.repository.js'
import { httpError } from '../../utils/http-error.js'

export async function listarRamos() {
  return ramosRepository.findAllRamos()
}

export async function editarRamo(id, cambios) {
  const ramo = await ramosRepository.actualizarRamo(id, cambios)
  if (!ramo) {
    throw httpError(404, 'Ramo no encontrado')
  }
  return ramo
}

// Borrado seguro: si el ramo tiene planes o cotizaciones asociadas no se borra (409) —
// el flujo correcto ahí es desactivarlo (checkbox "Activo"), no eliminarlo. Sin este chequeo
// previo, borrar primero `correlativos` (necesario para esquivar su FK) y que después
// `ramos` falle por planes/cotizaciones dejaría el correlativo perdido con el ramo todavía vivo.
export async function eliminarRamo(id) {
  const ramo = await ramosRepository.findRamoById(id)
  if (!ramo) {
    throw httpError(404, 'Ramo no encontrado')
  }

  const [planes, cotizaciones] = await Promise.all([
    ramosRepository.countPlanesByRamoId(id),
    ramosRepository.countCotizacionesByRamoId(id),
  ])
  if (planes > 0 || cotizaciones > 0) {
    throw httpError(
      409,
      'Este ramo tiene planes o cotizaciones asociadas. Desactivalo en vez de eliminarlo.'
    )
  }

  await ramosRepository.eliminarRamo(id)
}
