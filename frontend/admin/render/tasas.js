import { auth } from '../../shared/api.js'
import { crearBadge } from '../../shared/badge.js'
import { escapeHtml } from '../../shared/dom.js'
import { state } from '../state.js'
import { renderCampoInline } from './campos-inline.js'

// Render de la sección Tasas (tasas por cobertura + tasas por Tipo de Riesgo para
// MRC/Incendio) — extraído de admin.js (WU admin-module-split, PR6).

// rubros_actividad se muestra solo cuando el ramo seleccionado es uno de los que la
// usan (nombre = slug, no nombre_display); evita mostrarla para Vida/AP u otros ramos
// que no la usan. Exportada porque admin.js también la usa fuera del render (para
// decidir si hay que refetchear rubrosActividad al cambiar de ramo) — misma función,
// no duplicarla.
export function ramoUsaRubrosActividad(ramoId) {
  const ramo = state.ramos.find((r) => String(r.id) === String(ramoId))
  return ramo?.nombre === 'mrc' || ramo?.nombre === 'incendio'
}

export function renderTasas() {
  const puedeEditar = Boolean(auth.getUsuario()?.puede_editar_tasas)
  const opcionesRamo = state.ramos
    .map(
      (r) => `
    <option value="${r.id}" ${String(state.ramoTasasSeleccionado) === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `
    )
    .join('')

  return `
    ${!puedeEditar ? '<div class="admin-banner admin-banner--error">Tu usuario no tiene permiso para editar tasas — podés ver el historial, pero no cargar versiones nuevas.</div>' : ''}
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Tasas</span>
        <div class="card__title__actions">
          <select class="field-input" style="width: auto;" data-action="seleccionar-ramo-tasas" aria-label="Elegí un ramo">
            <option value="">Elegí un ramo…</option>
            ${opcionesRamo}
          </select>
          ${puedeEditar && state.ramoTasasSeleccionado ? '<button class="btn-primary btn-primary--sm" data-action="crear-tasa">+ Nueva versión de tasa</button>' : ''}
        </div>
      </div>
      <div class="card__body">
        ${renderTablaTasas()}
      </div>
    </div>
    ${
      ramoUsaRubrosActividad(state.ramoTasasSeleccionado)
        ? `
      <div class="panel card">
        <div class="card__title">Tasas por Tipo de Riesgo</div>
        <div class="card__body">
          ${renderTablaRubrosActividad()}
        </div>
      </div>
    `
        : ''
    }
  `
}

function renderTablaRubrosActividad() {
  const entry = state.rubrosActividad
  if (entry.loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando tipos de riesgo…</div>'
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`
  }
  if (!entry.datos?.length) {
    return '<div class="empty-state__subtitle">Todavía no hay tipos de riesgo cargados.</div>'
  }

  const filas = entry.datos
    .map(
      (r) => `
    <tr>
      <td data-label="Tipo de Riesgo">${escapeHtml(r.nombre)}</td>
      <td colspan="3" data-label="Categoría / Tasa Edificio-Contenido (‰)">${renderCamposTasaEdificioContenido(r)}</td>
    </tr>
  `
    )
    .join('')

  return `
    <div class="admin-table-scroll">
      <table class="admin-table admin-table--nested">
        <thead>
          <tr>
            <th>Tipo de Riesgo</th>
            <th>Categoría</th>
            <th colspan="2">Tasa Edificio / Contenido (‰)</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}

const CATEGORIAS_RUBRO_ACTIVIDAD = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map(
  (letra) => `CATEGORIA ${letra}`
)

function renderCamposTasaEdificioContenido(rubro) {
  const puedeEditar = Boolean(auth.getUsuario()?.puede_editar_tasas)

  return renderCampoInline({
    editando: state.rubroActividadEnEdicion.has(rubro.id),
    id: rubro.id,
    formAction: 'rubro-actividad-tasas',
    accionEditar: 'editar-tasa-edificio-contenido',
    accionCancelar: 'cancelar-tasa-edificio-contenido',
    puedeEditar,
    lectura: `
        <span>${escapeHtml(rubro.categoria ?? '—')}</span>
        <span>${rubro.tasa_edificio != null ? escapeHtml(String(rubro.tasa_edificio)) : '—'} / ${rubro.tasa_contenido != null ? escapeHtml(String(rubro.tasa_contenido)) : '—'}</span>
      `,
    campos: [
      {
        tipo: 'select',
        name: 'categoria',
        value: rubro.categoria,
        autofocus: true,
        ariaLabel: 'Categoría',
        opciones: CATEGORIAS_RUBRO_ACTIVIDAD.map((cat) => ({ value: cat, label: cat })),
      },
      {
        tipo: 'number',
        name: 'tasa_edificio',
        step: '0.001',
        placeholder: 'Edificio',
        value: rubro.tasa_edificio,
      },
      {
        tipo: 'number',
        name: 'tasa_contenido',
        step: '0.001',
        placeholder: 'Contenido',
        value: rubro.tasa_contenido,
      },
    ],
  })
}

export function renderModalTasa() {
  const m = state.modalTasa
  const catalogo = state.catalogoPorRamo[state.ramoTasasSeleccionado] ?? []
  const opcionesCobertura = catalogo
    .map(
      (c) => `
    <option value="${c.id}" ${String(m.cobertura_id) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>
  `
    )
    .join('')

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-tasa-backdrop">
      <div class="admin-modal" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="admin-modal-tasa-title">
        <div class="admin-modal__title" id="admin-modal-tasa-title">Nueva versión de tasa</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-tasa-form">
          <div class="admin-modal__field">
            <label for="admin-modal-tasa-cobertura">Cobertura</label>
            <select class="field-input" id="admin-modal-tasa-cobertura" name="cobertura_id">
              <option value="">Elegí una cobertura…</option>
              ${opcionesCobertura}
            </select>
          </div>
          <div class="admin-modal__field">
            <label for="admin-modal-tasa-valor">Valor de la tasa</label>
            <input class="field-input" id="admin-modal-tasa-valor" type="number" step="0.001" name="tasa_valor" value="${escapeHtml(m.tasa_valor)}" />
          </div>
          <div class="admin-modal__field">
            <label for="admin-modal-tasa-unidad">Unidad</label>
            <select class="field-input" id="admin-modal-tasa-unidad" name="unidad">
              <option value="permil" ${m.unidad === 'permil' ? 'selected' : ''}>‰ (por mil)</option>
              <option value="porcentaje" ${m.unidad === 'porcentaje' ? 'selected' : ''}>% (porcentaje)</option>
            </select>
          </div>
          <div class="admin-modal__field">
            <label for="admin-modal-tasa-vigente">Vigente desde</label>
            <input class="field-input" id="admin-modal-tasa-vigente" type="date" name="vigente_desde" value="${escapeHtml(m.vigente_desde)}" />
          </div>
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal-tasa">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `
}

function renderTablaTasas() {
  if (!state.ramoTasasSeleccionado) {
    return '<div class="empty-state__subtitle">Elegí un ramo para ver su historial de tasas.</div>'
  }

  const entry = state.tasasPorRamo[state.ramoTasasSeleccionado]
  if (!entry || entry.loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando tasas…</div>'
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`
  }
  if (!entry.historial.length) {
    return '<div class="empty-state__subtitle">Este ramo todavía no tiene tasas cargadas.</div>'
  }

  const puedeEditar = Boolean(auth.getUsuario()?.puede_editar_tasas)

  // El historial ya viene ordenado por vigente_desde descendente — la primera fila de
  // cada cobertura es la vigente, el resto queda como versión anterior.
  const vistaPorCobertura = new Set()
  const filas = entry.historial
    .map((t) => {
      const codigo = t.coberturas_catalogo?.codigo ?? String(t.cobertura_id)
      const esVigente = !vistaPorCobertura.has(codigo)
      vistaPorCobertura.add(codigo)
      return `
      <tr>
        <td data-label="Cobertura">${escapeHtml(t.coberturas_catalogo?.nombre ?? '—')}</td>
        <td data-label="Tasa">${escapeHtml(String(t.tasa_valor))}</td>
        <td data-label="Unidad">${t.unidad === 'permil' ? '‰' : '%'}</td>
        <td data-label="Vigente desde">${escapeHtml(t.vigente_desde)}</td>
        <td data-label="Estado">${crearBadge(esVigente ? 'Vigente' : 'Histórica', esVigente ? 'success' : 'neutral')}</td>
        <td data-label="Acciones">${puedeEditar ? `<button class="btn-outline" data-action="eliminar-tasa" data-id="${t.id}">Eliminar</button>` : ''}</td>
      </tr>
    `
    })
    .join('')

  return `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Cobertura</th>
            <th>Tasa</th>
            <th>Unidad</th>
            <th>Vigente desde</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}
