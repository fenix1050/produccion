import { escapeHtml } from '../../shared/dom.js'
import { state } from '../state.js'
import { renderCampoInline } from './campos-inline.js'

// Render de la sección Ramos (tabla de ramos, visibilidad, editar nombre
// inline, eliminar ramo) — extraído de admin.js (WU admin-module-split, PR6).

export function renderRamosGestion() {
  return `
    <div class="panel card">
      <div class="card__title">Ramos</div>
      <div class="card__body">
        ${renderTablaRamosGestion()}
      </div>
    </div>
  `
}

function renderTablaRamosGestion() {
  if (state.loadingRamosGestion) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando ramos…</div>'
  }
  if (state.ramosGestionError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.ramosGestionError)}</div>`
  }
  if (!state.ramosGestion.length) {
    return '<div class="empty-state__subtitle">No hay ramos para mostrar.</div>'
  }

  const filas = state.ramosGestion
    .map(
      (r) => `
    <tr>
      <td data-label="Ramo">${renderCampoNombreRamo(r)}</td>
      <td data-label="Estado">
        ${r.activo ? 'Visible en cotizador' : 'Oculto del cotizador'}
      </td>
      <td data-label="Acciones">
        <button type="button" class="btn-outline" data-action="toggle-ramo-activo" data-id="${r.id}" data-next-activo="${!r.activo}">
          ${r.activo ? 'Ocultar' : 'Mostrar'}
        </button>
        <button class="btn-outline" data-action="eliminar-ramo" data-id="${r.id}">Eliminar</button>
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
            <th>Ramo</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}

// El nombre de un ramo (nombre_display) rara vez cambia, así que se edita inline en la
// misma fila — mismo patrón que renderCampoPrimaTecnicaMinima/renderCampoTasaRpf. El botón
// "Editar" va en una columna de ancho fijo (`admin-ramo-nombre__accion`), separada del texto
// del nombre: los nombres de ramo varían mucho de largo ("Automóviles" vs "Multirriesgo
// Comercio"), así que compartir un solo <td> con flex dejaba el botón a distinta distancia
// en cada fila en vez de alineado en columna.
function renderCampoNombreRamo(ramo) {
  return renderCampoInline({
    editando: state.ramoNombreEnEdicion.has(ramo.id),
    id: ramo.id,
    formAction: 'nombre-ramo',
    accionEditar: 'editar-nombre-ramo',
    accionCancelar: 'cancelar-nombre-ramo',
    // Layout propio (ver admin.css .admin-ramo-nombre): mismo DOM que antes de la
    // unificación (botón envuelto en su propia <span> de ancho fijo), no el genérico
    // admin-valor-fijo — ver comentario arriba de renderTablaRamosGestion.
    wrapperClase: 'admin-ramo-nombre',
    accionWrapperClase: 'admin-ramo-nombre__accion',
    lectura: `<span class="admin-ramo-nombre__texto">${escapeHtml(ramo.nombre_display)}</span>`,
    campos: [{ tipo: 'text', name: 'nombre_display', value: ramo.nombre_display, autofocus: true }],
  })
}
