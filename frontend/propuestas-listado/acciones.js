// Decisión pura (sin DOM) de qué botones renderizar por fila del listado de Propuestas
// Formales. Los 3 flags de autorización (puede_continuar/puede_descargar/puede_anular)
// ya vienen calculados por el backend (backend/src/services/propuestas/listado.service.js,
// espejando emision.service.js:10-16,128,141-145) — este módulo NUNCA los recalcula a
// partir de `fila.estado`: solo decide layout/labels/href a partir de esos flags, tal
// como exige la spec ("gated strictly by the flags returned by the backend").

const TITULO_DESCARGA_DESHABILITADA = 'No tenés permiso para descargar esta propuesta.'
const TITULO_ANULAR_DESHABILITADO = 'No tenés permiso para anular propuestas.'

/**
 * @param {object} fila - una fila de `GET /propuestas` (incluye los flags del backend).
 * @returns {Array<{action: string, label: string, enabled: boolean, href?: string, disabledTitle?: string, ghost?: boolean}>}
 */
export function accionesDeFila(fila) {
  const acciones = []

  if (fila.puede_continuar) {
    acciones.push({
      action: 'continuar',
      label: 'Continuar',
      enabled: true,
      href: `../propuestas/?propuesta=${fila.id}`,
    })
  }

  acciones.push({
    action: 'descargar',
    label: 'Descargar PDF',
    enabled: Boolean(fila.puede_descargar),
    disabledTitle: TITULO_DESCARGA_DESHABILITADA,
  })

  acciones.push({
    action: 'anular',
    label: 'Anular',
    enabled: Boolean(fila.puede_anular),
    disabledTitle: TITULO_ANULAR_DESHABILITADO,
  })

  acciones.push({
    action: 'ver-detalle',
    label: 'Ver detalle',
    enabled: true,
    ghost: true,
  })

  return acciones
}
