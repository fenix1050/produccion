import compression from 'compression'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'

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

  app.use(helmet())
  app.use(compression())
  app.use(cors({ origin: FRONTEND_URL }))
  app.use(express.json({ limit: '2mb' }))

  app.get('/health', (_req, res) => res.json({ status: 'ok' }))

  app.use('/api', apiRateLimiter, apiRouter)

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
