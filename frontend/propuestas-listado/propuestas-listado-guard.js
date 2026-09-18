import { auth } from '../shared/api.js'

// Guard mínimo de la página de listado de Propuestas Formales — mismo patrón que
// historial-guard.js: no hay token en localStorage para chequear de forma síncrona
// (cambio session-httponly-cookie), hay que esperar auth.cargarSesion() (GET /auth/me)
// antes de decidir el gate.
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
