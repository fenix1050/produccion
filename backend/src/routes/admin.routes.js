import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import { requireRole, requireTasasEdit } from '../middleware/auth.js';

// requireAuth ya corre en routes/index.js antes de llegar acá. Todo este router exige
// además rol admin; las rutas de tasas suman el gate de puede_editar_tasas.
//
// Montado en '/admin' DESPUÉS de admin-tasas.routes.js (montado en '/admin/tasas' para
// POST /admin/tasas/importar). Express hace fallthrough: si una request a /admin/tasas
// no matchea ninguna ruta de admin-tasas.routes.js (que solo define /importar), sigue
// al siguiente router montado — este — donde SÍ están definidas GET/POST /tasas.
export const router = Router();

router.use(requireRole('admin'));

// Usuarios
router.get('/usuarios', adminController.listarUsuarios);
router.post('/usuarios', adminController.crearUsuario);
router.put('/usuarios/:id', adminController.editarUsuario);
router.put('/usuarios/:id/password', adminController.resetearPassword);

// Coberturas por plan
router.get('/planes/:planId/coberturas', adminController.listarCoberturasDePlan);
router.post('/planes/:planId/coberturas', adminController.agregarCoberturaAPlan);
router.put('/plan-coberturas/:id', adminController.editarPlanCobertura);
router.delete('/plan-coberturas/:id', adminController.eliminarPlanCobertura);

// Tasas (gate extra: puede_editar_tasas)
router.get('/ramos/:ramoId/tasas', requireTasasEdit, adminController.listarTasasDeRamo);
router.post('/tasas', requireTasasEdit, adminController.crearTasa);

// Planes
router.get('/planes', adminController.listarPlanes);
router.put('/planes/:id', adminController.editarPlan);
router.get('/planes/:id/formas-pago', adminController.listarFormasPagoDePlan);
router.put('/plan-formas-pago/:id', adminController.editarPlanFormaPago);
