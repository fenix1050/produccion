// Helpers de formato compartidos entre cotizar.js, historial.js y admin.js —
// extraídos de 3 copias duplicadas casi idénticas (ver docs/ESTADO_PROYECTO.md).
//
// IMPORTANTE: fmtGs() NO incluye el prefijo "Gs." (cotizar.js lo agrega manualmente
// en sus templates). fmtGsConPrefijo() sí lo incluye (historial.js y admin.js ya
// no agregan "Gs." en sus call sites). No unificar en una sola función de comportamiento
// único sin revisar los 3 call sites — se duplicaría o perdería la unidad monetaria.

export function fmtGs(n) {
  const num = Math.round(Number(n) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtGsConPrefijo(n) {
  return `Gs. ${fmtGs(n)}`;
}

// Como fmtGs, pero para inputs editables: un capital vacío debe mostrarse vacío,
// no "0" (fmtGs normal trata undefined/"" como 0 para totales/montos ya calculados).
export function fmtGsInput(digits) {
  if (digits === undefined || digits === null || digits === '') return '';
  return fmtGs(digits);
}

export function capitalizar(texto) {
  const str = String(texto ?? '');
  return str.charAt(0).toUpperCase() + str.slice(1);
}
