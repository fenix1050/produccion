import { escapeHtml } from '../../shared/dom.js'
import { renderSidebarFooter, renderTopbar as renderTopbarShell } from '../../shared/sidebar.js'
import { state } from '../state.js'
import { RAMOS_UI, RAMO_ICONOS, MOTIVO_BLOQUEO_ID, COTIZADOR_VERSION } from '../constants.js'
import { puedeAvanzarADetalle } from '../domain-rules.js'

// El estado 'disponible'/'proximamente' de un ramo ya no es un valor fijo de RAMOS_UI: se
// deriva del flag `activo` de la tabla `ramos` (togglable desde el panel admin, sección
// Ramos, solo rol admin). RAMOS_UI ahora solo aporta metadata de UI (code/label/estado
// original, usado como fallback si `/ramos` no cargó — ver init()).
export function ramoInfo(nombre) {
  const base = RAMOS_UI.find((r) => r.nombre === nombre)
  if (!base) return null
  const estado = ramoActivo(nombre) ? 'disponible' : 'proximamente'
  return { ...base, estado }
}

export function ramoActivo(nombre) {
  return state.ramosActivos.find((r) => r.nombre === nombre) || null
}

export function renderTopbar(ramo) {
  return renderTopbarShell({
    sidebarAbierta: state.sidebarAbierta,
    breadcrumb: ramo
      ? `
      <div class="topbar__breadcrumb">
        <span class="topbar__crumb-item">Cotizaciones</span>
        <span class="topbar__crumb-sep">›</span>
        <span class="topbar__crumb-item topbar__crumb-item--current">Nueva cotización</span>
      </div>
    `
      : '<div></div>',
  })
}

export function renderSidebar() {
  const rows = RAMOS_UI.map((base) => {
    const r = ramoInfo(base.nombre)
    const activa = r.nombre === state.ramoId
    const estadoTexto = r.estado === 'proximamente' ? 'Próximamente' : ''
    return `
      <div class="ramo-row ${activa ? 'ramo-row--activa' : ''} ${r.estado !== 'disponible' ? `ramo-row--${r.estado}` : ''}" data-action="select-ramo" data-ramo="${r.nombre}">
        <div class="ramo-row__icon">${RAMO_ICONOS[r.nombre] || ''}</div>
        <div class="ramo-row__label">${r.label}</div>
        ${estadoTexto ? `<div class="ramo-row__estado">${estadoTexto}</div>` : ''}
      </div>
    `
  }).join('')

  return `
    <div class="sidebar ${state.sidebarAbierta ? 'sidebar--abierta' : ''}">
      <div class="sidebar__section-label">Cotizar</div>
      <div class="ramo-list">${rows}</div>
      <div class="sidebar__footer">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('cotizar')}
        <div class="sidebar__credit">Powered by <strong>Kevin Ruiz Diaz</strong> v${COTIZADOR_VERSION}</div>
      </div>
    </div>
  `
}

export function renderHeader(ramo) {
  const subtitle = ramo ? `Cotizando ${ramo.label}` : 'Elegí una sección para comenzar'
  const showTabs = Boolean(ramo) && ramo.estado !== 'pausa' && ramo.estado !== 'proximamente'
  const bloqueado = !puedeAvanzarADetalle()

  return `
    <div class="main-header">
      <div>
        ${ramo ? '' : '<div class="main-header__title">Nueva cotización</div>'}
        <div class="main-header__subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${
        showTabs
          ? `
        <div class="tabs">
          <button class="tab-btn ${state.view === 'form' ? 'tab-btn--active' : ''}" data-action="show-tab" data-view="form">Datos</button>
          <button
            id="tab-detalle-plan"
            class="tab-btn ${state.view === 'result' ? 'tab-btn--active' : ''}"
            data-action="show-tab"
            data-view="result"
            ${bloqueado ? `disabled title="Corregí el capital declarado antes de avanzar — ver el mensaje de alerta" aria-disabled="true" aria-describedby="${MOTIVO_BLOQUEO_ID}"` : ''}
          >Detalle del plan</button>
        </div>
      `
          : ''
      }
    </div>
  `
}

export function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state__icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M14 2v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="empty-state__title">Seleccioná un ramo en el panel izquierdo</div>
      <div class="empty-state__subtitle">El formulario y la cotización aparecerán acá.</div>
    </div>
  `
}

export function renderRamoNoDisponible(ramo) {
  return `
    <div class="empty-state">
      <div class="empty-state__title">${escapeHtml(ramo.label)}</div>
      <div class="empty-state__subtitle">Próximamente.</div>
    </div>
  `
}
