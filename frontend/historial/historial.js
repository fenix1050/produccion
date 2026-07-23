import { api, auth } from '../shared/api.js';
import { crearBadge } from '../shared/badge.js';
import { escapeHtml } from '../shared/dom.js';
import { renderSidebarFooter, renderTopbarUser } from '../shared/sidebar.js';
import { fmtGsConPrefijo as fmtGs } from '../shared/format.js';

// Historial de cotizaciones (Fase 5/WU5) — mismo patrón Vanilla JS que admin.js: state +
// renderApp() que reconstruye innerHTML + bindEvents() post-render + modal vía state.modal.
// historial-guard.js (cargado antes en index.html) ya resuelve el redirect si no hay sesión.

const PAGE_SIZE = 20;

// Estados reales de `cotizaciones.estado` (ver comentario de la columna en
// backend/migrations/005_cotizaciones.sql: borrador / cotizada / aceptada / vencida / convertida).
const ESTADOS = ['borrador', 'cotizada', 'aceptada', 'vencida', 'convertida'];

// Variante de badge por estado — antes todo se mostraba en gris "neutral" sin distinción
// visual entre un borrador y una cotización aceptada. Colores con significado real:
// borrador = inactivo, cotizada = en curso, aceptada = éxito, vencida = alerta, convertida = cierre.
const ESTADO_BADGE = {
  borrador: 'neutral',
  cotizada: 'info',
  aceptada: 'success',
  vencida: 'warning',
  convertida: 'agent',
};

// Criterio real de disponibilidad de la Carta Oferta: hoy solo hay builder de páginas para
// el calculador 'mrc' (ver BUILDERS_POR_CALCULADOR en backend/src/templates/oferta/index.js —
// ofertaDisponibleParaRamo(ramo) devuelve true solo si ramo.calculador tiene builder). El join
// de findCotizaciones trae `ramos.calculador` embebido para reproducir el mismo chequeo acá
// sin pegarle de nuevo a la API por cada fila.
const CALCULADORES_CON_OFERTA_PDF = ['mrc'];

const state = {
  ramos: [],
  cotizaciones: [],
  count: 0,
  offset: 0,
  loading: false,
  error: '',
  banner: null, // { tipo: 'error'|'success', texto }
  modal: null, // { row, detalle, loading, error }

  filtros: {
    ramo_id: '',
    cliente: '',
    fecha_desde: '',
    fecha_hasta: '',
    estado: '',
  },
};

const app = document.getElementById('app');

async function init() {
  renderApp();
  try {
    state.ramos = await api.get('/ramos');
  } catch {
    state.ramos = [];
  }
  await cargarCotizaciones();
}

function cerrarSesion() {
  auth.clearSession();
  window.location.href = '../login/';
}

function fmtFecha(iso) {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleDateString('es-PY', { year: 'numeric', month: '2-digit', day: '2-digit' });
}


function mostrarBanner(tipo, texto) {
  state.banner = { tipo, texto };
  renderApp();
}

// De cotizacion_variantes solo interesa la prima "base" para el listado: no varía por forma
// de pago (eso es cotizacion_plan_pago.premio_total), solo por tipo de franquicia — y los
// ramos activos hoy (MRC/Incendio/Vida-AP) generan siempre una única variante sin_franquicia
// (la franquicia dual es exclusiva de Auto, Fase 1/2 pausada). Se prioriza esa por nombre y,
// si no está (dato viejo o de Auto), se cae a la primera variante que haya.
function primaRepresentativa(cotizacion) {
  const variantes = cotizacion.cotizacion_variantes ?? [];
  if (!variantes.length) return null;
  const sinFranquicia = variantes.find((v) => v.tipo_franquicia === 'sin_franquicia');
  return (sinFranquicia ?? variantes[0]).prima;
}

function ofertaDisponible(cotizacion) {
  return CALCULADORES_CON_OFERTA_PDF.includes(cotizacion.ramos?.calculador);
}

// Ventana de edición del backend (cotizacion.service.js actualizarCotizacion): 30 días corridos
// desde `created_at`. Se replica acá solo para habilitar/deshabilitar el botón — el backend
// vuelve a validarlo igual (nunca se confía solo en el chequeo del frontend).
const VENTANA_EDICION_MS = 30 * 24 * 60 * 60 * 1000;

function dentroDeVentana30Dias(createdAt) {
  if (!createdAt) return false;
  const creado = new Date(createdAt).getTime();
  if (Number.isNaN(creado)) return false;
  return Date.now() - creado <= VENTANA_EDICION_MS;
}

function puedeEditar(cotizacion) {
  const usuario = auth.getUsuario();
  if (!usuario) return false;
  const esDueno = usuario.rol === 'admin' || cotizacion.agente_id === usuario.id;
  return esDueno && dentroDeVentana30Dias(cotizacion.created_at);
}

function motivoNoEditable(cotizacion) {
  const usuario = auth.getUsuario();
  const esDueno = usuario && (usuario.rol === 'admin' || cotizacion.agente_id === usuario.id);
  if (!esDueno) return 'No tenés permiso para editar esta cotización.';
  if (!dentroDeVentana30Dias(cotizacion.created_at)) {
    return 'Ya pasaron más de 30 días desde que se generó esta cotización — no se puede editar.';
  }
  return '';
}

function editarCotizacion(id) {
  window.location.href = `../cotizar/?editar=${id}`;
}

// ---------------------------------------------------------------------------
// Carga y filtros
// ---------------------------------------------------------------------------

async function cargarCotizaciones() {
  state.loading = true;
  state.error = '';
  renderApp();

  const params = new URLSearchParams();
  if (state.filtros.ramo_id) params.set('ramo_id', state.filtros.ramo_id);
  if (state.filtros.cliente) params.set('cliente', state.filtros.cliente);
  if (state.filtros.fecha_desde) params.set('fecha_desde', state.filtros.fecha_desde);
  if (state.filtros.fecha_hasta) params.set('fecha_hasta', state.filtros.fecha_hasta);
  if (state.filtros.estado) params.set('estado', state.filtros.estado);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(state.offset));

  try {
    const { data, count } = await api.get(`/cotizaciones?${params.toString()}`);
    state.cotizaciones = data;
    state.count = count ?? 0;
  } catch (err) {
    state.cotizaciones = [];
    state.count = 0;
    state.error = err.message || 'No se pudo cargar el historial de cotizaciones.';
  } finally {
    state.loading = false;
    renderApp();
  }
}

function aplicarFiltros() {
  state.offset = 0;
  cargarCotizaciones();
}

function limpiarFiltros() {
  state.filtros = { ramo_id: '', cliente: '', fecha_desde: '', fecha_hasta: '', estado: '' };
  state.offset = 0;
  cargarCotizaciones();
}

function irPaginaAnterior() {
  if (state.offset === 0) return;
  state.offset = Math.max(0, state.offset - PAGE_SIZE);
  cargarCotizaciones();
}

function irPaginaSiguiente() {
  if (state.offset + PAGE_SIZE >= state.count) return;
  state.offset += PAGE_SIZE;
  cargarCotizaciones();
}

// ---------------------------------------------------------------------------
// Detalle (modal)
// ---------------------------------------------------------------------------

async function verDetalle(id) {
  const row = state.cotizaciones.find((c) => c.id === id);
  state.modal = { row, detalle: null, loading: true, error: '' };
  renderApp();
  try {
    state.modal.detalle = await api.get(`/cotizaciones/${id}`);
  } catch (err) {
    state.modal.error = err.message || 'No se pudo cargar el detalle de la cotización.';
  } finally {
    state.modal.loading = false;
    renderApp();
  }
}

function cerrarModal() {
  state.modal = null;
  renderApp();
}

async function descargarOferta(boton, id, numeroCotizacion) {
  // El PDF tarda un rato en generarse (Puppeteer) y el botón no daba ninguna señal mientras
  // tanto, así que un click impaciente terminaba en varias descargas del mismo archivo.
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Descargando…';
  try {
    const blob = await api.getBlob(`/cotizaciones/${id}/pdf-oferta`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Carta-Oferta-${numeroCotizacion ?? id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo descargar la Carta Oferta.');
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderApp() {
  app.innerHTML = `
    ${renderTopbar()}
    <div class="app-body">
      ${renderSidebar()}
      <div class="main">
        <div class="main-header">
          <div>
            <div class="main-header__title">Historial de cotizaciones</div>
            <div class="main-header__subtitle">Buscá, revisá y descargá las cotizaciones ya generadas</div>
          </div>
        </div>
        <div class="admin-content">
          ${renderBanner()}
          ${renderFiltros()}
          <div class="panel card">
            <div class="card__title">Cotizaciones</div>
            <div class="card__body">
              ${renderTabla()}
            </div>
          </div>
          ${renderPaginacion()}
        </div>
      </div>
    </div>
    ${state.modal ? renderModalDetalle() : ''}
  `;
  bindEvents();
}

function renderTopbar() {
  return `
    <div class="topbar">
      <div class="topbar__red-block">
        <img class="topbar__logo" src="../login/assets/logo-rojo-con-negro.svg" alt="Aseguradora Tajy" />
        <div class="topbar__brand-text">
          <div class="topbar__brand-sub">Sistema de Cotización de Pólizas</div>
        </div>
      </div>
      <div class="topbar__crumb-area">
        <div class="topbar__breadcrumb">
          <span class="topbar__crumb-item topbar__crumb-item--current">Historial de cotizaciones</span>
        </div>
        ${renderTopbarUser()}
      </div>
    </div>
  `;
}

function renderSidebar() {
  return `
    <div class="sidebar">
      <div class="sidebar__nav">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('historial')}
      </div>
    </div>
  `;
}

function renderBanner() {
  if (!state.banner) return '';
  return `<div class="admin-banner admin-banner--${state.banner.tipo}">${escapeHtml(state.banner.texto)}</div>`;
}

function renderFiltros() {
  const opcionesRamo = state.ramos.map((r) => `
    <option value="${r.id}" ${String(state.filtros.ramo_id) === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `).join('');

  const opcionesEstado = ESTADOS.map((e) => `
    <option value="${e}" ${state.filtros.estado === e ? 'selected' : ''}>${escapeHtml(e[0].toUpperCase() + e.slice(1))}</option>
  `).join('');

  return `
    <form class="historial-filtros" id="historial-filtros-form">
      <div class="historial-filtros__campo">
        <label>Ramo</label>
        <select class="field-input" name="ramo_id">
          <option value="">Todos</option>
          ${opcionesRamo}
        </select>
      </div>
      <div class="historial-filtros__campo">
        <label>Cliente</label>
        <input class="field-input" type="text" name="cliente" placeholder="Nombre del cliente" value="${escapeHtml(state.filtros.cliente)}" />
      </div>
      <div class="historial-filtros__campo">
        <label>Fecha desde</label>
        <input class="field-input" type="date" name="fecha_desde" value="${escapeHtml(state.filtros.fecha_desde)}" />
      </div>
      <div class="historial-filtros__campo">
        <label>Fecha hasta</label>
        <input class="field-input" type="date" name="fecha_hasta" value="${escapeHtml(state.filtros.fecha_hasta)}" />
      </div>
      <div class="historial-filtros__campo">
        <label>Estado</label>
        <select class="field-input" name="estado">
          <option value="">Todos</option>
          ${opcionesEstado}
        </select>
      </div>
      <button class="btn-primary" type="submit">Buscar</button>
      <button class="btn-outline" type="button" data-action="limpiar-filtros">Limpiar filtros</button>
    </form>
  `;
}

function renderTabla() {
  if (state.loading) {
    return '<div class="empty-state__subtitle">Cargando cotizaciones…</div>';
  }
  if (state.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.error)}</div>`;
  }
  if (!state.cotizaciones.length) {
    return '<div class="empty-state__subtitle">No se encontraron cotizaciones con estos filtros.</div>';
  }

  const filas = state.cotizaciones.map((c) => {
    const prima = primaRepresentativa(c);
    const puedeOferta = ofertaDisponible(c);
    return `
      <tr>
        <td><span class="historial-tabla__numero">${escapeHtml(c.numero_cotizacion)}</span></td>
        <td>${escapeHtml(c.cliente_nombre ?? '—')}</td>
        <td>${escapeHtml(c.ramos?.nombre_display ?? '—')}</td>
        <td>${escapeHtml(c.planes?.nombre ?? '—')}</td>
        <td>${fmtFecha(c.created_at)}</td>
        <td>${crearBadge(c.estado ?? '—', ESTADO_BADGE[c.estado] ?? 'neutral')}</td>
        <td class="historial-tabla__prima">${prima != null ? escapeHtml(fmtGs(prima)) : '—'}</td>
        <td>
          <div class="historial-tabla__actions">
            <button class="historial-tabla__btn-ghost" data-action="ver-detalle" data-id="${c.id}">Ver detalle</button>
            ${puedeOferta
              ? `<button class="btn-outline historial-tabla__btn-oferta" data-action="descargar-oferta" data-id="${c.id}" data-numero="${escapeHtml(c.numero_cotizacion)}">Carta Oferta</button>`
              : `<button class="btn-outline historial-tabla__btn-oferta historial-oferta-disabled" disabled title="Carta Oferta no disponible para este ramo todavía">Carta Oferta</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Número</th>
          <th>Cliente</th>
          <th>Ramo</th>
          <th>Plan</th>
          <th>Fecha</th>
          <th>Estado</th>
          <th>Prima</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderPaginacion() {
  const totalPaginas = Math.max(1, Math.ceil(state.count / PAGE_SIZE));
  const paginaActual = Math.floor(state.offset / PAGE_SIZE) + 1;

  return `
    <div class="historial-paginacion">
      <button class="btn-outline" data-action="pagina-anterior" ${state.offset === 0 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${paginaActual} de ${totalPaginas}</span>
      <button class="btn-outline" data-action="pagina-siguiente" ${state.offset + PAGE_SIZE >= state.count ? 'disabled' : ''}>Siguiente</button>
    </div>
  `;
}

function renderModalDetalle() {
  const m = state.modal;
  const row = m.row;

  let cuerpo = '<div class="empty-state__subtitle">Cargando detalle…</div>';
  if (m.error) {
    cuerpo = `<div class="admin-modal__error">${escapeHtml(m.error)}</div>`;
  } else if (!m.loading && m.detalle) {
    const d = m.detalle;
    const variantesHtml = (d.cotizacion_variantes ?? []).map((v) => {
      const formasHtml = (v.cotizacion_plan_pago ?? []).map((fp) => `
        <tr>
          <td>${escapeHtml(fp.formas_pago?.nombre_display ?? '—')}</td>
          <td>${fmtGs(fp.premio_total)}</td>
          <td>${fmtGs(fp.monto_inicial)}</td>
          <td>${fmtGs(fp.monto_cuota)}</td>
        </tr>
      `).join('');
      return `
        <div class="historial-detalle__grupo">
          <div class="historial-detalle__grupo-titulo">
            ${v.tipo_franquicia === 'con_franquicia' ? 'Con franquicia' : 'Sin franquicia'} — Prima ${fmtGs(v.prima)}
          </div>
          <table class="admin-table admin-table--nested">
            <thead>
              <tr><th>Forma de pago</th><th>Premio total</th><th>Inicial</th><th>Cuota</th></tr>
            </thead>
            <tbody>${formasHtml || '<tr><td colspan="4">Sin planes de pago cargados.</td></tr>'}</tbody>
          </table>
        </div>
      `;
    }).join('');

    const coberturasHtml = (d.cotizacion_coberturas ?? []).map((c) => `
      <tr>
        <td>${escapeHtml(c.nombre_snapshot)}</td>
        <td>${c.monto != null ? fmtGs(c.monto) : '—'}</td>
        <td>${c.franquicia != null ? fmtGs(c.franquicia) : '—'}</td>
      </tr>
    `).join('');

    cuerpo = `
      <div class="historial-detalle__grupo">
        <div class="historial-detalle__grupo-titulo">Datos generales</div>
        <div>Cliente: ${escapeHtml(d.cliente_nombre ?? '—')}</div>
        <div>Contacto: ${escapeHtml(d.cliente_contacto ?? '—')}</div>
        <div>Fecha: ${fmtFecha(d.created_at)}</div>
        <div>Estado: ${escapeHtml(d.estado ?? '—')}</div>
      </div>
      ${variantesHtml}
      ${coberturasHtml ? `
        <div class="historial-detalle__grupo">
          <div class="historial-detalle__grupo-titulo">Coberturas</div>
          <table class="admin-table admin-table--nested">
            <thead><tr><th>Cobertura</th><th>Monto</th><th>Franquicia</th></tr></thead>
            <tbody>${coberturasHtml}</tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-backdrop">
      <div class="admin-modal historial-modal-detalle" data-stop-propagation="true">
        <div class="admin-modal__title">Cotización ${escapeHtml(row?.numero_cotizacion ?? '')}</div>
        ${cuerpo}
        <div class="admin-modal__actions">
          ${row && puedeEditar(row)
            ? `<button type="button" class="btn-outline" data-action="editar-cotizacion" data-id="${row.id}">Editar</button>`
            : `<button type="button" class="btn-outline historial-oferta-disabled" disabled title="${escapeHtml(row ? motivoNoEditable(row) : '')}">Editar</button>`}
          <button type="button" class="btn-outline" data-action="cerrar-modal">Cerrar</button>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function bindEvents() {
  const form = document.getElementById('historial-filtros-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      state.filtros.ramo_id = form.ramo_id.value;
      state.filtros.cliente = form.cliente.value.trim();
      state.filtros.fecha_desde = form.fecha_desde.value;
      state.filtros.fecha_hasta = form.fecha_hasta.value;
      state.filtros.estado = form.estado.value;
      aplicarFiltros();
    });
  }

  app.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', onActionClick);
  });

  const backdrop = app.querySelector('.admin-modal-backdrop');
  if (backdrop) {
    backdrop.querySelector('.admin-modal')?.addEventListener('click', (e) => e.stopPropagation());
  }
}

function onActionClick(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;

  if (action === 'logout') {
    cerrarSesion();
    return;
  }
  if (action === 'limpiar-filtros') {
    limpiarFiltros();
    return;
  }
  if (action === 'pagina-anterior') {
    irPaginaAnterior();
    return;
  }
  if (action === 'pagina-siguiente') {
    irPaginaSiguiente();
    return;
  }
  if (action === 'ver-detalle') {
    verDetalle(Number(el.dataset.id));
    return;
  }
  if (action === 'descargar-oferta') {
    descargarOferta(el, Number(el.dataset.id), el.dataset.numero);
    return;
  }
  if (action === 'editar-cotizacion') {
    editarCotizacion(Number(el.dataset.id));
    return;
  }
  if (action === 'cerrar-modal' || action === 'cerrar-modal-backdrop') {
    cerrarModal();
  }
}

init();
