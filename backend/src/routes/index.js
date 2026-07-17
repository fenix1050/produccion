import { Router } from 'express';
import { router as ramosRouter } from './ramos.routes.js';
import { router as planesRouter } from './planes.routes.js';
import { router as cotizacionesRouter } from './cotizaciones.routes.js';
import { router as adminTasasRouter } from './admin-tasas.routes.js';
import { router as adminRouter } from './admin.routes.js';
import { router as authRouter } from './auth.routes.js';
import { requireAuth } from '../middleware/auth.js';

export const router = Router();

// Público: login (y GET /me, protegido internamente por el propio router de auth).
router.use('/auth', authRouter);

// Todo lo demás requiere sesión — cada router individual puede sumar gates extra
// (ej. admin-tasas.routes.js exige además rol admin + puede_editar_tasas).
router.use('/ramos', requireAuth, ramosRouter);
router.use('/planes', requireAuth, planesRouter);
router.use('/cotizaciones', requireAuth, cotizacionesRouter);
router.use('/admin/tasas', requireAuth, adminTasasRouter);
// Montado DESPUÉS de /admin/tasas: si una request a /admin/tasas no matchea ninguna
// ruta de adminTasasRouter (solo define /importar), Express hace fallthrough hasta
// acá, donde adminRouter sí define GET/POST /tasas (historial + nueva versión).
router.use('/admin', requireAuth, adminRouter);

// TODO Fase 3: /ramos/:id/descuentos, /ramos/:id/recargos, /ramos/:id/clausulas
