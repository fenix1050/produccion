// Única fuente de atributos de cookie de sesión (D2 de design.md, cambio
// session-httponly-cookie). res.clearCookie solo borra si domain/path/sameSite/secure
// coinciden EXACTAMENTE con los usados al setear — duplicar esos atributos en dos sitios
// (login y logout) es el modo de falla más probable (cookie zombie tras logout). Por eso
// set y clear comparten las mismas funciones de opciones.

export const COOKIE_SESION = process.env.COOKIE_SESSION_NAME || 'tajy_session'

export const COOKIE_CSRF = process.env.COOKIE_CSRF_NAME || 'tajy_csrf'

// 45 minutos, alineado a JWT_EXPIRES_IN de auth.service.js.
const MAX_AGE_MS = 45 * 60 * 1000

// En producción (Docker seteando NODE_ENV=production, ver backend/Dockerfile) la cookie
// necesita Secure + Domain para viajar entre api.cotizador.lat y cotizador.lat. En
// desarrollo local (`npm run dev`, tests) no hay TLS ni ese dominio — Secure=true
// bloquearía la cookie por completo sobre http://localhost, y Domain la dejaría inválida.
function esProduccion() {
  return process.env.NODE_ENV === 'production'
}

function opcionesBase() {
  const base = {
    secure: esProduccion(),
    sameSite: 'lax',
    path: '/',
  }
  if (esProduccion()) {
    base.domain = '.cotizador.lat'
  }
  return base
}

export function opcionesSesion() {
  return { ...opcionesBase(), httpOnly: true, maxAge: MAX_AGE_MS }
}

export function opcionesCsrf() {
  return { ...opcionesBase(), httpOnly: false, maxAge: MAX_AGE_MS }
}

export function setCookiesSesion(res, token, csrfToken) {
  res.cookie(COOKIE_SESION, token, opcionesSesion())
  res.cookie(COOKIE_CSRF, csrfToken, opcionesCsrf())
}

// Sin maxAge: res.clearCookie solo compara los atributos de identidad de la cookie
// (domain/path/sameSite/secure/httpOnly), no la expiración.
export function limpiarCookiesSesion(res) {
  const { maxAge: _maxAgeSesion, ...baseSesion } = opcionesSesion()
  const { maxAge: _maxAgeCsrf, ...baseCsrf } = opcionesCsrf()
  res.clearCookie(COOKIE_SESION, baseSesion)
  res.clearCookie(COOKIE_CSRF, baseCsrf)
}
