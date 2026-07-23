export { calcularPlanPago } from './utils/plan-pago.js';
import { sumarAjustes } from './utils/ajustes.js';
import { httpError } from '../utils/http-error.js';

/**
 * @param {object} input
 * @param {object} input.plan
 * @param {number} input.capital - Suma asegurada del vehículo (Gs.)
 * @param {object} input.tasaCapital - Ya resuelta por cotizacion.service.js (resolverContextoRepositorios)
 * @param {Array<{monto: number, porcentaje: number}>} [input.descuentos]
 * @param {Array<{monto: number, porcentaje: number}>} [input.recargos]
 * @returns {Promise<{prima: number, detalle: object}>}
 */
export async function calcularPrima({ plan, capital, tasaCapital, descuentos = [], recargos = [] }) {
  if (!tasaCapital) {
    throw httpError(
      422,
      `No hay tasa configurada para capital ${capital} en el plan ${plan.id}`,
      'El capital ingresado está fuera de los rangos de tasa configurados.'
    );
  }

  const primaBase = Math.max(capital * (tasaCapital.tasa_porcentaje / 100), plan.prima_tecnica_minima);

  const totalDescuentos = sumarAjustes(descuentos, primaBase, plan.descuento_maximo);
  const totalRecargos = sumarAjustes(recargos, primaBase, plan.recargo_maximo);

  const prima = primaBase - totalDescuentos + totalRecargos;

  return {
    prima,
    detalle: {
      capital,
      tasa_porcentaje: tasaCapital.tasa_porcentaje,
      prima_base: primaBase,
      prima_tecnica_minima: plan.prima_tecnica_minima,
      total_descuentos: totalDescuentos,
      total_recargos: totalRecargos,
    },
  };
}

