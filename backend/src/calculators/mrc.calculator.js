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
 *   Costo Edificio  = Capital_Edificio × rubros_actividad.tasa_edificio / 1000
 *   Costo Contenido = Capital_Contenido × rubros_actividad.tasa_contenido / 1000
 *   Prima_base = Costo Edificio + Costo Contenido — si no alcanza plan.prima_tecnica_minima,
 *     corta con error 422 (no se aplica el piso en silencio, ver más abajo)
 *   Prima = Prima_base − Descuentos (tope descuento_maximo) + Recargos (tope recargo_maximo)
 *
 * La tasa depende del `Tipo de Riesgo` (rubro de actividad) elegido, NO de una tasa fija del
 * ramo — confirmado por Kevin (2026-07-13): aunque el ejemplo de la hoja "MRC" del Excel usa la
 * tasa fija de la sección "Tasa MRC" (1,00‰/2,00‰) sin importar el rubro (BAZAR), en el sistema
 * real la tasa sí varía por categoría del rubro (misma tabla `rubros_actividad` que ya se usa
 * para Incendio, migración 013).
 *
 * También corta con error 422 si Capital_Edificio + Capital_Contenido supera
 * plan.responsabilidad_maxima_cotizable. Ambas alertas bloquean el cálculo — el frontend no
 * deja avanzar a "Detalle del plan" mientras estén activas (ver cotizar.js, puedeAvanzarADetalle).
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

  const capitalEdificio = riesgoDatos.capital_edificio ?? 0;
  const capitalContenido = riesgoDatos.capital_contenido ?? 0;

  if (
    plan.responsabilidad_maxima_cotizable != null &&
    capitalEdificio + capitalContenido > plan.responsabilidad_maxima_cotizable
  ) {
    const err = new Error(
      `La suma de Capital Edificio + Capital Contenido supera la Responsabilidad Máx. Cotizable del plan "${plan.nombre}" (Gs. ${plan.responsabilidad_maxima_cotizable}).`
    );
    err.status = 422;
    err.publicMessage = `El capital declarado supera el máximo cotizable para este plan (Gs. ${plan.responsabilidad_maxima_cotizable.toLocaleString('es-PY')}).`;
    throw err;
  }

  const rubro = await coberturasRepository.findRubroPorNombre(riesgoDatos.rubro_actividad);
  if (!rubro) {
    const err = new Error(`Tipo de Riesgo "${riesgoDatos.rubro_actividad}" no encontrado en rubros_actividad.`);
    err.status = 422;
    err.publicMessage = `El Tipo de Riesgo seleccionado no es válido.`;
    throw err;
  }

  const tasaEdificio = rubro.tasa_edificio;
  const tasaContenido = rubro.tasa_contenido;

  if (tasaEdificio == null || tasaContenido == null) {
    const err = new Error(`Faltan tasa_edificio/tasa_contenido para el Tipo de Riesgo "${rubro.nombre}".`);
    err.status = 422;
    err.publicMessage = `El Tipo de Riesgo "${rubro.nombre}" todavía no tiene tasas confirmadas.`;
    throw err;
  }

  const costoEdificio = capitalEdificio * (tasaEdificio / 1000);
  const costoContenido = capitalContenido * (tasaContenido / 1000);
  const primaCalculada = costoEdificio + costoContenido;

  // A pedido de Kevin (2026-07-13): si el capital declarado no alcanza a generar la Prima
  // Técnica Mínima del plan, no se aplica el piso en silencio — se corta con alerta, igual que
  // al superar la Responsabilidad Máx. Cotizable, y no se deja avanzar a la siguiente etapa.
  if (primaCalculada < plan.prima_tecnica_minima) {
    const err = new Error(
      `La prima calculada (Gs. ${primaCalculada}) no alcanza la Prima Técnica Mínima del plan "${plan.nombre}" (Gs. ${plan.prima_tecnica_minima}).`
    );
    err.status = 422;
    err.publicMessage = `El capital declarado es insuficiente: la prima calculada no alcanza la Prima Técnica Mínima de este plan (Gs. ${plan.prima_tecnica_minima.toLocaleString('es-PY')}).`;
    throw err;
  }

  const primaBase = primaCalculada;

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
    franquicia_default: c.franquicia_default ?? null,
  }));

  const coberturasDelPlan = await ramosRepository.findCoberturasByPlanId(planId);
  const sublimites = coberturasDelPlan
    .filter((pc) => pc.incluida_por_defecto && pc.coberturas_catalogo?.codigo?.startsWith('sublimite_'))
    .map((pc) => ({
      codigo: pc.coberturas_catalogo.codigo,
      nombre: pc.coberturas_catalogo.nombre,
      monto: pc.monto,
      franquicia_default: pc.coberturas_catalogo?.franquicia_default ?? null,
    }));

  return [...principales, ...sublimites];
}
