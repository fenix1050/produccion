import { redondearSup, redondearInf } from './utils/round.js';
import * as ramosRepository from '../repositories/ramos.repository.js';
import * as coberturasRepository from '../repositories/coberturas.repository.js';

const IVA_PORCENTAJE = 10;

// Planes con tasa `permil_mensual` (Protección de Préstamos) o base "saldo declarado" (Aportes
// y Ahorros) — ninguna fuente desglosa Prima/RPF/IVA para un producto de saldo mensual, y forzar
// esa tasa dentro del mismo motor anual (Premio dividido en 12 cuotas) sería inventar una
// convención sobre plata real. Confirmado con Kevin (2026-07-14): se deja sin implementar por
// ahora, mismo criterio que "Comercio Protección Total" (MRC) e "Incendio - Edificio y
// Contenido" antes de tener RPF confirmado — corta con 422 explicativo.
const PLANES_NO_IMPLEMENTADOS = new Set([
  'PROTECCION DE PRESTAMOS - COOPERATIVAS',
  'PROTECCION DE PRESTAMOS - MERCADO GENERAL',
  'APORTES Y AHORROS',
]);

const NOMBRE_PROTECCION_FAMILIAR = 'PROTECCION FAMILIAR';
const NOMBRE_AP_COOPERATIVO = 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO';
const NOMBRE_AP_PRIVADO = 'ACCIDENTES PERSONALES - SECTOR PRIVADO';
const NOMBRE_VIDA_DIRECTIVOS = 'VIDA DIRECTIVOS Y EMPLEADOS';

/**
 * Calculador de Vida y Accidentes Personales — a diferencia de MRC/Incendio, la tarifa no vive
 * en `tasas_cobertura_ramo` (tasa única por cobertura) sino en `tarifas_generico` (JSONB por
 * plan, con tasas distintas por franja etaria — ver migración 015/016). Sin prima técnica
 * mínima (decisión explícita de Kevin, migración 023): no se aplica ningún piso.
 *
 * Solo se implementan acá los 3 planes con tasa `permil`/`permil_anual` bien definida:
 *   - PROTECCION FAMILIAR: tasa fija 10‰ sobre capital asegurado.
 *   - ACCIDENTES PERSONALES (Cooperativo/Privado): tasa fija sobre capital asegurado + recargo
 *     opcional por Renta Diaria. Recargo por edad 70-80 años NO se aplica — el manual anota "+5"
 *     sin aclarar si son puntos porcentuales o % por año (ambigüedad ya documentada en la
 *     migración 016, sin resolver) — se corta con 422 en vez de adivinar.
 *   - VIDA DIRECTIVOS Y EMPLEADOS: tasa anual por franja etaria (18-69 años) sobre capital
 *     asegurado. La reducción de capital por jubilación (`reduccion_capital_jubilados`) es una
 *     regla de pago/siniestro, no de prima — queda fuera de alcance de este calculador.
 *
 * Protección de Préstamos (Cooperativas/Mercado General) y Aportes y Ahorros quedan sin
 * implementar — ver PLANES_NO_IMPLEMENTADOS arriba.
 *
 * @param {object} input
 * @param {number} input.planId
 * @param {object} input.riesgoDatos - { capital_asegurado, edad, incluye_renta_diaria?,
 *   suma_renta_diaria?, capital_gastos_sepelio? }
 * @returns {Promise<{prima: number, detalle: object, coberturas: Array<{codigo:string, nombre:string, monto:number}>}>}
 */
export async function calcularPrima({ planId, riesgoDatos }) {
  const plan = await ramosRepository.findPlanById(planId);

  if (PLANES_NO_IMPLEMENTADOS.has(plan.nombre)) {
    const err = new Error(
      `El plan "${plan.nombre}" tarifica por saldo mensual — no se puede cotizar todavía sin desglose Prima/RPF/IVA confirmado.`
    );
    err.status = 422;
    err.publicMessage = 'Este plan está pendiente de confirmación de fórmula de cálculo.';
    throw err;
  }

  const tarifas = await coberturasRepository.findTarifasGenericoByPlanId(planId);
  const catalogoRamo = await coberturasRepository.findCoberturasCatalogoByRamoId(plan.ramo_id);
  const catalogoPorCodigo = new Map(catalogoRamo.map((c) => [c.codigo, c]));

  let resultado;
  switch (plan.nombre) {
    case NOMBRE_PROTECCION_FAMILIAR:
      resultado = calcularProteccionFamiliar({ riesgoDatos, tarifas, catalogoPorCodigo });
      break;
    case NOMBRE_AP_COOPERATIVO:
    case NOMBRE_AP_PRIVADO:
      resultado = calcularAccidentesPersonales({ plan, riesgoDatos, tarifas, catalogoPorCodigo });
      break;
    case NOMBRE_VIDA_DIRECTIVOS:
      resultado = calcularVidaDirectivos({ riesgoDatos, tarifas, catalogoPorCodigo });
      break;
    default: {
      const err = new Error(`Plan "${plan.nombre}" de Vida/AP sin lógica de cálculo implementada.`);
      err.status = 422;
      err.publicMessage = 'Este plan está pendiente de confirmación de fórmula de cálculo.';
      throw err;
    }
  }

  return {
    prima: resultado.prima,
    detalle: resultado.detalle,
    coberturas: resultado.coberturas,
  };
}

function calcularProteccionFamiliar({ riesgoDatos, tarifas, catalogoPorCodigo }) {
  const capitalAsegurado = riesgoDatos.capital_asegurado ?? 0;

  const tarifaFallecimiento = tarifas.find((v) => v.cobertura_codigo === 'fallecimiento_cualquier_causa');
  if (!tarifaFallecimiento?.tasa) {
    const err = new Error('Falta la tasa de "fallecimiento_cualquier_causa" para Protección Familiar.');
    err.status = 422;
    err.publicMessage = 'Este plan todavía no tiene tasa confirmada.';
    throw err;
  }

  const prima = capitalAsegurado * (tarifaFallecimiento.tasa / 1000);

  const catalogoFallecimiento = catalogoPorCodigo.get('fallecimiento_cualquier_causa');
  const catalogoReembolso = catalogoPorCodigo.get('reembolso_gastos_funerarios');

  return {
    prima,
    detalle: {
      capital_asegurado: capitalAsegurado,
      tasa_fallecimiento: tarifaFallecimiento.tasa,
      prima_base: prima,
    },
    coberturas: [
      {
        codigo: 'fallecimiento_cualquier_causa',
        nombre: catalogoFallecimiento?.nombre ?? 'Muerte por Cualquier Causa',
        monto: capitalAsegurado,
        tipo_aplicacion: 'cobertura',
        incluye_en_suma_asegurada_total: true,
      },
      {
        codigo: 'reembolso_gastos_funerarios',
        nombre: catalogoReembolso?.nombre ?? 'Reembolso de Gastos Funerarios',
        monto: capitalAsegurado,
        tipo_aplicacion: 'cobertura',
        incluye_en_suma_asegurada_total: false,
      },
    ],
  };
}

function calcularAccidentesPersonales({ plan, riesgoDatos, tarifas, catalogoPorCodigo }) {
  const capitalAsegurado = riesgoDatos.capital_asegurado ?? 0;
  const edad = riesgoDatos.edad;

  if (edad != null && edad >= 70 && edad <= 80) {
    const err = new Error(
      `El plan "${plan.nombre}" tiene un recargo para edad 70-80 años que el manual no especifica con claridad (puntos porcentuales vs. % por año) — no se puede cotizar sin esa confirmación.`
    );
    err.status = 422;
    err.publicMessage = 'La edad declarada requiere un recargo todavía sin confirmar — consultar con el área técnica.';
    throw err;
  }

  if (riesgoDatos.capital_gastos_sepelio != null) {
    const err = new Error('"Gastos de Sepelio" no tiene tasa confirmada para Accidentes Personales.');
    err.status = 422;
    err.publicMessage = 'La cobertura de Gastos de Sepelio todavía no tiene tasa confirmada.';
    throw err;
  }

  const tarifaBase = tarifas.find((v) => v.cobertura_codigo === 'muerte_accidente_ap');
  if (!tarifaBase?.tasa) {
    const err = new Error(`Falta la tasa de "muerte_accidente_ap" para "${plan.nombre}".`);
    err.status = 422;
    err.publicMessage = 'Este plan todavía no tiene tasa confirmada.';
    throw err;
  }

  const primaBase = capitalAsegurado * (tarifaBase.tasa / 1000);

  const catalogoMuerte = catalogoPorCodigo.get('muerte_accidente_ap');
  const catalogoInvalidez = catalogoPorCodigo.get('invalidez_accidente_ap');
  const catalogoGastosMedicos = catalogoPorCodigo.get('gastos_medicos_accidente');
  const catalogoRentaDiaria = catalogoPorCodigo.get('renta_diaria_accidente');

  const coberturas = [
    {
      codigo: 'muerte_accidente_ap',
      nombre: catalogoMuerte?.nombre ?? 'Muerte a Consecuencia de Accidente',
      monto: capitalAsegurado,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: true,
    },
    {
      codigo: 'invalidez_accidente_ap',
      nombre: catalogoInvalidez?.nombre ?? 'Incapacidad Total y Permanente a Consecuencia de Accidente',
      monto: capitalAsegurado,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: false,
    },
    {
      codigo: 'gastos_medicos_accidente',
      nombre: catalogoGastosMedicos?.nombre ?? 'Gastos Médicos por Accidente',
      monto: capitalAsegurado,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: false,
    },
  ];

  let costoRentaDiaria = 0;
  if (riesgoDatos.incluye_renta_diaria) {
    const tarifaRentaDiaria = tarifas.find((v) => v.cobertura_codigo === 'renta_diaria_accidente');
    if (!tarifaRentaDiaria?.recargo_pct) {
      const err = new Error(`Falta el recargo de "renta_diaria_accidente" para "${plan.nombre}".`);
      err.status = 422;
      err.publicMessage = 'La Renta Diaria todavía no tiene recargo confirmado.';
      throw err;
    }

    const sumaRentaDiaria = riesgoDatos.suma_renta_diaria ?? 0;
    const topeRentaDiaria = capitalAsegurado * 0.001; // 1‰ del capital de muerte, confirmado manual Anexo 2
    if (sumaRentaDiaria > topeRentaDiaria) {
      const err = new Error(
        `La Renta Diaria (${sumaRentaDiaria}) supera el 1‰ del capital de Muerte (${topeRentaDiaria}) permitido por el manual.`
      );
      err.status = 422;
      err.publicMessage = 'La Renta Diaria declarada supera el máximo permitido (1‰ del capital de Muerte).';
      throw err;
    }

    costoRentaDiaria = primaBase * (tarifaRentaDiaria.recargo_pct / 100);

    coberturas.push({
      codigo: 'renta_diaria_accidente',
      nombre: catalogoRentaDiaria?.nombre ?? 'Renta Diaria por Accidente',
      monto: sumaRentaDiaria,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: false,
    });
  }

  const prima = primaBase + costoRentaDiaria;

  return {
    prima,
    detalle: {
      capital_asegurado: capitalAsegurado,
      tasa_muerte_accidente: tarifaBase.tasa,
      prima_base: primaBase,
      costo_renta_diaria: costoRentaDiaria,
    },
    coberturas,
  };
}

function calcularVidaDirectivos({ riesgoDatos, tarifas, catalogoPorCodigo }) {
  const capitalAsegurado = riesgoDatos.capital_asegurado ?? 0;
  const edad = riesgoDatos.edad;

  if (edad == null || edad < 18 || edad > 69) {
    const err = new Error(`Edad ${edad} fuera del rango asegurable (18-69 años) para Vida Directivos y Empleados.`);
    err.status = 422;
    err.publicMessage = 'La edad declarada está fuera del rango asegurable de este plan (18 a 69 años).';
    throw err;
  }

  const tarifaFranja = tarifas.find(
    (v) =>
      v.cobertura_codigo === 'fallecimiento_cualquier_causa' &&
      v.tasa != null &&
      edad >= v.edad_min &&
      edad <= v.edad_max
  );

  if (!tarifaFranja) {
    const err = new Error(`No se encontró tasa de "fallecimiento_cualquier_causa" para la edad ${edad}.`);
    err.status = 422;
    err.publicMessage = 'No hay tasa confirmada para la edad declarada.';
    throw err;
  }

  const prima = capitalAsegurado * (tarifaFranja.tasa / 1000);

  const catalogoFallecimiento = catalogoPorCodigo.get('fallecimiento_cualquier_causa');
  const catalogoPerdidasOrganicas = catalogoPorCodigo.get('perdidas_organicas');

  return {
    prima,
    detalle: {
      capital_asegurado: capitalAsegurado,
      edad,
      tasa_fallecimiento: tarifaFranja.tasa,
      prima_base: prima,
    },
    coberturas: [
      {
        codigo: 'fallecimiento_cualquier_causa',
        nombre: catalogoFallecimiento?.nombre ?? 'Muerte por Cualquier Causa',
        monto: capitalAsegurado,
        tipo_aplicacion: 'cobertura',
        incluye_en_suma_asegurada_total: true,
      },
      {
        codigo: 'perdidas_organicas',
        nombre: catalogoPerdidasOrganicas?.nombre ?? 'Pérdidas Orgánicas / Desmembramiento por Accidente',
        monto: capitalAsegurado,
        tipo_aplicacion: 'cobertura',
        incluye_en_suma_asegurada_total: false,
      },
    ],
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
