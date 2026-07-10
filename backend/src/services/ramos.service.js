import * as ramosRepository from '../repositories/ramos.repository.js';

export async function listarRamosActivos() {
  return ramosRepository.findRamosActivos();
}

export async function listarPlanesDeRamo(ramoId) {
  return ramosRepository.findPlanesByRamoId(ramoId);
}

export async function listarCoberturasDePlan(planId) {
  return ramosRepository.findCoberturasByPlanId(planId);
}
