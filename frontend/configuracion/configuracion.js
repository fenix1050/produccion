import { api, auth } from '../shared/api.js';

// Configuración (self-service) — cualquier usuario logueado (admin o agente) ve su propio
// perfil y cambia su propia contraseña. Distinto del panel /admin/ (gestión de OTROS
// usuarios, roles, coberturas, tasas y planes — requiere permisos específicos).
// configuracion-guard.js (cargado antes en index.html) ya resuelve el redirect si no hay sesión.

const ICON_EYE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"></circle></svg>`;
const ICON_EYE_OFF = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.5A10.6 10.6 0 0 1 12 5c5 0 9 4 10.5 7-.5 1-1.3 2.2-2.4 3.4M6.7 6.7C4.5 8.1 2.8 10 1.5 12c1.5 3 5.5 7 10.5 7 1.4 0 2.7-.3 3.9-.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

const state = {
  usuario: auth.getUsuario(),
  form: {
    password_actual: '',
    password_nueva: '',
    password_confirmar: '',
  },
  mostrar: {
    actual: false,
    nueva: false,
    confirmar: false,
  },
  enviando: false,
  error: '',
  exito: '',
};

const app = document.getElementById('app');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function cerrarSesion() {
  auth.clearSession();
  window.location.href = '../login/';
}

function renderSidebar() {
  const usuario = state.usuario;
  const nombreAgente = usuario?.nombre || 'Agente';
  const esAdmin = usuario?.rol === 'admin';
  const rolLabel = esAdmin ? 'Administrador' : usuario?.rol === 'agente' ? 'Agente' : 'Analista comercial';
  const iniciales = nombreAgente
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'AG';

  return `
    <div class="sidebar">
      <div class="sidebar__nav">
        <a class="nav-item" href="../cotizar/">🧮 Volver a cotizar</a>
        <a class="nav-item" href="../historial/">📋 Historial de cotizaciones</a>
        ${esAdmin ? '<a class="nav-item" href="../admin/">🛠️ Panel de administración</a>' : ''}
        <div class="nav-item" id="logout-link" data-action="logout">🚪 Cerrar sesión</div>
        <div class="sidebar__agent">
          <div class="sidebar__agent-avatar">${escapeHtml(iniciales)}</div>
          <div>
            <div class="sidebar__agent-name">${escapeHtml(nombreAgente)}</div>
            <div class="sidebar__agent-role">${escapeHtml(rolLabel)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPasswordField(campo, label, autocomplete) {
  const visible = state.mostrar[campo];
  return `
    <div class="config-field login-field--password">
      <label for="campo-${campo}">${label}</label>
      <div class="login-field__password-wrap">
        <input
          class="field-input"
          type="${visible ? 'text' : 'password'}"
          id="campo-${campo}"
          name="${campo}"
          autocomplete="${autocomplete}"
          value="${escapeHtml(state.form[`password_${campo}`] ?? '')}"
          required
        />
        <button type="button" class="login-field__toggle" data-toggle="${campo}" aria-label="Mostrar u ocultar contraseña">
          ${visible ? ICON_EYE_OFF : ICON_EYE}
        </button>
      </div>
    </div>
  `;
}

function renderTopbar() {
  return `
    <div class="topbar">
      <div class="topbar__brand">
        <img class="topbar__logo" src="../../logo/logo.svg" alt="Aseguradora Tajy" />
        <div class="topbar__divider"></div>
        <div class="topbar__text">
          <div class="topbar__subtitle">Configuración</div>
        </div>
      </div>
    </div>
  `;
}

function renderApp() {
  const usuario = state.usuario;

  app.innerHTML = `
    ${renderTopbar()}
    <div class="app-body">
      ${renderSidebar()}
      <div class="main">
        <div class="main-header">
          <div>
            <div class="main-header__title">Configuración</div>
            <div class="main-header__subtitle">Tu perfil y tu contraseña de acceso</div>
          </div>
        </div>
        <div class="admin-content">
          <div class="panel card config-card config-card--perfil">
            <div class="card__title">Mi perfil</div>
            <div class="config-fields">
              <div class="config-field">
                <label>Nombre</label>
                <div>${escapeHtml(usuario?.nombre ?? '—')}</div>
              </div>
              <div class="config-field">
                <label>Email</label>
                <div>${escapeHtml(usuario?.email ?? '—')}</div>
              </div>
              <div class="config-field">
                <label>Rol</label>
                <div>${escapeHtml(usuario?.rol ?? '—')}</div>
              </div>
            </div>
          </div>

          <div class="panel card config-card">
            <div class="card__title">Cambiar contraseña</div>
            ${state.error ? `<div class="admin-banner admin-banner--error">${escapeHtml(state.error)}</div>` : ''}
            ${state.exito ? `<div class="admin-banner admin-banner--success">${escapeHtml(state.exito)}</div>` : ''}
            <form id="password-form" novalidate>
              ${renderPasswordField('actual', 'Contraseña actual', 'current-password')}
              ${renderPasswordField('nueva', 'Contraseña nueva', 'new-password')}
              ${renderPasswordField('confirmar', 'Confirmar contraseña nueva', 'new-password')}
              <button type="submit" class="btn-primary" ${state.enviando ? 'disabled' : ''}>
                ${state.enviando ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document.getElementById('logout-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    cerrarSesion();
  });

  document.getElementById('password-form')?.addEventListener('submit', onSubmit);

  app.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const campo = btn.dataset.toggle;
      guardarValoresForm();
      state.mostrar[campo] = !state.mostrar[campo];
      renderApp();
    });
  });
}

// Antes de re-renderizar (ej. al togglear "mostrar contraseña"), persistimos lo que el
// usuario ya tipeó en el state — si no, renderApp() reconstruye el innerHTML desde cero
// y se perdería el valor de los inputs.
function guardarValoresForm() {
  const form = document.getElementById('password-form');
  if (!form) return;
  state.form.password_actual = form.querySelector('#campo-actual')?.value ?? state.form.password_actual;
  state.form.password_nueva = form.querySelector('#campo-nueva')?.value ?? state.form.password_nueva;
  state.form.password_confirmar = form.querySelector('#campo-confirmar')?.value ?? state.form.password_confirmar;
}

async function onSubmit(e) {
  e.preventDefault();
  guardarValoresForm();
  state.error = '';
  state.exito = '';

  const { password_actual, password_nueva, password_confirmar } = state.form;

  if (!password_actual || !password_nueva || !password_confirmar) {
    state.error = 'Completá los tres campos.';
    renderApp();
    return;
  }

  if (password_nueva.length < 8) {
    state.error = 'La contraseña nueva debe tener al menos 8 caracteres.';
    renderApp();
    return;
  }

  if (password_nueva !== password_confirmar) {
    state.error = 'La confirmación no coincide con la contraseña nueva.';
    renderApp();
    return;
  }

  state.enviando = true;
  renderApp();

  try {
    await api.put('/auth/password', { password_actual, password_nueva });
    state.exito = 'Contraseña actualizada correctamente.';
    state.form = { password_actual: '', password_nueva: '', password_confirmar: '' };
  } catch (err) {
    state.error = err.message || 'No se pudo cambiar la contraseña.';
  } finally {
    state.enviando = false;
    renderApp();
  }
}

renderApp();
