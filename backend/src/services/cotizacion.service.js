import { getCalculador } from '../calculators/index.js'
import * as coberturasRepository from '../repositories/coberturas.repository.js'
import * as cotizacionesRepository from '../repositories/cotizaciones.repository.js'
import * as ramosRepository from '../repositories/ramos.repository.js'
import { getSchemaCotizar } from '../schemas/index.js'
import { httpError } from '../utils/http-error.js'

import { withCache } from './cache.js'
import { renderOfertaPdf } from './pdf.service.js'
import * as tipoCambioService from './tipo-cambio.service.js'

/**
 * Calcula una cotización SIN guardarla — usado para el preview en vivo del frontend.
 * Devuelve todas las variantes (sin/con franquicia si corresponde) con sus 4 formas de pago.
 */
export async function calcularPreview(body, usuario) {
  const { plan, ramo, datosValidados } = await validarYResolverContexto(body)
  const calculador = getCalculador(ramo.calculador)

  return construirVariantes({ calculador, plan, ramo, datosValidados, usuario })
}

/**
 * Calcula y persiste la cotización completa: cabecera, variantes y planes de pago
 * por forma de pago. Asigna número(s) correlativo(s) por variante.
 */
export async function crearCotizacion(body, usuario) {
  const { plan, ramo, datosValidados } = await validarYResolverContexto(body)
  const calculador = getCalculador(ramo.calculador)

  const variantesCalculadas = await construirVariantes({
    calculador,
    plan,
    ramo,
    datosValidados,
    usuario,
  })

  const cotizacion = await cotizacionesRepository.insertCotizacion({
    numero_cotizacion: `${ramo.nombre.toUpperCase()}-${await cotizacionesRepository.nextNumeroCorrelativo(ramo.id)}`,
    ramo_id: ramo.id,
    plan_id: plan.id,
    agente_id: usuario.id,
    cliente_nombre: body.cliente_nombre,
    cliente_contacto: body.cliente_contacto,
    riesgo_datos: datosValidados.riesgo_datos,
    capital_asegurado: datosValidados.capital_asegurado,
    estado: 'cotizada',
    moneda: variantesCalculadas.moneda,
    // Snapshot de tipo de cambio SOLO cuando la cotización realmente necesitó convertir (ver
    // resolverUmbralInspeccion) — `calcularPreview` nunca llega a este INSERT, así que el preview
    // nunca persiste snapshot (migración 034: columnas nullable, NULL = "no hubo conversión").
    ...(variantesCalculadas.tipoCambioUsado
      ? {
          tipo_cambio_snapshot: variantesCalculadas.tipoCambioUsado.venta,
          tipo_cambio_fuente: variantesCalculadas.tipoCambioUsado.fuente,
          tipo_cambio_fecha: variantesCalculadas.tipoCambioUsado.obtenido_en,
        }
      : {}),
  })

  try {
    await insertarCoberturasYVariantes({
      cotizacionId: cotizacion.id,
      ramoId: ramo.id,
      variantesCalculadas,
    })
  } catch (error) {
    // Rollback manual: sin esto, la cabecera insertada arriba queda huérfana (sin variantes) si
    // este paso falla (ej. duplicate-key del Bug 1, o cualquier otra falla de red/RPC) — rompe la
    // generación de Carta Oferta más tarde y quema un `numero_cotizacion` que nunca se reutiliza.
    // Mismo espíritu que el comentario de `actualizarCotizacion` sobre no dejar estados
    // intermedios rotos, pero acá el mecanismo es un DELETE compensatorio (no hay nada previo que
    // preservar: la cabecera se acaba de crear en este mismo call). Se re-lanza el error original
    // sin envolverlo para no ocultar la causa real.
    await cotizacionesRepository.deleteCotizacion(cotizacion.id)
    throw error
  }

  return cotizacionesRepository.findCotizacionById(cotizacion.id)
}

export async function listarCotizaciones(query, usuario) {
  return cotizacionesRepository.findCotizaciones({
    ramoId: query.ramo_id,
    estado: query.estado,
    cliente: query.cliente,
    fechaDesde: query.fecha_desde,
    fechaHasta: query.fecha_hasta,
    limit: query.limit ? Number(query.limit) : undefined,
    offset: query.offset ? Number(query.offset) : undefined,
    agenteId: usuario.rol === 'admin' ? undefined : usuario.id,
  })
}

export async function obtenerCotizacion(id, usuario) {
  const cotizacion = await cotizacionesRepository.findCotizacionById(id)
  verificarPropiedad(cotizacion, usuario)
  return cotizacion
}

export async function generarPdfOferta(id, usuario) {
  const t0 = Date.now()
  const cotizacion = await cotizacionesRepository.findCotizacionById(id)
  verificarPropiedad(cotizacion, usuario)
  const t1 = Date.now()
  const plan = await ramosRepository.findPlanById(cotizacion.plan_id)
  // Sin filtro de `activo`: la cotización ya existe (se creó cuando el ramo estaba activo),
  // así que generar su PDF no debe fallar solo porque el ramo se dio de baja después.
  const ramo = await ramosRepository.findRamoById(cotizacion.ramo_id)
  // Catálogo VIGENTE del plan (montos/incluida_por_defecto actuales) — necesario para que los
  // sub-límites fijos de la Carta Oferta (ej. MRC) reflejen cambios del admin, en vez de quedar
  // hardcodeados con el valor de cuando se cargó la migración original.
  const planCoberturas = await ramosRepository.findCoberturasByPlanId(cotizacion.plan_id)
  const t2 = Date.now()

  const pdf = await renderOfertaPdf({ cotizacion, plan, ramo, planCoberturas })
  const t3 = Date.now()

  console.log(
    `[perf-oferta] findCotizacionById=${t1 - t0}ms plan+ramo+coberturas=${t2 - t1}ms renderOfertaPdf=${t3 - t2}ms total=${t3 - t0}ms`
  )

  return pdf
}

const VENTANA_EDICION_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Recalcula y reemplaza una cotización ya guardada, dentro de la ventana de 30 días desde su
 * creación (`created_at`). Reusa la misma validación/cálculo que `crearCotizacion` — no se toca
 * `numero_cotizacion`, `ramo_id` ni `agente_id`: son identidad de la cotización, no datos del
 * riesgo. Las variantes/coberturas/plan de pago/ajustes viejos se borran y se reinsertan con
 * números de variante NUEVOS (no se reciclan los correlativos ya emitidos).
 */
export async function actualizarCotizacion(id, body, usuario) {
  const existente = await cotizacionesRepository.findCotizacionById(id)
  verificarPropiedad(existente, usuario, 'No tenés permiso para editar esta cotización')

  if (Date.now() - new Date(existente.created_at).getTime() > VENTANA_EDICION_MS) {
    const mensaje =
      'Ya pasaron más de 30 días desde que se generó esta cotización — no se puede editar.'
    throw httpError(422, mensaje, mensaje)
  }

  const { plan, ramo, datosValidados } = await validarYResolverContexto(body)

  // No se puede "editar" una cotización cambiándole el ramo: coberturas/schema/tasas son
  // específicos de cada calculador y `ramo_id` nunca se toca en el UPDATE de abajo (es
  // identidad de la cotización, junto con numero_cotizacion/agente_id). Sin este chequeo, un
  // agente que cambia de ramo en el sidebar mientras edita (frontend/cotizar/cotizar.js,
  // selectRamo) terminaría guardando riesgo_datos/coberturas de un ramo distinto bajo el
  // ramo_id original — detectado en review-risk/readability de esta misma feature.
  if (ramo.id !== existente.ramo_id) {
    const mensaje = 'No se puede cambiar el ramo de una cotización ya existente.'
    throw httpError(422, mensaje, mensaje)
  }

  const calculador = getCalculador(ramo.calculador)
  const variantesCalculadas = await construirVariantes({
    calculador,
    plan,
    ramo,
    datosValidados,
    usuario,
  })

  // Orden deliberado: insertar los datos NUEVOS antes de tocar el header o borrar los viejos.
  // Si `insertarCoberturasYVariantes` falla acá (red, RPC del correlativo, etc.), la cotización
  // existente queda 100% intacta — nada se tocó todavía. Con el orden anterior (borrar → update
  // → insertar) una falla a mitad de camino dejaba la cabecera actualizada pero SIN variantes ni
  // coberturas (PDF roto, prima en null) — detectado por los 4 lentes de review de esta feature.
  // Se borran los IDs viejos ya capturados (no un DELETE ciego por cotizacion_id) para no
  // arrastrarse las filas recién insertadas, que comparten el mismo cotizacion_id.
  const idsVariantesViejas = (existente.cotizacion_variantes ?? []).map((v) => v.id)
  const idsCoberturasViejas = (existente.cotizacion_coberturas ?? []).map((c) => c.id)

  await insertarCoberturasYVariantes({ cotizacionId: id, ramoId: ramo.id, variantesCalculadas })

  await cotizacionesRepository.updateCotizacion(id, {
    cliente_nombre: body.cliente_nombre,
    cliente_contacto: body.cliente_contacto,
    riesgo_datos: datosValidados.riesgo_datos,
    capital_asegurado: datosValidados.capital_asegurado,
    plan_id: plan.id,
    estado: 'cotizada',
    moneda: variantesCalculadas.moneda,
    // Mismo criterio que crearCotizacion: solo se pisa el snapshot si ESTA edición volvió a
    // necesitar conversión — si no, se deja el `tipo_cambio_snapshot` tal como estaba.
    ...(variantesCalculadas.tipoCambioUsado
      ? {
          tipo_cambio_snapshot: variantesCalculadas.tipoCambioUsado.venta,
          tipo_cambio_fuente: variantesCalculadas.tipoCambioUsado.fuente,
          tipo_cambio_fecha: variantesCalculadas.tipoCambioUsado.obtenido_en,
        }
      : {}),
  })

  if (idsVariantesViejas.length)
    await cotizacionesRepository.deleteVariantesByIds(idsVariantesViejas)
  if (idsCoberturasViejas.length)
    await cotizacionesRepository.deleteCoberturasByIds(idsCoberturasViejas)

  return cotizacionesRepository.findCotizacionById(id)
}

// ---- Fase 4 ----
export async function aceptarCotizacion(_id, _kyc) {
  throw new Error('Aceptación de cotización + KYC pendiente — Fase 4')
}

export async function generarPdfPropuestaFormal(_id) {
  throw new Error('Generación de Propuesta Formal pendiente — Fase 4')
}

// ---------------------------------------------------------------------------

/**
 * Lanza un error 403 (mismo patrón que `requireRole` en middleware/auth.js: mensaje + `.status`
 * seteado a mano) si el usuario no es admin y no es el dueño de la cotización. Compartido entre
 * `obtenerCotizacion`, `generarPdfOferta` y `actualizarCotizacion` para no repetir la condición.
 */
function verificarPropiedad(
  cotizacion,
  usuario,
  mensaje = 'No tenés permiso para ver esta cotización'
) {
  if (usuario.rol !== 'admin' && cotizacion.agente_id !== usuario.id) {
    throw httpError(403, mensaje, mensaje)
  }
}

/**
 * Inserta el detalle de coberturas + variantes/planes de pago/ajustes de una cotización ya
 * persistida (cabecera insertada por `crearCotizacion` o ya existente para `actualizarCotizacion`).
 * Extraído para no duplicar esta lógica entre alta y edición — antes vivía inline dentro de
 * `crearCotizacion`.
 */
async function insertarCoberturasYVariantes({ cotizacionId, ramoId, variantesCalculadas }) {
  // Persiste el detalle de coberturas mostrado en "Detalle del plan" (hoy solo lo arma
  // mrc.calculator.js — Incendio/Vida-AP todavía no devuelven `coberturas`, de ahí el guard).
  // Snapshot de nombre/texto legal/exclusiones para que quede congelado aunque después
  // cambie el catálogo (mismo criterio que cotizacion_clausulas/cotizacion_servicios).
  if (variantesCalculadas.coberturas?.length) {
    const catalogoRamo = await coberturasRepository.findCoberturasCatalogoByRamoId(ramoId)
    const catalogoPorCodigo = new Map(catalogoRamo.map((c) => [c.codigo, c]))

    await cotizacionesRepository.insertCoberturas(
      variantesCalculadas.coberturas.map((cobertura) => {
        const catalogoRow = catalogoPorCodigo.get(cobertura.codigo)
        return {
          cotizacion_id: cotizacionId,
          cobertura_id: catalogoRow?.id ?? null,
          nombre_snapshot: cobertura.nombre,
          texto_legal_snapshot: catalogoRow?.texto_legal ?? null,
          texto_exclusiones_snapshot: catalogoRow?.texto_exclusiones ?? null,
          monto: cobertura.monto,
          // El calculador ya resuelve acá la franquicia elegida por el agente (o la default del
          // catálogo si no eligió ninguna) — ver construirListaCoberturas en mrc.calculator.js.
          franquicia: cobertura.franquicia_default ?? null,
          tipo_aplicacion: cobertura.tipo_aplicacion ?? 'cobertura',
          incluida: true,
        }
      })
    )
  }

  for (const variante of variantesCalculadas.variantes) {
    const numeroVariante = String(await cotizacionesRepository.nextNumeroCorrelativo(ramoId))

    const varianteGuardada = await cotizacionesRepository.insertVariante({
      cotizacion_id: cotizacionId,
      numero_variante: numeroVariante,
      tipo_franquicia: variante.tipo_franquicia,
      franquicia_monto: variante.franquicia_monto,
      prima: variante.prima,
    })

    // Descuento/recargo manual del agente (mrc/incendio hoy — ver sumarAjustes en esos
    // calculadores) — se guarda el total ya topado por plan.descuento_maximo/recargo_maximo,
    // no el body crudo, para que la Carta Oferta muestre lo que efectivamente se aplicó.
    const ajustesAGuardar = []
    if (variantesCalculadas.detalle?.total_descuentos > 0) {
      ajustesAGuardar.push({
        variante_id: varianteGuardada.id,
        tipo: 'descuento',
        descripcion: 'Descuento aplicado por el agente',
        monto: variantesCalculadas.detalle.total_descuentos,
      })
    }
    if (variantesCalculadas.detalle?.total_recargos > 0) {
      ajustesAGuardar.push({
        variante_id: varianteGuardada.id,
        tipo: 'recargo',
        descripcion: 'Recargo aplicado por el agente',
        monto: variantesCalculadas.detalle.total_recargos,
      })
    }
    if (ajustesAGuardar.length) {
      await cotizacionesRepository.insertAjustes(ajustesAGuardar)
    }

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
    )
  }
}

async function validarYResolverContexto(body) {
  const plan = await ramosRepository.findPlanById(body.plan_id)
  // soloActivos: true — no se debe poder cotizar/editar sobre un ramo dado de baja
  // (mismo comportamiento que el `.find()` sobre `findRamosActivos()` que reemplaza).
  const ramo = await ramosRepository.findRamoById(plan.ramo_id, { soloActivos: true })

  const schema = getSchemaCotizar(ramo.calculador)
  const datosValidados = schema.parse(body)

  return { plan, ramo, datosValidados }
}

/**
 * Resuelve, ANTES de invocar al calculador, todo el dato que hoy vive detrás de un repository
 * (plan/tasas/catálogo/rubro/tarifas) — así los calculators quedan puros (sin `await` a ningún
 * repository) y respetan la capa `routes → controllers → services → repositories`. Un `switch`
 * por `ramo.calculador` porque cada ramo necesita datos distintos.
 *
 * Para MRC/Incendio se trae siempre `tasasRamo` (incluso para "Edificio y Contenido", que antes
 * no la pedía) y se intenta resolver `rubro` siempre que venga `riesgo_datos.rubro_actividad`
 * (incluso para "Maquinaria Básico", que antes no lo pedía en absoluto). Es un overfetch mínimo
 * aceptado a propósito — una query de más, sin impacto en el resultado numérico — a cambio de no
 * duplicar acá la lógica de "es Maquinaria Básico" que ya vive en incendio.calculator.js.
 */
// Catálogo/tasas/rubro son datos que solo cambian cuando un admin edita coberturas, tasas
// o rubros desde el panel admin (ver invalidarCacheCatalogos en esos endpoints) — el
// cotizador los re-pide en cada preview mientras el agente edita el formulario, así que se
// pasan por el caché en memoria de cache.js en vez de pegarle a Supabase en cada tecla.
async function resolverContextoRepositorios(ramo, plan, riesgoDatos, capital, moneda) {
  switch (ramo.calculador) {
    case 'auto':
      return { tasaCapital: await ramosRepository.findTasaCapital(plan.id, capital) }
    case 'mrc':
    case 'incendio': {
      const [rubro, catalogoRamo, tasasRamo] = await Promise.all([
        riesgoDatos?.rubro_actividad
          ? withCache(`rubro:${riesgoDatos.rubro_actividad}`, () =>
              coberturasRepository.findRubroPorNombre(riesgoDatos.rubro_actividad)
            )
          : null,
        withCache(`catalogoRamo:${plan.ramo_id}`, () =>
          coberturasRepository.findCoberturasCatalogoByRamoId(plan.ramo_id)
        ),
        withCache(`tasasRamo:${plan.ramo_id}`, () =>
          coberturasRepository.findTasasCoberturaRamo(plan.ramo_id)
        ),
      ])

      // Mecánica "objeto_riesgo" (Incendio Hipotecario / con-sin Inspección, migración 035/036):
      // además de lo de arriba, resuelve la tasa por objeto de riesgo (findTasasRiesgoObjeto) y
      // el umbral de inspección — ninguno de los dos aplica a MRC ni a las otras 2 mecánicas de
      // Incendio, así que quedan afuera del Promise.all de arriba (evita I/O innecesario).
      if (ramo.calculador === 'incendio' && plan.tipo_mecanica === 'objeto_riesgo') {
        const tipoRiesgoNombre = riesgoDatos?.rubro_actividad
        const [tasasObjetoRiesgo, umbralInspeccion] = await Promise.all([
          tipoRiesgoNombre
            ? withCache(`tasasObjeto:${plan.ramo_id}:${tipoRiesgoNombre}:${plan.id}`, () =>
                coberturasRepository.findTasasRiesgoObjeto(plan.ramo_id, tipoRiesgoNombre, plan.id)
              )
            : null,
          resolverUmbralInspeccion(plan, moneda),
        ])
        return { rubro, catalogoRamo, tasasRamo, tasasObjetoRiesgo, umbralInspeccion }
      }

      return { rubro, catalogoRamo, tasasRamo }
    }
    case 'vida-ap': {
      const [tarifas, catalogoRamo] = await Promise.all([
        coberturasRepository.findTarifasGenericoByPlanId(plan.id),
        withCache(`catalogoRamo:${plan.ramo_id}`, () =>
          coberturasRepository.findCoberturasCatalogoByRamoId(plan.ramo_id)
        ),
      ])
      return { tarifas, catalogoRamo }
    }
    default:
      return {}
  }
}

/**
 * Resuelve el umbral de inspección aplicable al plan, convertido a la moneda de la cotización.
 * Devuelve `null` si `plan.requiere_inspeccion IS NULL` (la regla no aplica: Hipotecario,
 * Maquinaria, Edificio y Contenido — migración 035) o si todavía no se cargó el monto (estado
 * transitorio documentado en design.md/migración 038). Solo invoca al servicio de tipo de
 * cambio (I/O real) cuando la moneda de la cotización difiere de `umbral_inspeccion_moneda` —
 * una cotización 100% en la moneda del umbral no paga ningún fetch externo (Threat Matrix de
 * design.md: "Cotización 100% en una sola moneda → el servicio no se invoca").
 *
 * No hay conversión de montos declarados (ver Decision "sin conversión implícita" en design.md):
 * el tipo de cambio solo se usa acá para poder comparar la suma asegurada (en la moneda de la
 * cotización) contra un umbral expresado en otra moneda.
 *
 * @param {object} plan
 * @param {'PYG'|'USD'} moneda
 * @returns {Promise<{requiereInspeccion:boolean, montoEnMonedaCotizacion:number, moneda:string,
 *   tipoCambio:{venta:number,fuente:string,obtenido_en:string,stale:boolean}|null}|null>}
 */
async function resolverUmbralInspeccion(plan, moneda) {
  if (plan.requiere_inspeccion == null || plan.umbral_inspeccion_monto == null) return null

  if (moneda === plan.umbral_inspeccion_moneda) {
    return {
      requiereInspeccion: plan.requiere_inspeccion,
      montoEnMonedaCotizacion: plan.umbral_inspeccion_monto,
      moneda,
      tipoCambio: null,
    }
  }

  const tipoCambio = await tipoCambioService.obtenerTipoCambioVigente({ moneda: 'USD' })

  // Umbral en USD, cotización en Gs.: convertir el umbral A Gs. multiplicando por `venta`.
  // Umbral en Gs., cotización en USD: convertir el umbral A USD dividiendo por `venta`.
  const montoEnMonedaCotizacion =
    plan.umbral_inspeccion_moneda === 'USD'
      ? plan.umbral_inspeccion_monto * tipoCambio.venta
      : plan.umbral_inspeccion_monto / tipoCambio.venta

  return {
    requiereInspeccion: plan.requiere_inspeccion,
    montoEnMonedaCotizacion,
    moneda,
    tipoCambio: {
      venta: tipoCambio.venta,
      fuente: tipoCambio.fuente,
      obtenido_en: tipoCambio.obtenido_en,
      stale: tipoCambio.stale,
    },
  }
}

/**
 * Resuelve el descuento efectivo ANTES de invocar al calculador (cambio SDD
 * `mrc-plan-descuento-fijo`, ver design.md Decisión 1). Cuando `plan.descuento_default` está
 * seteado, `plan.cotizacion_combinada` es `false` (la franquicia dual de Auto es la otra rama
 * que lee `descuento_default` — mutuamente excluyentes, Decisión 3) y el usuario NO tiene
 * `puede_editar_descuento_plan`, se descarta cualquier descuento del body y se fuerza un único
 * ajuste `{ descripcion: 'Descuento del plan', porcentaje: plan.descuento_default }`. En
 * cualquier otro caso el body pasa intacto (comportamiento actual, sin cambios).
 *
 * `forzadoPorPlan` viaja junto al array resuelto porque el calculador lo necesita para decidir
 * si neutraliza el tope del USUARIO (`topeEfectivo`, Decisión 2) — es política de empresa, no
 * discrecionalidad del agente, así que el descuento forzado del plan no debe quedar clampeado
 * por `usuario.descuento_maximo_pct` en silencio.
 *
 * Función pura, exportada para test directo sin mockear repositories.
 *
 * @param {object} params
 * @param {object} params.plan
 * @param {Array<{monto?: number, porcentaje?: number}>|undefined} params.descuentosBody
 * @param {object|undefined} params.usuario
 * @returns {{descuentos: Array<object>, forzadoPorPlan: boolean}}
 */
export function resolverDescuentos({ plan, descuentosBody, usuario }) {
  const aplicaDescuentoDelPlan = plan.descuento_default != null && !plan.cotizacion_combinada

  if (!aplicaDescuentoDelPlan || usuario?.puede_editar_descuento_plan) {
    return { descuentos: descuentosBody ?? [], forzadoPorPlan: false }
  }

  return {
    descuentos: [{ descripcion: 'Descuento del plan', porcentaje: plan.descuento_default }],
    forzadoPorPlan: true,
  }
}

/**
 * Arma las variantes (sin/con franquicia) según la regla de negocio de Auto
 * (ver sección 5 de PLAN_DESARROLLO.md). Otros ramos no tienen franquicia dual
 * todavía — devuelven siempre 1 variante sin franquicia hasta que se implementen.
 */
async function construirVariantes({ calculador, plan, ramo, datosValidados, usuario }) {
  // `moneda` solo existe hoy en el schema de Incendio (grupo 4) — el resto de los ramos cae al
  // default 'PYG' (mismo default que la columna `cotizaciones.moneda` de la migración 034).
  const moneda = datosValidados.moneda ?? 'PYG'

  const contexto = await resolverContextoRepositorios(
    ramo,
    plan,
    datosValidados.riesgo_datos,
    datosValidados.capital_asegurado,
    moneda
  )

  const { descuentos, forzadoPorPlan } = resolverDescuentos({
    plan,
    descuentosBody: datosValidados.descuentos,
    usuario,
  })

  const { prima, detalle, coberturas } = await calculador.calcularPrima({
    planId: plan.id,
    plan,
    capital: datosValidados.capital_asegurado,
    riesgoDatos: datosValidados.riesgo_datos,
    descuentos,
    forzadoPorPlan,
    recargos: datosValidados.recargos,
    usuario,
    moneda,
    ...contexto,
  })

  const formasPagoPlan = await ramosRepository.findFormasPagoDelPlan(plan.id)
  const cuotas = resolverCuotas(plan, datosValidados.cuotas)

  const tiposFranquicia = resolverTiposFranquicia(plan, datosValidados.riesgo_datos, prima)

  const variantes = tiposFranquicia.map(({ tipo, primaAjustada, franquiciaMonto }) => ({
    tipo_franquicia: tipo,
    prima: primaAjustada,
    franquicia_monto: franquiciaMonto,
    formasPago: formasPagoPlan.map((fp) => ({
      forma_pago_id: fp.forma_pago_id,
      codigo: fp.formas_pago.codigo,
      nombre_display: fp.formas_pago.nombre_display,
      cantidad_cuotas: cuotas,
      ...calculador.calcularPlanPago(
        primaAjustada,
        { codigo: fp.formas_pago.codigo, tasa_rpf: fp.tasa_rpf },
        cuotas
      ),
    })),
  }))

  return {
    prima,
    detalle,
    coberturas,
    variantes,
    moneda,
    // Solo no-null cuando resolverUmbralInspeccion tuvo que convertir (moneda de la cotización
    // distinta de `umbral_inspeccion_moneda`) — `crearCotizacion` lo usa para decidir si persiste
    // tipo_cambio_snapshot/_fuente/_fecha. `calcularPreview` nunca llega a leer este campo.
    tipoCambioUsado: contexto.umbralInspeccion?.tipoCambio ?? null,
  }
}

/**
 * Cantidad de cuotas a usar: la que eligió el agente, topada por `plan.cuotas_maximo` si viene
 * seteado, o `plan.cuotas_default` si el agente no eligió ninguna (compatibilidad con
 * cotizaciones ya guardadas, que no mandaban este campo).
 */
function resolverCuotas(plan, cuotasElegidas) {
  if (cuotasElegidas == null) return plan.cuotas_default
  if (plan.cuotas_maximo != null) return Math.min(cuotasElegidas, plan.cuotas_maximo)
  return cuotasElegidas
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
    const FRANQUICIA_BASE = 350000 // TODO: leer de franquicia_auto_importacion_directa
    return [{ tipo: 'con_franquicia', primaAjustada: primaBase, franquiciaMonto: FRANQUICIA_BASE }]
  }

  if (plan.cotizacion_combinada) {
    const primaConDescuento = primaBase * (1 - (plan.descuento_default ?? 0) / 100)
    const franquiciaMonto = primaConDescuento * ((plan.franquicia_porcentaje ?? 0) / 100)
    return [
      { tipo: 'sin_franquicia', primaAjustada: primaBase, franquiciaMonto: 0 },
      { tipo: 'con_franquicia', primaAjustada: primaConDescuento, franquiciaMonto },
    ]
  }

  return [{ tipo: 'sin_franquicia', primaAjustada: primaBase, franquiciaMonto: 0 }]
}
