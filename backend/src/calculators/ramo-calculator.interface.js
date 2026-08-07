/**
 * Interfaz que debe implementar cada calculador de ramo (Strategy pattern).
 * Ver PLAN_DESARROLLO.md sección 3 y 5 para el detalle de cada fórmula.
 *
 * @typedef {Object} RamoCalculator
 * @property {(input: object) => Promise<{ prima: number, detalle: object }>} calcularPrima
 * @property {(prima: number, formaPago: object, cuotas: number) => { rpf: number, iva: number, premio: number, inicial: number, cuota: number, premio_sin_iva: number, inicial_sin_iva: number, cuota_sin_iva: number }} calcularPlanPago
 */

// No hay código ejecutable acá — es documentación de contrato para los calculadores
// en /calculators. Cada archivo de calculador debe exportar funciones con esta forma.
export {}
