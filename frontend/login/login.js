import { api, auth } from '../shared/api.js'
import { escapeHtml } from '../shared/dom.js'
import { initConstellationFx, initLoginFx } from '../shared/fx.js'

// Pantalla de login del Cotizador Tajy — WU4 (auth de frontend). Formulario
// email/password contra POST /api/auth/login; guarda token+usuario y redirige
// a cotizar. Estética: variante 3b del handoff en esta carpeta (diagonal rojo).

const app = document.getElementById('app')

const ICON_EYE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"></circle></svg>`
const ICON_EYE_OFF = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.5A10.6 10.6 0 0 1 12 5c5 0 9 4 10.5 7-.5 1-1.3 2.2-2.4 3.4M6.7 6.7C4.5 8.1 2.8 10 1.5 12c1.5 3 5.5 7 10.5 7 1.4 0 2.7-.3 3.9-.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
const ICON_EMAIL = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2" stroke="currentColor" stroke-width="1.6"></rect><path d="m5 7 7 5.2L19 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`

if (typeof window.bindThemeToggleOnce === 'function') {
  window.bindThemeToggleOnce()
}

const state = {
  email: '',
  error: '',
  enviando: false,
  mostrarPassword: false,
}

let destroyFx = []

function destroyLoginFx() {
  destroyFx.forEach((destroy) => destroy())
  destroyFx = []
}

function mountLoginFx() {
  const diagonal = app.querySelector('.login-diagonal')
  const backgroundCanvas = app.querySelector('#fx-canvas-bg')
  const diagonalCanvas = app.querySelector('#fx-canvas')
  const constellationCanvas = app.querySelector('#fx-canvas-constellation')

  if (!diagonal || !backgroundCanvas || !diagonalCanvas || !constellationCanvas) return

  // Sobre el fondo casi negro del tema oscuro las partículas y sus enlaces
  // necesitan más alpha y un rojo más luminoso para leerse; con los valores del
  // tema claro la red de constelación queda invisible. El halo (glow) va solo en
  // oscuro: sobre fondo blanco no lee como neón, lee como borrón.
  const oscuro = document.documentElement.getAttribute('data-theme') === 'dark'

  // La constelación se monta siempre: reemplaza a un <img> que antes se veía en
  // cualquier caso, y sabe quedarse quieta sola si el usuario pidió movimiento
  // reducido. Los campos de partículas sí se omiten por completo en ese caso.
  const constelacion = initConstellationFx(constellationCanvas, {
    glow: oscuro ? 11 : 0,
  })

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    destroyFx = [constelacion]
    return
  }

  destroyFx = [
    constelacion,
    initLoginFx(backgroundCanvas, app, {
      particleCount: 60,
      particleColor: oscuro ? '255, 42, 61' : '216, 19, 46',
      particleAlpha: oscuro ? 0.45 : 0.35,
      linkAlpha: oscuro ? 0.17 : 0.1,
      glow: oscuro ? 8 : 0,
    }),
    initLoginFx(diagonalCanvas, diagonal, {
      // El canvas de la diagonal cubre todo el viewport pero el clip-path recorta
      // más de la mitad, así que con el default (46) quedaban ~20 partículas
      // visibles y la franja se veía vacía.
      particleCount: 85,
      particleColor: oscuro ? '255, 150, 160' : '255, 184, 190',
      particleAlpha: oscuro ? 0.3 : 0.34,
      linkAlpha: oscuro ? 0.14 : 0.1,
      glow: oscuro ? 7 : 0,
    }),
  ]
}

function render() {
  destroyLoginFx()

  app.innerHTML = `
    <canvas class="login-fx login-fx--background" id="fx-canvas-bg" aria-hidden="true"></canvas>
    <div class="login-diagonal" aria-hidden="true">
      <canvas class="login-fx login-fx--diagonal" id="fx-canvas" aria-hidden="true"></canvas>
    </div>
    <img class="login-decoration login-decoration--wave login-decoration--wave-lower" src="../shared/assets/particles-wave-red.svg" alt="" aria-hidden="true" />
    <img class="login-decoration login-decoration--wave login-decoration--wave-upper" src="../shared/assets/particles-wave-red.svg" alt="" aria-hidden="true" />
    <canvas class="login-decoration login-decoration--constellation" id="fx-canvas-constellation" aria-hidden="true"></canvas>
    <div class="login-card">
      <div class="login-card__tab"></div>
      <div class="login-card__logo-wrap">
        <img class="login-card__logo login-card__logo--light" src="./assets/logo-rojo-con-negro.svg" alt="" aria-hidden="true" />
        <img class="login-card__logo login-card__logo--dark" src="../../logo/logo-dark.png" alt="" aria-hidden="true" />
      </div>
      <h1 class="login-card__title">Bienvenido</h1>
      <p class="login-card__subtitle">Ingresá tus credenciales para continuar</p>
      ${state.error ? `<div class="login-card__error" role="alert">${escapeHtml(state.error)}</div>` : ''}
      <form class="login-form" id="login-form" novalidate>
        <div class="login-field">
          <label for="email">Email</label>
          <div class="login-field__input-wrap">
            <span class="login-field__icon" aria-hidden="true">${ICON_EMAIL}</span>
            <input type="email" id="email" name="email" placeholder="correo@ejemplo.com" autocomplete="username" required value="${escapeHtml(state.email)}" />
          </div>
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
    ${
      typeof window.renderThemeToggleButton === 'function'
        ? window.renderThemeToggleButton({ className: 'login-theme-toggle' })
        : ''
    }
  `

  document.getElementById('login-form').addEventListener('submit', onSubmit)
  document.getElementById('toggle-password').addEventListener('click', onTogglePassword)
  document.getElementById('forgot-link').addEventListener('click', onForgotPassword)
  mountLoginFx()
}

function onTogglePassword() {
  // Actualizamos solo el input y el ícono en vez de llamar a render(): un
  // re-render completo destruye y recrea el botón, perdiendo el foco del
  // teclado. Así el foco queda predecible en el propio botón toggle.
  state.mostrarPassword = !state.mostrarPassword
  const input = document.getElementById('password')
  const toggle = document.getElementById('toggle-password')
  input.type = state.mostrarPassword ? 'text' : 'password'
  toggle.innerHTML = state.mostrarPassword ? ICON_EYE_OFF : ICON_EYE
  toggle.focus()
}

function onForgotPassword(e) {
  e.preventDefault()
  state.error =
    'No hay recuperación automática de contraseña — pedile a un administrador que te la reestablezca desde el panel.'
  render()
}

async function onSubmit(e) {
  e.preventDefault()
  const form = e.target
  const email = form.email.value.trim()
  const password = form.password.value

  state.email = email
  state.error = ''
  state.enviando = true
  render()

  try {
    // El body de POST /auth/login ya no trae el JWT (viaja solo por cookie httpOnly) —
    // login setea ambas cookies server-side; acá solo redirigimos, la próxima página
    // resuelve la sesión vía auth.cargarSesion() -> GET /auth/me.
    await api.post('/auth/login', { email, password })
    window.location.href = '../bienvenida/'
  } catch {
    state.enviando = false
    state.error = 'No se pudo iniciar sesión. Revisá el email y la contraseña.'
    render()
  }
}

// Si ya hay una sesión activa (cookie httpOnly vigente), evitamos el re-login
// innecesario. cargarSesion() resuelve contra GET /auth/me — ya no hay token en
// localStorage para chequear de forma síncrona.
async function init() {
  const usuario = await auth.cargarSesion()
  if (usuario) {
    window.location.href = '../cotizar/'
  } else {
    render()
  }
}

init()

// El color y el alpha de las partículas se resuelven al montar el canvas, así que
// un cambio de tema en caliente dejaría el campo con la paleta anterior (rojo
// apagado sobre fondo negro, o al revés). Remontamos el efecto, sin re-renderizar
// el formulario: eso perdería lo que el usuario ya haya tipeado.
document.addEventListener('tajy-theme-change', () => {
  destroyLoginFx()
  mountLoginFx()
})

window.addEventListener('pagehide', destroyLoginFx)
