import compression from 'compression'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

import { csrfProtection } from './middleware/csrf.js'
import { apiRateLimiter } from './middleware/rate-limit.js'
import { router as apiRouter } from './routes/index.js'

export function createApp() {
  const { FRONTEND_URL, JWT_SECRET } = process.env
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
  app.use(
    cors({
      origin: FRONTEND_URL,
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

  // Manejador de errores centralizado — todo controller que haga next(err) cae acá.
  // Loguear err.stack (no el objeto err crudo): errores de Zod hacen que
  // console.error(err) explote dentro de util.inspect y tumba el proceso entero.

  app.use((err, _req, res, _next) => {
    console.error(err.stack || err.message || err)
    const status = err.status || 500
    res.status(status).json({
      error: err.publicMessage || 'Error interno del servidor',
    })
  })

  return app
}
