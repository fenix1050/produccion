import { escapeHtml, renderBanner } from '../../shared/dom.js'
import { renderSidebarFooter, renderTopbar as renderTopbarShell } from '../../shared/sidebar.js'
import { state, app } from '../state.js'
import { RAMOS_UI, RAMO_ICONOS, MOTIVO_BLOQUEO_ID, PASOS_EMISION_CARTA } from '../constants.js'
import { puedeAvanzarADetalle } from '../domain-rules.js'
import { renderResultadoView } from './render-detalle-plan.js'
import { renderDatosView } from './render-datos.js'

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

// Skeleton de la lista de ramos mientras carga GET /ramos (state.loadingRamos, ver init() en
// actions.js) — mismo layout que .ramo-row (ícono + label) para que no haya salto al llegar
// la lista real. Cantidad de filas fija (RAMOS_UI.length) en vez de un número mágico.
function renderSidebarSkeleton() {
  const rows = RAMOS_UI.map(
    () => `
      <div class="ramo-row" aria-hidden="true">
        <span class="skeleton-circle"></span>
        <span class="skeleton-text" style="width: 65%"></span>
      </div>
    `
  ).join('')

  return `
    <div class="sidebar ${state.sidebarAbierta ? 'sidebar--abierta' : ''}">
      <div class="sidebar__section-label">Cotizar</div>
      <div class="ramo-list">${rows}</div>
      <div class="sidebar__footer">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('cotizar')}
      </div>
    </div>
  `
}

export function renderSidebar() {
  if (state.loadingRamos) return renderSidebarSkeleton()

  const rows = RAMOS_UI.filter((base) => ramoActivo(base.nombre))
    .map((base) => {
      const r = ramoInfo(base.nombre)
      const activa = r.nombre === state.ramoId
      return `
      <div class="ramo-row ${activa ? 'ramo-row--activa' : ''}" data-action="select-ramo" data-ramo="${r.nombre}">
        <div class="ramo-row__icon">${RAMO_ICONOS[r.nombre] || ''}</div>
        <div class="ramo-row__label">${r.label}</div>
      </div>
    `
    })
    .join('')

  return `
    <div class="sidebar ${state.sidebarAbierta ? 'sidebar--abierta' : ''}">
      <div class="sidebar__section-label">Cotizar</div>
      <div class="ramo-list">${rows}</div>
      <div class="sidebar__footer">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('cotizar')}
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
            ${bloqueado ? `title="Corregí el capital declarado antes de avanzar — ver el mensaje de alerta" aria-disabled="true" aria-describedby="${MOTIVO_BLOQUEO_ID}"` : ''}
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

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

// Paneles con scroll propio (`.datos-view__form` y `.live-summary`, ver comentario de
// cotizador.css línea ~2400) que `app.innerHTML = ...` recrea desde cero en cada render: sin
// esto, el navegador los repinta con scrollTop 0 y cualquier renderApp() disparado desde una
// interacción dentro de esos paneles (ej. blur al aceptar la suma asegurada de una cobertura
// adicional) manda al agente de vuelta arriba del todo.
const SELECTORES_SCROLL_PRESERVADO = ['.datos-view__form', '.live-summary']

// Recuerda la última tab renderada para distinguir "cambié de tab" (anima con slide
// direccional) de "renderApp() se disparó por otra razón dentro de la misma tab" (ej. tildar
// una cobertura adicional) — en ese segundo caso .panel sigue con su fadeIn de siempre, sin
// slide. Vive fuera de `state` a propósito: es un detalle de presentación de esta transición,
// no algo que el resto de la app necesite leer ni persistir.
let vistaPrevia = null

// Último scrollTop conocido de cada panel, sobrevive aunque el panel no exista en el DOM del
// render actual (ej. mientras se ve "Detalle del plan", .datos-view__form no existe). Antes
// capturarScrollPaneles() solo guardaba lo que encontraba en el render inmediatamente
// anterior, así que el scroll sobrevivía un re-render dentro de la misma tab (ej. tildar una
// cobertura adicional) pero se perdía en un viaje de ida y vuelta entre tabs — bug real en una
// cotización larga editada desde historial, reportado por Kevin, 2026-08-12. Este objeto es el
// cache persistente que le falta a ese caso.
const scrollsConocidos = {}

function capturarScrollPaneles() {
  for (const selector of SELECTORES_SCROLL_PRESERVADO) {
    const el = app.querySelector(selector)
    if (el) scrollsConocidos[selector] = el.scrollTop
  }
}

function restaurarScrollPaneles() {
  for (const selector of SELECTORES_SCROLL_PRESERVADO) {
    const top = scrollsConocidos[selector]
    if (top === undefined) continue
    const el = app.querySelector(selector)
    if (el) el.scrollTop = top
  }
}

export function renderApp() {
  const ramo = state.ramoId ? ramoInfo(state.ramoId) : null

  let contenido
  if (!ramo) {
    contenido = renderEmptyState()
  } else if (ramo.estado === 'pausa' || ramo.estado === 'proximamente') {
    contenido = renderRamoNoDisponible(ramo)
  } else {
    const claseTransicion =
      vistaPrevia && vistaPrevia !== state.view
        ? state.view === 'result'
          ? 'view-transition--avanza'
          : 'view-transition--retrocede'
        : ''
    const vista = state.view === 'form' ? renderDatosView(ramo) : renderResultadoView(ramo)
    contenido = claseTransicion ? `<div class="${claseTransicion}">${vista}</div>` : vista
  }
  vistaPrevia = ramo ? state.view : null

  capturarScrollPaneles()

  app.innerHTML = `
    ${renderTopbar(ramo)}
    <div class="app-body">
      <div class="sidebar-overlay ${state.sidebarAbierta ? 'sidebar-overlay--visible' : ''}" data-action="close-sidebar"></div>
      ${renderSidebar()}
      <main class="main">
        ${renderHeader(ramo)}
        ${renderBanner(state.banner)}
        ${contenido}
      </main>
    </div>
    ${renderModalProgresoCarta()}
  `

  restaurarScrollPaneles()
}

// ---------------------------------------------------------------------------
// Modal de progreso de emisión — mismo patrón de modal que renderModalDetalle() de
// historial.js (admin-modal-backdrop + admin-modal + focus trap), con marcado propio
// (.progreso-carta-modal) porque cotizar/index.html no importa admin.css.
// ---------------------------------------------------------------------------

export function renderModalProgresoCarta() {
  const p = state.progresoCarta
  if (!p) return ''

  const stepsHtml = PASOS_EMISION_CARTA.map((nombre, index) => {
    const estadoPaso =
      p.estado === 'error' && index === p.paso
        ? 'error'
        : index < p.paso || (index === p.paso && p.estado === 'exito')
          ? 'completado'
          : index === p.paso
            ? 'activo'
            : 'pendiente'
    const marcador =
      estadoPaso === 'completado'
        ? '<span class="progreso-step__check" aria-hidden="true">✓</span>'
        : estadoPaso === 'activo'
          ? '<span class="spinner" aria-hidden="true"></span>'
          : estadoPaso === 'error'
            ? '<span class="progreso-step__check" aria-hidden="true">!</span>'
            : `<span>${index + 1}</span>`
    return `
      <li class="progreso-step progreso-step--${estadoPaso}">
        <span class="progreso-step__marker">${marcador}</span>
        <span class="progreso-step__label">${escapeHtml(nombre)}</span>
      </li>
    `
  }).join('')

  const porcentaje = Math.round(
    ((p.estado === 'exito' ? PASOS_EMISION_CARTA.length : p.paso) / PASOS_EMISION_CARTA.length) *
      100
  )

  const permiteCerrar = p.estado === 'exito' || p.estado === 'error'

  const resultadoHtml =
    p.estado === 'exito'
      ? `
        <div class="progreso-resultado progreso-resultado--exito" role="status">
          <div><strong>Cotización generada correctamente</strong><p>La Carta Oferta está lista para revisar y descargar.</p></div>
        </div>
        <div class="admin-modal__actions">
          <button type="button" class="btn-outline" data-action="cerrar-modal-progreso-carta">Cerrar</button>
          <button type="button" class="resumen-sistema__cta" data-action="ver-pdf-carta">Ver PDF</button>
        </div>
      `
      : p.estado === 'error'
        ? `
        <div class="progreso-resultado progreso-resultado--error" role="alert">
          <div><strong>No pudimos completar la Carta Oferta</strong><p>${escapeHtml(p.error || 'Ocurrió un error inesperado.')}</p></div>
        </div>
        <div class="admin-modal__actions">
          <button type="button" class="btn-outline" data-action="cerrar-modal-progreso-carta">Cerrar</button>
          <button type="button" class="resumen-sistema__cta" data-action="reintentar-carta">Reintentar</button>
        </div>
      `
        : ''

  return `
    <div class="admin-modal-backdrop" ${permiteCerrar ? 'data-action="cerrar-modal-progreso-carta"' : ''}>
      <div class="admin-modal progreso-carta-modal" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="progreso-carta-title">
        <div class="admin-modal__title" id="progreso-carta-title">Proceso de cotización</div>
        <div class="progreso-track" role="progressbar" aria-label="Progreso de la emisión" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${porcentaje}">
          <div class="progreso-fill" style="width: ${porcentaje}%"></div>
        </div>
        <ol class="progreso-steps" aria-live="polite">
          ${stepsHtml}
        </ol>
        <div class="progreso-terminal-slot">
          <div class="progreso-terminal-slot__content">${resultadoHtml}</div>
        </div>
      </div>
    </div>
  `
}
