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

/**
 * Cuota e Inicial del plan de pago financiado, ambos redondeados al millar hacia abajo — a
 * pedido de Kevin (2026-07-17): el asegurado paga siempre montos redondos en las 2 cuotas
 * (Inicial y Cuota), incluso cuando hay un descuento/recargo manual de por medio. La diferencia
 * entre el Premio teórico (Prima+RPF+IVA) y lo efectivamente cobrado (Inicial + N×Cuota) la
 * absorbe la aseguradora — el asegurado nunca paga de más por el redondeo.
 *
 * Reemplaza la regla anterior (Cuota redondeada, Inicial exacto absorbiendo el resto) en los
 * 4 calculadores (Auto/MRC/Incendio/Vida-AP), que usaban la misma fórmula duplicada.
 */
export function calcularCuotaInicial(premio, cuotas) {
  const cuota = redondearInf(premio / (cuotas + 1));
  const inicial = redondearInf(premio - cuotas * cuota);
  return { cuota, inicial };
}
