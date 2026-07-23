import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

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
});
