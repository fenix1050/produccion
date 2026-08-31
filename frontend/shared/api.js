// Wrapper simple de fetch para hablar con la API — mismo patrón que Siniestros Tajy.
// Nunca se llama a Supabase directo desde acá.
//
// Cambio session-httponly-cookie: el JWT de sesión ya no vive en localStorage — viaja
// como cookie httpOnly (fuera del alcance de JS), y la identidad del usuario se resuelve
// vía GET /auth/me, cacheada en memoria por carga de página (D4 de design.md).

const API_BASE_URL = window.API_BASE_URL || 'http://localhost:3000/api'

const COOKIE_CSRF = 'tajy_csrf'

// ---- Caché en memoria de la sesión (D4) ----
// getUsuario()/isLoggedIn()/tieneAccesoAdmin() se invocan en render síncrono en ~10
// sitios del frontend — volverlos async propaga `await` por toda la capa de render.
// Cada página es un documento completo, así que "una carga = una llamada" alcanza; la
// cookie httpOnly es la autoridad real, esto es solo un espejo de lectura para la UI.
let usuarioCacheado = null
let sesionCargada = false
let sesionEnCurso = null

function getUsuario() {
  return usuarioCacheado
}

function isLoggedIn() {
  return sesionCargada && Boolean(usuarioCacheado)
}

function clearSession() {
  usuarioCacheado = null
  sesionCargada = false
}

// Ruta relativa a login desde cualquier shell (cotizar/historial/admin/login están todos
// al mismo nivel bajo frontend/, así que desde adentro de cada uno es "../login/").
function redirectToLogin() {
  const yaEnLogin = window.location.pathname.replace(/\\/g, '/').includes('/login/')
  if (yaEnLogin) return
  window.location.href = '../login/'
}

function leerCookie(nombre) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${nombre}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

const METODOS_MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function headersCsrf(method) {
  if (!METODOS_MUTANTES.has(method)) return {}
  const csrfToken = leerCookie(COOKIE_CSRF)
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headersCsrf(method) },
    ...options,
  })

  if (res.status === 401) {
    clearSession()
    redirectToLogin()
    throw new Error('Sesión expirada o inválida')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))

    if (res.status === 403 && body.error === 'Token CSRF inválido o ausente') {
      clearSession()
      redirectToLogin()
    }

    const error = new Error(body.error || `Error ${res.status} al llamar a ${path}`)
    error.status = res.status
    error.body = body
    throw error
  }

  if (res.status === 204) return null
  return res.json()
}

async function requestBlob(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
  })

  if (res.status === 401) {
    clearSession()
    redirectToLogin()
    throw new Error('Sesión expirada o inválida')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Error ${res.status} al llamar a ${path}`)
  }
  return res.blob()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  getBlob: (path) => requestBlob(path),
}

// Un usuario tiene algo que hacer en el panel admin si es rol 'admin' (acceso total) O
// tiene al menos uno de los 4 permisos parciales de un rol custom (migración 031) — mismo
// criterio que ya usa admin.js para filtrar qué secciones mostrarle una vez adentro
// (seccionesVisibles), pero acá decide si vale la pena mostrarle la puerta de entrada.
function tieneAccesoAdmin() {
  const usuario = getUsuario()
  if (!usuario) return false
  return (
    usuario.rol === 'admin' ||
    Boolean(usuario.puede_gestionar_usuarios) ||
    Boolean(usuario.puede_editar_coberturas) ||
    Boolean(usuario.puede_editar_tasas) ||
    Boolean(usuario.puede_editar_planes)
  )
}

// Bootstrap de sesión: una llamada por carga de página a GET /auth/me, cachea el
// resultado en memoria. Traga el 401 (request() ya hizo clearSession()+redirect+throw
// para ese caso) y devuelve null en vez de propagar — así login.js y los guards deciden
// qué hacer sin un bucle de redirect (D8 de design.md).
async function cargarSesion() {
  // Dedupe de llamadas concurrentes: el guard de cada página (ej. historial-guard.js) y
  // el bootstrap propio del módulo (ej. historial.js) invocan cargarSesion() casi al
  // mismo tiempo, antes de que la primera resuelva — sin esto, cada carga de página
  // dispararía 2 GET /auth/me en vez de 1 (D4 de design.md: "una carga = una llamada").
  if (sesionEnCurso) return sesionEnCurso

  sesionEnCurso = (async () => {
    try {
      const { usuario } = await api.get('/auth/me')
      usuarioCacheado = usuario
      sesionCargada = true
      return usuario
    } catch {
      usuarioCacheado = null
      sesionCargada = true
      return null
    } finally {
      sesionEnCurso = null
    }
  })()

  return sesionEnCurso
}

// Best-effort: avisa al backend para invalidar el token (token_version) e instruye al
// navegador a limpiar las cookies (Set-Cookie de logout) ANTES de limpiar la caché local.
// Si la llamada falla (red caída, sesión ya vencida/inválida) igual hay que limpiar la
// caché en memoria y dejar al usuario deslogueado del lado cliente — no bloquear el
// logout local por un error de red o un 401 esperable (la sesión ya no sirve de todos
// modos).
async function logout() {
  try {
    await api.post('/auth/logout')
  } catch {
    // intencional: logout del cliente sigue adelante pase lo que pase acá
  } finally {
    clearSession()
  }
}

export const auth = {
  getUsuario,
  clearSession,
  cargarSesion,
  logout,
  isLoggedIn,
  tieneAccesoAdmin,
}
