// Única fuente de atributos de cookie de sesión (D2 de design.md, cambio
// session-httponly-cookie). res.clearCookie solo borra si domain/path/sameSite/secure
// coinciden EXACTAMENTE con los usados al setear — duplicar esos atributos en dos sitios
// (login y logout) es el modo de falla más probable (cookie zombie tras logout). Por eso
// set y clear comparten las mismas funciones de opciones.

export const COOKIE_SESION = process.env.COOKIE_SESSION_NAME || 'tajy_session'

export const COOKIE_CSRF = process.env.COOKIE_CSRF_NAME || 'tajy_csrf'

// 45 minutos, alineado a JWT_EXPIRES_IN de auth.service.js.
const MAX_AGE_MS = 45 * 60 * 1000

// COOKIE_DOMAIN es independiente de NODE_ENV a propósito: NODE_ENV distingue el gate de
// negocio de PF-3 (productivo vs. no productivo), no si el despliegue tiene TLS y un
// dominio compartido entre frontend y API. TEST corre con NODE_ENV=test (para no pasar
// ese gate) pero SÍ necesita Secure+Domain porque test-web.cotizador.lat y
// test-api.cotizador.lat son subdominios distintos bajo HTTPS real — igual que PROD con
// cotizador.lat/api.cotizador.lat. Sin COOKIE_DOMAIN seteado (dev local, npm test) la
// cookie queda host-only y sin Secure, porque http://localhost no tiene TLS.
function dominioCookie() {
  return process.env.COOKIE_DOMAIN || null
}

function opcionesBase() {
  const domain = dominioCookie()
  const base = {
    secure: Boolean(domain),
    sameSite: 'lax',
    path: '/',
  }
  if (domain) {
    base.domain = domain
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
