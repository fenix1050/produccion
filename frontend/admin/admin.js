import { api, auth } from '../shared/api.js';

// Panel de Administración del Cotizador Tajy — WU5, primera porción (Usuarios).
// Mismo patrón Vanilla JS que cotizar.js: state + render + delegación de eventos por
// data-action. Coberturas por plan / Tasas / Planes quedan como stub "Próximamente" —
// se implementan en próximas porciones de WU5.

const SECCIONES = [
  { id: 'usuarios', label: 'Usuarios', icon: '👤', disponible: true },
  { id: 'coberturas', label: 'Coberturas por plan', icon: '🛡️', disponible: false },
  { id: 'tasas', label: 'Tasas', icon: '📈', disponible: false },
  { id: 'planes', label: 'Planes', icon: '📋', disponible: false },
];

const state = {
  seccion: 'usuarios',
  usuarios: [],
  loadingUsuarios: false,
  usuariosError: '',
  banner: null, // { tipo: 'error'|'success', texto }
  modal: null, // { tipo: 'crear'|'editar'|'password', usuario?, error, guardando }
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
    el.addEventListener('click', onActionClick);
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
