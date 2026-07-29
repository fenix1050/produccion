import * as coberturasRepository from '../repositories/coberturas.repository.js'
import * as ramosRepository from '../repositories/ramos.repository.js'

export async function listarRamosActivos() {
  return ramosRepository.findRamosActivos()
}

export async function listarPlanesDeRamo(ramoId) {
  return ramosRepository.findPlanesByRamoId(ramoId)
}

export async function listarCoberturasDePlan(planId) {
  return ramosRepository.findCoberturasByPlanId(planId)
}

export async function listarClausulasObligatoriasDePlan(planId) {
  return ramosRepository.findClausulasObligatoriasByPlanId(planId)
}

export async function listarRubrosActividad(ramoId) {
  return coberturasRepository.findRubrosActividad(ramoId)
}

export async function listarCoberturasCatalogoDeRamo(ramoId) {
  return coberturasRepository.findCoberturasCatalogoByRamoId(ramoId)
}
