/**
 * Redondea hacia arriba al múltiplo de `paso` más cercano (default 1000 Gs.).
 * Usado en el motor de cálculo para RPF e IVA/Premio.
 */
export function redondearSup(valor, paso = 1000) {
  return Math.ceil(valor / paso) * paso;
}

/**
 * Redondea hacia abajo al múltiplo de `paso` más cercano (default 1000 Gs.).
 * Usado específicamente para la Cuota del plan de pago financiado — confirmado contra
 * capturas reales del sistema de escritorio (Auto, cotización Nº 903.662): la Cuota
 * redondea hacia ABAJO y el Inicial absorbe el resto para que Inicial + N×Cuota dé
 * exacto el Premio (ver PLAN_DESARROLLO.md sección 5).
 */
export function redondearInf(valor, paso = 1000) {
  return Math.floor(valor / paso) * paso;
}
