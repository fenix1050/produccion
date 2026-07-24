import { api, auth } from '../shared/api.js';
import { escapeHtml } from '../shared/dom.js';
import { initLoginFx } from './login-fx.js';

// Pantalla de login del Cotizador Tajy — WU4 (auth de frontend). Formulario
// email/password contra POST /api/auth/login; guarda token+usuario y redirige
// a cotizar. Estética: variante 3b del handoff en esta carpeta (diagonal rojo).

const app = document.getElementById('app');

const ICON_EYE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"></circle></svg>`;
const ICON_EYE_OFF = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.5A10.6 10.6 0 0 1 12 5c5 0 9 4 10.5 7-.5 1-1.3 2.2-2.4 3.4M6.7 6.7C4.5 8.1 2.8 10 1.5 12c1.5 3 5.5 7 10.5 7 1.4 0 2.7-.3 3.9-.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

const state = {
  email: '',
  error: '',
  enviando: false,
  mostrarPassword: false,
};

let destroyFx = null;

function render() {
  if (destroyFx) {
    destroyFx.forEach((fn) => fn());
    destroyFx = null;
  }

  app.innerHTML = `
    <canvas id="fx-canvas-bg"></canvas>
    <div class="login-diagonal"><canvas id="fx-canvas"></canvas></div>
    <div class="login-card">
      <div class="login-card__tab"></div>
      <img class="login-card__logo" src="./assets/logo-rojo-con-negro.svg" alt="Aseguradora Tajy" />
      <h1 class="login-card__title">Bienvenido</h1>
      <p class="login-card__subtitle">Ingresá tus credenciales para continuar</p>
      ${state.error ? `<div class="login-card__error" role="alert">${escapeHtml(state.error)}</div>` : ''}
      <form class="login-form" id="login-form" novalidate>
        <div class="login-field">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="correo@ejemplo.com" autocomplete="username" required value="${escapeHtml(state.email)}" />
        </div>
        <div class="login-field login-field--password">
          <label for="password">Contraseña</label>
          <div class="login-field__password-wrap">
            <input type="${state.mostrarPassword ? 'text' : 'password'}" id="password" name="password" placeholder="Tu contraseña" autocomplete="current-password" required />
            <button type="button" class="login-field__toggle" id="toggle-password" aria-label="Mostrar u ocultar contraseña">
              ${state.mostrarPassword ? ICON_EYE_OFF : ICON_EYE}
            </button>
          </div>
        </div>
        <div class="login-forgot">
          <a href="#" id="forgot-link">¿Olvidaste tu contraseña?</a>
        </div>
        <button type="submit" class="login-submit" ${state.enviando ? 'disabled' : ''}>
          ${state.enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p class="login-card__footer">Aseguradora Tajy Prop. Coop. S.A</p>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', onSubmit);
  document.getElementById('toggle-password').addEventListener('click', onTogglePassword);
  document.getElementById('forgot-link').addEventListener('click', onForgotPassword);

  const diagonal = document.querySelector('.login-diagonal');
  destroyFx = [
    initLoginFx(document.getElementById('fx-canvas'), diagonal, {
      particleColor: '255, 255, 255',
    }),
    initLoginFx(document.getElementById('fx-canvas-bg'), app, {
      particleCount: 60,
      particleColor: '216, 19, 46',
      particleAlpha: 0.35,
      linkAlpha: 0.1,
    }),
  ];
}


function onTogglePassword() {
  // Actualizamos solo el input y el ícono en vez de llamar a render(): un
  // re-render completo destruye y recrea el botón, perdiendo el foco del
  // teclado. Así el foco queda predecible en el propio botón toggle.
  state.mostrarPassword = !state.mostrarPassword;
  const input = document.getElementById('password');
  const toggle = document.getElementById('toggle-password');
  input.type = state.mostrarPassword ? 'text' : 'password';
  toggle.innerHTML = state.mostrarPassword ? ICON_EYE_OFF : ICON_EYE;
  toggle.focus();
}

function onForgotPassword(e) {
  e.preventDefault();
  state.error = 'No hay recuperación automática de contraseña — pedile a un administrador que te la reestablezca desde el panel.';
  render();
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.email.value.trim();
  const password = form.password.value;

  state.email = email;
  state.error = '';
  state.enviando = true;
  render();

  try {
    const data = await api.post('/auth/login', { email, password });
    auth.setToken(data.token);
    auth.setUsuario(data.usuario);
    window.location.href = '../bienvenida/';
  } catch (err) {
    state.enviando = false;
    state.error = 'No se pudo iniciar sesión. Revisá el email y la contraseña.';
    render();
  }
}

// Si ya hay una sesión guardada, evitamos el re-login innecesario.
if (auth.isLoggedIn()) {
  window.location.href = '../cotizar/';
} else {
  render();
}
