import { redondearSup } from './utils/round.js';
import * as ramosRepository from '../repositories/ramos.repository.js';

const IVA_PORCENTAJE = 10;

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

/**
 * @param {number} prima
 * @param {{tasa_rpf: number, codigo: string}} formaPago
 * @param {number} cuotas - cantidad de cuotas (0 = contado)
 */
export function calcularPlanPago(prima, formaPago, cuotas) {
  const rpfPorcentaje = formaPago.codigo === 'contado' ? 0 : formaPago.tasa_rpf;
  const rpf = rpfPorcentaje > 0 ? redondearSup(prima * (rpfPorcentaje / 100)) : 0;

  const iva = prima * (IVA_PORCENTAJE / 100) + rpf * (IVA_PORCENTAJE / 100);
  const premio = prima + rpf + iva;

  // Confirmado por Kevin: cada uno de los 12 pagos (inicial + 11 cuotas) es el mismo
  // monto, redondeado hacia arriba a la unidad de mil — igual para Contado si se
  // fracciona (aunque Contado normalmente se paga en un solo pago = premio completo).
  const pagoMensual = redondearSup(premio / 12);

  return {
    rpf_porcentaje: rpfPorcentaje,
    rpf,
    iva,
    premio,
    inicial: cuotas > 0 ? pagoMensual : premio,
    cuota: cuotas > 0 ? pagoMensual : 0,
  };
}

function sumarAjustes(ajustes, base, tope) {
  const total = ajustes.reduce((acc, ajuste) => {
    const monto = ajuste.monto ?? base * (ajuste.porcentaje / 100);
    return acc + monto;
  }, 0);

  if (tope != null) {
    const topeMonto = base * (tope / 100);
    return Math.min(total, topeMonto);
  }
  return total;
}
