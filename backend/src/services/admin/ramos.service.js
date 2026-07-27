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
