// Decisión pura (sin DOM) de qué botones renderizar por fila del listado de Propuestas
// Formales. Los 3 flags de autorización (puede_continuar/puede_descargar/puede_anular)
// ya vienen calculados por el backend (backend/src/services/propuestas/listado.service.js,
// espejando emision.service.js:10-16,128,141-145) — este módulo NUNCA los recalcula a
// partir de `fila.estado`: solo decide layout/labels/href a partir de esos flags, tal
// como exige la spec ("gated strictly by the flags returned by the backend").

const TITULO_DESCARGA_DESHABILITADA = 'No tenés permiso para descargar esta propuesta.'

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

  // A diferencia de Descargar PDF (que se muestra deshabilitado con tooltip), Anular
  // directamente no se renderiza si el usuario no puede usarlo — decisión de Kevin
  // (2026-09-18): "sería más sencillo" que un botón visible-pero-inerte.
  if (fila.puede_anular) {
    acciones.push({
      action: 'anular',
      label: 'Anular',
      enabled: true,
    })
  }

  acciones.push({
    action: 'ver-detalle',
    label: 'Ver detalle',
    enabled: true,
    ghost: true,
  })

  return acciones
}
