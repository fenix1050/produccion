import { auth } from '../shared/api.js'

// Guard mínimo de la página de listado de Propuestas Formales — mismo patrón que
// historial-guard.js: no hay token en localStorage para chequear de forma síncrona
// (cambio session-httponly-cookie), hay que esperar auth.cargarSesion() (GET /auth/me)
// antes de decidir el gate.
function navegarRutaInterna(path) {
  try {
    const url = new URL(path, window.location.href)
    if (url.origin !== window.location.origin) return false
    window.location.assign(`${url.pathname}${url.search}${url.hash}`)
    return true
  } catch {
    return false
  }
}

async function init() {
  const usuario = await auth.cargarSesion()
  if (!usuario) navegarRutaInterna('../login/')
}

init()

document.getElementById('logout-link')?.addEventListener('click', async (e) => {
  e.preventDefault()
  await auth.logout()
  navegarRutaInterna('../login/')
})
