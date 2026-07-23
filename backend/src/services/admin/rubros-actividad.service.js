import * as coberturasRepository from '../../repositories/coberturas.repository.js';

// rubros_actividad no tiene vigente_desde/versionado (a diferencia de
// tasas_cobertura_ramo) — se edita con UPDATE directo, mismo patrón que editarPlan.
export async function listarRubrosActividad(grupo) {
  return coberturasRepository.findRubrosActividad(grupo);
}

export async function editarRubroActividad(id, cambios) {
  const fila = await coberturasRepository.actualizarRubroActividad(id, cambios);
  if (!fila) {
    const err = new Error('Tipo de riesgo no encontrado');
    err.status = 404;
    throw err;
  }
  return fila;
}
