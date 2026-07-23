import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import {
  requireTasasEdit,
  requireUsuariosEdit,
  requireCoberturasEdit,
  requirePlanesEdit,
} from '../middleware/auth.js';

// requireAuth ya corre en routes/index.js antes de llegar acá. Ya NO hay un gate
// "rol admin" global para todo este router (ver docs/ESTADO_PROYECTO.md sección 20a2):
// cada grupo de rutas exige su propio permiso booleano de usuarios (mismo patrón que
// puede_editar_tasas), así se puede dar acceso a solo una sección del panel admin sin
// hacer al usuario admin completo.
//
// Montado en '/admin' DESPUÉS de admin-tasas.routes.js (montado en '/admin/tasas' para
// POST /admin/tasas/importar). Express hace fallthrough: si una request a /admin/tasas
// no matchea ninguna ruta de admin-tasas.routes.js (que solo define /importar), sigue
// al siguiente router montado — este — donde SÍ están definidas GET/POST /tasas.
export const router = Router();

// Usuarios (gate: puede_gestionar_usuarios)
router.get('/usuarios', requireUsuariosEdit, adminController.listarUsuarios);
router.post('/usuarios', requireUsuariosEdit, adminController.crearUsuario);
router.put('/usuarios/:id', requireUsuariosEdit, adminController.editarUsuario);
router.put('/usuarios/:id/password', requireUsuariosEdit, adminController.resetearPassword);
router.delete('/usuarios/:id', requireUsuariosEdit, adminController.eliminarUsuario);

// Roles (migración 031) — sub-recurso de Usuarios, mismo gate que esa sección.
router.get('/roles', requireUsuariosEdit, adminController.listarRoles);
router.post('/roles', requireUsuariosEdit, adminController.crearRol);
router.put('/roles/:id', requireUsuariosEdit, adminController.editarRol);
router.delete('/roles/:id', requireUsuariosEdit, adminController.eliminarRol);

// Coberturas por plan (gate: puede_editar_coberturas)
router.get('/planes/:planId/coberturas', requireCoberturasEdit, adminController.listarCoberturasDePlan);
router.post('/planes/:planId/coberturas', requireCoberturasEdit, adminController.agregarCoberturaAPlan);
router.put('/plan-coberturas/:id', requireCoberturasEdit, adminController.editarPlanCobertura);
router.delete('/plan-coberturas/:id', requireCoberturasEdit, adminController.eliminarPlanCobertura);

// Tasas (gate: puede_editar_tasas)
router.get('/ramos/:ramoId/tasas', requireTasasEdit, adminController.listarTasasDeRamo);
router.post('/tasas', requireTasasEdit, adminController.crearTasa);
router.delete('/tasas/:id', requireTasasEdit, adminController.eliminarTasa);
router.get('/rubros-actividad', requireTasasEdit, adminController.listarRubrosActividad);
router.put('/rubros-actividad/:id', requireTasasEdit, adminController.editarRubroActividad);

// Planes (gate: puede_editar_planes)
router.get('/planes', requirePlanesEdit, adminController.listarPlanes);
router.put('/planes/:id', requirePlanesEdit, adminController.editarPlan);
router.get('/planes/:id/formas-pago', requirePlanesEdit, adminController.listarFormasPagoDePlan);
router.put('/plan-formas-pago/:id', requirePlanesEdit, adminController.editarPlanFormaPago);
