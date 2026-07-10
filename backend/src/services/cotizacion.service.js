import * as ramosRepository from '../repositories/ramos.repository.js';
import * as cotizacionesRepository from '../repositories/cotizaciones.repository.js';
import { getCalculador } from '../calculators/index.js';
import { getSchemaCotizar } from '../schemas/index.js';

/**
 * Calcula una cotización SIN guardarla — usado para el preview en vivo del frontend.
 * Devuelve todas las variantes (sin/con franquicia si corresponde) con sus 4 formas de pago.
 */
export async function calcularPreview(body) {
  const { plan, ramo, datosValidados } = await validarYResolverContexto(body);
  const calculador = getCalculador(ramo.calculador);

  return construirVariantes({ calculador, plan, datosValidados });
}

/**
 * Calcula y persiste la cotización completa: cabecera, variantes y planes de pago
 * por forma de pago. Asigna número(s) correlativo(s) por variante.
 */
export async function crearCotizacion(body) {
  const { plan, ramo, datosValidados } = await validarYResolverContexto(body);
  const calculador = getCalculador(ramo.calculador);

  const variantesCalculadas = await construirVariantes({ calculador, plan, datosValidados });

  const cotizacion = await cotizacionesRepository.insertCotizacion({
    numero_cotizacion: `${ramo.nombre.toUpperCase()}-${await cotizacionesRepository.nextNumeroCorrelativo(ramo.id)}`,
    ramo_id: ramo.id,
    plan_id: plan.id,
    agente_id: body.agente_id ?? null, // TODO: tomar del usuario autenticado cuando haya auth
    cliente_nombre: body.cliente_nombre,
    cliente_contacto: body.cliente_contacto,
    riesgo_datos: datosValidados.riesgo_datos,
    capital_asegurado: datosValidados.capital_asegurado,
    estado: 'cotizada',
  });

  for (const variante of variantesCalculadas.variantes) {
    const numeroVariante = String(await cotizacionesRepository.nextNumeroCorrelativo(ramo.id));

    const varianteGuardada = await cotizacionesRepository.insertVariante({
      cotizacion_id: cotizacion.id,
      numero_variante: numeroVariante,
      tipo_franquicia: variante.tipo_franquicia,
      franquicia_monto: variante.franquicia_monto,
      prima: variante.prima,
    });

    await cotizacionesRepository.insertPlanesPago(
      variante.formasPago.map((fp) => ({
        variante_id: varianteGuardada.id,
        forma_pago_id: fp.forma_pago_id,
        cantidad_cuotas: fp.cantidad_cuotas,
        rpf_porcentaje: fp.rpf_porcentaje,
        rpf_monto: fp.rpf,
        iva_monto: fp.iva,
        premio_total: fp.premio,
        monto_inicial: fp.inicial,
        monto_cuota: fp.cuota,
      }))
    );
  }

  return cotizacionesRepository.findCotizacionById(cotizacion.id);
}

export async function listarCotizaciones(query) {
  return cotizacionesRepository.findCotizaciones({
    ramoId: query.ramo_id,
    estado: query.estado,
    cliente: query.cliente,
    limit: query.limit ? Number(query.limit) : undefined,
    offset: query.offset ? Number(query.offset) : undefined,
  });
}

export async function obtenerCotizacion(id) {
  return cotizacionesRepository.findCotizacionById(id);
}

export async function generarPdfOferta(_id) {
  // TODO Fase 2: render con Puppeteer sobre templates/auto-oferta.html (ver sección 7 del plan)
  throw new Error('Generación de PDF pendiente — Fase 2');
}

// ---- Fase 4 ----
export async function aceptarCotizacion(_id, _kyc) {
  throw new Error('Aceptación de cotización + KYC pendiente — Fase 4');
}

export async function generarPdfPropuestaFormal(_id) {
  throw new Error('Generación de Propuesta Formal pendiente — Fase 4');
}

// ---------------------------------------------------------------------------

async function validarYResolverContexto(body) {
  const plan = await ramosRepository.findPlanById(body.plan_id);
  // TODO: reemplazar por un repository de ramos que traiga el ramo completo por id
  const ramos = await ramosRepository.findRamosActivos();
  const ramo = ramos.find((r) => r.id === plan.ramo_id);

  const schema = getSchemaCotizar(ramo.calculador);
  const datosValidados = schema.parse(body);

  return { plan, ramo, datosValidados };
}

/**
 * Arma las variantes (sin/con franquicia) según la regla de negocio de Auto
 * (ver sección 5 de PLAN_DESARROLLO.md). Otros ramos no tienen franquicia dual
 * todavía — devuelven siempre 1 variante sin franquicia hasta que se implementen.
 */
async function construirVariantes({ calculador, plan, datosValidados }) {
  const { prima, detalle } = await calculador.calcularPrima({
    planId: plan.id,
    capital: datosValidados.capital_asegurado,
    descuentos: datosValidados.descuentos,
    recargos: datosValidados.recargos,
  });

  const formasPagoPlan = await ramosRepository.findFormasPagoDelPlan(plan.id);

  const tiposFranquicia = resolverTiposFranquicia(plan, datosValidados.riesgo_datos, prima);

  const variantes = tiposFranquicia.map(({ tipo, primaAjustada, franquiciaMonto }) => ({
    tipo_franquicia: tipo,
    prima: primaAjustada,
    franquicia_monto: franquiciaMonto,
    formasPago: formasPagoPlan.map((fp) => ({
      forma_pago_id: fp.forma_pago_id,
      cantidad_cuotas: plan.cuotas_default,
      ...calculador.calcularPlanPago(
        primaAjustada,
        { codigo: fp.formas_pago.codigo, tasa_rpf: fp.tasa_rpf },
        plan.cuotas_default
      ),
    })),
  }));

  return { prima, detalle, variantes };
}

/**
 * @param {number} primaBase - prima ya calculada (capital × tasa, con piso de prima técnica mínima)
 */
function resolverTiposFranquicia(plan, riesgoDatos, primaBase) {
  // TODO Fase 2: mover a calculators/auto.calculator.js como parte de la interfaz
  // (hoy vive acá porque depende de datos de `plan` Y de `riesgo_datos` a la vez).
  // Ver regla completa en PLAN_DESARROLLO.md sección 5.
  if (riesgoDatos.via_importacion === 'IMPORTACION DIRECTA') {
    // Franquicia fija por defecto en toda cotización. El add-on para sacarla
    // (antes Gs. 909.091) está pendiente de recalcular — ver sección 11, punto 9.
    const FRANQUICIA_BASE = 350000; // TODO: leer de franquicia_auto_importacion_directa
    return [{ tipo: 'con_franquicia', primaAjustada: primaBase, franquiciaMonto: FRANQUICIA_BASE }];
  }

  if (plan.cotizacion_combinada) {
    const primaConDescuento = primaBase * (1 - (plan.descuento_default ?? 0) / 100);
    const franquiciaMonto = primaConDescuento * ((plan.franquicia_porcentaje ?? 0) / 100);
    return [
      { tipo: 'sin_franquicia', primaAjustada: primaBase, franquiciaMonto: 0 },
      { tipo: 'con_franquicia', primaAjustada: primaConDescuento, franquiciaMonto },
    ];
  }

  return [{ tipo: 'sin_franquicia', primaAjustada: primaBase, franquiciaMonto: 0 }];
}
