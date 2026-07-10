import { Router } from 'express';
import { router as ramosRouter } from './ramos.routes.js';
import { router as planesRouter } from './planes.routes.js';
import { router as cotizacionesRouter } from './cotizaciones.routes.js';
import { router as adminTasasRouter } from './admin-tasas.routes.js';

export const router = Router();

router.use('/ramos', ramosRouter);
router.use('/planes', planesRouter);
router.use('/cotizaciones', cotizacionesRouter);
router.use('/admin/tasas', adminTasasRouter);

// TODO Fase 3: /ramos/:id/descuentos, /ramos/:id/recargos, /ramos/:id/clausulas
// TODO Fase 5: /admin/coberturas (CRUD)
