import * as ramosRepository from '../repositories/ramos.repository.js';
import * as coberturasRepository from '../repositories/coberturas.repository.js';

export async function listarRamosActivos() {
  return ramosRepository.findRamosActivos();
}

export async function listarPlanesDeRamo(ramoId) {
  return ramosRepository.findPlanesByRamoId(ramoId);
}

export async function listarCoberturasDePlan(planId) {
  return ramosRepository.findCoberturasByPlanId(planId);
}

export async function listarRubrosActividad(grupo) {
  return coberturasRepository.findRubrosActividad(grupo);
}
