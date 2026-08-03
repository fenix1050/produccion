import { auth } from '../shared/api.js'

// Guard mínimo de la página stub de Historial (WU4) — el listado real es Fase 5/WU5.
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
