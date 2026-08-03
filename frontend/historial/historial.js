import { api, auth } from '../shared/api.js'
import { crearBadge } from '../shared/badge.js'
import { getRamos } from '../shared/catalogo.js'
import { escapeHtml, enfocarPrimerElemento, atraparFoco, renderBanner } from '../shared/dom.js'
import { renderSidebarFooter, renderTopbar as renderTopbarShell } from '../shared/sidebar.js'
import { fmtMoneda } from '../shared/format.js'

// Historial de cotizaciones (Fase 5/WU5) — mismo patrón Vanilla JS que admin.js: state +
// renderApp() que reconstruye innerHTML + bindEvents() post-render + modal vía state.modal.
// historial-guard.js (cargado antes en index.html) ya resuelve el redirect si no hay sesión.

const PAGE_SIZE = 20

// Estados reales de `cotizaciones.estado` (ver comentario de la columna en
// backend/migrations/005_cotizaciones.sql: borrador / cotizada / aceptada / vencida / convertida).
const ESTADOS = ['borrador', 'cotizada', 'aceptada', 'vencida', 'convertida']

// Variante de badge por estado — antes todo se mostraba en gris "neutral" sin distinción
// visual entre un borrador y una cotización aceptada. Colores con significado real:
// borrador = inactivo, cotizada = en curso, aceptada = éxito, vencida = alerta, convertida = cierre.
const ESTADO_BADGE = {
  borrador: 'neutral',
  cotizada: 'info',
  aceptada: 'success',
  vencida: 'warning',
  convertida: 'agent',
}

// Criterio real de disponibilidad de la Carta Oferta: hoy solo hay builder de páginas para
// el calculador 'mrc' (ver BUILDERS_POR_CALCULADOR en backend/src/templates/oferta/index.js —
// ofertaDisponibleParaRamo(ramo) devuelve true solo si ramo.calculador tiene builder). El join
// de findCotizaciones trae `ramos.calculador` embebido para reproducir el mismo chequeo acá
// sin pegarle de nuevo a la API por cada fila.
const CALCULADORES_CON_OFERTA_PDF = ['mrc']

const state = {
  ramos: [],
  cotizaciones: [],
  count: 0,
  offset: 0,
  loading: false,
  error: '',
  banner: null, // { tipo: 'error'|'success', texto }
  modal: null, // { row, detalle, loading, error }
  // Sidebar hamburguesa (Fase 3 responsive, ≤1024px) — puramente visual, mismo patrón
  // que admin.js. Ver .sidebar/.sidebar-overlay en frontend/shared/cotizador.css.
  sidebarAbierta: false,

  filtros: {
    ramo_id: '',
    cliente: '',
    fecha_desde: '',
    fecha_hasta: '',
    estado: '',
  },
}

const app = document.getElementById('app')

// Elemento que disparó la apertura del modal de detalle ("Ver detalle") — se
// restaura el foco ahí al cerrar (focus trap, WU accesibilidad).
let elementoDisparadorModal = null

async function init() {
  // Cambio session-httponly-cookie: historial-guard.js (cargado antes en index.html) ya
  // dispara auth.cargarSesion(), pero es fire-and-forget desde ese módulo — sin esperarla
  // acá también, el primer renderApp() de abajo (que arma el sidebar vía
  // auth.getUsuario(), síncrono) se ejecutaría antes de que GET /auth/me resuelva.
  // cargarSesion() dedupea llamadas concurrentes, así que esto no dispara una segunda
  // request de red.
  await auth.cargarSesion()
  renderApp()
  try {
    state.ramos = await getRamos()
  } catch {
    state.ramos = []
  }
  await cargarCotizaciones()
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

// De cotizacion_variantes solo interesa la prima "base" para el listado: no varía por forma
// de pago (eso es cotizacion_plan_pago.premio_total), solo por tipo de franquicia — y los
// ramos activos hoy (MRC/Incendio/Vida-AP) generan siempre una única variante sin_franquicia
// (la franquicia dual es exclusiva de Auto, Fase 1/2 pausada). Se prioriza esa por nombre y,
// si no está (dato viejo o de Auto), se cae a la primera variante que haya.
//
// IMPORTANTE (cotizacion-moneda#Historial does not aggregate across currencies): esta pantalla
// nunca suma `prima`/`premio_total` entre filas — cada fila se formatea con SU PROPIA `moneda`
// (ver renderTabla/renderModalDetalle). No agregar un total/resumen que sume esta columna sin
// primero agrupar por moneda; sumar Gs. + USD sin conversión sería un bug de negocio silencioso.
function primaRepresentativa(cotizacion) {
  const variantes = cotizacion.cotizacion_variantes ?? []
  if (!variantes.length) return null
  const sinFranquicia = variantes.find((v) => v.tipo_franquicia === 'sin_franquicia')
  return (sinFranquicia ?? variantes[0]).prima
}

function ofertaDisponible(cotizacion) {
  return CALCULADORES_CON_OFERTA_PDF.includes(cotizacion.ramos?.calculador)
}

// Ventana de edición del backend (cotizacion.service.js actualizarCotizacion): 30 días corridos
// desde `created_at`. Se replica acá solo para habilitar/deshabilitar el botón — el backend
// vuelve a validarlo igual (nunca se confía solo en el chequeo del frontend).
const VENTANA_EDICION_MS = 30 * 24 * 60 * 60 * 1000

function dentroDeVentana30Dias(createdAt) {
  if (!createdAt) return false
  const creado = new Date(createdAt).getTime()
  if (Number.isNaN(creado)) return false
  return Date.now() - creado <= VENTANA_EDICION_MS
}

function puedeEditar(cotizacion) {
  const usuario = auth.getUsuario()
  if (!usuario) return false
  const esDueno = usuario.rol === 'admin' || cotizacion.agente_id === usuario.id
  return esDueno && dentroDeVentana30Dias(cotizacion.created_at)
}

function motivoNoEditable(cotizacion) {
  const usuario = auth.getUsuario()
  const esDueno = usuario && (usuario.rol === 'admin' || cotizacion.agente_id === usuario.id)
  if (!esDueno) return 'No tenés permiso para editar esta cotización.'
  if (!dentroDeVentana30Dias(cotizacion.created_at)) {
    return 'Ya pasaron más de 30 días desde que se generó esta cotización — no se puede editar.'
  }
  return ''
}

function editarCotizacion(id) {
  window.location.href = `../cotizar/?editar=${id}`
}

// ---------------------------------------------------------------------------
// Carga y filtros
// ---------------------------------------------------------------------------

async function cargarCotizaciones() {
  state.loading = true
  state.error = ''
  renderApp()

  const params = new URLSearchParams()
  if (state.filtros.ramo_id) params.set('ramo_id', state.filtros.ramo_id)
  if (state.filtros.cliente) params.set('cliente', state.filtros.cliente)
  if (state.filtros.fecha_desde) params.set('fecha_desde', state.filtros.fecha_desde)
  if (state.filtros.fecha_hasta) params.set('fecha_hasta', state.filtros.fecha_hasta)
  if (state.filtros.estado) params.set('estado', state.filtros.estado)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(state.offset))

  try {
    const { data, count } = await api.get(`/cotizaciones?${params.toString()}`)
    state.cotizaciones = data
    state.count = count ?? 0
  } catch (err) {
    state.cotizaciones = []
    state.count = 0
    state.error = err.message || 'No se pudo cargar el historial de cotizaciones.'
  } finally {
    state.loading = false
    renderApp()
  }
}

function aplicarFiltros() {
  state.offset = 0
  cargarCotizaciones()
}

function limpiarFiltros() {
  state.filtros = { ramo_id: '', cliente: '', fecha_desde: '', fecha_hasta: '', estado: '' }
  state.offset = 0
  cargarCotizaciones()
}

function irPaginaAnterior() {
  if (state.offset === 0) return
  state.offset = Math.max(0, state.offset - PAGE_SIZE)
  cargarCotizaciones()
}

function irPaginaSiguiente() {
  if (state.offset + PAGE_SIZE >= state.count) return
  state.offset += PAGE_SIZE
  cargarCotizaciones()
}

// ---------------------------------------------------------------------------
// Detalle (modal)
// ---------------------------------------------------------------------------

async function verDetalle(id) {
  const row = state.cotizaciones.find((c) => c.id === id)
  elementoDisparadorModal = document.activeElement
  state.modal = { row, detalle: null, loading: true, error: '' }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
  try {
    state.modal.detalle = await api.get(`/cotizaciones/${id}`)
  } catch (err) {
    state.modal.error = err.message || 'No se pudo cargar el detalle de la cotización.'
  } finally {
    state.modal.loading = false
    renderApp()
    // El contenido cambia de "Cargando…" a los datos reales/botones — el nodo del modal
    // es nuevo (innerHTML completo) así que el foco puesto arriba ya no aplica, se repone.
    enfocarPrimerElemento(app.querySelector('.admin-modal'))
  }
}

function cerrarModal() {
  state.modal = null
  renderApp()
  if (elementoDisparadorModal) {
    elementoDisparadorModal.focus()
    elementoDisparadorModal = null
  }
}

async function descargarOferta(boton, id, numeroCotizacion) {
  // El PDF tarda un rato en generarse (Puppeteer) y el botón no daba ninguna señal mientras
  // tanto, así que un click impaciente terminaba en varias descargas del mismo archivo.
  const textoOriginal = boton.textContent
  boton.disabled = true
  boton.setAttribute('aria-disabled', 'true')
  boton.setAttribute('aria-label', 'Descargando la Carta Oferta, esperá a que termine')
  boton.textContent = 'Descargando…'
  try {
    const blob = await api.getBlob(`/cotizaciones/${id}/pdf-oferta`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Carta-Oferta-${numeroCotizacion ?? id}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo descargar la Carta Oferta.')
  } finally {
    boton.disabled = false
    boton.removeAttribute('aria-disabled')
    boton.removeAttribute('aria-label')
    boton.textContent = textoOriginal
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
            <div class="main-header__title">Historial de cotizaciones</div>
            <div class="main-header__subtitle">Buscá, revisá y descargá las cotizaciones ya generadas</div>
          </div>
        </div>
        <div class="admin-content">
          ${renderBanner(state.banner)}
          ${renderFiltros()}
          <div class="panel card">
            <div class="card__title">Cotizaciones</div>
            <div class="card__body">
              ${renderTabla()}
            </div>
          </div>
          ${renderPaginacion()}
        </div>
      </main>
    </div>
    ${state.modal ? renderModalDetalle() : ''}
  `
  actualizarIndicadorScrollTabla()
}

function renderTopbar() {
  return renderTopbarShell({
    sidebarAbierta: state.sidebarAbierta,
    breadcrumb: `
      <div class="topbar__breadcrumb">
        <span class="topbar__crumb-item topbar__crumb-item--current">Historial de cotizaciones</span>
      </div>
    `,
  })
}

function renderSidebar() {
  return `
    <div class="sidebar ${state.sidebarAbierta ? 'sidebar--abierta' : ''}">
      <div class="sidebar__nav">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('historial')}
      </div>
    </div>
  `
}

function renderFiltros() {
  const opcionesRamo = state.ramos
    .map(
      (r) => `
    <option value="${r.id}" ${String(state.filtros.ramo_id) === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `
    )
    .join('')

  const opcionesEstado = ESTADOS.map(
    (e) => `
    <option value="${e}" ${state.filtros.estado === e ? 'selected' : ''}>${escapeHtml(e[0].toUpperCase() + e.slice(1))}</option>
  `
  ).join('')

  return `
    <form class="historial-filtros" id="historial-filtros-form">
      <div class="historial-filtros__campo">
        <label for="historial-filtro-ramo">Ramo</label>
        <select class="field-input" id="historial-filtro-ramo" name="ramo_id">
          <option value="">Todos</option>
          ${opcionesRamo}
        </select>
      </div>
      <div class="historial-filtros__campo">
        <label for="historial-filtro-cliente">Cliente</label>
        <input class="field-input" id="historial-filtro-cliente" type="text" name="cliente" placeholder="Nombre del cliente" value="${escapeHtml(state.filtros.cliente)}" />
      </div>
      <div class="historial-filtros__campo">
        <label for="historial-filtro-desde">Fecha desde</label>
        <input class="field-input" id="historial-filtro-desde" type="date" name="fecha_desde" value="${escapeHtml(state.filtros.fecha_desde)}" />
      </div>
      <div class="historial-filtros__campo">
        <label for="historial-filtro-hasta">Fecha hasta</label>
        <input class="field-input" id="historial-filtro-hasta" type="date" name="fecha_hasta" value="${escapeHtml(state.filtros.fecha_hasta)}" />
      </div>
      <div class="historial-filtros__campo">
        <label for="historial-filtro-estado">Estado</label>
        <select class="field-input" id="historial-filtro-estado" name="estado">
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

function renderTabla() {
  if (state.loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando cotizaciones…</div>'
  }
  if (state.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.error)}</div>`
  }
  if (!state.cotizaciones.length) {
    return '<div class="empty-state__subtitle">No se encontraron cotizaciones con estos filtros.</div>'
  }

  const filas = state.cotizaciones
    .map((c) => {
      const prima = primaRepresentativa(c)
      const moneda = c.moneda ?? 'PYG'
      const puedeOferta = ofertaDisponible(c)
      return `
      <tr>
        <td data-label="Número"><span class="historial-tabla__numero">${escapeHtml(c.numero_cotizacion)}</span></td>
        <td data-label="Cliente">${escapeHtml(c.cliente_nombre ?? '—')}</td>
        <td data-label="Ramo">${escapeHtml(c.ramos?.nombre_display ?? '—')}</td>
        <td data-label="Plan">${escapeHtml(c.planes?.nombre ?? '—')}</td>
        <td data-label="Fecha">${fmtFecha(c.created_at)}</td>
        <td data-label="Estado">${crearBadge(c.estado ?? '—', ESTADO_BADGE[c.estado] ?? 'neutral')}</td>
        <td data-label="Moneda">${escapeHtml(moneda)}</td>
        <td class="historial-tabla__prima" data-label="Prima">${prima != null ? escapeHtml(fmtMoneda(prima, moneda)) : '—'}</td>
        <td data-label="Acciones">
          <div class="historial-tabla__actions">
            <button class="historial-tabla__btn-ghost" data-action="ver-detalle" data-id="${c.id}">Ver detalle</button>
            ${
              puedeOferta
                ? `<button class="btn-outline historial-tabla__btn-oferta" data-action="descargar-oferta" data-id="${c.id}" data-numero="${escapeHtml(c.numero_cotizacion)}">Carta Oferta</button>`
                : `<button class="btn-outline historial-tabla__btn-oferta historial-oferta-disabled" disabled aria-disabled="true" aria-label="Carta Oferta no disponible para este ramo todavía" title="Carta Oferta no disponible para este ramo todavía">Carta Oferta</button>`
            }
          </div>
        </td>
      </tr>
    `
    })
    .join('')

  return `
    <div class="historial-tabla-scroll" id="historial-tabla-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Número</th>
            <th>Cliente</th>
            <th>Ramo</th>
            <th>Plan</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Moneda</th>
            <th>Prima</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}

// La tabla puede tener más columnas de las que entran en viewports angostos — antes se
// recortaba en silencio (overflow oculto sin scrollbar visible). Ahora scrollea horizontal
// (ver .historial-tabla-scroll) y este listener actualiza el degradé sutil del borde derecho
// para que desaparezca solo cuando ya no queda contenido oculto a la derecha.
function actualizarIndicadorScrollTabla() {
  const el = document.getElementById('historial-tabla-scroll')
  if (!el) return
  const alFinal = el.scrollWidth - el.clientWidth - el.scrollLeft <= 1
  el.classList.toggle(
    'historial-tabla-scroll--al-final',
    alFinal || el.scrollWidth <= el.clientWidth
  )
}

function renderPaginacion() {
  const totalPaginas = Math.max(1, Math.ceil(state.count / PAGE_SIZE))
  const paginaActual = Math.floor(state.offset / PAGE_SIZE) + 1
  // GET /cotizaciones ya devuelve `count` (total real de filas que matchean el filtro, no solo
  // las de la página actual — ver cargarCotizaciones()), así que el rango "Mostrando X-Y de Z"
  // sale del mismo dato que ya se usaba para calcular la cantidad de páginas.
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

function renderCuerpoModalDetalle(m) {
  let cuerpo =
    '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando detalle…</div>'
  if (m.error) {
    cuerpo = `<div class="admin-modal__error">${escapeHtml(m.error)}</div>`
  } else if (!m.loading && m.detalle) {
    const d = m.detalle
    // La moneda de la cotización es una única invariante de cabecera (ver design.md
    // "moneda en cotizaciones pero no en cotizacion_variantes/cotizacion_plan_pago") — todos los
    // montos del detalle (variantes, formas de pago, coberturas) se formatean con esa misma moneda.
    const monedaDetalle = d.moneda ?? 'PYG'
    const fmtDetalle = (valor) => fmtMoneda(valor, monedaDetalle)
    const variantesHtml = (d.cotizacion_variantes ?? [])
      .map((v) => {
        const formasHtml = (v.cotizacion_plan_pago ?? [])
          .map(
            (fp) => `
        <tr>
          <td>${escapeHtml(fp.formas_pago?.nombre_display ?? '—')}</td>
          <td>${fmtDetalle(fp.premio_total)}</td>
          <td>${fmtDetalle(fp.monto_inicial)}</td>
          <td>${fmtDetalle(fp.monto_cuota)}</td>
        </tr>
      `
          )
          .join('')
        return `
        <div class="historial-detalle__grupo">
          <div class="historial-detalle__grupo-titulo">
            ${v.tipo_franquicia === 'con_franquicia' ? 'Con franquicia' : 'Sin franquicia'} — Prima ${fmtDetalle(v.prima)}
          </div>
          <div class="historial-detalle__tabla-scroll">
            <table class="admin-table admin-table--nested">
              <thead>
                <tr><th>Forma de pago</th><th>Premio total</th><th>Inicial</th><th>Cuota</th></tr>
              </thead>
              <tbody>${formasHtml || '<tr><td colspan="4">Sin planes de pago cargados.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      `
      })
      .join('')

    const coberturasHtml = (d.cotizacion_coberturas ?? [])
      .map(
        (c) => `
      <tr>
        <td>${escapeHtml(c.nombre_snapshot)}</td>
        <td>${c.monto != null ? fmtDetalle(c.monto) : '—'}</td>
        <td>${c.franquicia != null ? fmtDetalle(c.franquicia) : '—'}</td>
      </tr>
    `
      )
      .join('')

    cuerpo = `
      <div class="historial-detalle__grupo">
        <div class="historial-detalle__grupo-titulo">Datos generales</div>
        <div>Cliente: ${escapeHtml(d.cliente_nombre ?? '—')}</div>
        <div>Contacto: ${escapeHtml(d.cliente_contacto ?? '—')}</div>
        <div>Fecha: ${fmtFecha(d.created_at)}</div>
        <div>Estado: ${escapeHtml(d.estado ?? '—')}</div>
        <div>Moneda: ${escapeHtml(monedaDetalle)}</div>
      </div>
      ${variantesHtml}
      ${
        coberturasHtml
          ? `
        <div class="historial-detalle__grupo">
          <div class="historial-detalle__grupo-titulo">Coberturas</div>
          <div class="historial-detalle__tabla-scroll">
            <table class="admin-table admin-table--nested">
              <thead><tr><th>Cobertura</th><th>Monto</th><th>Franquicia</th></tr></thead>
              <tbody>${coberturasHtml}</tbody>
            </table>
          </div>
        </div>
      `
          : ''
      }
    `
  }

  return cuerpo
}

function renderModalDetalle() {
  const m = state.modal
  const row = m.row

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-backdrop">
      <div class="admin-modal historial-modal-detalle" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="historial-modal-title">
        <div class="admin-modal__title" id="historial-modal-title">Cotización ${escapeHtml(row?.numero_cotizacion ?? '')}</div>
        ${renderCuerpoModalDetalle(m)}
        <div class="admin-modal__actions">
          ${
            row && puedeEditar(row)
              ? `<button type="button" class="btn-outline" data-action="editar-cotizacion" data-id="${row.id}">Editar</button>`
              : `<button type="button" class="btn-outline historial-oferta-disabled" disabled title="${escapeHtml(row ? motivoNoEditable(row) : '')}">Editar</button>`
          }
          <button type="button" class="btn-outline" data-action="cerrar-modal">Cerrar</button>
        </div>
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Eventos — delegación única sobre #app (registrada una sola vez, junto al
// init() del archivo). renderApp() reemplaza el innerHTML de #app en cada
// render pero no el nodo #app en sí, así que estos listeners sobreviven a
// cada re-render sin necesidad de volver a engancharlos (mismo patrón que
// cotizar.js, líneas ~1590-1672, y admin.js).
// ---------------------------------------------------------------------------

// Respeta data-stop-propagation (el modal): si el click ocurrió dentro del
// modal pero no sobre un elemento con su propio data-action, no debe
// "escapar" hacia el data-action del backdrop que lo contiene (antes evitado
// con e.stopPropagation() en el modal en cada bind).
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
  if (e.target.id !== 'historial-filtros-form') return
  e.preventDefault()
  const form = e.target
  state.filtros.ramo_id = form.ramo_id.value
  state.filtros.cliente = form.cliente.value.trim()
  state.filtros.fecha_desde = form.fecha_desde.value
  state.filtros.fecha_hasta = form.fecha_hasta.value
  state.filtros.estado = form.estado.value
  aplicarFiltros()
}

// Escape cierra el modal de detalle si está abierto. Tab/Shift+Tab quedan atrapados
// dentro del modal (focus trap) mientras esté abierto.
function onKeydown(e) {
  if (e.key === 'Escape' && state.modal) {
    cerrarModal()
    return
  }
  if (e.key === 'Tab' && state.modal) {
    const modalAbierto = app.querySelector('.admin-modal')
    if (modalAbierto) atraparFoco(e, modalAbierto)
  }
}

// El evento 'scroll' no burbujea, pero un listener en fase de captura sobre un ancestro fijo
// (#app, que sobrevive a cada renderApp()) sí se dispara igual durante el recorrido top-down
// del evento — evita tener que reenganchar el listener cada vez que se recrea la tabla.
function onAppScroll(e) {
  if (e.target.id === 'historial-tabla-scroll') actualizarIndicadorScrollTabla()
}

function registrarEventos() {
  app.addEventListener('click', onAppClick)
  app.addEventListener('submit', onAppSubmit)
  app.addEventListener('scroll', onAppScroll, true)
  window.addEventListener('resize', actualizarIndicadorScrollTabla)
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
  if (action === 'ver-detalle') {
    verDetalle(Number(el.dataset.id))
    return
  }
  if (action === 'descargar-oferta') {
    descargarOferta(el, Number(el.dataset.id), el.dataset.numero)
    return
  }
  if (action === 'editar-cotizacion') {
    editarCotizacion(Number(el.dataset.id))
    return
  }
  if (action === 'cerrar-modal' || action === 'cerrar-modal-backdrop') {
    cerrarModal()
  }
}

registrarEventos()
init()
