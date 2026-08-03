import { auth } from '../shared/api.js'
import { getRamos } from '../shared/catalogo.js'
import { atraparFoco } from '../shared/dom.js'
import { state, app } from './state.js'
import { seccionesVisibles } from './secciones.js'
import { renderApp } from './render/shell.js'
import {
  cargarUsuarios,
  abrirModalCrear,
  abrirModalEditar,
  abrirModalPassword,
  cerrarModal,
  desactivarUsuario,
  eliminarUsuario,
  guardarModalCrear,
  guardarModalEditar,
  guardarModalPassword,
} from './usuarios.js'
import {
  cargarRoles,
  eliminarRol,
  abrirModalRolCrear,
  abrirModalRolEditar,
  cerrarModalRol,
  guardarModalRol,
} from './roles.js'
import {
  cargarRamosGestion,
  toggleRamoActivo,
  habilitarEdicionNombreRamo,
  cancelarEdicionNombreRamo,
  guardarNombreRamo,
  eliminarRamo,
} from './ramos.js'
import {
  cargarPlanes,
  togglePlanActivo,
  habilitarEdicionPrima,
  cancelarEdicionPrima,
  guardarPrimaTecnicaMinima,
  habilitarEdicionTopes,
  cancelarEdicionTopes,
  guardarPlanTopes,
  toggleFormasPago,
  toggleFormaPagoHabilitada,
  habilitarEdicionTasaRpf,
  cancelarEdicionTasaRpf,
  guardarTasaRpf,
  eliminarPlan,
} from './planes.js'
import {
  seleccionarRamoTasas,
  habilitarEdicionRubroActividad,
  cancelarEdicionRubroActividad,
  guardarRubroActividadTasas,
  eliminarTasa,
  abrirModalTasa,
  cerrarModalTasa,
  guardarModalTasa,
} from './tasas.js'
import {
  seleccionarRamoCoberturas,
  seleccionarPlanCoberturas,
  toggleCoberturaDefecto,
  habilitarEdicionCobertura,
  cancelarEdicionCobertura,
  guardarMontoFranquicia,
  eliminarCoberturaDelPlan,
  abrirModalCobertura,
  cerrarModalCobertura,
  guardarModalCobertura,
} from './coberturas.js'

// Panel de Administración del Cotizador Tajy — WU5, primera porción (Usuarios).
// Mismo patrón Vanilla JS que cotizar.js: state + render + delegación de eventos por
// data-action. Coberturas por plan / Tasas / Planes quedan como stub "Próximamente" —
// se implementan en próximas porciones de WU5.

async function init() {
  // Cambio session-httponly-cookie: ya no hay token en localStorage para chequear de
  // forma síncrona — hay que esperar auth.cargarSesion() (GET /auth/me) antes del gate.
  // Se cachea en memoria (shared/api.js), así que auth.tieneAccesoAdmin() de acá abajo
  // (y el resto de los ~10 call-sites síncronos de auth.getUsuario() en render/*.js) ya
  // la encuentran resuelta.
  const usuario = await auth.cargarSesion()
  if (!usuario) {
    window.location.href = '../login/'
    return
  }
  if (!auth.tieneAccesoAdmin()) {
    // El panel admin es para rol 'admin' O cualquier rol custom con al menos un permiso
    // parcial (migración 031) — antes exigía rol==='admin' a secas, lo que dejaba afuera
    // a roles como "Jefe de Análisis de Riesgo" aunque tuvieran los 4 permisos en true.
    // A quien no tiene ningún permiso se lo redirige directo al cotizador (mismo patrón
    // que la sesión expirada en shared/api.js, que también resuelve con un redirect en
    // vez de una pantalla propia).
    window.location.href = '../cotizar/'
    return
  }

  // Permisos parciales por sección (ver docs/ESTADO_PROYECTO.md sección 20a2): un admin
  // puede no tener acceso a todas las secciones. Se arranca en la primera visible.
  const visibles = seccionesVisibles()
  if (!visibles.length) {
    state.seccion = null
    renderApp()
    return
  }
  state.seccion = visibles[0].id
  renderApp()

  if (state.seccion === 'usuarios') {
    await Promise.all([cargarUsuarios(), cargarRoles()])
  } else if (state.seccion === 'planes') {
    await cargarPlanes()
  } else if (state.seccion === 'tasas' || state.seccion === 'coberturas') {
    const ramos = await getRamos()
    state.ramos = ramos
    renderApp()
  } else if (state.seccion === 'ramos') {
    await cargarRamosGestion()
  }
}

async function cerrarSesion() {
  await auth.logout()
  window.location.href = '../login/'
}

// ---------------------------------------------------------------------------
// Eventos — delegación única sobre #app (registrada una sola vez más abajo,
// junto al init() del archivo). renderApp() reemplaza el innerHTML de #app en
// cada render pero no el nodo #app en sí, así que estos listeners sobreviven
// a cada re-render sin necesidad de volver a engancharlos (mismo patrón que
// cotizar.js, líneas ~1590-1672).
// ---------------------------------------------------------------------------

// Resuelve el elemento [data-action] real a partir del target del evento,
// respetando data-stop-propagation: si el click ocurrió dentro de un
// contenedor marcado (el modal) pero no sobre un elemento con su propio
// data-action, no debe "escapar" hacia el data-action del backdrop que lo
// contiene (antes evitado con e.stopPropagation() en el modal en cada bind).
function resolveActionTarget(e) {
  const target = e.target.closest('[data-action]')
  if (!target || target.disabled) return null
  const stopEl = e.target.closest('[data-stop-propagation]')
  if (stopEl && !stopEl.contains(target)) return null
  return target
}

function onAppClick(e) {
  const target = resolveActionTarget(e)
  if (!target) return
  // SELECT/INPUT con data-action se despachan por 'change' (ver onAppChange),
  // no acá, para no disparar la acción dos veces (mismo criterio que el
  // bindEvents() original: evento = SELECT/INPUT ? 'change' : 'click').
  if (target.tagName === 'SELECT' || target.tagName === 'INPUT') return
  onActionClick(target)
}

function onAppChange(e) {
  const target = resolveActionTarget(e)
  if (!target) return
  if (target.tagName !== 'SELECT' && target.tagName !== 'INPUT') return
  onActionClick(target)
}

function onAppSubmit(e) {
  const inlineForm = e.target.closest('[data-form-action]')
  if (inlineForm) {
    e.preventDefault()
    onInlineFormSubmit(inlineForm)
    return
  }
  if (e.target.id === 'admin-modal-form') {
    e.preventDefault()
    onModalSubmit(e.target)
    return
  }
  if (e.target.id === 'admin-modal-tasa-form') {
    e.preventDefault()
    guardarModalTasa(e.target)
    return
  }
  if (e.target.id === 'admin-modal-cobertura-form') {
    e.preventDefault()
    guardarModalCobertura(e.target)
    return
  }
  if (e.target.id === 'admin-modal-rol-form') {
    e.preventDefault()
    guardarModalRol(e.target)
  }
}

// Escape cierra el modal que esté abierto (uno solo a la vez, en el orden en
// que se abrieron los 4 posibles: usuario/rol/tasa/cobertura). Tab/Shift+Tab quedan
// atrapados dentro del modal (focus trap) — se resuelve el contenedor en vivo porque
// renderApp() reconstruye el DOM del modal en cada render.
function onKeydown(e) {
  if (e.key === 'Escape') {
    if (state.modal) {
      cerrarModal()
    } else if (state.modalRol) {
      cerrarModalRol()
    } else if (state.modalTasa) {
      cerrarModalTasa()
    } else if (state.modalCobertura) {
      cerrarModalCobertura()
    }
    return
  }
  if (e.key === 'Tab') {
    const modalAbierto = app.querySelector('.admin-modal')
    if (modalAbierto) atraparFoco(e, modalAbierto)
  }
}

function registrarEventos() {
  app.addEventListener('click', onAppClick)
  app.addEventListener('change', onAppChange)
  app.addEventListener('submit', onAppSubmit)
  document.addEventListener('keydown', onKeydown)
}

function handleSeleccionarSeccion(el) {
  state.seccion = el.dataset.seccion
  state.banner = null
  state.sidebarAbierta = false
  renderApp()
  if (state.seccion === 'usuarios') {
    if (!state.usuarios.length && !state.loadingUsuarios) cargarUsuarios()
    if (!state.roles.length && !state.loadingRoles) cargarRoles()
  }
  if (state.seccion === 'planes' && !state.planes.length && !state.loadingPlanes) {
    cargarPlanes()
  }
  if ((state.seccion === 'tasas' || state.seccion === 'coberturas') && !state.ramos.length) {
    getRamos().then((ramos) => {
      state.ramos = ramos
      renderApp()
    })
  }
  if (state.seccion === 'ramos' && !state.ramosGestion.length && !state.loadingRamosGestion) {
    cargarRamosGestion()
  }
}

// Un handler por data-action, en vez del if/else en cascada original (~195 líneas, ~40 ramas,
// issue #84). Cada handler recibe el elemento clickeado; varias claves comparten el mismo
// handler cuando la acción original cubría el backdrop y el botón de cierre del modal.
const ACTION_HANDLERS = {
  'select-seccion': handleSeleccionarSeccion,
  logout: cerrarSesion,
  'toggle-sidebar': () => {
    state.sidebarAbierta = !state.sidebarAbierta
    renderApp()
  },
  'close-sidebar': () => {
    state.sidebarAbierta = false
    renderApp()
  },
  'crear-usuario': abrirModalCrear,
  'editar-usuario': (el) => abrirModalEditar(Number(el.dataset.id)),
  'password-usuario': (el) => abrirModalPassword(Number(el.dataset.id)),
  'desactivar-usuario': (el) => desactivarUsuario(Number(el.dataset.id)),
  'eliminar-usuario': (el) => eliminarUsuario(Number(el.dataset.id)),
  'cerrar-modal': cerrarModal,
  'cerrar-modal-backdrop': cerrarModal,
  'crear-rol': abrirModalRolCrear,
  'editar-rol': (el) => abrirModalRolEditar(Number(el.dataset.id)),
  'eliminar-rol': (el) => eliminarRol(Number(el.dataset.id)),
  'cerrar-modal-rol': cerrarModalRol,
  'cerrar-modal-rol-backdrop': cerrarModalRol,
  'filtrar-ramo': (el) => {
    state.ramoFiltro = el.value
    renderApp()
  },
  'toggle-plan-activo': (el) => togglePlanActivo(el.dataset.id, el.checked),
  'toggle-ramo-activo': (el) => toggleRamoActivo(el.dataset.id, el.checked),
  'editar-nombre-ramo': (el) => habilitarEdicionNombreRamo(Number(el.dataset.id)),
  'cancelar-nombre-ramo': (el) => cancelarEdicionNombreRamo(Number(el.dataset.id)),
  'eliminar-ramo': (el) => eliminarRamo(Number(el.dataset.id)),
  'toggle-formas-pago': (el) => toggleFormasPago(Number(el.dataset.id)),
  'toggle-forma-pago-habilitada': (el) =>
    toggleFormaPagoHabilitada(el.dataset.id, Number(el.dataset.planId), el.checked),
  'editar-prima-tecnica-minima': (el) => habilitarEdicionPrima(Number(el.dataset.id)),
  'cancelar-prima-tecnica-minima': (el) => cancelarEdicionPrima(Number(el.dataset.id)),
  'editar-plan-topes': (el) => habilitarEdicionTopes(Number(el.dataset.id)),
  'cancelar-plan-topes': (el) => cancelarEdicionTopes(Number(el.dataset.id)),
  'editar-tasa-rpf': (el) => habilitarEdicionTasaRpf(Number(el.dataset.id)),
  'cancelar-tasa-rpf': (el) => cancelarEdicionTasaRpf(Number(el.dataset.id)),
  'seleccionar-ramo-tasas': (el) => seleccionarRamoTasas(el.value),
  'crear-tasa': abrirModalTasa,
  'eliminar-tasa': (el) => eliminarTasa(Number(el.dataset.id)),
  'eliminar-plan': (el) => eliminarPlan(Number(el.dataset.id)),
  'cerrar-modal-tasa': cerrarModalTasa,
  'cerrar-modal-tasa-backdrop': cerrarModalTasa,
  'editar-tasa-edificio-contenido': (el) => habilitarEdicionRubroActividad(Number(el.dataset.id)),
  'cancelar-tasa-edificio-contenido': (el) => cancelarEdicionRubroActividad(Number(el.dataset.id)),
  'seleccionar-ramo-coberturas': (el) => seleccionarRamoCoberturas(el.value),
  'seleccionar-plan-coberturas': (el) => seleccionarPlanCoberturas(el.value),
  'toggle-cobertura-defecto': (el) =>
    toggleCoberturaDefecto(el.dataset.id, Number(el.dataset.planId), el.checked),
  'editar-cobertura-plan': (el) => habilitarEdicionCobertura(Number(el.dataset.id)),
  'cancelar-cobertura-plan': (el) => cancelarEdicionCobertura(Number(el.dataset.id)),
  'eliminar-cobertura-plan': (el) =>
    eliminarCoberturaDelPlan(el.dataset.id, Number(el.dataset.planId)),
  'agregar-cobertura': abrirModalCobertura,
  'cerrar-modal-cobertura': cerrarModalCobertura,
  'cerrar-modal-cobertura-backdrop': cerrarModalCobertura,
}

function onActionClick(el) {
  const handler = ACTION_HANDLERS[el.dataset.action]
  if (handler) handler(el)
}

function onInlineFormSubmit(form) {
  const accion = form.dataset.formAction
  if (accion === 'prima-tecnica-minima') {
    guardarPrimaTecnicaMinima(form.dataset.id, form)
  } else if (accion === 'plan-topes') {
    guardarPlanTopes(form.dataset.id, form)
  } else if (accion === 'nombre-ramo') {
    guardarNombreRamo(form.dataset.id, form)
  } else if (accion === 'tasa-rpf') {
    guardarTasaRpf(form.dataset.id, Number(form.dataset.planId), form)
  } else if (accion === 'monto-franquicia') {
    guardarMontoFranquicia(form.dataset.id, Number(form.dataset.planId), form)
  } else if (accion === 'rubro-actividad-tasas') {
    guardarRubroActividadTasas(form.dataset.id, form)
  }
}

function onModalSubmit(form) {
  const tipo = state.modal.tipo
  if (tipo === 'crear') guardarModalCrear(form)
  else if (tipo === 'editar') guardarModalEditar(form)
  else if (tipo === 'password') guardarModalPassword(form)
}

registrarEventos()
init()
