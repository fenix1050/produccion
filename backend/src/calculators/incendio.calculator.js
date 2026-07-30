export { calcularPlanPago } from './utils/plan-pago.js'
import { httpError } from '../utils/http-error.js'

import { sumarAjustes, topeEfectivo } from './utils/ajustes.js'

const NOMBRE_PLAN_MAQUINARIA = 'MAQUINARIA BASICO'

const CODIGO_INCENDIO_EDIFICIO = 'incendio_edificio'
const CODIGO_INCENDIO_CONTENIDO = 'incendio_contenido'
const CODIGO_INCENDIO_MAQUINARIA = 'incendio_maquinaria'
const CODIGO_SUBLIMITE_FENOMENOS_NATURALES = 'sublimite_fenomenos_naturales'
const CODIGO_SUBLIMITE_VANDALISMO_MAQUINARIA = 'sublimite_vandalismo_maquinaria'

// Tercera mecánica de tasa (planes Hipotecario, con Inspección, sin Inspección — migraciones
// 035/036/038): 4 objetos de riesgo OPCIONALES, cada uno con su propia tasa dentro de un
// "Tipo de Riesgo" (ej. VIVIENDA FAMILIAR). El campo del riesgo_datos, el nombre interno del
// objeto (clave de `tasasObjetoRiesgo.objetos`) y el código de catálogo van de la mano acá para
// no repetir el mapeo en 3 lugares distintos.
const OBJETOS_RIESGO = [
  { campo: 'capital_edificio', objeto: 'edificio', codigo: 'incendio_edificio' },
  { campo: 'capital_instalaciones', objeto: 'instalaciones', codigo: 'incendio_instalaciones' },
  {
    campo: 'capital_contenido_mueble_equipos',
    objeto: 'contenido_mueble_equipos',
    codigo: 'incendio_contenido_mueble_equipos',
  },
  {
    campo: 'capital_contenido_mercaderia',
    objeto: 'contenido_mercaderia',
    codigo: 'incendio_contenido_mercaderia',
  },
]

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
  tasasObjetoRiesgo,
  umbralInspeccion,
  moneda = 'PYG',
  forzadoPorPlan = false,
}) {
  const pisoPlan = pisoPrimaTecnica(plan, moneda)

  const catalogoPorCodigo = new Map(catalogoRamo.map((c) => [c.codigo, c]))

  // Dispatch por `plan.tipo_mecanica` (migración 035). Fallback por nombre mientras la columna
  // no esté poblada en filas viejas (rollback nivel 2 documentado en design.md) — preserva el
  // comportamiento anterior a la migración para los 2 planes ya productivos.
  const mecanica =
    plan.tipo_mecanica ??
    (plan.nombre === NOMBRE_PLAN_MAQUINARIA ? 'maquinaria' : 'edificio_contenido')

  const {
    primaBase: primaCalculada,
    detalle,
    coberturas,
  } = mecanica === 'objeto_riesgo'
    ? await calcularPorObjetoRiesgo({
        plan,
        riesgoDatos,
        catalogoPorCodigo,
        tasasObjetoRiesgo,
        umbralInspeccion,
        moneda,
      })
    : mecanica === 'maquinaria'
      ? await calcularMaquinariaBasico({ plan, riesgoDatos, catalogoPorCodigo, tasasRamo })
      : await calcularEdificioYContenido({ plan, riesgoDatos, catalogoPorCodigo, rubro })

  // A pedido de Kevin (2026-07-15): sí se pueden cotizar capitales que generen una prima menor
  // a la Prima Técnica Mínima del plan — no se bloquea con alerta. En ese caso se aplica el
  // piso en silencio: la Prima Técnica Mínima pasa a ser la prima base de la cotización.
  const primaBase = Math.max(primaCalculada, pisoPlan)

  // `forzadoPorPlan` (cambio SDD `mrc-plan-descuento-fijo`, mismo one-liner que
  // mrc.calculator.js por simetría — inerte hoy, ningún plan de Incendio seedea
  // `descuento_default` todavía). Default `false`: cero cambio de comportamiento.
  const totalDescuentos = sumarAjustes(
    descuentos,
    primaBase,
    topeEfectivo(plan.descuento_maximo, forzadoPorPlan ? null : usuario?.descuento_maximo_pct)
  )
  const totalRecargos = sumarAjustes(
    recargos,
    primaBase,
    topeEfectivo(plan.recargo_maximo, usuario?.recargo_maximo_pct)
  )

  const prima = primaBase - totalDescuentos + totalRecargos

  return {
    prima,
    detalle: {
      ...detalle,
      prima_base: primaBase,
      prima_tecnica_minima: pisoPlan,
      total_descuentos: totalDescuentos,
      total_recargos: totalRecargos,
    },
    coberturas,
  }
}

async function calcularEdificioYContenido({ plan, riesgoDatos, catalogoPorCodigo, rubro }) {
  const capitalEdificio = riesgoDatos.capital_edificio ?? 0
  const capitalContenido = riesgoDatos.capital_contenido ?? 0

  if (
    plan.responsabilidad_maxima_cotizable != null &&
    capitalEdificio + capitalContenido > plan.responsabilidad_maxima_cotizable
  ) {
    throw httpError(
      422,
      `La suma de Capital Edificio + Capital Contenido supera la Responsabilidad Máx. Cotizable del plan "${plan.nombre}" (Gs. ${plan.responsabilidad_maxima_cotizable}).`,
      `El capital declarado supera el máximo cotizable para este plan (Gs. ${plan.responsabilidad_maxima_cotizable.toLocaleString('es-PY')}).`
    )
  }

  if (!rubro) {
    throw httpError(
      422,
      `Tipo de Riesgo "${riesgoDatos.rubro_actividad}" no encontrado en rubros_actividad.`,
      `El Tipo de Riesgo seleccionado no es válido.`
    )
  }

  const tasaEdificio = rubro.tasa_edificio
  const tasaContenido = rubro.tasa_contenido

  if (tasaEdificio == null || tasaContenido == null) {
    throw httpError(
      422,
      `Faltan tasa_edificio/tasa_contenido para el Tipo de Riesgo "${rubro.nombre}".`,
      `El Tipo de Riesgo "${rubro.nombre}" todavía no tiene tasas confirmadas.`
    )
  }

  const costoEdificio = capitalEdificio * (tasaEdificio / 1000)
  const costoContenido = capitalContenido * (tasaContenido / 1000)

  const catalogoEdificio = catalogoPorCodigo.get(CODIGO_INCENDIO_EDIFICIO)
  const catalogoContenido = catalogoPorCodigo.get(CODIGO_INCENDIO_CONTENIDO)
  const catalogoSublimiteFenomenos = catalogoPorCodigo.get(CODIGO_SUBLIMITE_FENOMENOS_NATURALES)

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
  ]

  if (riesgoDatos.sublimite_fenomenos_naturales_porcentaje != null) {
    coberturas.push({
      codigo: CODIGO_SUBLIMITE_FENOMENOS_NATURALES,
      nombre: catalogoSublimiteFenomenos?.nombre ?? 'Sublímite por Fenómenos Naturales',
      sublimite_porcentaje: riesgoDatos.sublimite_fenomenos_naturales_porcentaje,
      tipo_aplicacion: 'sublimite',
      incluye_en_suma_asegurada_total: false,
    })
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
  }
}

async function calcularMaquinariaBasico({ plan, riesgoDatos, catalogoPorCodigo, tasasRamo }) {
  const capitalMaquinaria = riesgoDatos.capital_maquinaria ?? 0

  if (
    plan.responsabilidad_maxima_cotizable != null &&
    capitalMaquinaria > plan.responsabilidad_maxima_cotizable
  ) {
    throw httpError(
      422,
      `El Capital Maquinaria supera la Responsabilidad Máx. Cotizable del plan "${plan.nombre}" (${plan.responsabilidad_maxima_cotizable}).`,
      `El capital declarado supera el máximo cotizable para este plan.`
    )
  }

  const catalogoMaquinaria = catalogoPorCodigo.get(CODIGO_INCENDIO_MAQUINARIA)
  const catalogoSublimiteVandalismo = catalogoPorCodigo.get(CODIGO_SUBLIMITE_VANDALISMO_MAQUINARIA)

  const tasaMaquinaria = tasasRamo.find(
    (t) => t.coberturas_catalogo?.codigo === CODIGO_INCENDIO_MAQUINARIA
  )

  if (!tasaMaquinaria || tasaMaquinaria.tasa_valor == null) {
    throw httpError(
      422,
      `Falta la tasa de "${CODIGO_INCENDIO_MAQUINARIA}" en tasas_cobertura_ramo.`,
      'Este plan todavía no tiene tasa confirmada.'
    )
  }

  const costoMaquinaria = capitalMaquinaria * (tasaMaquinaria.tasa_valor / 1000)

  const coberturas = [
    {
      codigo: CODIGO_INCENDIO_MAQUINARIA,
      nombre: catalogoMaquinaria?.nombre ?? 'Incendio de Maquinaria',
      monto: capitalMaquinaria,
      franquicia_default: catalogoMaquinaria?.franquicia_default ?? null,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: true,
    },
  ]

  if (riesgoDatos.sublimite_vandalismo_porcentaje != null) {
    coberturas.push({
      codigo: CODIGO_SUBLIMITE_VANDALISMO_MAQUINARIA,
      nombre: catalogoSublimiteVandalismo?.nombre ?? 'Sublímite por Vandalismo (Maquinaria)',
      sublimite_porcentaje: riesgoDatos.sublimite_vandalismo_porcentaje,
      tipo_aplicacion: 'sublimite',
      incluye_en_suma_asegurada_total: false,
    })
  }

  return {
    primaBase: costoMaquinaria,
    detalle: {
      capital_maquinaria: capitalMaquinaria,
      tasa_incendio_maquinaria: tasaMaquinaria.tasa_valor,
      costo_maquinaria: costoMaquinaria,
    },
    coberturas,
  }
}

/**
 * Piso de Prima Técnica Mínima, específico por moneda (migración 034 —
 * `planes.prima_tecnica_minima` en Gs., `planes.prima_tecnica_minima_usd` nullable). Sin
 * conversión implícita: una cotización en USD sin piso USD confirmado rechaza con 422 en vez de
 * reusar/convertir el piso en Gs. (criterio cerrado en design.md — el piso es un valor de
 * suscripción negociado, no un monto convertible).
 *
 * @param {object} plan
 * @param {'PYG'|'USD'} moneda
 * @returns {number}
 */
function pisoPrimaTecnica(plan, moneda) {
  if (moneda === 'USD') {
    if (plan.prima_tecnica_minima_usd == null) {
      throw httpError(
        422,
        `El plan "${plan.nombre}" todavía no tiene Prima Técnica Mínima en USD confirmada — no se puede cotizar en esa moneda.`,
        'Este plan todavía no tiene el piso de prima en USD confirmado.'
      )
    }
    return plan.prima_tecnica_minima_usd
  }

  if (!plan.prima_tecnica_minima) {
    throw httpError(
      422,
      `El plan "${plan.nombre}" todavía no tiene RPF/prima técnica mínima confirmados — no se puede cotizar.`,
      'Este plan está pendiente de confirmación de tasas.'
    )
  }
  return plan.prima_tecnica_minima
}

/**
 * Tercera mecánica de tasa (planes Hipotecario, con Inspección, sin Inspección — migración 035).
 * Prima = Σ capital_i × tasa_i sobre los objetos de riesgo DECLARADOS (capital > 0) — los 4
 * objetos son opcionales, sin ninguno declarado rechaza con 422. La tasa efectiva del conjunto
 * (costoTotal / sumaTotal) se clampea contra `tasa_minima`/`tasa_maxima` del tipo de riesgo si
 * cae fuera de ese rango.
 *
 * El umbral de inspección ya viene resuelto por cotizacion.service.js (I/O de tipo de cambio
 * hecho upstream, ver design.md) — `umbralInspeccion == null` significa que la regla no aplica
 * (plan Hipotecario, o cualquier plan con `requiere_inspeccion IS NULL`).
 *
 * @param {object} params
 * @param {object} params.plan
 * @param {object} params.riesgoDatos - capital_edificio/capital_instalaciones/
 *   capital_contenido_mueble_equipos/capital_contenido_mercaderia, todos opcionales
 * @param {Map<string,object>} params.catalogoPorCodigo
 * @param {{tipo_riesgo:object, objetos:object}|null|undefined} params.tasasObjetoRiesgo
 * @param {{requiereInspeccion:boolean, montoEnMonedaCotizacion:number}|null|undefined} params.umbralInspeccion
 * @param {'PYG'|'USD'} params.moneda
 * @returns {Promise<{primaBase:number, detalle:object, coberturas:Array<object>}>}
 */
async function calcularPorObjetoRiesgo({
  plan,
  riesgoDatos,
  catalogoPorCodigo,
  tasasObjetoRiesgo,
  umbralInspeccion,
  moneda,
}) {
  if (!tasasObjetoRiesgo) {
    throw httpError(
      422,
      `Tipo de Riesgo no encontrado o sin tasas confirmadas para el plan "${plan.nombre}".`,
      'Este Tipo de Riesgo todavía no tiene tasas confirmadas.'
    )
  }

  const { tipo_riesgo: tipoRiesgo, objetos } = tasasObjetoRiesgo

  const declarados = OBJETOS_RIESGO.map(({ campo, objeto, codigo }) => ({
    objeto,
    codigo,
    capital: riesgoDatos[campo] ?? 0,
  })).filter((d) => d.capital > 0)

  if (declarados.length === 0) {
    throw httpError(
      422,
      `Debe declarar al menos un objeto de riesgo (Edificio, Instalaciones, Contenido Mueble y Equipos, Contenido Mercadería) para el plan "${plan.nombre}".`,
      'Debe declarar al menos un objeto de riesgo con suma asegurada.'
    )
  }

  const sumaTotal = declarados.reduce((acc, d) => acc + d.capital, 0)

  if (
    plan.responsabilidad_maxima_cotizable != null &&
    sumaTotal > plan.responsabilidad_maxima_cotizable
  ) {
    throw httpError(
      422,
      `La suma asegurada declarada supera la Responsabilidad Máx. Cotizable del plan "${plan.nombre}" (${plan.responsabilidad_maxima_cotizable}).`,
      `El capital declarado supera el máximo cotizable para este plan.`
    )
  }

  // Umbral de inspección (migración 035 + design.md): "sin Inspección" con suma ≥ umbral se
  // rechaza — debe cotizarse "con Inspección". La dirección segura ("con Inspección" por debajo
  // del umbral, sobre-inspeccionar) NO se bloquea (open question resuelta como no-bloqueante).
  if (
    umbralInspeccion &&
    umbralInspeccion.requiereInspeccion === false &&
    sumaTotal >= umbralInspeccion.montoEnMonedaCotizacion
  ) {
    throw httpError(
      422,
      `La suma asegurada declarada (${sumaTotal}) alcanza o supera el umbral de inspección — debe cotizarse bajo el plan "Incendio con Inspección".`,
      'La suma asegurada declarada supera el umbral que exige inspección — seleccione "Incendio con Inspección".'
    )
  }

  let costoTotal = 0
  const detalleObjetos = {}
  const coberturas = []

  for (const { objeto, codigo, capital } of declarados) {
    const tasaObjeto = objetos?.[objeto]
    if (!tasaObjeto || tasaObjeto.tasa_valor == null) {
      throw httpError(
        422,
        `Falta la tasa de "${objeto}" para el Tipo de Riesgo "${tipoRiesgo?.nombre}".`,
        'El Tipo de Riesgo todavía no tiene todas las tasas confirmadas.'
      )
    }

    const divisorObjeto = tasaObjeto.unidad === 'permil' ? 1000 : 100
    // Redondeo a 2 decimales: evita ruido de punto flotante (ej. 100_000_000*0.9/100 =
    // 900000.0000000001 en JS) sin perder precisión real de negocio (montos en Gs./USD no
    // manejan más de centavos).
    const costo = Math.round(capital * (tasaObjeto.tasa_valor / divisorObjeto) * 100) / 100
    costoTotal += costo

    detalleObjetos[`capital_${objeto}`] = capital
    detalleObjetos[`tasa_${objeto}`] = tasaObjeto.tasa_valor
    detalleObjetos[`costo_${objeto}`] = costo

    const catalogo = catalogoPorCodigo.get(codigo)
    coberturas.push({
      codigo,
      nombre: catalogo?.nombre ?? codigo,
      monto: capital,
      franquicia_default: catalogo?.franquicia_default ?? null,
      tipo_aplicacion: 'cobertura',
      incluye_en_suma_asegurada_total: true,
    })
  }

  // Clamp de la tasa EFECTIVA del conjunto (costoTotal / sumaTotal) contra tasa_minima/
  // tasa_maxima del tipo de riesgo — Requirement "Rate floor and cap per risk type". Las tasas
  // por objeto son datos oficiales ya redondeados (no se tocan individualmente); el clamp actúa
  // sobre el resultado agregado si cae fuera de la banda de suscripción del tipo de riesgo.
  let primaObjetos = costoTotal
  let tasaEfectivaAplicada = null
  if (sumaTotal > 0 && (tipoRiesgo?.tasa_minima != null || tipoRiesgo?.tasa_maxima != null)) {
    const divisorGlobal = tipoRiesgo.unidad === 'permil' ? 1000 : 100
    const tasaEfectiva = (costoTotal / sumaTotal) * divisorGlobal
    let tasaClamped = tasaEfectiva
    if (tipoRiesgo.tasa_minima != null && tasaClamped < tipoRiesgo.tasa_minima) {
      tasaClamped = tipoRiesgo.tasa_minima
    }
    if (tipoRiesgo.tasa_maxima != null && tasaClamped > tipoRiesgo.tasa_maxima) {
      tasaClamped = tipoRiesgo.tasa_maxima
    }
    if (tasaClamped !== tasaEfectiva) {
      primaObjetos = Math.round(sumaTotal * (tasaClamped / divisorGlobal) * 100) / 100
      tasaEfectivaAplicada = tasaClamped
    }
  }

  return {
    primaBase: primaObjetos,
    detalle: {
      tipo_riesgo: tipoRiesgo?.nombre ?? null,
      suma_asegurada_total: sumaTotal,
      moneda,
      ...detalleObjetos,
      ...(tasaEfectivaAplicada != null ? { tasa_efectiva_aplicada: tasaEfectivaAplicada } : {}),
    },
    coberturas,
  }
}
