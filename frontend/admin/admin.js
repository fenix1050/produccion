import { api, auth } from '../shared/api.js';

// Panel de Administración del Cotizador Tajy — WU5, primera porción (Usuarios).
// Mismo patrón Vanilla JS que cotizar.js: state + render + delegación de eventos por
// data-action. Coberturas por plan / Tasas / Planes quedan como stub "Próximamente" —
// se implementan en próximas porciones de WU5.

const SECCIONES = [
  { id: 'usuarios', label: 'Usuarios', icon: '👤', disponible: true },
  { id: 'coberturas', label: 'Coberturas por plan', icon: '🛡️', disponible: false },
  { id: 'tasas', label: 'Tasas', icon: '📈', disponible: false },
  { id: 'planes', label: 'Planes', icon: '📋', disponible: true },
];

const state = {
  seccion: 'usuarios',
  usuarios: [],
  loadingUsuarios: false,
  usuariosError: '',
  banner: null, // { tipo: 'error'|'success', texto }
  modal: null, // { tipo: 'crear'|'editar'|'password', usuario?, error, guardando }

  ramos: [],
  planes: [],
  loadingPlanes: false,
  planesError: '',
  ramoFiltro: 'todos',
  planExpandido: null, // id del plan con la fila de formas de pago abierta
  formasPagoPorPlan: {}, // planId -> { loading, error, datos: [] }
  primaEnEdicion: new Set(), // ids de plan con el campo prima_tecnica_minima habilitado para editar
  tasaRpfEnEdicion: new Set(), // ids de plan_formas_pago con la tasa habilitada para editar
};

const app = document.getElementById('app');

async function init() {
  if (!auth.isLoggedIn()) {
    window.location.href = '../login/';
    return;
  }
  const usuario = auth.getUsuario();
  if (usuario?.rol !== 'admin') {
    // El panel admin es solo para rol 'admin' — a diferencia de un mensaje de acceso
    // denegado, se redirige directo al cotizador (mismo patrón que la sesión expirada
    // en shared/api.js, que también resuelve con un redirect en vez de una pantalla propia).
    window.location.href = '../cotizar/';
    return;
  }
  renderApp();
  await cargarUsuarios();
}

function cerrarSesion() {
  auth.clearSession();
  window.location.href = '../login/';
}

function fmtGs(n) {
  const num = Math.round(Number(n) || 0);
  return `Gs. ${num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function mostrarBanner(tipo, texto) {
  state.banner = { tipo, texto };
  renderApp();
}

// ---------------------------------------------------------------------------
// Usuarios: carga y acciones
// ---------------------------------------------------------------------------

async function cargarUsuarios() {
  state.loadingUsuarios = true;
  state.usuariosError = '';
  renderApp();
  try {
    state.usuarios = await api.get('/admin/usuarios');
  } catch (err) {
    state.usuarios = [];
    state.usuariosError = err.message || 'No se pudo cargar la lista de usuarios.';
  } finally {
    state.loadingUsuarios = false;
    renderApp();
  }
}

function abrirModalCrear() {
  state.modal = {
    tipo: 'crear',
    error: '',
    guardando: false,
    nombre: '',
    email: '',
    rol: 'agente',
    puede_editar_tasas: false,
    password: '',
  };
  renderApp();
}

function abrirModalEditar(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) return;
  state.modal = {
    tipo: 'editar',
    usuario,
    error: '',
    guardando: false,
    rol: usuario.rol,
    puede_editar_tasas: Boolean(usuario.puede_editar_tasas),
    activo: Boolean(usuario.activo),
  };
  renderApp();
}

function abrirModalPassword(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) return;
  state.modal = { tipo: 'password', usuario, error: '', guardando: false, password: '' };
  renderApp();
}

function cerrarModal() {
  state.modal = null;
  renderApp();
}

async function desactivarUsuario(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) return;
  if (!confirm(`¿Desactivar a ${usuario.nombre}? No va a poder iniciar sesión.`)) return;

  try {
    await api.put(`/admin/usuarios/${usuarioId}`, { activo: false });
    mostrarBanner('success', `${usuario.nombre} fue desactivado.`);
    await cargarUsuarios();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo desactivar el usuario.');
  }
}

async function guardarModalCrear(form) {
  const nombre = form.nombre.value.trim();
  const email = form.email.value.trim();
  const rol = form.rol.value;
  const puedeEditarTasas = form.puede_editar_tasas.checked;
  const password = form.password.value;

  if (!nombre || !email) {
    state.modal.error = 'Completá nombre y email.';
    renderApp();
    return;
  }
  if (password.length < 8) {
    state.modal.error = 'La contraseña debe tener al menos 8 caracteres.';
    renderApp();
    return;
  }

  state.modal.error = '';
  state.modal.guardando = true;
  renderApp();

  try {
    await api.post('/admin/usuarios', {
      nombre,
      email,
      rol,
      puede_editar_tasas: puedeEditarTasas,
      password,
    });
    cerrarModal();
    mostrarBanner('success', `Usuario ${nombre} creado.`);
    await cargarUsuarios();
  } catch (err) {
    state.modal.guardando = false;
    state.modal.error = err.message || 'No se pudo crear el usuario.';
    renderApp();
  }
}

async function guardarModalEditar(form) {
  const usuario = state.modal.usuario;
  const rol = form.rol.value;
  const puedeEditarTasas = form.puede_editar_tasas.checked;
  const activo = form.activo.checked;

  state.modal.error = '';
  state.modal.guardando = true;
  renderApp();

  try {
    await api.put(`/admin/usuarios/${usuario.id}`, {
      rol,
      puede_editar_tasas: puedeEditarTasas,
      activo,
    });
    cerrarModal();
    mostrarBanner('success', `Usuario ${usuario.nombre} actualizado.`);
    await cargarUsuarios();
  } catch (err) {
    state.modal.guardando = false;
    state.modal.error = err.message || 'No se pudo actualizar el usuario.';
    renderApp();
  }
}

async function guardarModalPassword(form) {
  const usuario = state.modal.usuario;
  const password = form.password.value;

  if (password.length < 8) {
    state.modal.error = 'La contraseña debe tener al menos 8 caracteres.';
    renderApp();
    return;
  }

  state.modal.error = '';
  state.modal.guardando = true;
  renderApp();

  try {
    await api.put(`/admin/usuarios/${usuario.id}/password`, { password });
    cerrarModal();
    mostrarBanner('success', `Contraseña de ${usuario.nombre} actualizada.`);
  } catch (err) {
    state.modal.guardando = false;
    state.modal.error = err.message || 'No se pudo actualizar la contraseña.';
    renderApp();
  }
}

// ---------------------------------------------------------------------------
// Planes: carga y acciones
// ---------------------------------------------------------------------------

async function cargarPlanes() {
  state.loadingPlanes = true;
  state.planesError = '';
  renderApp();
  try {
    const [ramos, planes] = await Promise.all([
      state.ramos.length ? Promise.resolve(state.ramos) : api.get('/ramos'),
      api.get('/admin/planes'),
    ]);
    state.ramos = ramos;
    state.planes = planes;
  } catch (err) {
    state.planes = [];
    state.planesError = err.message || 'No se pudo cargar la lista de planes.';
  } finally {
    state.loadingPlanes = false;
    renderApp();
  }
}

async function togglePlanActivo(planId, activo) {
  try {
    await api.put(`/admin/planes/${planId}`, { activo });
    const plan = state.planes.find((p) => p.id === Number(planId));
    if (plan) plan.activo = activo;
    mostrarBanner('success', `Plan ${activo ? 'activado' : 'desactivado'}.`);
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el plan.');
  }
}

function habilitarEdicionPrima(planId) {
  state.primaEnEdicion.add(planId);
  renderApp();
}

function cancelarEdicionPrima(planId) {
  state.primaEnEdicion.delete(planId);
  renderApp();
}

async function guardarPrimaTecnicaMinima(planId, form) {
  const valor = form.prima_tecnica_minima.value;
  const prima_tecnica_minima = valor === '' ? null : Number(valor);

  try {
    const plan = await api.put(`/admin/planes/${planId}`, { prima_tecnica_minima });
    const idx = state.planes.findIndex((p) => p.id === Number(planId));
    if (idx !== -1) state.planes[idx] = { ...state.planes[idx], ...plan };
    state.primaEnEdicion.delete(Number(planId));
    mostrarBanner('success', 'Prima técnica mínima actualizada.');
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la prima técnica mínima.');
  }
}

async function toggleFormasPago(planId) {
  if (state.planExpandido === planId) {
    state.planExpandido = null;
    renderApp();
    return;
  }
  state.planExpandido = planId;
  renderApp();

  if (state.formasPagoPorPlan[planId]?.datos) return; // ya cargadas

  state.formasPagoPorPlan[planId] = { loading: true, error: '', datos: [] };
  renderApp();
  try {
    const datos = await api.get(`/admin/planes/${planId}/formas-pago`);
    state.formasPagoPorPlan[planId] = { loading: false, error: '', datos };
  } catch (err) {
    state.formasPagoPorPlan[planId] = {
      loading: false,
      error: err.message || 'No se pudieron cargar las formas de pago.',
      datos: [],
    };
  }
  renderApp();
}

async function toggleFormaPagoHabilitada(planFormaPagoId, planId, habilitada) {
  try {
    await api.put(`/admin/plan-formas-pago/${planFormaPagoId}`, { habilitada });
    const entry = state.formasPagoPorPlan[planId];
    const fila = entry?.datos.find((f) => f.id === Number(planFormaPagoId));
    if (fila) fila.habilitada = habilitada;
    mostrarBanner('success', `Forma de pago ${habilitada ? 'habilitada' : 'deshabilitada'}.`);
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la forma de pago.');
  }
}

function habilitarEdicionTasaRpf(planFormaPagoId) {
  state.tasaRpfEnEdicion.add(planFormaPagoId);
  renderApp();
}

function cancelarEdicionTasaRpf(planFormaPagoId) {
  state.tasaRpfEnEdicion.delete(planFormaPagoId);
  renderApp();
}

async function guardarTasaRpf(planFormaPagoId, planId, form) {
  const tasa_rpf = Number(form.tasa_rpf.value);

  try {
    const fila = await api.put(`/admin/plan-formas-pago/${planFormaPagoId}`, { tasa_rpf });
    const entry = state.formasPagoPorPlan[planId];
    const idx = entry?.datos.findIndex((f) => f.id === Number(planFormaPagoId));
    if (entry && idx !== -1) entry.datos[idx] = { ...entry.datos[idx], ...fila };
    state.tasaRpfEnEdicion.delete(Number(planFormaPagoId));
    mostrarBanner('success', 'Tasa RPF actualizada.');
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la tasa RPF.');
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
            <div class="main-header__title">Administración</div>
            <div class="main-header__subtitle">Gestión de usuarios, coberturas, tasas y planes</div>
          </div>
        </div>
        <div class="admin-content">
          ${renderBanner()}
          ${renderSeccion()}
        </div>
      </div>
    </div>
    ${state.modal ? renderModal() : ''}
  `;
  bindEvents();
}

function renderTopbar() {
  return `
    <div class="topbar">
      <div class="topbar__brand">
        <img class="topbar__logo" src="../../logo/logo.svg" alt="Aseguradora Tajy" />
        <div class="topbar__divider"></div>
        <div class="topbar__text">
          <div class="topbar__subtitle">Panel de Administración</div>
        </div>
      </div>
    </div>
  `;
}

function renderSidebar() {
  const items = SECCIONES.map((s) => `
    <div
      class="admin-nav__item ${s.id === state.seccion ? 'admin-nav__item--active' : ''}"
      data-action="select-seccion"
      data-seccion="${s.id}"
    >
      <span>${s.icon}</span>
      <span>${s.label}</span>
      ${!s.disponible ? '<span class="admin-nav__badge">Pronto</span>' : ''}
    </div>
  `).join('');

  const usuario = auth.getUsuario();
  const nombreAgente = usuario?.nombre || 'Admin';
  const iniciales = nombreAgente
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'AD';

  return `
    <div class="sidebar">
      <div class="sidebar__section-label">Secciones</div>
      <div class="admin-nav">${items}</div>
      <div class="sidebar__footer">
        <a class="nav-item" href="../cotizar/">🧮 Volver a cotizar</a>
        <div class="nav-item" data-action="logout">🚪 Cerrar sesión</div>
        <div class="sidebar__agent">
          <div class="sidebar__agent-avatar">${escapeHtml(iniciales)}</div>
          <div>
            <div class="sidebar__agent-name">${escapeHtml(nombreAgente)}</div>
            <div class="sidebar__agent-role">Administrador</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderBanner() {
  if (!state.banner) return '';
  return `<div class="admin-banner admin-banner--${state.banner.tipo}">${escapeHtml(state.banner.texto)}</div>`;
}

function renderSeccion() {
  const seccion = SECCIONES.find((s) => s.id === state.seccion);
  if (!seccion?.disponible) return renderProximamente(seccion);
  if (state.seccion === 'usuarios') return renderUsuarios();
  if (state.seccion === 'planes') return renderPlanes();
  return renderProximamente(seccion);
}

function renderProximamente(seccion) {
  return `
    <div class="empty-state">
      <div class="empty-state__title">${escapeHtml(seccion?.label ?? '')}</div>
      <div class="empty-state__subtitle">Esta sección todavía no está implementada — próximamente.</div>
    </div>
  `;
}

function renderUsuarios() {
  return `
    <div class="admin-toolbar">
      <div class="admin-toolbar__title">Usuarios</div>
      <button class="btn-primary" data-action="crear-usuario">+ Nuevo usuario</button>
    </div>
    <div class="panel card">
      ${renderTablaUsuarios()}
    </div>
  `;
}

function renderTablaUsuarios() {
  if (state.loadingUsuarios) {
    return '<div class="empty-state__subtitle">Cargando usuarios…</div>';
  }
  if (state.usuariosError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.usuariosError)}</div>`;
  }
  if (!state.usuarios.length) {
    return '<div class="empty-state__subtitle">Todavía no hay usuarios cargados.</div>';
  }

  const filas = state.usuarios.map((u) => `
    <tr>
      <td>${escapeHtml(u.nombre)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="admin-pill admin-pill--${u.rol}">${u.rol === 'admin' ? 'Admin' : 'Agente'}</span></td>
      <td><span class="admin-pill ${u.puede_editar_tasas ? 'admin-pill--yes' : 'admin-pill--no'}">${u.puede_editar_tasas ? 'Sí' : 'No'}</span></td>
      <td><span class="admin-pill ${u.activo ? 'admin-pill--yes' : 'admin-pill--no'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <div class="admin-table__actions">
          <button class="btn-outline" data-action="editar-usuario" data-id="${u.id}">Editar</button>
          <button class="btn-outline" data-action="password-usuario" data-id="${u.id}">Resetear password</button>
          ${u.activo ? `<button class="btn-outline" data-action="desactivar-usuario" data-id="${u.id}">Desactivar</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Email</th>
          <th>Rol</th>
          <th>Edita tasas</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderPlanes() {
  const opcionesRamo = state.ramos.map((r) => `
    <option value="${r.id}" ${state.ramoFiltro === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `).join('');

  return `
    <div class="admin-toolbar">
      <div class="admin-toolbar__title">Planes</div>
      <select class="field-input" style="width: auto;" data-action="filtrar-ramo">
        <option value="todos" ${state.ramoFiltro === 'todos' ? 'selected' : ''}>Todos los ramos</option>
        ${opcionesRamo}
      </select>
    </div>
    <div class="panel card">
      ${renderTablaPlanes()}
    </div>
  `;
}

function renderTablaPlanes() {
  if (state.loadingPlanes) {
    return '<div class="empty-state__subtitle">Cargando planes…</div>';
  }
  if (state.planesError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.planesError)}</div>`;
  }

  const planesFiltrados = state.ramoFiltro === 'todos'
    ? state.planes
    : state.planes.filter((p) => String(p.ramo_id) === state.ramoFiltro);

  if (!planesFiltrados.length) {
    return '<div class="empty-state__subtitle">No hay planes para mostrar.</div>';
  }

  const filas = planesFiltrados.map((p) => `
    <tr>
      <td>${escapeHtml(p.nombre)}</td>
      <td>${escapeHtml(p.ramos?.nombre_display ?? '')}</td>
      <td>
        <label class="admin-modal__checkbox">
          <input type="checkbox" data-action="toggle-plan-activo" data-id="${p.id}" ${p.activo ? 'checked' : ''} />
          ${p.activo ? 'Activo' : 'Inactivo'}
        </label>
      </td>
      <td>${renderCampoPrimaTecnicaMinima(p)}</td>
      <td>
        <button class="btn-outline" data-action="toggle-formas-pago" data-id="${p.id}">
          ${state.planExpandido === p.id ? 'Ocultar' : 'Formas de pago'}
        </button>
      </td>
    </tr>
    ${state.planExpandido === p.id ? `<tr class="admin-subrow"><td colspan="5">${renderFormasPagoDelPlan(p.id)}</td></tr>` : ''}
  `).join('');

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Plan</th>
          <th>Ramo</th>
          <th>Estado</th>
          <th>Prima técnica mínima</th>
          <th>Formas de pago</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderFormasPagoDelPlan(planId) {
  const entry = state.formasPagoPorPlan[planId];
  if (!entry || entry.loading) {
    return '<div class="empty-state__subtitle">Cargando formas de pago…</div>';
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`;
  }
  if (!entry.datos.length) {
    return '<div class="empty-state__subtitle">Este plan no tiene formas de pago configuradas.</div>';
  }

  const filas = entry.datos.map((f) => `
    <tr>
      <td>${escapeHtml(f.formas_pago?.nombre_display ?? '')}</td>
      <td>${renderCampoTasaRpf(f, planId)}</td>
      <td>
        <label class="admin-modal__checkbox">
          <input type="checkbox" data-action="toggle-forma-pago-habilitada" data-id="${f.id}" data-plan-id="${planId}" ${f.habilitada ? 'checked' : ''} />
          ${f.habilitada ? 'Habilitada' : 'Deshabilitada'}
        </label>
      </td>
    </tr>
  `).join('');

  return `
    <table class="admin-table admin-table--nested">
      <thead>
        <tr>
          <th>Forma de pago</th>
          <th>Tasa RPF (%)</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderCampoPrimaTecnicaMinima(plan) {
  if (!state.primaEnEdicion.has(plan.id)) {
    return `
      <div class="admin-valor-fijo">
        <span>${plan.prima_tecnica_minima != null ? escapeHtml(fmtGs(plan.prima_tecnica_minima)) : '—'}</span>
        <button class="btn-outline" data-action="editar-prima-tecnica-minima" data-id="${plan.id}">Editar</button>
      </div>
    `;
  }
  return `
    <form class="admin-inline-form" data-form-action="prima-tecnica-minima" data-id="${plan.id}">
      <input class="field-input field-input--sm" type="number" step="0.01" name="prima_tecnica_minima" value="${plan.prima_tecnica_minima ?? ''}" autofocus />
      <button class="btn-outline" type="submit">Guardar</button>
      <button class="btn-outline" type="button" data-action="cancelar-prima-tecnica-minima" data-id="${plan.id}">Cancelar</button>
    </form>
  `;
}

function renderCampoTasaRpf(formaPagoPlan, planId) {
  if (!state.tasaRpfEnEdicion.has(formaPagoPlan.id)) {
    return `
      <div class="admin-valor-fijo">
        <span>${escapeHtml(String(formaPagoPlan.tasa_rpf))}</span>
        <button class="btn-outline" data-action="editar-tasa-rpf" data-id="${formaPagoPlan.id}" data-plan-id="${planId}">Editar</button>
      </div>
    `;
  }
  return `
    <form class="admin-inline-form" data-form-action="tasa-rpf" data-id="${formaPagoPlan.id}" data-plan-id="${planId}">
      <input class="field-input field-input--sm" type="number" step="0.001" name="tasa_rpf" value="${formaPagoPlan.tasa_rpf}" autofocus />
      <button class="btn-outline" type="submit">Guardar</button>
      <button class="btn-outline" type="button" data-action="cancelar-tasa-rpf" data-id="${formaPagoPlan.id}">Cancelar</button>
    </form>
  `;
}

function renderModal() {
  const m = state.modal;
  let titulo = '';
  let cuerpo = '';

  if (m.tipo === 'crear') {
    titulo = 'Nuevo usuario';
    cuerpo = `
      <div class="admin-modal__field">
        <label>Nombre</label>
        <input class="field-input" type="text" name="nombre" value="${escapeHtml(m.nombre)}" />
      </div>
      <div class="admin-modal__field">
        <label>Email</label>
        <input class="field-input" type="email" name="email" value="${escapeHtml(m.email)}" />
      </div>
      <div class="admin-modal__field">
        <label>Rol</label>
        <select class="field-input" name="rol">
          <option value="agente" ${m.rol === 'agente' ? 'selected' : ''}>Agente</option>
          <option value="admin" ${m.rol === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="admin-modal__field">
        <label class="admin-modal__checkbox">
          <input type="checkbox" name="puede_editar_tasas" ${m.puede_editar_tasas ? 'checked' : ''} />
          Puede editar tasas
        </label>
      </div>
      <div class="admin-modal__field">
        <label>Contraseña (mín. 8 caracteres)</label>
        <input class="field-input" type="password" name="password" autocomplete="new-password" />
      </div>
    `;
  } else if (m.tipo === 'editar') {
    titulo = `Editar ${escapeHtml(m.usuario.nombre)}`;
    cuerpo = `
      <div class="admin-modal__field">
        <label>Rol</label>
        <select class="field-input" name="rol">
          <option value="agente" ${m.rol === 'agente' ? 'selected' : ''}>Agente</option>
          <option value="admin" ${m.rol === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="admin-modal__field">
        <label class="admin-modal__checkbox">
          <input type="checkbox" name="puede_editar_tasas" ${m.puede_editar_tasas ? 'checked' : ''} />
          Puede editar tasas
        </label>
      </div>
      <div class="admin-modal__field">
        <label class="admin-modal__checkbox">
          <input type="checkbox" name="activo" ${m.activo ? 'checked' : ''} />
          Activo
        </label>
      </div>
    `;
  } else if (m.tipo === 'password') {
    titulo = `Resetear contraseña de ${escapeHtml(m.usuario.nombre)}`;
    cuerpo = `
      <div class="admin-modal__field">
        <label>Nueva contraseña (mín. 8 caracteres)</label>
        <input class="field-input" type="password" name="password" autocomplete="new-password" />
      </div>
    `;
  }

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-backdrop">
      <div class="admin-modal" data-stop-propagation="true">
        <div class="admin-modal__title">${titulo}</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-form">
          ${cuerpo}
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function bindEvents() {
  app.querySelectorAll('[data-action]').forEach((el) => {
    const evento = el.tagName === 'SELECT' || el.tagName === 'INPUT' ? 'change' : 'click';
    el.addEventListener(evento, onActionClick);
  });

  app.querySelectorAll('[data-form-action]').forEach((form) => {
    form.addEventListener('submit', onInlineFormSubmit);
  });

  const backdrop = app.querySelector('.admin-modal-backdrop');
  if (backdrop) {
    backdrop.querySelector('.admin-modal')?.addEventListener('click', (e) => e.stopPropagation());
  }

  const form = document.getElementById('admin-modal-form');
  if (form) {
    form.addEventListener('submit', onModalSubmit);
  }
}

function onActionClick(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;

  if (action === 'select-seccion') {
    state.seccion = el.dataset.seccion;
    state.banner = null;
    renderApp();
    if (state.seccion === 'planes' && !state.planes.length && !state.loadingPlanes) {
      cargarPlanes();
    }
    return;
  }
  if (action === 'logout') {
    cerrarSesion();
    return;
  }
  if (action === 'crear-usuario') {
    abrirModalCrear();
    return;
  }
  if (action === 'editar-usuario') {
    abrirModalEditar(el.dataset.id);
    return;
  }
  if (action === 'password-usuario') {
    abrirModalPassword(el.dataset.id);
    return;
  }
  if (action === 'desactivar-usuario') {
    desactivarUsuario(el.dataset.id);
    return;
  }
  if (action === 'cerrar-modal' || action === 'cerrar-modal-backdrop') {
    cerrarModal();
    return;
  }
  if (action === 'filtrar-ramo') {
    state.ramoFiltro = el.value;
    renderApp();
    return;
  }
  if (action === 'toggle-plan-activo') {
    togglePlanActivo(el.dataset.id, el.checked);
    return;
  }
  if (action === 'toggle-formas-pago') {
    toggleFormasPago(Number(el.dataset.id));
    return;
  }
  if (action === 'toggle-forma-pago-habilitada') {
    toggleFormaPagoHabilitada(el.dataset.id, Number(el.dataset.planId), el.checked);
    return;
  }
  if (action === 'editar-prima-tecnica-minima') {
    habilitarEdicionPrima(Number(el.dataset.id));
    return;
  }
  if (action === 'cancelar-prima-tecnica-minima') {
    cancelarEdicionPrima(Number(el.dataset.id));
    return;
  }
  if (action === 'editar-tasa-rpf') {
    habilitarEdicionTasaRpf(Number(el.dataset.id));
    return;
  }
  if (action === 'cancelar-tasa-rpf') {
    cancelarEdicionTasaRpf(Number(el.dataset.id));
  }
}

function onInlineFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const accion = form.dataset.formAction;
  if (accion === 'prima-tecnica-minima') {
    guardarPrimaTecnicaMinima(form.dataset.id, form);
  } else if (accion === 'tasa-rpf') {
    guardarTasaRpf(form.dataset.id, Number(form.dataset.planId), form);
  }
}

function onModalSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const tipo = state.modal.tipo;
  if (tipo === 'crear') guardarModalCrear(form);
  else if (tipo === 'editar') guardarModalEditar(form);
  else if (tipo === 'password') guardarModalPassword(form);
}

init();
