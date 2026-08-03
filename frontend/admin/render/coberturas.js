import { escapeHtml } from '../../shared/dom.js'
import { fmtGsConPrefijo as fmtGs } from '../../shared/format.js'
import { state } from '../state.js'
import { renderCampoInline } from './campos-inline.js'

// Render de la sección "Coberturas por plan" — extraído de admin.js (WU
// admin-module-split, PR7).

export function renderCoberturas() {
  const opcionesRamo = state.ramos
    .map(
      (r) => `
    <option value="${r.id}" ${String(state.ramoCoberturasSeleccionado) === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `
    )
    .join('')

  const planesEntry = state.ramoCoberturasSeleccionado
    ? state.planesPorRamoCob[state.ramoCoberturasSeleccionado]
    : null
  const opcionesPlan = (planesEntry?.datos ?? [])
    .map(
      (p) => `
    <option value="${p.id}" ${String(state.planCoberturasSeleccionado) === String(p.id) ? 'selected' : ''}>${escapeHtml(p.nombre)}</option>
  `
    )
    .join('')

  return `
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Coberturas por plan</span>
        <div class="card__title__actions">
          <select class="field-input" style="width: auto;" data-action="seleccionar-ramo-coberturas" aria-label="Elegí un ramo">
            <option value="">Elegí un ramo…</option>
            ${opcionesRamo}
          </select>
          ${
            state.ramoCoberturasSeleccionado
              ? `
            <select class="field-input" style="width: auto;" data-action="seleccionar-plan-coberturas" aria-label="Elegí un plan">
              <option value="">Elegí un plan…</option>
              ${opcionesPlan}
            </select>
          `
              : ''
          }
          ${state.planCoberturasSeleccionado ? '<button class="btn-primary btn-primary--sm" data-action="agregar-cobertura">+ Agregar cobertura</button>' : ''}
        </div>
      </div>
      <div class="card__body">
        ${renderTablaCoberturasPlan()}
      </div>
    </div>
  `
}

function renderTablaCoberturasPlan() {
  if (!state.ramoCoberturasSeleccionado) {
    return '<div class="empty-state__subtitle">Elegí un ramo para ver sus planes.</div>'
  }
  const planesEntry = state.planesPorRamoCob[state.ramoCoberturasSeleccionado]
  if (!planesEntry || planesEntry.loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando planes…</div>'
  }
  if (planesEntry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(planesEntry.error)}</div>`
  }
  if (!state.planCoberturasSeleccionado) {
    return '<div class="empty-state__subtitle">Elegí un plan para ver sus coberturas.</div>'
  }

  const entry = state.coberturasDelPlan[state.planCoberturasSeleccionado]
  if (!entry || entry.loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando coberturas…</div>'
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`
  }
  if (!entry.datos.length) {
    return '<div class="empty-state__subtitle">Este plan todavía no tiene coberturas cargadas.</div>'
  }

  const planId = state.planCoberturasSeleccionado
  const filas = entry.datos
    .map(
      (c) => `
    <tr>
      <td data-label="Cobertura">${escapeHtml(c.coberturas_catalogo?.nombre ?? '—')}</td>
      <td data-label="Categoría">${escapeHtml(c.coberturas_catalogo?.categoria ?? '—')}</td>
      <td data-label="Por defecto">
        <label class="admin-modal__checkbox">
          <input type="checkbox" data-action="toggle-cobertura-defecto" data-id="${c.id}" data-plan-id="${planId}" ${c.incluida_por_defecto ? 'checked' : ''} />
          ${c.incluida_por_defecto ? 'Por defecto' : 'Opcional'}
        </label>
      </td>
      <td colspan="2" data-label="Monto / Franquicia">${renderCamposMontoFranquicia(c, planId)}</td>
      <td data-label="Acciones">
        <button class="btn-outline" data-action="eliminar-cobertura-plan" data-id="${c.id}" data-plan-id="${planId}">Quitar</button>
      </td>
    </tr>
  `
    )
    .join('')

  return `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Cobertura</th>
            <th>Categoría</th>
            <th>Por defecto</th>
            <th colspan="2">Monto / Franquicia</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}

function renderCamposMontoFranquicia(planCobertura, planId) {
  return renderCampoInline({
    editando: state.coberturaEnEdicion.has(planCobertura.id),
    id: planCobertura.id,
    planId,
    formAction: 'monto-franquicia',
    accionEditar: 'editar-cobertura-plan',
    accionCancelar: 'cancelar-cobertura-plan',
    lectura: `<span>${planCobertura.monto != null ? escapeHtml(fmtGs(planCobertura.monto)) : '—'} / ${planCobertura.franquicia != null ? escapeHtml(fmtGs(planCobertura.franquicia)) : '—'}</span>`,
    campos: [
      {
        tipo: 'number',
        name: 'monto',
        step: '0.01',
        placeholder: 'Monto',
        value: planCobertura.monto,
        autofocus: true,
      },
      {
        tipo: 'number',
        name: 'franquicia',
        step: '0.01',
        placeholder: 'Franquicia',
        value: planCobertura.franquicia,
      },
    ],
  })
}

export function renderModalCobertura() {
  const m = state.modalCobertura
  const catalogo = state.catalogoPorRamo[state.ramoCoberturasSeleccionado] ?? []
  const yaAgregadas = new Set(
    (state.coberturasDelPlan[state.planCoberturasSeleccionado]?.datos ?? []).map(
      (c) => c.cobertura_id
    )
  )
  const opcionesCobertura = catalogo
    .filter((c) => !yaAgregadas.has(c.id))
    .map(
      (c) => `
      <option value="${c.id}" ${String(m.cobertura_id) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>
    `
    )
    .join('')

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-cobertura-backdrop">
      <div class="admin-modal" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="admin-modal-cobertura-title">
        <div class="admin-modal__title" id="admin-modal-cobertura-title">Agregar cobertura al plan</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-cobertura-form">
          <div class="admin-modal__field">
            <label for="admin-modal-cobertura-select">Cobertura</label>
            <select class="field-input" id="admin-modal-cobertura-select" name="cobertura_id">
              <option value="">Elegí una cobertura…</option>
              ${opcionesCobertura}
            </select>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="incluida_por_defecto" ${m.incluida_por_defecto ? 'checked' : ''} />
              Incluida por defecto
            </label>
          </div>
          <div class="admin-modal__field">
            <label for="admin-modal-cobertura-monto">Monto (opcional)</label>
            <input class="field-input" id="admin-modal-cobertura-monto" type="number" step="0.01" name="monto" value="${escapeHtml(m.monto)}" />
          </div>
          <div class="admin-modal__field">
            <label for="admin-modal-cobertura-franquicia">Franquicia (opcional)</label>
            <input class="field-input" id="admin-modal-cobertura-franquicia" type="number" step="0.01" name="franquicia" value="${escapeHtml(m.franquicia)}" />
          </div>
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal-cobertura">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `
}
