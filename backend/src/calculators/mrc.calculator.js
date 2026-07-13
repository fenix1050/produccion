import { redondearSup } from './utils/round.js';
import * as ramosRepository from '../repositories/ramos.repository.js';
import * as coberturasRepository from '../repositories/coberturas.repository.js';

const IVA_PORCENTAJE = 10;

// Códigos del catálogo (migración 012_seed_mrc.sql) cuya suma asegurada viene directo
// del formulario (Capital Edificio / Capital Contenido).
const CODIGO_INCENDIO_EDIFICIO = 'incendio_edificio';
const CODIGO_INCENDIO_CONTENIDO = 'incendio_contenido';

/**
 * Calculador de MRC (Multirriesgo Comercio) — solo el plan "MULTIRRIESGO COMERCIO - NORMAL"
 * tiene RPF y prima_tecnica_minima confirmados contra el sistema real (ver PLAN_DESARROLLO.md
 * sección 11, pendiente #10). "COMERCIO PROTECCION TOTAL" no tiene esos datos cargados
 * todavía — calcularPrima corta con un error 422 explicativo si se intenta cotizar ese plan.
 *
 * Fórmula (idéntica en estructura a Incendio simple, sección 5 del plan — MRC "Normal" usa
 * la misma prima_tecnica_minima ~409.091 Gs. que el piso confirmado para Incendio, por eso
 * se adopta el mismo esqueleto de 2 líneas en vez de repartir el capital entre todas las
 * coberturas obligatorias, cuya proporción de reparto NO está confirmada todavía):
 *   Costo Edificio  = Capital_Edificio × Tasa(incendio_edificio) / 1000
 *   Costo Contenido = Capital_Contenido × Tasa(incendio_contenido) / 1000
 *   Prima_base = MAX(Costo Edificio + Costo Contenido, plan.prima_tecnica_minima)
 *   Prima = Prima_base − Descuentos (tope descuento_maximo) + Recargos (tope recargo_maximo)
 *
 * @param {object} input
 * @param {number} input.planId
 * @param {object} input.riesgoDatos - { rubro_actividad, capital_edificio, capital_contenido, ... }
 * @param {Array<{monto?: number, porcentaje?: number}>} [input.descuentos]
 * @param {Array<{monto?: number, porcentaje?: number}>} [input.recargos]
 * @returns {Promise<{prima: number, detalle: object, coberturas: Array<{codigo:string, nombre:string, monto:number}>}>}
 */
export async function calcularPrima({ planId, riesgoDatos, descuentos = [], recargos = [] }) {
  const plan = await ramosRepository.findPlanById(planId);

  if (!plan.prima_tecnica_minima) {
    const err = new Error(
      `El plan "${plan.nombre}" todavía no tiene RPF/prima técnica mínima confirmados — no se puede cotizar.`
    );
    err.status = 422;
    err.publicMessage = 'Este plan está pendiente de confirmación de tasas.';
    throw err;
  }

  const tasas = await coberturasRepository.findTasasCoberturaRamo(plan.ramo_id);
  const tasaPorCodigo = Object.fromEntries(
    tasas.map((t) => [t.coberturas_catalogo.codigo, t.tasa_valor])
  );

  const capitalEdificio = riesgoDatos.capital_edificio ?? 0;
  const capitalContenido = riesgoDatos.capital_contenido ?? 0;

  const tasaEdificio = tasaPorCodigo[CODIGO_INCENDIO_EDIFICIO];
  const tasaContenido = tasaPorCodigo[CODIGO_INCENDIO_CONTENIDO];

  if (tasaEdificio == null || tasaContenido == null) {
    const err = new Error('Faltan tasas de incendio_edificio/incendio_contenido para el ramo MRC.');
    err.status = 500;
    throw err;
  }

  const costoEdificio = capitalEdificio * (tasaEdificio / 1000);
  const costoContenido = capitalContenido * (tasaContenido / 1000);

  const primaBase = Math.max(costoEdificio + costoContenido, plan.prima_tecnica_minima);

  const totalDescuentos = sumarAjustes(descuentos, primaBase, plan.descuento_maximo);
  const totalRecargos = sumarAjustes(recargos, primaBase, plan.recargo_maximo);

  const prima = primaBase - totalDescuentos + totalRecargos;

  const coberturas = await construirListaCoberturas({
    ramoId: plan.ramo_id,
    planId: plan.id,
    capitalEdificio,
    capitalContenido,
  });

  return {
    prima,
    detalle: {
      rubro_actividad: riesgoDatos.rubro_actividad,
      capital_edificio: capitalEdificio,
      capital_contenido: capitalContenido,
      tasa_incendio_edificio: tasaEdificio,
      tasa_incendio_contenido: tasaContenido,
      costo_edificio: costoEdificio,
      costo_contenido: costoContenido,
      prima_base: primaBase,
      prima_tecnica_minima: plan.prima_tecnica_minima,
      total_descuentos: totalDescuentos,
      total_recargos: totalRecargos,
    },
    coberturas,
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

/**
 * Arma la lista de coberturas a mostrar en el panel "Coberturas incluidas":
 *  - Coberturas obligatorias del ramo (es_opcional = false): incendio_edificio/contenido
 *    usan el capital declarado por línea; el resto de las obligatorias (robo, cristales,
 *    responsabilidad civil, equipos electrónicos) todavía no tienen confirmado cómo se
 *    reparte el capital entre líneas (ver comentario de la migración 012), así que se
 *    muestran informativamente con el Capital Contenido como referencia — NO están sumadas
 *    a la prima todavía.
 *  - Sublímites incluidos por defecto del plan (plan_coberturas), con su monto fijo de catálogo.
 */
async function construirListaCoberturas({ ramoId, planId, capitalEdificio, capitalContenido }) {
  const catalogo = await coberturasRepository.findCoberturasCatalogoByRamoId(ramoId);
  const obligatorias = catalogo.filter((c) => !c.es_opcional && !c.codigo.startsWith('sublimite_'));

  const montoPorCodigo = {
    [CODIGO_INCENDIO_EDIFICIO]: capitalEdificio,
    [CODIGO_INCENDIO_CONTENIDO]: capitalContenido,
  };

  const principales = obligatorias.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    monto: montoPorCodigo[c.codigo] ?? capitalContenido,
  }));

  const coberturasDelPlan = await ramosRepository.findCoberturasByPlanId(planId);
  const sublimites = coberturasDelPlan
    .filter((pc) => pc.incluida_por_defecto && pc.coberturas_catalogo?.codigo?.startsWith('sublimite_'))
    .map((pc) => ({
      codigo: pc.coberturas_catalogo.codigo,
      nombre: pc.coberturas_catalogo.nombre,
      monto: pc.monto,
    }));

  return [...principales, ...sublimites];
}
