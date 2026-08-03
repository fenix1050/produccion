import { auth } from '../shared/api.js'

// Guard de la pantalla de Configuración: solo exige sesión activa, SIN chequear ningún
// permiso de admin — a diferencia de admin.js, esta pantalla es self-service y la usa
// cualquier usuario logueado (admin o agente) para ver su propio perfil y cambiar su
// propia contraseña. Mismo patrón que historial-guard.js.
// Cambio session-httponly-cookie: ya no hay token en localStorage para chequear de forma
// síncrona — hay que esperar auth.cargarSesion() (GET /auth/me) antes de decidir el gate.
async function init() {
  const usuario = await auth.cargarSesion()
  if (!usuario) {
    window.location.href = '../login/'
  }
}

init()

document.getElementById('logout-link')?.addEventListener('click', async (e) => {
  e.preventDefault()
  await auth.logout()
  window.location.href = '../login/'
})
