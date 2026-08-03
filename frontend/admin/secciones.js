import { auth } from '../shared/api.js'
import {
  ICON_ADMIN_USUARIOS,
  ICON_ADMIN_COBERTURAS,
  ICON_ADMIN_TASAS,
  ICON_ADMIN_PLANES,
  ICON_GEAR,
} from '../shared/nav-icons.js'

// Secciones del panel admin — extraído de admin.js (WU admin-module-split, PR1).

export const SECCIONES = [
  { id: 'usuarios', label: 'Usuarios', disponible: true, permiso: 'puede_gestionar_usuarios' },
  {
    id: 'coberturas',
    label: 'Coberturas por plan',
    disponible: true,
    permiso: 'puede_editar_coberturas',
  },
  { id: 'tasas', label: 'Tasas', disponible: true, permiso: 'puede_editar_tasas' },
  { id: 'planes', label: 'Planes', disponible: true, permiso: 'puede_editar_planes' },
  // Sin `permiso`: a diferencia del resto de las secciones (permisos delegables por rol
  // custom), habilitar/deshabilitar un ramo en el sidebar del cotizador es una decisión de
  // sistema reservada al rol admin literal — ver seccionesVisibles() y el gate del backend
  // (requireRole('admin') en admin.routes.js).
  { id: 'ramos', label: 'Ramos', disponible: true, soloAdmin: true },
]

// Íconos SVG por sección — mismo estilo de línea (18x18) que el resto de la nav del
// sidebar (ramos en cotizar.js, links de shared/sidebar.js), separado del array de
// arriba para no mezclar datos de negocio con presentación.
export const SECCION_ICONOS = {
  usuarios: ICON_ADMIN_USUARIOS,
  coberturas: ICON_ADMIN_COBERTURAS,
  tasas: ICON_ADMIN_TASAS,
  planes: ICON_ADMIN_PLANES,
  ramos: ICON_GEAR,
}

// Secciones visibles para el usuario logueado según sus permisos parciales
// (mismo patrón que puede_editar_tasas, ver docs/ESTADO_PROYECTO.md sección 20a2).
export function seccionesVisibles() {
  const usuario = auth.getUsuario()
  return SECCIONES.filter((s) =>
    s.soloAdmin ? usuario?.rol === 'admin' : Boolean(usuario?.[s.permiso])
  )
}
