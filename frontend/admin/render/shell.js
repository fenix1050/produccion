import { escapeHtml, renderBanner } from '../../shared/dom.js'
import { renderSidebarFooter, renderTopbar as renderTopbarShell } from '../../shared/sidebar.js'
import { ICON_WRENCH } from '../../shared/nav-icons.js'
import { state, app } from '../state.js'
import { SECCION_ICONOS, seccionesVisibles } from '../secciones.js'
import { renderUsuarios } from './usuarios.js'
import { renderModal, renderModalRol } from './modales-usuario.js'
import { renderPlanes } from './planes.js'
import { renderTasas, renderModalTasa } from './tasas.js'
import { renderRamosGestion } from './ramos.js'
import { renderCoberturas, renderModalCobertura } from './coberturas.js'

// Shell del panel admin (topbar, sidebar, layout general, ruteo de secciones y estado
// "próximamente") + banner de feedback — extraído de admin.js (WU admin-module-split,
// PR7). Cierra la capa de render: todo render/* ya existe antes de crear cualquier
// módulo de dominio.

export function renderApp() {
  // app.innerHTML se reemplaza entero en cada render, así que .admin-content es un nodo
  // nuevo con scrollTop = 0 — sin esto, cualquier acción (ej. "Editar" en una tasa) tira
  // al usuario arriba de todo aunque estaba scrolleado abajo.
  const scrollAnterior = app.querySelector('.admin-content')?.scrollTop ?? 0

  app.innerHTML = `
    ${renderTopbar()}
    <div class="app-body">
      <div class="sidebar-overlay ${state.sidebarAbierta ? 'sidebar-overlay--visible' : ''}" data-action="close-sidebar"></div>
      ${renderSidebar()}
      <main class="main">
        <div class="main-header">
          <div>
            <div class="main-header__title">Administración</div>
            <div class="main-header__subtitle">Gestión de usuarios, coberturas, tasas y planes</div>
          </div>
        </div>
        <div class="admin-content">
          ${renderBanner(state.banner)}
          ${renderSeccion()}
        </div>
      </main>
    </div>
    ${state.modal ? renderModal() : ''}
    ${state.modalRol ? renderModalRol() : ''}
    ${state.modalTasa ? renderModalTasa() : ''}
    ${state.modalCobertura ? renderModalCobertura() : ''}
  `

  const contenido = app.querySelector('.admin-content')
  if (contenido) contenido.scrollTop = scrollAnterior
}

export function renderTopbar() {
  return renderTopbarShell({
    sidebarAbierta: state.sidebarAbierta,
    breadcrumb: `
      <div class="topbar__breadcrumb">
        <span class="topbar__crumb-item topbar__crumb-item--current">Panel de Administración</span>
      </div>
    `,
    active: 'admin',
  })
}

export function renderSidebar() {
  const items = seccionesVisibles()
    .map(
      (s) => `
    <div
      class="nav-item nav-item--icon ${s.id === state.seccion ? 'nav-item--active' : ''}"
      data-action="select-seccion"
      data-seccion="${s.id}"
    >
      <span class="nav-item__badge">${SECCION_ICONOS[s.id] ?? ''}</span>
      <span>${s.label}</span>
      ${!s.disponible ? '<span class="nav-item__badge-pill">Pronto</span>' : ''}
    </div>
  `
    )
    .join('')

  return `
    <div class="sidebar ${state.sidebarAbierta ? 'sidebar--abierta' : ''}">
      <div class="sidebar__nav">
        <div class="sidebar__section-label">Secciones</div>
        ${items}
      </div>
      <div class="sidebar__footer">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('admin')}
      </div>
    </div>
  `
}

export function renderSeccion() {
  if (!state.seccion) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Sin secciones habilitadas</div>
        <div class="empty-state__subtitle">Tu usuario no tiene permiso para ninguna sección del panel admin. Pedile a un administrador que te habilite acceso.</div>
      </div>
    `
  }
  const seccion = seccionesVisibles().find((s) => s.id === state.seccion)
  if (!seccion?.disponible) return renderProximamente(seccion)
  if (state.seccion === 'usuarios') return renderUsuarios()
  if (state.seccion === 'coberturas') return renderCoberturas()
  if (state.seccion === 'planes') return renderPlanes()
  if (state.seccion === 'tasas') return renderTasas()
  if (state.seccion === 'ramos') return renderRamosGestion()
  return renderProximamente(seccion)
}

// Distinto del resto de los "empty-state__subtitle" sueltos que se usan en las tablas
// (esos son "sin datos": la sección existe y funciona, simplemente no cargó filas
// todavía). Este es "no implementado": una limitación real del sistema, no un problema
// temporal de datos — así que además del título/subtítulo lleva ícono + badge
// "Próximamente" para que no se confundan a simple vista (hallazgo de auditoría UX/UI).
function renderProximamente(seccion) {
  return `
    <div class="empty-state">
      <div class="empty-state__icon">${ICON_WRENCH}</div>
      <div class="empty-state__title">
        ${escapeHtml(seccion?.label ?? '')}
        <span class="admin-badge-proximamente">Próximamente</span>
      </div>
      <div class="empty-state__subtitle">Esta funcionalidad todavía no está disponible en el panel — no es un problema de datos ni de conexión, es una sección en desarrollo.</div>
    </div>
  `
}

export function mostrarBanner(tipo, texto) {
  state.banner = { tipo, texto }
  renderApp()
}
