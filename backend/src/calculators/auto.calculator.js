export { calcularPlanPago } from './utils/plan-pago.js';
import { sumarAjustes } from './utils/ajustes.js';
import * as ramosRepository from '../repositories/ramos.repository.js';

/**
 * @param {object} input
 * @param {number} input.planId
 * @param {number} input.capital - Suma asegurada del vehículo (Gs.)
 * @param {Array<{monto: number, porcentaje: number}>} [input.descuentos]
 * @param {Array<{monto: number, porcentaje: number}>} [input.recargos]
 * @returns {Promise<{prima: number, detalle: object}>}
 */
export async function calcularPrima({ planId, capital, descuentos = [], recargos = [] }) {
  const plan = await ramosRepository.findPlanById(planId);
  const tasaCapital = await ramosRepository.findTasaCapital(planId, capital);

  if (!tasaCapital) {
    const err = new Error(`No hay tasa configurada para capital ${capital} en el plan ${planId}`);
    err.status = 422;
    err.publicMessage = 'El capital ingresado está fuera de los rangos de tasa configurados.';
    throw err;
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

