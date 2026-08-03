import { timingSafeEqual } from 'node:crypto'

import { COOKIE_CSRF } from '../utils/cookies.js'
import { httpError } from '../utils/http-error.js'

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Único endpoint exento: todavía no existe una cookie CSRF antes de loguearse (la crea
// el propio login) — ya está cubierto por loginRateLimiter (D3 de design.md).
// Ruta relativa (sin el prefijo '/api'): este middleware se monta como
// `app.use('/api', apiRateLimiter, csrfProtection, apiRouter)`, y Express recorta el
// prefijo del mount ('/api') de req.path/req.url para toda la pila montada en esa capa.
const RUTA_EXENTA = '/auth/login'

function comparacionSegura(a, b) {
  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')
  // timingSafeEqual exige buffers de igual longitud — si difieren, ya sabemos que no
  // coinciden (comparar longitudes no filtra nada sensible, a diferencia de comparar
  // los bytes con === antes de esta guarda).
  if (bufferA.length !== bufferB.length) return false
  return timingSafeEqual(bufferA, bufferB)
}

/**
 * Validación CSRF double-submit, global por método HTTP (D3 de design.md): toda request
 * que muta estado (POST/PUT/PATCH/DELETE) debe incluir el header `X-CSRF-Token` con el
 * mismo valor que la cookie `tajy_csrf` (legible por JS, seteada en el login). Montado
 * antes del router de la API — cobertura sin registro ruta por ruta.
 */
export function csrfProtection(req, res, next) {
  if (METODOS_SEGUROS.has(req.method) || req.path === RUTA_EXENTA) {
    return next()
  }

  const cookieToken = req.cookies?.[COOKIE_CSRF]
  const headerToken = req.headers['x-csrf-token']

  if (!cookieToken || !headerToken || !comparacionSegura(cookieToken, headerToken)) {
    return next(httpError(403, 'Token CSRF inválido o ausente'))
  }

  next()
}
