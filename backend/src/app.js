import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router as apiRouter } from './routes/index.js';

export function createApp() {
  const { FRONTEND_URL } = process.env;
  if (!FRONTEND_URL) {
    throw new Error(
      'Falta FRONTEND_URL en el .env — copiar .env.example y completar. No hay fallback a wildcard por seguridad.'
    );
  }

  const app = express();

  app.use(helmet());
  app.use(cors({ origin: FRONTEND_URL }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api', apiRouter);

  // Manejador de errores centralizado — todo controller que haga next(err) cae acá.
  // Loguear err.stack (no el objeto err crudo): errores de Zod hacen que
  // console.error(err) explote dentro de util.inspect y tumba el proceso entero.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err.stack || err.message || err);
    const status = err.status || 500;
    res.status(status).json({
      error: err.publicMessage || 'Error interno del servidor',
    });
  });

  return app;
}
