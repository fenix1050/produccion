import { escapeHtml } from '../../shared/dom.js'
import { state } from '../state.js'

// Panel de la curva GLOBAL de R.P.F. por cuotas (migración 058, cambio `rpf-variable-mrc`)
// — standalone, arriba de la tabla de Planes (design.md Decisión 9): la curva es compartida
// por MRC/Incendio/Vida-AP, no por plan, así que vive fuera de la subfila "Formas de pago"
// de cada plan. Un solo <form> con las 33 celdas y un botón "Guardar" (bulk PUT, Decisión 7)
// en vez del patrón de edición inline per-celda del resto de la sección Planes.

// Orden fijo de columnas (izquierda a derecha) — mismo orden que Hoja4 de
// docs/insumos/Ajuste MC.xlsx: Cobrador, Aquí Pago (boca_cobranza), Tarjeta de Crédito.
const ORDEN_CODIGOS = ['cobrador', 'boca_cobranza', 'tarjeta_credito']
const CUOTAS_TOTALES = 11

export function renderRpfCuotas() {
  return `
    <div class="panel card">
      <div class="card__title">R.P.F. por cantidad de cuotas</div>
      <div class="card__body">
        <p class="empty-state__subtitle">
          Curva única compartida por MRC, Incendio y Vida y Accidentes Personales — Auto sigue
          usando la tasa fija por forma de pago (sección "Formas de pago" de cada plan).
        </p>
        ${renderCuerpoRpfCuotas()}
      </div>
    </div>
  `
}

function renderCuerpoRpfCuotas() {
  if (state.curvaRpf.loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando curva de R.P.F…</div>'
  }
  if (state.curvaRpf.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.curvaRpf.error)}</div>`
  }
  const datos = state.curvaRpf.datos
  if (!datos || !datos.length) {
    return '<div class="empty-state__subtitle">No hay curva de R.P.F. cargada todavía.</div>'
  }

  const columnas = ORDEN_CODIGOS.map((codigo) => {
    const fila = datos.find((f) => f.formas_pago?.codigo === codigo)
    return {
      codigo,
      forma_pago_id: fila?.forma_pago_id,
      nombreDisplay: fila?.formas_pago?.nombre_display ?? codigo,
    }
  }).filter((c) => c.forma_pago_id != null)

  const encabezados = columnas.map((c) => `<th>${escapeHtml(c.nombreDisplay)}</th>`).join('')

  const filas = []
  for (let cuotas = 1; cuotas <= CUOTAS_TOTALES; cuotas++) {
    const celdas = columnas
      .map((c) => {
        const fila = datos.find((f) => f.forma_pago_id === c.forma_pago_id && f.cuotas === cuotas)
        const valor = fila?.tasa_rpf ?? 0
        const nombre = `celda-${c.forma_pago_id}-${cuotas}`
        return `<td data-label="${escapeHtml(c.nombreDisplay)}">
          <input
            class="field-input field-input--sm"
            type="number"
            step="0.0001"
            min="0"
            name="${nombre}"
            data-forma-pago-id="${c.forma_pago_id}"
            data-cuotas="${cuotas}"
            value="${escapeHtml(String(valor))}"
            aria-label="R.P.F. ${escapeHtml(c.nombreDisplay)} a ${cuotas} cuotas"
          />
        </td>`
      })
      .join('')
    filas.push(`<tr><td data-label="Cuotas">${cuotas}</td>${celdas}</tr>`)
  }

  return `
    <form id="rpf-cuotas-form" data-form-action="rpf-cuotas">
      <div class="admin-table-scroll">
        <table class="admin-table">
          <thead>
            <tr><th>Cuotas</th>${encabezados}</tr>
          </thead>
          <tbody>${filas.join('')}</tbody>
        </table>
      </div>
      <button class="btn-outline" type="submit" ${state.curvaRpf.guardando ? 'disabled' : ''}>
        ${state.curvaRpf.guardando ? 'Guardando…' : 'Guardar curva'}
      </button>
    </form>
  `
}
