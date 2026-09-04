export function evaluarReadiness({ propuesta, carta, motivoIneligibilidad = null }) {
  const draft = propuesta?.draft_json ?? {}
  const asegurado = draft.partes?.asegurado ?? {}
  const pendientes = []

  if (motivoIneligibilidad) pendientes.push(`carta:${motivoIneligibilidad}`)
  if (!propuesta?.cotizacion_variante_id || !propuesta?.cotizacion_plan_pago_id) {
    pendientes.push('seleccion_comercial')
  }
  if (!asegurado.tipo_persona) pendientes.push('asegurado.tipo_persona')
  if (!asegurado.nombre_razon_social) pendientes.push('asegurado.nombre_razon_social')
  if (!asegurado.documento) pendientes.push('asegurado.documento')
  if (!asegurado.direccion) pendientes.push('asegurado.direccion')
  if (!asegurado.ciudad) pendientes.push('asegurado.ciudad')
  if (!asegurado.telefono) pendientes.push('asegurado.telefono')
  if (!asegurado.email) pendientes.push('asegurado.email')
  if (!asegurado.actividad_economica) pendientes.push('asegurado.actividad_economica')
  if (asegurado.tipo_persona === 'fisica') {
    for (const field of ['fecha_nacimiento', 'nacionalidad', 'estado_civil', 'ocupacion']) {
      if (!asegurado[field]) pendientes.push(`asegurado.${field}`)
    }
  }
  if (asegurado.tipo_persona === 'juridica') {
    for (const field of ['nombre', 'documento', 'cargo']) {
      if (!draft.partes?.representante_legal?.[field]) {
        pendientes.push(`representante_legal.${field}`)
      }
    }
  }
  if (draft.partes?.tomador_igual_asegurado === false) {
    for (const field of [
      'nombre_razon_social',
      'documento',
      'direccion',
      'ciudad',
      'telefono',
      'email',
    ]) {
      if (!draft.partes?.tomador?.[field]) pendientes.push(`tomador.${field}`)
    }
    if (draft.partes?.tomador?.documento === asegurado.documento) {
      pendientes.push('tomador.identidad_distinta')
    }
  }
  if (!draft.tipo_firma) pendientes.push('tipo_firma')

  return {
    informativo: false,
    listo: pendientes.length === 0,
    pendientes,
    emision_habilitada: pendientes.length === 0,
    mensaje_emision: pendientes.length
      ? 'Complete the required data before issuing the Formal Proposal.'
      : 'The proposal is ready to issue.',
    carta_id: carta?.id ?? propuesta?.carta_oferta_id ?? null,
  }
}

export function asegurarReadinessEmision({ propuesta, carta, motivoIneligibilidad, textos }) {
  const readiness = evaluarReadiness({ propuesta, carta, motivoIneligibilidad })
  if (!readiness.listo) return { readiness, error: 'PF_DATOS_INCOMPLETOS' }
  if (!textos.length) return { readiness, error: 'PF_TEXTOS_NO_PUBLICADOS' }
  const clavesPublicadas = new Set(textos.map((texto) => texto.clave))
  const textosFaltantes = MRC_REQUIRED_TEXT_KEYS.filter((clave) => !clavesPublicadas.has(clave))
  if (textosFaltantes.length) {
    return { readiness, error: 'PF_TEXTOS_INCOMPLETOS', textosFaltantes }
  }
  return { readiness, error: null }
}
export const MRC_REQUIRED_TEXT_KEYS = [
  'coberturas_principales',
  'declaraciones_generales',
  'declaracion_jurada_origen_fondos',
  'autorizaciones_tomador_poliza_digital',
  'condiciones_mrc',
  'clausula_adicional_cobranzas',
]
