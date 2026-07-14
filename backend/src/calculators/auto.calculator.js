import { redondearSup, redondearInf } from './utils/round.js';
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
 * @param {number} cuotas - cantidad de cuotas financiadas (no cuenta el Inicial)
 */
export function calcularPlanPago(prima, formaPago, cuotas) {
  const rpfPorcentaje = formaPago.codigo === 'contado' ? 0 : formaPago.tasa_rpf;
  const rpf = rpfPorcentaje > 0 ? redondearSup(prima * (rpfPorcentaje / 100)) : 0;

  const iva = prima * (IVA_PORCENTAJE / 100) + rpf * (IVA_PORCENTAJE / 100);
  const premio = prima + rpf + iva;

  // Contado se paga de una sola vez — Inicial = Premio completo, sin Cuotas, sin importar
  // la cantidad de cuotas elegida para las formas de pago financiadas (confirmado contra
  // captura real del sistema de escritorio, cotización Nº 903.662).
  if (formaPago.codigo === 'contado' || !cuotas) {
    return { rpf_porcentaje: rpfPorcentaje, rpf, iva, premio, inicial: premio, cuota: 0 };
  }

  // La Cuota redondea hacia ABAJO (no hacia arriba) y el Inicial absorbe el resto, para que
  // Inicial + N×Cuota dé EXACTO el Premio — confirmado número por número contra la misma
  // captura real (antes acá se usaba redondearSup con divisor fijo /12, lo que además
  // ignoraba la cantidad de cuotas elegida por el agente).
  const cuota = redondearInf(premio / (cuotas + 1));
  const inicial = premio - cuotas * cuota;

  return { rpf_porcentaje: rpfPorcentaje, rpf, iva, premio, inicial, cuota };
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
