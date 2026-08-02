import * as coberturasRepository from '../repositories/coberturas.repository.js'
import * as ramosRepository from '../repositories/ramos.repository.js'
import { withCache } from './cache.js'

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
  return withCache(`rubrosActividad:${ramoId}`, () =>
    coberturasRepository.findRubrosActividad(ramoId)
  )
}

export async function listarCoberturasCatalogoDeRamo(ramoId) {
  return withCache(`catalogoRamo:${ramoId}`, () =>
    coberturasRepository.findCoberturasCatalogoByRamoId(ramoId)
  )
}
