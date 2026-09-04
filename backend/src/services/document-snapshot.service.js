import { createHash } from 'node:crypto'

export const CARTA_SNAPSHOT_SCHEMA_VERSION = '2'

// This is an explicit deployment revision, not a source-content fingerprint. Runtime deployments
// do not reliably expose the exact template source bytes, so it MUST be bumped whenever any active
// Carta template, layout, or renderer behavior changes.
export const CARTA_OFERTA_RENDERER_REVISION = 'pf1-renderer-r2'
export const PROPUESTA_FORMAL_RENDERER_REVISION = 'pf3-mrc-renderer-r16'

export function canonicalStringify(value) {
  return JSON.stringify(normalize(value))
}

export function hashSnapshot(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex')
}

export function hashPdf(pdf) {
  return createHash('sha256').update(pdf).digest('hex')
}

export function buildCartaOfertaSnapshot({
  cotizacion,
  plan,
  ramo,
  planCoberturas,
  renderTimestamp = new Date().toISOString(),
  renderTimezone = 'America/Asuncion',
  renderLocale = 'es-PY',
}) {
  const fuente = buildCotizacionFuenteSnapshot(cotizacion, { plan, ramo, planCoberturas })
  const snapshot = {
    document_type: 'carta_oferta',
    product_code: ramo.calculador,
    renderer_identity: {
      policy: 'manual_source_revision',
      revision: CARTA_OFERTA_RENDERER_REVISION,
    },
    render_context: {
      timestamp: renderTimestamp,
      timezone: renderTimezone,
      locale: renderLocale,
    },
    cotizacion: {
      id: cotizacion.id,
      numero_cotizacion: cotizacion.numero_cotizacion,
      agente_id: cotizacion.agente_id,
      fecha: cotizacion.fecha,
      vigencia_dias: cotizacion.vigencia_dias,
      cliente_nombre: cotizacion.cliente_nombre,
      cliente_contacto: cotizacion.cliente_contacto,
      riesgo_datos: cotizacion.riesgo_datos,
      capital_asegurado: cotizacion.capital_asegurado,
      moneda: cotizacion.moneda,
      tipo_cambio_snapshot: cotizacion.tipo_cambio_snapshot,
      tipo_cambio_fuente: cotizacion.tipo_cambio_fuente,
      tipo_cambio_fecha: cotizacion.tipo_cambio_fecha,
      usuarios: fuente.usuario,
      cotizacion_coberturas: fuente.cotizacion_coberturas,
      cotizacion_servicios: fuente.cotizacion_servicios,
      cotizacion_clausulas: fuente.cotizacion_clausulas,
      cotizacion_variantes: fuente.cotizacion_variantes,
    },
    plan: fuente.plan,
    ramo: fuente.ramo,
    plan_coberturas: fuente.plan_coberturas,
  }

  const identitySnapshot = {
    ...snapshot,
    render_context: {
      timezone: snapshot.render_context.timezone,
      locale: snapshot.render_context.locale,
    },
  }

  return {
    snapshot,
    snapshotHash: hashSnapshot(identitySnapshot),
    schemaVersion: CARTA_SNAPSHOT_SCHEMA_VERSION,
    templateVersion: `${ramo.calculador}:manual-source-revision:${CARTA_OFERTA_RENDERER_REVISION}`,
    calculatorVersion: `${ramo.calculador}:1`,
  }
}

export function buildCotizacionFuenteSnapshot(cotizacion, { plan, ramo, planCoberturas } = {}) {
  return {
    plan_id: cotizacion.plan_id,
    agente_id: cotizacion.agente_id,
    fecha: cotizacion.fecha,
    vigencia_dias: cotizacion.vigencia_dias,
    cliente_nombre: cotizacion.cliente_nombre,
    cliente_contacto: cotizacion.cliente_contacto,
    riesgo_datos: cotizacion.riesgo_datos,
    capital_asegurado: cotizacion.capital_asegurado,
    moneda: cotizacion.moneda,
    tipo_cambio_snapshot: cotizacion.tipo_cambio_snapshot,
    tipo_cambio_fuente: cotizacion.tipo_cambio_fuente,
    tipo_cambio_fecha: cotizacion.tipo_cambio_fecha,
    usuario: buildUsuarioSnapshot(cotizacion.usuarios),
    plan: buildPlanSnapshot(plan),
    ramo: buildRamoSnapshot(ramo),
    plan_coberturas: buildPlanCoberturasSnapshot(planCoberturas),
    cotizacion_coberturas: [...(cotizacion.cotizacion_coberturas ?? [])]
      .sort((left, right) => left.id - right.id)
      .map((cobertura) => ({
        id: cobertura.id,
        cotizacion_id: cobertura.cotizacion_id,
        cobertura_id: cobertura.cobertura_id,
        nombre_snapshot: cobertura.nombre_snapshot,
        texto_legal_snapshot: cobertura.texto_legal_snapshot,
        texto_exclusiones_snapshot: cobertura.texto_exclusiones_snapshot,
        monto: cobertura.monto,
        franquicia: cobertura.franquicia,
        tipo_aplicacion: cobertura.tipo_aplicacion,
        incluida: cobertura.incluida,
        coberturas_catalogo: cobertura.coberturas_catalogo
          ? {
              codigo: cobertura.coberturas_catalogo.codigo,
              incluye_en_suma_asegurada_total:
                cobertura.coberturas_catalogo.incluye_en_suma_asegurada_total,
            }
          : null,
      })),
    cotizacion_servicios: [...(cotizacion.cotizacion_servicios ?? [])]
      .sort((left, right) => left.id - right.id)
      .map((servicio) => ({
        id: servicio.id,
        cotizacion_id: servicio.cotizacion_id,
        servicio_id: servicio.servicio_id,
        nombre_snapshot: servicio.nombre_snapshot,
        texto_legal_snapshot: servicio.texto_legal_snapshot,
        incluido: servicio.incluido,
      })),
    cotizacion_clausulas: [...(cotizacion.cotizacion_clausulas ?? [])]
      .sort((left, right) => left.id - right.id)
      .map((clausula) => ({
        id: clausula.id,
        cotizacion_id: clausula.cotizacion_id,
        clausula_id: clausula.clausula_id,
        texto_legal_snapshot: clausula.texto_legal_snapshot,
      })),
    cotizacion_variantes: [...(cotizacion.cotizacion_variantes ?? [])]
      .sort((left, right) => left.id - right.id)
      .map((variante) => ({
        id: variante.id,
        cotizacion_id: variante.cotizacion_id,
        numero_variante: variante.numero_variante,
        tipo_franquicia: variante.tipo_franquicia,
        franquicia_monto: variante.franquicia_monto,
        prima: variante.prima,
        cotizacion_plan_pago: [...(variante.cotizacion_plan_pago ?? [])]
          .sort((left, right) => left.id - right.id)
          .map((planPago) => ({
            id: planPago.id,
            variante_id: planPago.variante_id,
            forma_pago_id: planPago.forma_pago_id,
            cantidad_cuotas: planPago.cantidad_cuotas,
            rpf_porcentaje: planPago.rpf_porcentaje,
            rpf_monto: planPago.rpf_monto,
            iva_monto: planPago.iva_monto,
            premio_total: planPago.premio_total,
            monto_inicial: planPago.monto_inicial,
            monto_cuota: planPago.monto_cuota,
            formas_pago: planPago.formas_pago
              ? {
                  codigo: planPago.formas_pago.codigo,
                  nombre_display: planPago.formas_pago.nombre_display,
                }
              : null,
          })),
        cotizacion_ajustes: [...(variante.cotizacion_ajustes ?? [])]
          .sort((left, right) => left.id - right.id)
          .map((ajuste) => ({
            id: ajuste.id,
            variante_id: ajuste.variante_id,
            tipo: ajuste.tipo,
            catalogo_id: ajuste.catalogo_id,
            descripcion: ajuste.descripcion,
            porcentaje: ajuste.porcentaje,
            monto: ajuste.monto,
          })),
      })),
  }
}

export function buildCartaOfertaRenderInput(snapshot) {
  return {
    cotizacion: snapshot.cotizacion,
    plan: snapshot.plan,
    ramo: snapshot.ramo,
    planCoberturas: snapshot.plan_coberturas,
    renderContext: snapshot.render_context,
  }
}

export function buildPropuestaFormalSnapshot({ propuesta, carta, commercial, agente, textos }) {
  const textVersions = Object.fromEntries(
    textos.map((texto) => [
      texto.clave,
      {
        id: texto.id,
        version: texto.version,
        hash: hashSnapshot(texto.contenido),
        contenido: texto.contenido,
        motivo: texto.motivo,
        creado_por: texto.creado_por,
        creado_at: texto.creado_at,
        publicado_at: texto.publicado_at,
        origen: texto.origen,
      },
    ])
  )
  const snapshot = {
    document_type: 'propuesta_formal',
    product_code: 'mrc',
    renderer_identity: {
      policy: 'manual_source_revision',
      revision: PROPUESTA_FORMAL_RENDERER_REVISION,
    },
    proposal: {
      id: propuesta.id,
      numero_propuesta: propuesta.numero_propuesta,
      emitida_at: new Date().toISOString(),
      agente: { id: agente.id, nombre: agente.nombre, matricula: agente.matricula_agente ?? null },
    },
    carta: {
      id: carta.id,
      numero_carta: carta.numero_carta,
      version: carta.version,
      render_context: carta.snapshot_json?.render_context,
      riesgo_datos: carta.snapshot_json?.cotizacion?.riesgo_datos ?? {},
      coberturas: carta.snapshot_json?.cotizacion?.cotizacion_coberturas ?? [],
    },
    commercial,
    draft: propuesta.draft_json,
    texts: textVersions,
  }
  return {
    snapshot,
    snapshotHash: hashSnapshot(snapshot),
    schemaVersion: '1',
    templateVersion: `mrc:manual-source-revision:${PROPUESTA_FORMAL_RENDERER_REVISION}`,
    textVersions,
  }
}

function buildUsuarioSnapshot(usuario) {
  if (!usuario) return null
  return {
    nombre: usuario.nombre,
    email: usuario.email,
    telefono: usuario.telefono,
    roles: usuario.roles ? { nombre: usuario.roles.nombre } : null,
  }
}

function buildPlanSnapshot(plan) {
  if (!plan) return null
  return { id: plan.id, nombre: plan.nombre }
}

function buildRamoSnapshot(ramo) {
  if (!ramo) return null
  return {
    id: ramo.id,
    nombre: ramo.nombre,
    nombre_display: ramo.nombre_display,
    calculador: ramo.calculador,
  }
}

function buildPlanCoberturasSnapshot(planCoberturas) {
  return [...(planCoberturas ?? [])]
    .sort((left, right) => left.id - right.id)
    .map((planCobertura) => ({
      id: planCobertura.id,
      plan_id: planCobertura.plan_id,
      cobertura_id: planCobertura.cobertura_id,
      monto: planCobertura.monto,
      incluida_por_defecto: planCobertura.incluida_por_defecto,
      coberturas_catalogo: planCobertura.coberturas_catalogo
        ? {
            codigo: planCobertura.coberturas_catalogo.codigo,
            incluye_en_suma_asegurada_total:
              planCobertura.coberturas_catalogo.incluye_en_suma_asegurada_total,
          }
        : null,
    }))
}

function normalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Snapshots cannot contain non-finite numbers')
    return value
  }
  if (Array.isArray(value)) return value.map(normalize)
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, normalize(value[key])])
    )
  }
  throw new TypeError(`Unsupported snapshot value type: ${typeof value}`)
}
