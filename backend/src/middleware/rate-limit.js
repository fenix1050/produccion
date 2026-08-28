import { rateLimit, ipKeyGenerator } from 'express-rate-limit'

// Combina IP + email para no bloquear a todos los usuarios detrás de la misma IP (oficina,
// NAT) por los intentos fallidos de uno solo, sin dejar de frenar fuerza bruta contra una
// cuenta puntual. ipKeyGenerator normaliza IPv6 (evita bypass truncando/expandiendo la IP).
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email || '').toLowerCase()}`,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá de nuevo más tarde.' },
})

// Throttle general para toda la API autenticada (ramos, planes, cotizaciones, admin, etc.):
// un token JWT filtrado o un cliente con bug no debería poder golpear la base sin límite.
// Límite generoso porque cubre navegación normal de varios agentes detrás de la misma IP/NAT.
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { error: 'Demasiadas solicitudes. Probá de nuevo más tarde.' },
})

function claveUsuario(req) {
  return req.usuario?.id ? `user:${req.usuario.id}` : ipKeyGenerator(req.ip)
}

export const passwordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: claveUsuario,
  message: {
    error: 'Demasiados intentos de cambio de contraseña. Probá de nuevo más tarde.',
  },
})

export const adminPasswordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: claveUsuario,
  message: {
    error: 'Demasiados reseteos de contraseña. Probá de nuevo más tarde.',
  },
})

export const importRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: claveUsuario,
  message: {
    error: 'Demasiadas importaciones. Probá de nuevo más tarde.',
  },
})

export const pdfRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: claveUsuario,
  message: {
    error: 'Demasiadas solicitudes de generación de PDF. Probá de nuevo más tarde.',
  },
})
