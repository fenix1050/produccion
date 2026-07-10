/**
 * Redondea hacia arriba al múltiplo de `paso` más cercano (default 1000 Gs.).
 * Usado en todo el motor de cálculo: RPF, IVA/Premio, e Inicial/Cuota.
 */
export function redondearSup(valor, paso = 1000) {
  return Math.ceil(valor / paso) * paso;
}
