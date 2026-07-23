import { api, auth } from '../shared/api.js';
import { escapeHtml } from '../shared/dom.js';
import { renderSidebarFooter, renderTopbarUser } from '../shared/sidebar.js';

// Configuración (self-service) — cualquier usuario logueado (admin o agente) ve su propio
// perfil y cambia su propia contraseña. Distinto del panel /admin/ (gestión de OTROS
// usuarios, roles, coberturas, tasas y planes — requiere permisos específicos).
// configuracion-guard.js (cargado antes en index.html) ya resuelve el redirect si no hay sesión.

const ICON_EYE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"></circle></svg>`;
const ICON_EYE_OFF = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.5A10.6 10.6 0 0 1 12 5c5 0 9 4 10.5 7-.5 1-1.3 2.2-2.4 3.4M6.7 6.7C4.5 8.1 2.8 10 1.5 12c1.5 3 5.5 7 10.5 7 1.4 0 2.7-.3 3.9-.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const ICON_LOCK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4.5" y="10.5" width="15" height="10" rx="2" stroke="currentColor" stroke-width="1.7"></rect><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg>`;
const ICON_USER = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.3" stroke="currentColor" stroke-width="1.7"></circle><path d="M4.5 20c1.2-3.8 4.4-5.8 7.5-5.8s6.3 2 7.5 5.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg>`;
const ICON_MAIL = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" stroke-width="1.7"></rect><path d="M4.5 6.5l7.5 6 7.5-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const ICON_SHIELD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3.5l7 2.6v5.4c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6.1l7-2.6z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path></svg>`;
const ICON_CLOCK_SM = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"></circle><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const ICON_MONITOR = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.5" width="17" height="12" rx="1.5" stroke="currentColor" stroke-width="1.7"></rect><path d="M9 20h6M12 16.5V20" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg>`;
const ICON_CHECK_SM = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

const REQUISITOS_PASSWORD = [
  { clave: 'length', label: 'Mínimo 8 caracteres', test: (v) => v.length >= 8 },
  { clave: 'upper', label: 'Una mayúscula', test: (v) => /[A-Z]/.test(v) },
  { clave: 'number', label: 'Un número', test: (v) => /[0-9]/.test(v) },
  { clave: 'special', label: 'Un carácter especial', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

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

function formatearTiempoRelativo(fechaIso) {
  if (!fechaIso) return 'Sin registro';
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return 'Sin registro';

  const segundos = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (segundos < 60) return 'Hace un momento';

  const unidades = [
    ['año', 31536000],
    ['mes', 2592000],
    ['día', 86400],
    ['hora', 3600],
    ['minuto', 60],
  ];

  for (const [nombre, segundosPorUnidad] of unidades) {
    const cantidad = Math.floor(segundos / segundosPorUnidad);
    if (cantidad >= 1) {
      return `Hace ${cantidad} ${nombre}${cantidad > 1 ? 's' : ''}`;
    }
  }
  return 'Hace un momento';
}

// Cosmético: no persistido en backend, solo lee el navegador/SO actual del cliente.
function detectarDispositivo() {
  const ua = navigator.userAgent;
  const navegador = ua.includes('Edg/') ? 'Edge'
    : ua.includes('Chrome/') ? 'Chrome'
    : ua.includes('Firefox/') ? 'Firefox'
    : ua.includes('Safari/') ? 'Safari'
    : 'Navegador';
  const so = ua.includes('Windows') ? 'Windows'
    : ua.includes('Mac OS') ? 'macOS'
    : ua.includes('Linux') ? 'Linux'
    : ua.includes('Android') ? 'Android'
    : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
    : 'este dispositivo';
  return `${navegador} - ${so}`;
}

function cerrarSesion() {
  auth.clearSession();
  window.location.href = '../login/';
}

function renderSidebar() {
  return `
    <div class="sidebar">
      <div class="sidebar__nav">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('configuracion')}
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
        <span class="login-field__prefix">${ICON_LOCK}</span>
        <input
          class="field-input login-field__input"
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
    </div>`;
}

function renderRequisitosPassword(valorActual) {
  return `
    <div class="config-pass-requisitos">
      ${REQUISITOS_PASSWORD.map((req) => `
        <div class="config-pass-req${req.test(valorActual) ? ' config-pass-req--met' : ''}" data-req="${req.clave}">
          <span class="config-pass-req__icon">${ICON_CHECK_SM}</span>
          <span>${req.label}</span>
        </div>
      `).join('')}
    </div>`;
}

function actualizarRequisitosPassword(valorActual) {
  REQUISITOS_PASSWORD.forEach((req) => {
    const el = document.querySelector(`.config-pass-req[data-req="${req.clave}"]`);
    el?.classList.toggle('config-pass-req--met', req.test(valorActual));
  });
}

function renderPerfilHeader() {
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
    <div class="config-perfil-header">
      <div class="sidebar__agent-avatar config-perfil-avatar">${escapeHtml(iniciales)}</div>
      <div class="config-perfil-header__info">
        <div class="config-perfil-header__name">${escapeHtml(nombreAgente)}</div>
        <span class="config-perfil-header__badge">${escapeHtml(rolLabel)}</span>
      </div>
    </div>
    <div class="config-perfil-divider"></div>`;
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
          <span class="topbar__crumb-item topbar__crumb-item--current">Configuración</span>
        </div>
        ${renderTopbarUser()}
      </div>
    </div>
  `;
}

function renderApp() {
  const usuario = state.usuario;
  const esAdmin = usuario?.rol === 'admin';
  const rolLabel = esAdmin ? 'Administrador' : usuario?.rol === 'agente' ? 'Agente' : 'Analista comercial';

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
          <div class="config-grid">
            <div class="panel card config-card config-card--perfil">
              <div class="card__title">Mi perfil</div>
              <div class="card__body">
                ${renderPerfilHeader()}
                <div class="config-fields">
                  <div class="config-field config-field--icon">
                    <span class="config-field__icon">${ICON_USER}</span>
                    <div>
                      <label>Nombre</label>
                      <div>${escapeHtml(usuario?.nombre ?? '—')}</div>
                    </div>
                  </div>
                  <div class="config-field config-field--icon">
                    <span class="config-field__icon">${ICON_MAIL}</span>
                    <div>
                      <label>Email</label>
                      <div>${escapeHtml(usuario?.email ?? '—')}</div>
                    </div>
                  </div>
                  <div class="config-field config-field--icon">
                    <span class="config-field__icon">${ICON_SHIELD}</span>
                    <div>
                      <label>Rol</label>
                      <div>${escapeHtml(rolLabel)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="panel card config-card">
              <div class="card__title config-card__title--with-icon">
                <span>Cambiar contraseña</span>
                <span class="config-card__title-icon">${ICON_LOCK}</span>
              </div>
              <div class="card__body">
                ${state.error ? `<div class="admin-banner admin-banner--error">${escapeHtml(state.error)}</div>` : ''}
                ${state.exito ? `<div class="admin-banner admin-banner--success">${escapeHtml(state.exito)}</div>` : ''}
                <form id="password-form" novalidate>
                  ${renderPasswordField('actual', 'Contraseña actual', 'current-password')}
                  ${renderPasswordField('nueva', 'Contraseña nueva', 'new-password')}
                  ${renderPasswordField('confirmar', 'Confirmar contraseña nueva', 'new-password')}
                  ${renderRequisitosPassword(state.form.password_nueva)}
                  <button type="submit" class="btn-primary" ${state.enviando ? 'disabled' : ''}>
                    ${state.enviando ? 'Guardando…' : 'Guardar contraseña'}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div class="panel card config-card config-card--actividad">
            <div class="card__title">Actividad reciente</div>
            <div class="card__body">
              <div class="config-actividad-grid">
                <div class="config-actividad-item">
                  <span class="config-actividad-icon">${ICON_CLOCK_SM}</span>
                  <div>
                    <label>Último inicio de sesión</label>
                    <div>${escapeHtml(formatearTiempoRelativo(usuario?.ultima_sesion))}</div>
                  </div>
                </div>
                <div class="config-actividad-item">
                  <span class="config-actividad-icon">${ICON_MONITOR}</span>
                  <div>
                    <label>Dispositivo</label>
                    <div>${escapeHtml(detectarDispositivo())}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document.querySelector('.sidebar [data-action="logout"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    cerrarSesion();
  });

  document.getElementById('password-form')?.addEventListener('submit', onSubmit);

  document.getElementById('campo-nueva')?.addEventListener('input', (e) => {
    actualizarRequisitosPassword(e.target.value);
  });

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
