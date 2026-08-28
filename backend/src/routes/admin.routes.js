import { Router } from 'express'
import { adminPasswordResetRateLimiter } from '../middleware/rate-limit.js'
import * as adminController from '../controllers/admin.controller.js'
import {
  requireTasasEdit,
  requireUsuariosEdit,
  requireCoberturasEdit,
  requirePlanesEdit,
  requireRole,
} from '../middleware/auth.js'

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
export const router = Router()

// Usuarios (gate: puede_gestionar_usuarios)
router.get('/usuarios', requireUsuariosEdit, adminController.listarUsuarios)
router.post('/usuarios', requireUsuariosEdit, adminController.crearUsuario)
router.put('/usuarios/:id', requireUsuariosEdit, adminController.editarUsuario)
router.put(
  '/usuarios/:id/password',
  requireUsuariosEdit,
  adminPasswordResetRateLimiter,
  adminController.resetearPassword
)
router.delete('/usuarios/:id', requireUsuariosEdit, adminController.eliminarUsuario)

// Roles (migración 031) — sub-recurso de Usuarios, mismo gate que esa sección.
router.get('/roles', requireUsuariosEdit, adminController.listarRoles)
router.post('/roles', requireUsuariosEdit, adminController.crearRol)
router.put('/roles/:id', requireUsuariosEdit, adminController.editarRol)
router.delete('/roles/:id', requireUsuariosEdit, adminController.eliminarRol)

// Coberturas por plan (gate: puede_editar_coberturas)
router.get(
  '/planes/:planId/coberturas',
  requireCoberturasEdit,
  adminController.listarCoberturasDePlan
)
router.post(
  '/planes/:planId/coberturas',
  requireCoberturasEdit,
  adminController.agregarCoberturaAPlan
)
router.put('/plan-coberturas/:id', requireCoberturasEdit, adminController.editarPlanCobertura)
router.delete('/plan-coberturas/:id', requireCoberturasEdit, adminController.eliminarPlanCobertura)

// Tasas (gate: puede_editar_tasas)
router.get('/ramos/:ramoId/tasas', requireTasasEdit, adminController.listarTasasDeRamo)
router.post('/tasas', requireTasasEdit, adminController.crearTasa)
router.delete('/tasas/:id', requireTasasEdit, adminController.eliminarTasa)
router.get('/rubros-actividad', requireTasasEdit, adminController.listarRubrosActividad)
router.put('/rubros-actividad/:id', requireTasasEdit, adminController.editarRubroActividad)

// Planes (gate: puede_editar_planes)
router.get('/planes', requirePlanesEdit, adminController.listarPlanes)
router.put('/planes/:id', requirePlanesEdit, adminController.editarPlan)
router.delete('/planes/:id', requirePlanesEdit, adminController.eliminarPlan)
router.get('/planes/:id/formas-pago', requirePlanesEdit, adminController.listarFormasPagoDePlan)
router.put('/plan-formas-pago/:id', requirePlanesEdit, adminController.editarPlanFormaPago)

// R.P.F. por cuotas (gate: puede_editar_planes, mismo permiso que ya edita el escalar
// tasa_rpf hoy vía plan-formas-pago/:id — ver design.md Decisión 8, Engram #391 decisión 4).
// Curva GLOBAL: no cuelga de /planes/:id, es un solo recurso compartido por MRC/Incendio/Vida-AP.
router.get('/rpf-cuotas', requirePlanesEdit, adminController.listarCurvaRpf)
router.put('/rpf-cuotas', requirePlanesEdit, adminController.editarCurvaRpf)

// Topes de descuento/recargo del plan (gate: rol admin literal, no un permiso booleano
// delegable). Ver docs/ESTADO_PROYECTO.md: si esto fuera parte de puede_editar_planes, un
// Jefe/Analista de Riesgo (que ya tiene ese permiso) podría subir el mismo tope que limita
// su propio descuento vía puede_editar_descuento_plan. Mismo patrón que Ramos.
router.put('/planes/:id/topes', requireRole('admin'), adminController.editarPlanTopes)

// Ramos (gate: rol admin literal, no un permiso booleano delegable) — habilitar/deshabilitar
// un ramo determina qué aparece "Próximamente" en el sidebar del cotizador y si se puede
// cotizar por ese ramo vía API (ver findRamoById soloActivos), es una decisión a nivel de
// sistema que Kevin pidió reservar solo para el rol admin.
router.get('/ramos', requireRole('admin'), adminController.listarRamosAdmin)
router.put('/ramos/:id', requireRole('admin'), adminController.editarRamo)
router.delete('/ramos/:id', requireRole('admin'), adminController.eliminarRamo)
