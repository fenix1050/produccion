import { escapeHtml } from '../../shared/dom.js'
import { state } from '../state.js'

// Render de la sección "Textos de Propuesta Formal" — publica/versiona los textos
// legales de MRC (declaraciones, condiciones, cláusula de cobranzas, etc.) que el PDF
// de la Propuesta Formal imprime y que la emisión exige tener publicados.

export function renderTextosPropuesta() {
  return `
    <div class="panel card">
      <div class="card__title"><span>Textos publicados</span></div>
      <div class="card__body">
        <p class="empty-state__subtitle">Estos son los textos legales que se imprimen en el PDF de la Propuesta Formal (MRC). Publicar una nueva versión reemplaza la vigente para esa clave — la anterior queda en el historial, no se pierde.</p>
        ${renderTablaTextos()}
      </div>
    </div>
    <div class="panel card">
      <div class="card__title"><span>Publicar nueva versión</span></div>
      <div class="card__body">
        ${renderFormularioTexto()}
      </div>
    </div>
  `
}

function renderTablaTextos() {
  const { loading, error, datos, faltantes } = state.textosPropuesta
  if (loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando textos…</div>'
  }
  if (error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(error)}</div>`
  }

  const alertaFaltantes = faltantes.length
    ? `<div class="admin-banner admin-banner--error">Faltan publicar: ${faltantes.map((clave) => escapeHtml(clave)).join(', ')} — sin esto no se puede emitir ninguna Propuesta Formal.</div>`
    : ''

  const filas = datos
    .map(
      (texto) => `
    <tr>
      <td data-label="Clave">${escapeHtml(texto.clave)}</td>
      <td data-label="Versión">${escapeHtml(texto.version)}</td>
      <td data-label="Motivo">${escapeHtml(texto.motivo)}</td>
      <td data-label="Publicado">${texto.publicado_at ? escapeHtml(new Date(texto.publicado_at).toLocaleString('es-PY')) : '—'}</td>
    </tr>
  `
    )
    .join('')

  return `
    ${alertaFaltantes}
    <table class="admin-table">
      <thead><tr><th>Clave</th><th>Versión</th><th>Motivo</th><th>Publicado</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="4" data-label="">Todavía no hay textos publicados.</td></tr>'}</tbody>
    </table>
  `
}

function renderFormularioTexto() {
  const { guardando } = state.textosPropuesta
  return `<form id="textos-propuesta-form">
    <div class="admin-modal__field">
      <label for="textos-propuesta-clave">Clave</label>
      <input class="field-input" id="textos-propuesta-clave" name="clave" required maxlength="80" placeholder="Ej.: declaraciones_generales" />
    </div>
    <div class="admin-modal__field">
      <label for="textos-propuesta-motivo">Motivo de publicación</label>
      <input class="field-input" id="textos-propuesta-motivo" name="motivo" required minlength="3" maxlength="500" placeholder="Ej.: corrección de typo" />
    </div>
    <div class="admin-modal__field">
      <label for="textos-propuesta-contenido">Texto aprobado</label>
      <textarea class="field-input" id="textos-propuesta-contenido" name="contenido" required rows="8"></textarea>
    </div>
    <button type="submit" class="btn-primary" ${guardando ? 'disabled' : ''}>${guardando ? 'Publicando…' : 'Publicar versión'}</button>
  </form>`
}
