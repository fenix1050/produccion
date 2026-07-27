// Helpers de formato compartidos entre cotizar.js, historial.js y admin.js —
// extraídos de 3 copias duplicadas casi idénticas (ver docs/ESTADO_PROYECTO.md).
//
// IMPORTANTE: fmtGs() NO incluye el prefijo "Gs." (cotizar.js lo agrega manualmente
// en sus templates). fmtGsConPrefijo() sí lo incluye (historial.js y admin.js ya
// no agregan "Gs." en sus call sites). No unificar en una sola función de comportamiento
// único sin revisar los 3 call sites — se duplicaría o perdería la unidad monetaria.

export function fmtGs(n) {
  const num = Math.round(Number(n) || 0)
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function fmtGsConPrefijo(n) {
  return `Gs. ${fmtGs(n)}`
}

// --- Soporte de moneda (USD/PYG) — PR4 de incendio-3-planes-y-moneda ---
// USD sí usa decimales (centavos) a diferencia de Gs., que siempre se maneja en enteros.
export function fmtUsd(n) {
  const num = Number(n) || 0
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtUsdConPrefijo(n) {
  return `USD ${fmtUsd(n)}`
}

// Monto sin prefijo, según moneda — para call sites que ya arman su propio marcado de unidad
// (ej. `<span>Gs.</span>` separado del número) y solo necesitan el número formateado correcto.
export function fmtMonto(valor, moneda) {
  return moneda === 'USD' ? fmtUsd(valor) : fmtGs(valor)
}

// Etiqueta de unidad para acompañar fmtMonto() en el mismo marcado existente.
export function unidadMoneda(moneda) {
  return moneda === 'USD' ? 'USD' : 'Gs.'
}

// Monto CON prefijo — para call sites que muestran un solo string (ej. celda de tabla).
export function fmtMoneda(valor, moneda) {
  return moneda === 'USD' ? fmtUsdConPrefijo(valor) : fmtGsConPrefijo(valor)
}

// Como fmtGs, pero para inputs editables: un capital vacío debe mostrarse vacío,
// no "0" (fmtGs normal trata undefined/"" como 0 para totales/montos ya calculados).
export function fmtGsInput(digits) {
  if (digits === undefined || digits === null || digits === '') return ''
  return fmtGs(digits)
}

export function capitalizar(texto) {
  const str = String(texto ?? '')
  return str.charAt(0).toUpperCase() + str.slice(1)
}
