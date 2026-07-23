export { calcularPlanPago } from './utils/plan-pago.js';
import { sumarAjustes, topeEfectivo } from './utils/ajustes.js';

const NOMBRE_PLAN_MAQUINARIA = 'MAQUINARIA BASICO';

const CODIGO_INCENDIO_EDIFICIO = 'incendio_edificio';
const CODIGO_INCENDIO_CONTENIDO = 'incendio_contenido';
const CODIGO_INCENDIO_MAQUINARIA = 'incendio_maquinaria';
const CODIGO_SUBLIMITE_FENOMENOS_NATURALES = 'sublimite_fenomenos_naturales';
const CODIGO_SUBLIMITE_VANDALISMO_MAQUINARIA = 'sublimite_vandalismo_maquinaria';

/**
 * Calculador de Incendio — dos planes con mecánica distinta (migración 013):
 *
 * "INCENDIO - EDIFICIO Y CONTENIDO": mismo esqueleto que MRC (mrc.calculator.js) —
 *   Costo Edificio  = Capital_Edificio × rubros_actividad.tasa_edificio / 1000
 *   Costo Contenido = Capital_Contenido × rubros_actividad.tasa_contenido / 1000
 *   Prima = MAX(Costo Edificio + Costo Contenido, plan.prima_tecnica_minima) — Gs. 409.091,
 *   un piso PRE-IVA (calcularPlanPago suma IVA/RPF después) que ya rinde el Premio final
 *   correcto de ~Gs. 450.000 (409.091 × 1,10) — ver migración 026, revierte el intento fallido
 *   de la 025 de guardar 450.000 directo (habría duplicado el IVA). El piso se aplica en
 *   silencio, no bloquea la cotización (2026-07-15, mismo criterio que MRC).
 *
 * "MAQUINARIA BASICO": tasa única fija 0,7% (7‰, cargada en tasas_cobertura_ramo para el código
 *   'incendio_maquinaria') sobre un solo capital declarado (Capital Maquinaria) — no depende del
 *   rubro de actividad. Piso plan.prima_tecnica_minima (Gs. 100), mismo criterio de piso
 *   silencioso.
 *
 * Sublímite de Fenómenos Naturales (plan Edificio y Contenido) y Sublímite de Vandalismo
 * (plan Maquinaria Básico): confirmado por Kevin (2026-07-14) que son INFORMATIVOS — a primer
 * riesgo absoluto, un % de la suma ya declarada (Edificio/Contenido o Maquinaria), sin tasa ni
 * costo propio. No suman a la prima: solo se registran en la lista de coberturas con el
 * porcentaje que eligió el agente, para mostrarse en el detalle/PDF (a diferencia de las
 * coberturas adicionales de MRC, que sí tarifican con su propia suma asegurada).
 *
 * @param {object} input
 * @param {object} input.plan
 * @param {object} input.riesgoDatos - Edificio/Contenido: { rubro_actividad, capital_edificio,
 *   capital_contenido, sublimite_fenomenos_naturales_porcentaje? }. Maquinaria Básico:
 *   { capital_maquinaria, sublimite_vandalismo_porcentaje? }.
 * @param {object|null} input.rubro - Ya resuelto por cotizacion.service.js (resolverContextoRepositorios)
 * @param {Array<object>} input.catalogoRamo - Catálogo completo del ramo, ya resuelto
 * @param {Array<object>} input.tasasRamo - Tasas por cobertura del ramo, ya resueltas
 * @param {Array<{monto?: number, porcentaje?: number}>} [input.descuentos]
 * @param {Array<{monto?: number, porcentaje?: number}>} [input.recargos]
 * @returns {Promise<{prima: number, detalle: object, coberturas: Array<{codigo:string, nombre:string, monto:number}>}>}
 */
export async function calcularPrima({
  plan,
  riesgoDatos,
  descuentos = [],
  recargos = [],
  usuario,
  rubro,
  catalogoRamo,
  tasasRamo,
}) {
  if (!plan.prima_tecnica_minima) {
    const err = new Error(
      `El plan "${plan.nombre}" todavía no tiene RPF/prima técnica mínima confirmados — no se puede cotizar.`
    );
    err.status = 422;
    err.publicMessage = 'Este plan está pendiente de confirmación de tasas.';
    throw err;
  }

  const catalogoPorCodigo = new Map(catalogoRamo.map((c) => [c.codigo, c]));

  const esMaquinariaBasico = plan.nombre === NOMBRE_PLAN_MAQUINARIA;

  const { primaBase: primaCalculada, detalle, coberturas } = esMaquinariaBasico
    ? await calcularMaquinariaBasico({ plan, riesgoDatos, catalogoPorCodigo, tasasRamo })
    : await calcularEdificioYContenido({ plan, riesgoDatos, catalogoPorCodigo, rubro });

  // A pedido de Kevin (2026-07-15): sí se pueden cotizar capitales que generen una prima menor
  // a la Prima Técnica Mínima del plan — no se bloquea con alerta. En ese caso se aplica el
  // piso en silencio: la Prima Técnica Mínima pasa a ser la prima base de la cotización.
  const primaBase = Math.max(primaCalculada, plan.prima_tecnica_minima);

  const totalDescuentos = sumarAjustes(descuentos, primaBase, topeEfectivo(plan.descuento_maximo, usuario?.descuento_maximo_pct));
  const totalRecargos = sumarAjustes(recargos, primaBase, topeEfectivo(plan.recargo_maximo, usuario?.recargo_maximo_pct));

  const prima = primaBase - totalDescuentos + totalRecargos;

  return {
    prima,
    detalle: {
      ...detalle,
      prima_base: primaBase,
      prima_tecnica_minima: plan.prima_tecnica_minima,
      total_descuentos: totalDescuentos,
      total_recargos: totalRecargos,
    },
    coberturas,
  };
}

async function calcularEdificioYContenido({ plan, riesgoDatos, catalogoPorCodigo, rubro }) {
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

  const catalogoEdificio = catalogoPorCodigo.get(CODIGO_INCENDIO_EDIFICIO);
  const catalogoContenido = catalogoPorCodigo.get(CODIGO_INCENDIO_CONTENIDO);
  const catalogoSublimiteFenomenos = catalogoPorCodigo.get(CODIGO_SUBLIMITE_FENOMENOS_NATURALES);

  const coberturas = [
    {
      codigo: CODIGO_INCENDIO_EDIFICIO,
      nombre: catalogoEdificio?.nombre ?? 'Incendio de Edificio',
      monto: capitalEdificio,
      franquicia_default: catalogoEdificio?.franquicia_default ?? null,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: true,
    },
    {
      codigo: CODIGO_INCENDIO_CONTENIDO,
      nombre: catalogoContenido?.nombre ?? 'Incendio de Contenido',
      monto: capitalContenido,
      franquicia_default: catalogoContenido?.franquicia_default ?? null,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: true,
    },
  ];

  if (riesgoDatos.sublimite_fenomenos_naturales_porcentaje != null) {
    coberturas.push({
      codigo: CODIGO_SUBLIMITE_FENOMENOS_NATURALES,
      nombre: catalogoSublimiteFenomenos?.nombre ?? 'Sublímite por Fenómenos Naturales',
      sublimite_porcentaje: riesgoDatos.sublimite_fenomenos_naturales_porcentaje,
      tipo_aplicacion: 'sublimite',
      incluye_en_suma_asegurada_total: false,
    });
  }

  return {
    primaBase: costoEdificio + costoContenido,
    detalle: {
      rubro_actividad: riesgoDatos.rubro_actividad,
      capital_edificio: capitalEdificio,
      capital_contenido: capitalContenido,
      tasa_incendio_edificio: tasaEdificio,
      tasa_incendio_contenido: tasaContenido,
      costo_edificio: costoEdificio,
      costo_contenido: costoContenido,
    },
    coberturas,
  };
}

async function calcularMaquinariaBasico({ plan, riesgoDatos, catalogoPorCodigo, tasasRamo }) {
  const capitalMaquinaria = riesgoDatos.capital_maquinaria ?? 0;

  if (
    plan.responsabilidad_maxima_cotizable != null &&
    capitalMaquinaria > plan.responsabilidad_maxima_cotizable
  ) {
    const err = new Error(
      `El Capital Maquinaria supera la Responsabilidad Máx. Cotizable del plan "${plan.nombre}" (${plan.responsabilidad_maxima_cotizable}).`
    );
    err.status = 422;
    err.publicMessage = `El capital declarado supera el máximo cotizable para este plan.`;
    throw err;
  }

  const catalogoMaquinaria = catalogoPorCodigo.get(CODIGO_INCENDIO_MAQUINARIA);
  const catalogoSublimiteVandalismo = catalogoPorCodigo.get(CODIGO_SUBLIMITE_VANDALISMO_MAQUINARIA);

  const tasaMaquinaria = tasasRamo.find(
    (t) => t.coberturas_catalogo?.codigo === CODIGO_INCENDIO_MAQUINARIA
  );

  if (!tasaMaquinaria || tasaMaquinaria.tasa_valor == null) {
    const err = new Error(`Falta la tasa de "${CODIGO_INCENDIO_MAQUINARIA}" en tasas_cobertura_ramo.`);
    err.status = 422;
    err.publicMessage = 'Este plan todavía no tiene tasa confirmada.';
    throw err;
  }

  const costoMaquinaria = capitalMaquinaria * (tasaMaquinaria.tasa_valor / 1000);

  const coberturas = [
    {
      codigo: CODIGO_INCENDIO_MAQUINARIA,
      nombre: catalogoMaquinaria?.nombre ?? 'Incendio de Maquinaria',
      monto: capitalMaquinaria,
      franquicia_default: catalogoMaquinaria?.franquicia_default ?? null,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: true,
    },
  ];

  if (riesgoDatos.sublimite_vandalismo_porcentaje != null) {
    coberturas.push({
      codigo: CODIGO_SUBLIMITE_VANDALISMO_MAQUINARIA,
      nombre: catalogoSublimiteVandalismo?.nombre ?? 'Sublímite por Vandalismo (Maquinaria)',
      sublimite_porcentaje: riesgoDatos.sublimite_vandalismo_porcentaje,
      tipo_aplicacion: 'sublimite',
      incluye_en_suma_asegurada_total: false,
    });
  }

  return {
    primaBase: costoMaquinaria,
    detalle: {
      capital_maquinaria: capitalMaquinaria,
      tasa_incendio_maquinaria: tasaMaquinaria.tasa_valor,
      costo_maquinaria: costoMaquinaria,
    },
    coberturas,
  };
}

