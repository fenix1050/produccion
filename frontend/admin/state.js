// Estado compartido de la página de administración — extraído de admin.js (WU
// admin-module-split, PR1). Los módulos importan `state`/`app` desde acá y mutan
// propiedades del objeto (nunca reasignan el binding, semántica de ESM live-binding).

export const state = {
  seccion: 'usuarios',
  // Sidebar hamburguesa (Fase 2 responsive, ≤1024px) — puramente visual, ver
  // patrón .sidebar/.sidebar-overlay en frontend/shared/cotizador.css.
  sidebarAbierta: false,
  usuarios: [],
  loadingUsuarios: false,
  usuariosError: '',
  banner: null, // { tipo: 'error'|'success', texto }
  modal: null, // { tipo: 'crear'|'editar'|'password', usuario?, error, guardando }

  // Roles configurables (migración 031) — cacheados en memoria al entrar a Usuarios.
  roles: [],
  loadingRoles: false,
  rolesError: '',
  modalRol: null, // { tipo: 'crear'|'editar', rolId?, nombre, puede_*, error, guardando }

  ramos: [],
  ramosGestion: [],
  loadingRamosGestion: false,
  ramosGestionError: '',
  ramoNombreEnEdicion: new Set(), // ids de ramo con el campo de nombre_display en edición
  planes: [],
  loadingPlanes: false,
  planesError: '',
  ramoFiltro: 'todos',
  planExpandido: null, // id del plan con la fila de formas de pago abierta
  formasPagoPorPlan: {}, // planId -> { loading, error, datos: [] }
  primaEnEdicion: new Set(), // ids de plan con el campo prima_tecnica_minima habilitado para editar
  topesEnEdicion: new Set(), // ids de plan con descuento_maximo/recargo_maximo habilitados para editar (solo admin literal)
  tasaRpfEnEdicion: new Set(), // ids de plan_formas_pago con la tasa habilitada para editar

  ramoTasasSeleccionado: null,
  tasasPorRamo: {}, // ramoId -> { loading, error, historial: [] }
  catalogoPorRamo: {}, // ramoId -> coberturas_catalogo[] (para el selector del modal de alta)
  modalTasa: null, // { error, guardando, cobertura_id, tasa_valor, unidad, vigente_desde }

  // rubros_actividad: compartida entre MRC e Incendio (no tiene ramo_id propio), se carga
  // una sola vez (no por ramo) — ver seleccionarRamoTasas.
  rubrosActividad: { loading: false, error: '', datos: null },
  rubroActividadEnEdicion: new Set(), // ids de rubros_actividad con tasa_edificio/tasa_contenido habilitados para editar

  ramoCoberturasSeleccionado: null,
  planCoberturasSeleccionado: null,
  planesPorRamoCob: {}, // ramoId -> { loading, error, datos: [] }
  coberturasDelPlan: {}, // planId -> { loading, error, datos: [] }
  coberturaEnEdicion: new Set(), // ids de plan_coberturas con monto/franquicia habilitados para editar
  modalCobertura: null, // { error, guardando, cobertura_id, incluida_por_defecto }

  // Elemento que disparó la apertura del modal actualmente abierto (botón "Editar",
  // "Nuevo usuario", etc.) — se restaura el foco ahí al cerrar (focus trap, WU
  // accesibilidad). Vive en `state` (y no como `let` de módulo) porque usuarios, roles,
  // tasas y coberturas necesitan escribirlo desde sus propios módulos — un `let` importado
  // es de solo lectura para quien lo importa.
  elementoDisparadorModal: null,
}

export const app = document.getElementById('app')
