// New v2 cookies are host-only; only explicit deletion of legacy cookies uses Domain.
// Set and clear of new cookies share attributes so logout cannot leave cookie zombies.

export const COOKIE_SESION_LEGACY = process.env.COOKIE_SESSION_NAME || 'tajy_session'
export const COOKIE_CSRF_LEGACY = process.env.COOKIE_CSRF_NAME || 'tajy_csrf'

export const COOKIE_SESION = `${COOKIE_SESION_LEGACY}_v2`
export const COOKIE_CSRF = `${COOKIE_CSRF_LEGACY}_v2`

// 45 minutos, alineado a JWT_EXPIRES_IN de auth.service.js.
const MAX_AGE_MS = 45 * 60 * 1000

function opcionesBase() {
  return {
    // Preserve the existing Secure toggle without emitting COOKIE_DOMAIN as an attribute.
    secure: Boolean(process.env.COOKIE_DOMAIN),
    sameSite: 'lax',
    path: '/',
  }
}

export function opcionesSesion() {
  return { ...opcionesBase(), httpOnly: true, maxAge: MAX_AGE_MS }
}

export function opcionesCsrf() {
  return { ...opcionesBase(), httpOnly: true, maxAge: MAX_AGE_MS }
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

// The pre-isolation cookies were issued for the shared parent domain. Expire only legacy
// names actually present on this request; Domain is reserved for these deletion headers.
export function limpiarCookiesLegadas(req, res) {
  if (req.legacyCookiesLimpiadas) return
  req.legacyCookiesLimpiadas = true
  const cookies = req.cookies ?? {}
  const opcionesLegacy = {
    domain: '.cotizador.lat',
    path: '/',
    sameSite: 'lax',
    secure: Boolean(process.env.COOKIE_DOMAIN),
  }

  if (Object.hasOwn(cookies, COOKIE_SESION_LEGACY)) {
    res.clearCookie(COOKIE_SESION_LEGACY, opcionesLegacy)
  }
  if (Object.hasOwn(cookies, COOKIE_CSRF_LEGACY)) {
    res.clearCookie(COOKIE_CSRF_LEGACY, opcionesLegacy)
  }
}
