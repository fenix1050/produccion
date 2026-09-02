export function evaluarReadiness({ propuesta, carta, motivoIneligibilidad = null }) {
  const draft = propuesta?.draft_json ?? {}
  const asegurado = draft.partes?.asegurado ?? {}
  const plaFt = draft.pla_ft ?? {}
  const pendientes = []

  if (motivoIneligibilidad) pendientes.push(`carta:${motivoIneligibilidad}`)
  if (!propuesta?.cotizacion_variante_id || !propuesta?.cotizacion_plan_pago_id) {
    pendientes.push('seleccion_comercial')
  }
  if (!asegurado.tipo_persona) pendientes.push('asegurado.tipo_persona')
  if (!asegurado.nombre_razon_social) pendientes.push('asegurado.nombre_razon_social')
  if (!asegurado.documento) pendientes.push('asegurado.documento')
  if (!asegurado.direccion) pendientes.push('asegurado.direccion')
  if (!asegurado.telefono && !asegurado.email) pendientes.push('asegurado.contacto')
  if (!asegurado.actividad_economica) pendientes.push('asegurado.actividad_economica')
  if (typeof plaFt.es_pep !== 'boolean') pendientes.push('pla_ft.es_pep')
  if (plaFt.es_pep && (!plaFt.pep_institucion || !plaFt.pep_cargo)) {
    pendientes.push('pla_ft.detalle_pep')
  }
  if (typeof plaFt.sujeto_obligado !== 'boolean') pendientes.push('pla_ft.sujeto_obligado')
  if (!plaFt.origen_fondos_descripcion) pendientes.push('pla_ft.origen_fondos')

  return {
    informativo: true,
    listo: pendientes.length === 0,
    pendientes,
    emision_habilitada: false,
    mensaje_emision: 'La emisión de la Propuesta Formal estará disponible en PF-3.',
    carta_id: carta?.id ?? propuesta?.carta_oferta_id ?? null,
  }
}
