import { getCalculador } from '../calculators/index.js'
import * as coberturasRepository from '../repositories/coberturas.repository.js'
import * as cotizacionesRepository from '../repositories/cotizaciones.repository.js'
import * as ramosRepository from '../repositories/ramos.repository.js'
import { getSchemaCotizar } from '../schemas/index.js'
import { httpError } from '../utils/http-error.js'

import { withCache } from './cache.js'
import { verificarPropiedad } from './cotizacion-authorization.service.js'
import { renderOfertaPdf } from './pdf.service.js'
import { resolverUmbralInspeccion } from './umbral-inspeccion.service.js'

export { verificarPropiedad } from './cotizacion-authorization.service.js'
export { resolverUmbralInspeccion } from './umbral-inspeccion.service.js'

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

  const { coberturas, variantes } = await armarPayloadDetalle({
    ramoId: ramo.id,
    variantesCalculadas,
  })

  // Un único RPC atómico (migración 052, `crear_cotizacion_atomica`) hace, en una sola
  // transacción de Postgres: reservar el correlativo de la cabecera, insertar `cotizaciones` y
  // delegar coberturas/variantes/ajustes/plan de pago al helper compartido — un fallo en
  // cualquier paso hace rollback de TODO, incluido el incremento del correlativo. Ya no hace
  // falta ninguna compensación manual del lado de JS (ver spec.md — "Manual DELETE compensation
  // removed"): si el RPC falla, se re-lanza el error tal cual.
  const cotizacionId = await cotizacionesRepository.crearCotizacionAtomica({
    p_prefijo_numero: ramo.nombre.toUpperCase(),
    p_ramo_id: ramo.id,
    p_cotizacion: {
      plan_id: plan.id,
      agente_id: usuario.id,
      cliente_nombre: body.cliente_nombre,
      cliente_contacto: body.cliente_contacto,
      riesgo_datos: datosValidados.riesgo_datos,
      capital_asegurado: datosValidados.capital_asegurado,
      estado: 'cotizada',
      moneda: variantesCalculadas.moneda,
      // Snapshot de tipo de cambio SOLO cuando la cotización realmente necesitó convertir (ver
      // resolverUmbralInspeccion) — `calcularPreview` nunca llega acá, así que el preview nunca
      // persiste snapshot (migración 034: columnas nullable, ausentes acá = NULL = "no hubo
      // conversión", ver `crear_cotizacion_atomica`).
      ...(variantesCalculadas.tipoCambioUsado
        ? {
            tipo_cambio_snapshot: variantesCalculadas.tipoCambioUsado.venta,
            tipo_cambio_fuente: variantesCalculadas.tipoCambioUsado.fuente,
            tipo_cambio_fecha: variantesCalculadas.tipoCambioUsado.obtenido_en,
          }
        : {}),
    },
    p_coberturas: coberturas,
    p_variantes: variantes,
  })

  return cotizacionesRepository.findCotizacionById(cotizacionId)
}

export async function listarCotizaciones(query, usuario) {
  return cotizacionesRepository.findCotizaciones({
    ramoId: query.ramo_id,
    estado: query.estado,
    cliente: query.cliente,
    fechaDesde: query.fecha_desde,
    fechaHasta: query.fecha_hasta,
    limit: query.limit,
    offset: query.offset,
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
  // Las 3 queries siguientes solo dependen de `cotizacion` (ya resuelta arriba), no entre sí —
  // se piden en paralelo en vez de 3 awaits secuenciales.
  const [plan, ramo, planCoberturas] = await Promise.all([
    ramosRepository.findPlanById(cotizacion.plan_id),
    // Sin filtro de `activo`: la cotización ya existe (se creó cuando el ramo estaba activo),
    // así que generar su PDF no debe fallar solo porque el ramo se dio de baja después.
    ramosRepository.findRamoById(cotizacion.ramo_id),
    // Catálogo VIGENTE del plan (montos/incluida_por_defecto actuales) — necesario para que los
    // sub-límites fijos de la Carta Oferta (ej. MRC) reflejen cambios del admin, en vez de quedar
    // hardcodeados con el valor de cuando se cargó la migración original.
    ramosRepository.findCoberturasByPlanId(cotizacion.plan_id),
  ])
  const t2 = Date.now()

  const pdf = await renderOfertaPdf({ cotizacion, plan, ramo, planCoberturas })
  const t3 = Date.now()

  console.log(
    `[perf-oferta] findCotizacionById=${t1 - t0}ms plan+ramo+coberturas(paralelo)=${t2 - t1}ms renderOfertaPdf=${t3 - t2}ms total=${t3 - t0}ms`
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

  const { coberturas, variantes } = await armarPayloadDetalle({
    ramoId: ramo.id,
    variantesCalculadas,
  })

  // Un único RPC atómico (migración 052, `actualizar_cotizacion_atomica`) bloquea la cabecera
  // (`FOR UPDATE`), borra el detalle viejo por `cotizacion_id`, actualiza los campos editables y
  // reinserta el detalle nuevo — todo en una sola transacción de Postgres. Ya no hace falta el
  // truco "insertar antes de borrar por IDs capturados": eso solo existía para sobrevivir una
  // falla no-transaccional del cliente PostgREST (ver design.md Decision #7).
  const cotizacionId = await cotizacionesRepository.actualizarCotizacionAtomica({
    p_cotizacion_id: id,
    p_cotizacion: {
      cliente_nombre: body.cliente_nombre,
      cliente_contacto: body.cliente_contacto,
      riesgo_datos: datosValidados.riesgo_datos,
      capital_asegurado: datosValidados.capital_asegurado,
      plan_id: plan.id,
      estado: 'cotizada',
      moneda: variantesCalculadas.moneda,
      // Mismo criterio que crearCotizacion: solo se pisa el snapshot si ESTA edición volvió a
      // necesitar conversión — si no, el RPC preserva el `tipo_cambio_snapshot` existente (la
      // clave simplemente no viaja en el payload).
      ...(variantesCalculadas.tipoCambioUsado
        ? {
            tipo_cambio_snapshot: variantesCalculadas.tipoCambioUsado.venta,
            tipo_cambio_fuente: variantesCalculadas.tipoCambioUsado.fuente,
            tipo_cambio_fecha: variantesCalculadas.tipoCambioUsado.obtenido_en,
          }
        : {}),
    },
    p_coberturas: coberturas,
    p_variantes: variantes,
  })

  return cotizacionesRepository.findCotizacionById(cotizacionId)
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
 * Arma el `p_coberturas`/`p_variantes` JSONB que espera el RPC atómico (migración 052) a partir
 * del resultado del calculador — pura lógica de shape, SIN escrituras a la base: el único `await`
 * que queda es una lectura de catálogo (necesaria para resolver `cobertura_id`/textos legales
 * snapshot), no un insert. Reemplaza `insertarCoberturasYVariantes` (que hacía los INSERTs
 * secuenciales uno por uno) ahora que `_insertar_detalle_cotizacion` (mismo shape de columnas)
 * corre del lado de Postgres dentro de `crear_cotizacion_atomica`/`actualizar_cotizacion_atomica`.
 */
async function armarPayloadDetalle({ ramoId, variantesCalculadas }) {
  // Detalle de coberturas mostrado en "Detalle del plan" (hoy solo lo arma mrc.calculator.js —
  // Incendio/Vida-AP todavía no devuelven `coberturas`, de ahí el guard). Snapshot de
  // nombre/texto legal/exclusiones para que quede congelado aunque después cambie el catálogo
  // (mismo criterio que cotizacion_clausulas/cotizacion_servicios).
  let coberturas = []
  if (variantesCalculadas.coberturas?.length) {
    const catalogoRamo = await coberturasRepository.findCoberturasCatalogoByRamoId(ramoId)
    const catalogoPorCodigo = new Map(catalogoRamo.map((c) => [c.codigo, c]))

    coberturas = variantesCalculadas.coberturas.map((cobertura) => {
      const catalogoRow = catalogoPorCodigo.get(cobertura.codigo)
      return {
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
  }

  // El `numero_variante` (correlativo por variante) ya NO se pide acá — el RPC lo reserva
  // internamente por variante vía `siguiente_correlativo` dentro de la misma transacción.
  const variantes = variantesCalculadas.variantes.map((variante) => {
    // Descuento/recargo manual del agente (mrc/incendio hoy — ver sumarAjustes en esos
    // calculadores) — se guarda el total ya topado por plan.descuento_maximo/recargo_maximo,
    // no el body crudo, para que la Carta Oferta muestre lo que efectivamente se aplicó.
    const ajustes = []
    if (variantesCalculadas.detalle?.total_descuentos > 0) {
      ajustes.push({
        tipo: 'descuento',
        descripcion: 'Descuento aplicado por el agente',
        monto: variantesCalculadas.detalle.total_descuentos,
      })
    }
    if (variantesCalculadas.detalle?.total_recargos > 0) {
      ajustes.push({
        tipo: 'recargo',
        descripcion: 'Recargo aplicado por el agente',
        monto: variantesCalculadas.detalle.total_recargos,
      })
    }

    return {
      tipo_franquicia: variante.tipo_franquicia,
      franquicia_monto: variante.franquicia_monto,
      prima: variante.prima,
      ajustes,
      planes_pago: variante.formasPago.map((fp) => ({
        forma_pago_id: fp.forma_pago_id,
        cantidad_cuotas: fp.cantidad_cuotas,
        rpf_porcentaje: fp.rpf_porcentaje,
        rpf_monto: fp.rpf,
        iva_monto: fp.iva,
        premio_total: fp.premio,
        monto_inicial: fp.inicial,
        monto_cuota: fp.cuota,
      })),
    }
  })

  return { coberturas, variantes }
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
 * Resuelve la tasa de R.P.F. a usar para UNA forma de pago de plan, ANTES de invocar
 * `calculador.calcularPlanPago()` (cambio SDD `rpf-variable-mrc`, ver design.md — Data Flow).
 * `calcularPlanPago` no se toca: sigue recibiendo `{ codigo, tasa_rpf }`, solo cambia de dónde
 * sale ese número.
 *
 * - `contado` siempre 0 (mismo bypass que ya aplica `calcularPlanPago`, pero explícito acá para
 *   no tocar la curva ni el escalar sin necesidad).
 * - Ramo SIN `usa_rpf_por_cuotas`: devuelve el escalar legacy `formaPagoPlan.tasa_rpf` sin
 *   tocar la curva — Auto queda byte-idéntico.
 * - Ramo CON el flag y `cuotas` falsy (0/null): resuelve a 0 por regla de negocio (design.md
 *   Decisión 4 — cambio de comportamiento real y deliberado frente al escalar, que hoy cobra
 *   el RPF plano aunque `cuotas` sea 0).
 * - Ramo CON el flag y `cuotas` dentro de la curva: valor de `rpf_cuotas` para
 *   `(forma_pago.codigo, cuotas)`.
 * - Ramo CON el flag y `cuotas` fuera de rango: `httpError(422)` explícito, sin clamp
 *   (design.md Decisión 5 / Engram #391).
 *
 * Función pura, exportada para test directo sin mockear repositories.
 *
 * @param {object} params
 * @param {object} params.ramo
 * @param {{tasa_rpf: number, formas_pago: {codigo: string}}} params.formaPagoPlan
 * @param {Array<{cuotas: number, tasa_rpf: number, formas_pago: {codigo: string}}>|null} params.curva
 * @param {number} params.cuotas
 * @returns {number}
 */
export function resolverTasaRpf({ ramo, formaPagoPlan, curva, cuotas }) {
  const codigo = formaPagoPlan.formas_pago.codigo

  if (codigo === 'contado') return 0
  if (!ramo.usa_rpf_por_cuotas) return formaPagoPlan.tasa_rpf
  if (!cuotas) return 0

  const fila = curva?.find((c) => c.formas_pago.codigo === codigo && c.cuotas === cuotas)
  if (!fila) {
    const mensaje = `No existe tasa de R.P.F. para ${cuotas} cuotas (forma de pago '${codigo}').`
    throw httpError(422, mensaje, mensaje)
  }

  return fila.tasa_rpf
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

  // Solo se pide la curva (cacheada, cambia únicamente desde el admin) para los ramos
  // flagueados (MRC/Incendio/Vida-AP) — Auto y el resto ni la tocan, `resolverTasaRpf` cae
  // directo al escalar legacy sin este `await` de más.
  const curvaRpf = ramo.usa_rpf_por_cuotas
    ? await withCache('rpfCuotas', () => ramosRepository.findCurvaRpf())
    : null

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
        {
          codigo: fp.formas_pago.codigo,
          tasa_rpf: resolverTasaRpf({ ramo, formaPagoPlan: fp, curva: curvaRpf, cuotas }),
        },
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
