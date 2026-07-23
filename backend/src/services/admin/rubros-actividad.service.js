import * as coberturasRepository from '../../repositories/coberturas.repository.js';
import { httpError } from '../../utils/http-error.js';

// rubros_actividad no tiene vigente_desde/versionado (a diferencia de
// tasas_cobertura_ramo) — se edita con UPDATE directo, mismo patrón que editarPlan.
export async function listarRubrosActividad(grupo) {
  return coberturasRepository.findRubrosActividad(grupo);
}

export async function editarRubroActividad(id, cambios) {
  const fila = await coberturasRepository.actualizarRubroActividad(id, cambios);
  if (!fila) {
    throw httpError(404, 'Tipo de riesgo no encontrado');
  }
  return fila;
}
