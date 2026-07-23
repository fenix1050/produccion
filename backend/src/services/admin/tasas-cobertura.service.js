import * as coberturasRepository from '../../repositories/coberturas.repository.js';

// --- Tasas ---
// `coberturasRepository.findTasasCoberturaRamo` (usado por los calculadores en tiempo de
// cotización, ver mrc.calculator.js/incendio.calculator.js) SÍ filtra por vigente_desde <= hoy
// y se queda con la versión más reciente por cobertura (dedup vía Map, ver el propio repository)
// — verificado 2026-07-17 al confirmar que las ediciones de tasas del panel admin (WU3/WU5) se
// reflejan en vivo en el cotizador para cualquier rol, sin caché ni reinicio de por medio.

export async function listarTasasDeRamo(ramoId) {
  return coberturasRepository.findTasasCoberturaRamoConHistorial(ramoId);
}

export async function crearVersionDeTasa(ramoId, datos) {
  return coberturasRepository.crearTasaCoberturaRamo(ramoId, datos);
}

export async function eliminarTasa(id) {
  return coberturasRepository.eliminarTasaCoberturaRamo(id);
}
