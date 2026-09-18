import { api, auth } from '../shared/api.js'
import { crearBadge } from '../shared/badge.js'
import { escapeHtml, enfocarPrimerElemento, atraparFoco, renderBanner } from '../shared/dom.js'
import { renderSidebarFooter, renderTopbar as renderTopbarShell } from '../shared/sidebar.js'
import { accionesDeFila } from './acciones.js'

// Listado de Propuestas Formales — mismo patrón Vanilla JS que historial.js: state +
// renderApp() que reconstruye innerHTML de #app + delegación única sobre #app + modal
// vía state.modalAnular. propuestas-listado-guard.js (cargado antes en index.html) ya
// resuelve el redirect si no hay sesión.

const PAGE_SIZE = 20

// Dominio real de `propuestas_formales.estado` (ver migración 069/075) más el valor
// sintético 'activa' que el backend expande a los 4 estados vivos (listado.service.js).
const ESTADOS_FILTRO = [
  { value: 'activa', label: 'Activas' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'en_revision', label: 'En revisión' },
  { value: 'generando_pdf', label: 'Generando PDF' },
  { value: 'error_pdf', label: 'Error PDF' },
  { value: 'emitida', label: 'Emitida' },
  { value: 'anulada', label: 'Anulada' },
  { value: 'reemplazada', label: 'Reemplazada' },
]

const ESTADO_BADGE = {
  borrador: 'neutral',
  en_revision: 'info',
  generando_pdf: 'info',
  error_pdf: 'warning',
  emitida: 'success',
  anulada: 'danger',
  reemplazada: 'neutral',
}

const MOTIVO_MIN = 3
const MOTIVO_MAX = 1000

const state = {
  data: [],
  count: 0,
  offset: 0,
  loading: false,
  error: '',
  banner: null, // { tipo: 'error'|'success', texto }
  sidebarAbierta: false,
  filtros: {
    busqueda: '',
    estado: '',
  },
  // Deep link desde Historial ("Ver propuestas", propuesta-accion.js:42): filtra el
  // listado a las propuestas de una única Carta Oferta. Viene de la query string, no es
  // editable desde el formulario de filtros.
  cartaOfertaId: null,
  modalAnular: null, // { fila, motivo, loading, error }
}

const app = document.getElementById('app')

let elementoDisparadorModal = null

// Lee ?carta_oferta_id=<id> de la URL de entrada. Se resuelve una sola vez al iniciar la
// página (no cambia dentro de la sesión de uso del listado).
function leerCartaOfertaIdDesdeUrl() {
  const params = new URLSearchParams(window.location.search)
  const valor = params.get('carta_oferta_id')
  return valor ? valor : null
}

async function init() {
  state.cartaOfertaId = leerCartaOfertaIdDesdeUrl()
  await auth.cargarSesion()
  renderApp()
  await cargarPropuestas()
}

async function cerrarSesion() {
  await auth.logout()
  window.location.href = '../login/'
}

function fmtFecha(iso) {
  if (!iso) return '—'
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleDateString('es-PY', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function mostrarBanner(tipo, texto) {
  state.banner = { tipo, texto }
  renderApp()
}

// ---------------------------------------------------------------------------
// Carga y filtros
// ---------------------------------------------------------------------------

async function cargarPropuestas() {
  state.loading = true
  state.error = ''
  renderApp()

  const params = new URLSearchParams()
  if (state.filtros.busqueda) params.set('busqueda', state.filtros.busqueda)
  if (state.filtros.estado) params.set('estado', state.filtros.estado)
  if (state.cartaOfertaId) params.set('carta_oferta_id', state.cartaOfertaId)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(state.offset))

  try {
    const { data, count } = await api.get(`/propuestas?${params.toString()}`)
    state.data = data ?? []
    state.count = count ?? 0
  } catch (err) {
    state.data = []
    state.count = 0
    state.error = err.message || 'No se pudo cargar el listado de propuestas formales.'
  } finally {
    state.loading = false
    renderApp()
  }
}

function aplicarFiltros() {
  state.offset = 0
  cargarPropuestas()
}

function limpiarFiltros() {
  state.filtros = { busqueda: '', estado: '' }
  state.offset = 0
  cargarPropuestas()
}

function irPaginaAnterior() {
  if (state.offset === 0) return
  state.offset = Math.max(0, state.offset - PAGE_SIZE)
  cargarPropuestas()
}

function irPaginaSiguiente() {
  if (state.offset + PAGE_SIZE >= state.count) return
  state.offset += PAGE_SIZE
  cargarPropuestas()
}

// ---------------------------------------------------------------------------
// Acciones de fila
// ---------------------------------------------------------------------------

function continuarPropuesta(fila) {
  const accion = accionesDeFila(fila).find((a) => a.action === 'continuar')
  if (accion?.href) window.location.href = accion.href
}

async function descargarPdf(boton, fila) {
  const textoOriginal = boton.textContent
  boton.disabled = true
  boton.setAttribute('aria-disabled', 'true')
  boton.textContent = 'Descargando…'
  try {
    const blob = await api.getBlob(`/propuestas/${fila.id}/pdf`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `propuesta-${fila.numero_propuesta ?? fila.id}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo descargar la Propuesta Formal.')
  } finally {
    boton.disabled = false
    boton.removeAttribute('aria-disabled')
    boton.textContent = textoOriginal
  }
}

function verDetalle(fila) {
  elementoDisparadorModal = document.activeElement
  state.modalDetalle = fila
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal--detalle'))
}

function cerrarModalDetalle() {
  state.modalDetalle = null
  renderApp()
  if (elementoDisparadorModal) {
    elementoDisparadorModal.focus()
    elementoDisparadorModal = null
  }
}

// ---------------------------------------------------------------------------
// Modal de anulación
// ---------------------------------------------------------------------------

function abrirModalAnular(fila) {
  elementoDisparadorModal = document.activeElement
  state.modalAnular = { fila, motivo: '', loading: false, error: '' }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal--anular'))
}

function cerrarModalAnular() {
  state.modalAnular = null
  renderApp()
  if (elementoDisparadorModal) {
    elementoDisparadorModal.focus()
    elementoDisparadorModal = null
  }
}

function actualizarMotivoAnular(valor) {
  if (!state.modalAnular) return
  state.modalAnular.motivo = valor
  renderApp()
}

function motivoValido(motivo) {
  const longitud = motivo.trim().length
  return longitud >= MOTIVO_MIN && longitud <= MOTIVO_MAX
}

function mapearErrorAnular(err) {
  if (err.status === 403) return 'No tenés permiso para anular esta propuesta.'
  if (err.status === 409) return 'El estado cambió, recargá el listado.'
  return err.message || 'No se pudo anular la propuesta.'
}

async function confirmarAnular() {
  const modal = state.modalAnular
  if (!modal || !motivoValido(modal.motivo)) return

  modal.loading = true
  modal.error = ''
  renderApp()

  try {
    await api.post(`/propuestas/${modal.fila.id}/anular`, { motivo: modal.motivo.trim() })
    state.modalAnular = null
    mostrarBanner('success', 'Propuesta anulada correctamente.')
    await cargarPropuestas()
  } catch (err) {
    modal.error = mapearErrorAnular(err)
    modal.loading = false
    renderApp()
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderApp() {
  app.innerHTML = `
    ${renderTopbar()}
    <div class="app-body">
      <div class="sidebar-overlay ${state.sidebarAbierta ? 'sidebar-overlay--visible' : ''}" data-action="close-sidebar"></div>
      ${renderSidebar()}
      <main class="main">
        <div class="main-header">
          <div>
            <div class="main-header__title">Propuestas Formales</div>
            <div class="main-header__subtitle">Buscá, continuá, descargá o anulá propuestas formales</div>
          </div>
        </div>
        <div class="admin-content">
          ${renderBanner(state.banner)}
          ${state.cartaOfertaId ? renderFiltroCartaBanner() : ''}
          ${renderFiltros()}
          <div class="panel card">
            <div class="card__title">Propuestas</div>
            <div class="card__body">
              ${renderTabla()}
            </div>
          </div>
          ${renderPaginacion()}
        </div>
      </main>
    </div>
    ${state.modalAnular ? renderModalAnular() : ''}
    ${state.modalDetalle ? renderModalDetalle() : ''}
  `
}

function renderTopbar() {
  return renderTopbarShell({
    sidebarAbierta: state.sidebarAbierta,
    breadcrumb: `
      <div class="topbar__breadcrumb">
        <span class="topbar__crumb-item topbar__crumb-item--current">Propuestas Formales</span>
      </div>
    `,
    active: 'propuestas-listado',
  })
}

function renderSidebar() {
  return `
    <div class="sidebar ${state.sidebarAbierta ? 'sidebar--abierta' : ''}">
      <div class="sidebar__nav">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('propuestas-listado')}
      </div>
    </div>
  `
}

// Indicador mínimo de que el listado llegó filtrado desde el deep link de Historial ("Ver
// propuestas"), no desde el formulario de filtros de esta pantalla.
function renderFiltroCartaBanner() {
  return `
    <div class="admin-banner propuestas-listado-filtro-carta">
      Mostrando propuestas de la Carta N° ${escapeHtml(String(state.cartaOfertaId))}
      — <a href="./">Ver todas las propuestas</a>
    </div>
  `
}

function renderFiltros() {
  const opcionesEstado = ESTADOS_FILTRO.map(
    (e) => `
    <option value="${e.value}" ${state.filtros.estado === e.value ? 'selected' : ''}>${escapeHtml(e.label)}</option>
  `
  ).join('')

  return `
    <form class="historial-filtros" id="propuestas-listado-filtros-form">
      <div class="historial-filtros__campo">
        <label for="propuestas-listado-filtro-busqueda">Búsqueda</label>
        <input class="field-input" id="propuestas-listado-filtro-busqueda" type="text" name="busqueda" placeholder="Número, carta o cliente" value="${escapeHtml(state.filtros.busqueda)}" />
      </div>
      <div class="historial-filtros__campo">
        <label for="propuestas-listado-filtro-estado">Estado</label>
        <select class="field-input" id="propuestas-listado-filtro-estado" name="estado">
          <option value="">Todos</option>
          ${opcionesEstado}
        </select>
      </div>
      <div class="historial-filtros__acciones">
        <button class="btn-primary" type="submit">Buscar</button>
        <button class="btn-outline" type="button" data-action="limpiar-filtros">Limpiar filtros</button>
      </div>
    </form>
  `
}

function renderBotonAccion(fila, accion) {
  if (accion.action === 'ver-detalle') {
    return `<button class="historial-tabla__btn-ghost" data-action="ver-detalle" data-id="${fila.id}">${escapeHtml(accion.label)}</button>`
  }
  if (accion.action === 'continuar') {
    return `<button class="btn-primary" data-action="continuar" data-id="${fila.id}">${escapeHtml(accion.label)}</button>`
  }
  if (!accion.enabled) {
    return `<button class="btn-outline" disabled aria-disabled="true" title="${escapeHtml(accion.disabledTitle)}">${escapeHtml(accion.label)}</button>`
  }
  return `<button class="btn-outline" data-action="${accion.action}" data-id="${fila.id}">${escapeHtml(accion.label)}</button>`
}

function renderTabla() {
  if (state.loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando propuestas…</div>'
  }
  if (state.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.error)}</div>`
  }
  if (!state.data.length) {
    return '<div class="empty-state__subtitle">No se encontraron propuestas formales con estos filtros.</div>'
  }

  const filas = state.data
    .map((fila) => {
      const acciones = accionesDeFila(fila)
      const botonesHtml = acciones.map((accion) => renderBotonAccion(fila, accion)).join('')
      return `
      <tr>
        <td data-label="Número">${escapeHtml(fila.numero_propuesta ?? '—')}</td>
        <td data-label="Carta">${escapeHtml(fila.numero_carta ?? '—')}</td>
        <td data-label="Cliente">${escapeHtml(fila.cliente_nombre ?? '—')}</td>
        <td data-label="Estado">${crearBadge(fila.estado ?? '—', ESTADO_BADGE[fila.estado] ?? 'neutral')}</td>
        <td data-label="Fecha">${fmtFecha(fila.created_at)}</td>
        <td data-label="Acciones">
          <div class="historial-tabla__actions">${botonesHtml}</div>
        </td>
      </tr>
    `
    })
    .join('')

  return `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Número</th>
            <th>Carta</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}

function renderPaginacion() {
  const totalPaginas = Math.max(1, Math.ceil(state.count / PAGE_SIZE))
  const paginaActual = Math.floor(state.offset / PAGE_SIZE) + 1
  const desde = state.count === 0 ? 0 : state.offset + 1
  const hasta = Math.min(state.offset + PAGE_SIZE, state.count)

  return `
    <div class="historial-paginacion">
      <span class="historial-paginacion__total">Mostrando ${desde}–${hasta} de ${state.count} resultados</span>
      <button class="btn-outline" data-action="pagina-anterior" ${state.offset === 0 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${paginaActual} de ${totalPaginas}</span>
      <button class="btn-outline" data-action="pagina-siguiente" ${state.offset + PAGE_SIZE >= state.count ? 'disabled' : ''}>Siguiente</button>
    </div>
  `
}

function renderModalAnular() {
  const m = state.modalAnular
  const longitud = m.motivo.trim().length
  const valido = motivoValido(m.motivo)

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-anular-backdrop">
      <div class="admin-modal admin-modal--anular" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="propuestas-listado-anular-title">
        <div class="admin-modal__title" id="propuestas-listado-anular-title">Anular propuesta ${escapeHtml(m.fila.numero_propuesta ?? '')}</div>
        <label for="propuestas-listado-anular-motivo">Motivo</label>
        <textarea
          id="propuestas-listado-anular-motivo"
          class="field-input"
          minlength="${MOTIVO_MIN}"
          maxlength="${MOTIVO_MAX}"
          required
          data-action-input="motivo-anular"
        >${escapeHtml(m.motivo)}</textarea>
        <div class="propuestas-listado-anular__contador">${longitud}/${MOTIVO_MAX}</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <div class="admin-modal__actions">
          <button type="button" class="btn-outline" data-action="cerrar-modal-anular" ${m.loading ? 'disabled' : ''}>Cancelar</button>
          <button type="button" class="btn-primary" data-action="confirmar-anular" ${!valido || m.loading ? 'disabled' : ''}>${m.loading ? 'Anulando…' : 'Anular'}</button>
        </div>
      </div>
    </div>
  `
}

function renderModalDetalle() {
  const fila = state.modalDetalle
  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-detalle-backdrop">
      <div class="admin-modal admin-modal--detalle" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="propuestas-listado-detalle-title">
        <div class="admin-modal__title" id="propuestas-listado-detalle-title">Propuesta ${escapeHtml(fila.numero_propuesta ?? '')}</div>
        <dl>
          <div><dt>Carta</dt><dd>${escapeHtml(fila.numero_carta ?? '—')}</dd></div>
          <div><dt>Cliente</dt><dd>${escapeHtml(fila.cliente_nombre ?? '—')}</dd></div>
          <div><dt>Estado</dt><dd>${crearBadge(fila.estado ?? '—', ESTADO_BADGE[fila.estado] ?? 'neutral')}</dd></div>
          <div><dt>Creada</dt><dd>${fmtFecha(fila.created_at)}</dd></div>
          <div><dt>Emitida</dt><dd>${fmtFecha(fila.emitida_at)}</dd></div>
        </dl>
        <div class="admin-modal__actions">
          <button type="button" class="btn-outline" data-action="cerrar-modal-detalle">Cerrar</button>
        </div>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Eventos — delegación única sobre #app, registrada una sola vez (mismo patrón que
// historial.js).
// ---------------------------------------------------------------------------

function resolveActionTarget(e) {
  const target = e.target.closest('[data-action]')
  if (!target || target.disabled) return null
  const stopEl = e.target.closest('[data-stop-propagation]')
  if (stopEl && !stopEl.contains(target)) return null
  return target
}

function onAppClick(e) {
  const target = resolveActionTarget(e)
  if (!target) return
  onActionClick(target)
}

function onAppSubmit(e) {
  if (e.target.id !== 'propuestas-listado-filtros-form') return
  e.preventDefault()
  const form = e.target
  state.filtros.busqueda = form.busqueda.value.trim()
  state.filtros.estado = form.estado.value
  aplicarFiltros()
}

function onAppInput(e) {
  if (e.target.dataset.actionInput === 'motivo-anular') {
    actualizarMotivoAnular(e.target.value)
  }
}

function onKeydown(e) {
  const modalAbierto = app.querySelector('.admin-modal')
  if (e.key === 'Escape' && modalAbierto) {
    if (state.modalAnular) cerrarModalAnular()
    else if (state.modalDetalle) cerrarModalDetalle()
    return
  }
  if (e.key === 'Tab' && modalAbierto) {
    atraparFoco(e, modalAbierto)
  }
}

function registrarEventos() {
  app.addEventListener('click', onAppClick)
  app.addEventListener('submit', onAppSubmit)
  app.addEventListener('input', onAppInput)
  document.addEventListener('keydown', onKeydown)
}

function onActionClick(el) {
  const action = el.dataset.action

  if (action === 'logout') {
    cerrarSesion()
    return
  }
  if (action === 'toggle-sidebar') {
    state.sidebarAbierta = !state.sidebarAbierta
    renderApp()
    return
  }
  if (action === 'close-sidebar') {
    state.sidebarAbierta = false
    renderApp()
    return
  }
  if (action === 'limpiar-filtros') {
    limpiarFiltros()
    return
  }
  if (action === 'pagina-anterior') {
    irPaginaAnterior()
    return
  }
  if (action === 'pagina-siguiente') {
    irPaginaSiguiente()
    return
  }
  if (action === 'continuar') {
    const fila = state.data.find((f) => f.id === Number(el.dataset.id))
    if (fila) continuarPropuesta(fila)
    return
  }
  if (action === 'descargar') {
    const fila = state.data.find((f) => f.id === Number(el.dataset.id))
    if (fila) descargarPdf(el, fila)
    return
  }
  if (action === 'anular') {
    const fila = state.data.find((f) => f.id === Number(el.dataset.id))
    if (fila) abrirModalAnular(fila)
    return
  }
  if (action === 'ver-detalle') {
    const fila = state.data.find((f) => f.id === Number(el.dataset.id))
    if (fila) verDetalle(fila)
    return
  }
  if (action === 'confirmar-anular') {
    confirmarAnular()
    return
  }
  if (action === 'cerrar-modal-anular' || action === 'cerrar-modal-anular-backdrop') {
    cerrarModalAnular()
    return
  }
  if (action === 'cerrar-modal-detalle' || action === 'cerrar-modal-detalle-backdrop') {
    cerrarModalDetalle()
  }
}

registrarEventos()
init()
