import compression from 'compression'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { ZodError } from 'zod'

import { csrfProtection } from './middleware/csrf.js'
import { apiRateLimiter } from './middleware/rate-limit.js'
import { router as apiRouter } from './routes/index.js'

export function createApp() {
  const { FRONTEND_URL, FRONTEND_URL_EXTRA, JWT_SECRET } = process.env
  if (!FRONTEND_URL) {
    throw new Error(
      'Falta FRONTEND_URL en el .env — copiar .env.example y completar. No hay fallback a wildcard por seguridad.'
    )
  }
  if (!JWT_SECRET) {
    throw new Error(
      'Falta JWT_SECRET en el .env — copiar .env.example y completar. Sin esto, jwt.sign()/jwt.verify() firman y validan tokens con `undefined`, dejando la autenticación rota o falsificable.'
    )
  }

  const app = express()

  // Un solo salto de proxy inverso en producción (Caddy, mismo docker-compose): sin esto,
  // req.ip siempre resuelve a la IP de Caddy y los rate limiters (keyGenerator basado en
  // req.ip) comparten un único balde entre todos los agentes reales.
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(compression())

  // Sin cookies ni body: se sirve antes del cookieParser para que no quede
  // encadenado a él (CodeQL marca cualquier handler posterior al parser de
  // cookies que no pase por CSRF, aunque este endpoint no lea ni mute nada).
  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  // credentials: true habilita que el navegador envíe/reciba la cookie de sesión
  // httpOnly (fetch con credentials:'include') — requiere un origin explícito, nunca
  // wildcard: el propio spec de CORS prohíbe combinar '*' con credenciales.
  const allowedOrigins = [
    FRONTEND_URL,
    ...(FRONTEND_URL_EXTRA || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ]

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    })
  )
  // Falso positivo de CodeQL en esta línea: solo reconoce librerías CSRF conocidas
  // (csurf, etc.) como sanitizer — no modela nuestro middleware custom de double-submit
  // (csrfProtection, montado dos líneas más abajo antes del router) como protección
  // válida, así que marca cualquier ruta detrás de este parser como desprotegida.
  // Verificado con tests (csrf.test.js) y en vivo con curl/Playwright: bloquea header
  // ausente/incorrecto en todo método mutante, pasa con el token correcto.
  app.use(cookieParser()) // codeql[js/missing-token-validation]
  app.use(express.json({ limit: '2mb' }))

  app.use('/api', apiRateLimiter, csrfProtection, apiRouter)

  app.use(manejarErrorCentral)

  return app
}

// Manejador de errores centralizado — todo controller que haga next(err) cae acá.
// Loguear err.stack (no el objeto err crudo): errores de Zod hacen que
// console.error(err) explote dentro de util.inspect y tumba el proceso entero.
//
// `codigo` expone el código de dominio ya calculado por servicios como
// traducirErrorRpc() (ej. PF_BORRADOR_NO_EDITABLE, PF_REVISION_CONFLICT) — son strings
// públicas de negocio, no detalle interno. Sin esto, el frontend solo tenía `status` +
// el texto libre de `error`, y no podía distinguir un 409 de otro (ver bug real: un 409
// por PF_BORRADOR_NO_EDITABLE se mostraba como "conflicto de revisión, recargue" aunque
// la causa real era otra). `undefined` se omite solo en la serialización JSON, así que
// esto no cambia el shape de una respuesta que no traía código.
export function manejarErrorCentral(err, _req, res, _next) {
  console.error(err.stack || err.message || err)

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos de entrada inválidos',
      detalles: err.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message,
      })),
    })
  }

  const status = err.status || 500

  res.status(status).json({
    error: err.publicMessage || 'Error interno del servidor',
    codigo: err.code,
  })
}
