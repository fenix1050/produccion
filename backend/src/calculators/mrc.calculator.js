export { calcularPlanPago } from './utils/plan-pago.js';
import { sumarAjustes, topeEfectivo } from './utils/ajustes.js';
import { httpError } from '../utils/http-error.js';

// Códigos del catálogo (migración 012_seed_mrc.sql) cuya suma asegurada viene directo
// del formulario (Capital Edificio / Capital Contenido).
const CODIGO_INCENDIO_EDIFICIO = 'incendio_edificio';
const CODIGO_INCENDIO_CONTENIDO = 'incendio_contenido';

// A pedido de Kevin (2026-07-15): la cotización de MRC necesita al menos 3 coberturas de tipo
// "Cobertura" (Incendio Edificio/Contenido cuentan siempre, más lo que agregue el agente como
// cobertura adicional) — los sub-límites fijos (agua/equipos electrónicos/granizo) NO cuentan
// para este mínimo, van aparte siempre incluidos.
const MINIMO_COBERTURAS_MRC = 3;

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
 *   Prima_base = MAX(Costo Edificio + Costo Contenido, plan.prima_tecnica_minima) — el piso
 *     se aplica en silencio, no bloquea la cotización (ver más abajo)
 *   Prima = Prima_base − Descuentos (tope descuento_maximo) + Recargos (tope recargo_maximo)
 *
 * La tasa depende del `Tipo de Riesgo` (rubro de actividad) elegido, NO de una tasa fija del
 * ramo — confirmado por Kevin (2026-07-13): aunque el ejemplo de la hoja "MRC" del Excel usa la
 * tasa fija de la sección "Tasa MRC" (1,00‰/2,00‰) sin importar el rubro (BAZAR), en el sistema
 * real la tasa sí varía por categoría del rubro (misma tabla `rubros_actividad` que ya se usa
 * para Incendio, migración 013).
 *
 * Sigue cortando con error 422 si Capital_Edificio + Capital_Contenido supera
 * plan.responsabilidad_maxima_cotizable — esa alerta bloquea el cálculo, el frontend no deja
 * avanzar a "Detalle del plan" mientras esté activa (ver cotizar.js, puedeAvanzarADetalle). La
 * Prima Técnica Mínima, en cambio, ya NO bloquea (2026-07-15): se aplica como piso silencioso.
 *
 * Coberturas adicionales (desde 2026-07-13): fuera de Incendio Edificio/Contenido, ninguna
 * cobertura se incluye por defecto. El agente agrega explícitamente cada línea vía
 * `riesgoDatos.coberturas_adicionales` ({codigo, suma_asegurada}), y la misma cobertura puede
 * repetirse con distinta suma asegurada (confirmado contra "Version 01 - Calculo Varios.xlsx",
 * hoja MRC/DATOS: "Robo contenido" aparece dos veces en una cotización real con sumas
 * distintas). Cada línea se tarifica con `tasas_cobertura_ramo` (permil) y su costo se suma a
 * la prima; se rechaza con 422 si el código no existe/no está activo en el ramo, si es uno de
 * los 2 códigos fijos (ya cubiertos por el capital declarado), o si no tiene tasa confirmada
 * (hoy el caso de `sublimite_cctv`).
 *
 * @param {object} input
 * @param {object} input.plan
 * @param {object} input.riesgoDatos - { rubro_actividad, capital_edificio, capital_contenido, ... }
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
    throw httpError(
      422,
      `El plan "${plan.nombre}" todavía no tiene RPF/prima técnica mínima confirmados — no se puede cotizar.`,
      'Este plan está pendiente de confirmación de tasas.'
    );
  }

  const capitalEdificio = riesgoDatos.capital_edificio ?? 0;
  const capitalContenido = riesgoDatos.capital_contenido ?? 0;

  if (
    plan.responsabilidad_maxima_cotizable != null &&
    capitalEdificio + capitalContenido > plan.responsabilidad_maxima_cotizable
  ) {
    throw httpError(
      422,
      `La suma de Capital Edificio + Capital Contenido supera la Responsabilidad Máx. Cotizable del plan "${plan.nombre}" (Gs. ${plan.responsabilidad_maxima_cotizable}).`,
      `El capital declarado supera el máximo cotizable para este plan (Gs. ${plan.responsabilidad_maxima_cotizable.toLocaleString('es-PY')}).`
    );
  }

  if (!rubro) {
    throw httpError(
      422,
      `Tipo de Riesgo "${riesgoDatos.rubro_actividad}" no encontrado en rubros_actividad.`,
      `El Tipo de Riesgo seleccionado no es válido.`
    );
  }

  const tasaEdificio = rubro.tasa_edificio;
  const tasaContenido = rubro.tasa_contenido;

  if (tasaEdificio == null || tasaContenido == null) {
    throw httpError(
      422,
      `Faltan tasa_edificio/tasa_contenido para el Tipo de Riesgo "${rubro.nombre}".`,
      `El Tipo de Riesgo "${rubro.nombre}" todavía no tiene tasas confirmadas.`
    );
  }

  const costoEdificio = capitalEdificio * (tasaEdificio / 1000);
  const costoContenido = capitalContenido * (tasaContenido / 1000);

  // Coberturas adicionales: a partir de 2026-07-13, ninguna cobertura fuera de Incendio
  // Edificio/Contenido se incluye por defecto — el agente las agrega explícitamente como
  // líneas, y la MISMA cobertura puede repetirse con distinta suma asegurada (confirmado
  // contra "Version 01 - Calculo Varios.xlsx", hoja MRC/DATOS: "Robo contenido" aparece dos
  // veces en una cotización real, Gs. 50.000.000 y Gs. 10.000.000, cada una con su propio
  // costo calculado por tasa).
  const catalogoPorCodigo = new Map(catalogoRamo.map((c) => [c.codigo, c]));

  const tasaPorCodigo = new Map(
    tasasRamo.map((t) => [t.coberturas_catalogo?.codigo, { tasa_valor: t.tasa_valor, unidad: t.unidad }])
  );

  const coberturasAdicionalesValidadas = [];
  let totalCoberturasAdicionales = 0;

  for (const linea of riesgoDatos.coberturas_adicionales ?? []) {
    const catalogoRow = catalogoPorCodigo.get(linea.codigo);
    if (!catalogoRow) {
      throw httpError(
        422,
        `La cobertura "${linea.codigo}" no existe o no está activa en el catálogo del ramo MRC.`,
        `La cobertura seleccionada no es válida.`
      );
    }

    if (linea.codigo === CODIGO_INCENDIO_EDIFICIO || linea.codigo === CODIGO_INCENDIO_CONTENIDO) {
      throw httpError(
        422,
        `"${catalogoRow.nombre}" ya se cotiza mediante Capital Edificio/Contenido — no se puede agregar como cobertura adicional.`,
        `"${catalogoRow.nombre}" ya está incluida a través del capital declarado.`
      );
    }

    const tasaInfo = tasaPorCodigo.get(linea.codigo);
    if (!tasaInfo || tasaInfo.tasa_valor == null) {
      throw httpError(
        422,
        `La cobertura "${catalogoRow.nombre}" todavía no tiene tasa confirmada.`,
        `La cobertura "${catalogoRow.nombre}" todavía no tiene tasa confirmada.`
      );
    }

    // NOTA: unidad hoy siempre es 'permil' en MRC — si en el futuro aparece otra unidad
    // (ej. porcentaje directo) esta fórmula debe revisarse, no asumir permil ciegamente.
    if (tasaInfo.unidad !== 'permil') {
      throw httpError(
        422,
        `Unidad de tasa "${tasaInfo.unidad}" no soportada todavía para "${catalogoRow.nombre}".`,
        `La cobertura "${catalogoRow.nombre}" tiene una unidad de tasa no soportada.`
      );
    }

    const costoLinea = linea.suma_asegurada * (tasaInfo.tasa_valor / 1000);
    totalCoberturasAdicionales += costoLinea;

    coberturasAdicionalesValidadas.push({
      codigo: linea.codigo,
      nombre: catalogoRow.nombre,
      monto: linea.suma_asegurada,
      franquicia_default: catalogoRow.franquicia_default ?? null,
      tipo_aplicacion: catalogoRow.categoria === 'Sublímites' ? 'sublimite' : 'cobertura',
      // Por defecto TRUE — "Robo valores ventanilla" es la única excepción confirmada hoy
      // (migración 020): sub-límite de "Valores en caja fuerte", no cuenta como suma
      // asegurada independiente en el resumen "Suma Asegurada total".
      incluye_en_suma_asegurada_total: catalogoRow.incluye_en_suma_asegurada_total ?? true,
      costo: costoLinea,
    });
  }

  // Incendio Edificio + Incendio Contenido cuentan siempre como 2 coberturas fijas — se suma
  // lo que el agente agregó como cobertura adicional (sin contar sub-límites) para el mínimo.
  const cantidadCoberturas =
    2 + coberturasAdicionalesValidadas.filter((c) => c.tipo_aplicacion === 'cobertura').length;

  if (cantidadCoberturas < MINIMO_COBERTURAS_MRC) {
    throw httpError(
      422,
      `El plan "${plan.nombre}" requiere al menos ${MINIMO_COBERTURAS_MRC} coberturas — hay ${cantidadCoberturas} cargadas.`,
      `Este plan requiere un mínimo de ${MINIMO_COBERTURAS_MRC} coberturas — agregá al menos una cobertura adicional para continuar.`
    );
  }

  const primaCalculada = costoEdificio + costoContenido + totalCoberturasAdicionales;

  // A pedido de Kevin (2026-07-15): sí se pueden cotizar capitales que generen una prima menor
  // a la Prima Técnica Mínima del plan — no se bloquea con alerta. En ese caso se aplica el
  // piso en silencio: la Prima Técnica Mínima pasa a ser la prima base de la cotización.
  const primaBase = Math.max(primaCalculada, plan.prima_tecnica_minima);

  const totalDescuentos = sumarAjustes(descuentos, primaBase, topeEfectivo(plan.descuento_maximo, usuario?.descuento_maximo_pct));
  const totalRecargos = sumarAjustes(recargos, primaBase, topeEfectivo(plan.recargo_maximo, usuario?.recargo_maximo_pct));

  const prima = primaBase - totalDescuentos + totalRecargos;

  const coberturas = construirListaCoberturas({
    capitalEdificio,
    capitalContenido,
    catalogoPorCodigo,
    coberturasAdicionalesValidadas,
    franquiciasPorCobertura: riesgoDatos.franquicias_por_cobertura ?? {},
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
      costo_coberturas_adicionales: totalCoberturasAdicionales,
      prima_base: primaBase,
      prima_tecnica_minima: plan.prima_tecnica_minima,
      total_descuentos: totalDescuentos,
      total_recargos: totalRecargos,
    },
    coberturas,
  };
}

/**
 * Arma la lista de coberturas a mostrar en el panel "Coberturas incluidas".
 *
 * Desde 2026-07-13, la única inclusión automática son las 2 líneas fijas de Incendio
 * Edificio/Contenido (cotizadas por Capital Edificio/Contenido). Ninguna otra cobertura ni
 * sublímite se incluye por defecto — el agente las agrega explícitamente vía
 * `coberturas_adicionales`, ya validadas y con costo calculado en `calcularPrima`. Se retira
 * el viejo comportamiento de incluir automáticamente las obligatorias del catálogo y los
 * sublímites marcados `incluida_por_defecto` en `plan_coberturas`, porque no reflejaba cómo
 * se arma una cotización real (confirmado contra "Version 01 - Calculo Varios.xlsx", hoja
 * MRC/DATOS: una misma cobertura como "Robo contenido" puede repetirse con distinta suma
 * asegurada, algo que la inclusión automática por defecto no podía representar).
 *
 * Cada línea trae `tipo_aplicacion` ('cobertura' | 'sublimite'), resuelto directamente desde
 * `coberturas_catalogo.categoria` — no es un toggle manual del agente.
 */
function construirListaCoberturas({
  capitalEdificio,
  capitalContenido,
  catalogoPorCodigo,
  coberturasAdicionalesValidadas,
  franquiciasPorCobertura,
}) {
  // El agente puede elegir una franquicia distinta a la default del catálogo por cobertura
  // (selector "Franquicia" en Detalle del plan) — si eligió una, esa es la que se persiste;
  // si no, se cae a la default del catálogo (mismo comportamiento que antes de esta elección).
  const franquiciaEfectiva = (codigo, porDefecto) =>
    codigo in franquiciasPorCobertura ? franquiciasPorCobertura[codigo] : porDefecto;

  const catalogoEdificio = catalogoPorCodigo.get(CODIGO_INCENDIO_EDIFICIO);
  const catalogoContenido = catalogoPorCodigo.get(CODIGO_INCENDIO_CONTENIDO);

  const fijas = [
    {
      codigo: CODIGO_INCENDIO_EDIFICIO,
      nombre: catalogoEdificio?.nombre ?? 'Incendio Edificio',
      monto: capitalEdificio,
      franquicia_default: franquiciaEfectiva(CODIGO_INCENDIO_EDIFICIO, catalogoEdificio?.franquicia_default ?? null),
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: true,
    },
    {
      codigo: CODIGO_INCENDIO_CONTENIDO,
      nombre: catalogoContenido?.nombre ?? 'Incendio Contenido',
      monto: capitalContenido,
      franquicia_default: franquiciaEfectiva(CODIGO_INCENDIO_CONTENIDO, catalogoContenido?.franquicia_default ?? null),
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: true,
    },
  ];

  const adicionales = coberturasAdicionalesValidadas.map(
    ({ codigo, nombre, monto, franquicia_default, tipo_aplicacion, incluye_en_suma_asegurada_total }) => ({
      codigo,
      nombre,
      monto,
      franquicia_default: franquiciaEfectiva(codigo, franquicia_default),
      tipo_aplicacion,
      incluye_en_suma_asegurada_total,
    })
  );

  return [...fijas, ...adicionales];
}
