import { api, auth } from '../shared/api.js'
import { getRamos } from '../shared/catalogo.js'
import { enfocarPrimerElemento, atraparFoco } from '../shared/dom.js'
import { state, app } from './state.js'
import { seccionesVisibles } from './secciones.js'
import { ramoUsaRubrosActividad } from './render/tasas.js'
import { renderApp, mostrarBanner } from './render/shell.js'
import { habilitarEdicionInline, cancelarEdicionInline } from './inline-edit.js'
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

// Panel de Administración del Cotizador Tajy — WU5, primera porción (Usuarios).
// Mismo patrón Vanilla JS que cotizar.js: state + render + delegación de eventos por
// data-action. Coberturas por plan / Tasas / Planes quedan como stub "Próximamente" —
// se implementan en próximas porciones de WU5.

async function init() {
  if (!auth.isLoggedIn()) {
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
// Tasas: carga y acciones
// ---------------------------------------------------------------------------

async function seleccionarRamoTasas(ramoId) {
  // ramos.id es un código de texto ('mrc', 'incendio', ...), no numérico — a diferencia
  // de plan_id/cobertura_id. Nunca castear con Number acá (ver renderPlanes, que ya trata
  // ramo_id como string).
  state.ramoTasasSeleccionado = ramoId || null
  renderApp()
  if (!state.ramoTasasSeleccionado) return
  const tareas = [
    cargarTasasDeRamo(state.ramoTasasSeleccionado),
    cargarCatalogoDeRamo(state.ramoTasasSeleccionado),
  ]
  if (ramoUsaRubrosActividad(state.ramoTasasSeleccionado)) {
    // Cambio "incendio-tasas-por-rubro": el catálogo ahora se filtra por ramo
    // (rubro_actividad_ramo), así que MRC e Incendio ya NO comparten la misma lista —
    // hay que refetchear al cambiar de ramo, no cachear una sola vez para siempre.
    tareas.push(cargarRubrosActividad(state.ramoTasasSeleccionado))
  }
  await Promise.all(tareas)
}

async function cargarRubrosActividad(ramoId) {
  state.rubrosActividad = { loading: true, error: '', datos: state.rubrosActividad.datos ?? [] }
  renderApp()
  try {
    const datos = await api.get(`/admin/rubros-actividad?ramo_id=${ramoId}`)
    state.rubrosActividad = { loading: false, error: '', datos }
  } catch (err) {
    state.rubrosActividad = {
      loading: false,
      error: err.message || 'No se pudieron cargar los tipos de riesgo.',
      datos: [],
    }
  }
  renderApp()
}

function habilitarEdicionRubroActividad(id) {
  habilitarEdicionInline(state.rubroActividadEnEdicion, id)
}

function cancelarEdicionRubroActividad(id) {
  cancelarEdicionInline(state.rubroActividadEnEdicion, id)
}

async function guardarRubroActividadTasas(id, form) {
  // A diferencia de prima_tecnica_minima/monto/franquicia, el schema de este endpoint
  // (editarRubroActividadSchema) NO acepta null — tasa_edificio/tasa_contenido son
  // z.number().nonnegative().optional(), así que acá siempre se manda un número.
  const tasa_edificio = Number(form.tasa_edificio.value)
  const tasa_contenido = Number(form.tasa_contenido.value)
  const categoria = form.categoria.value

  if (Number.isNaN(tasa_edificio) || Number.isNaN(tasa_contenido)) {
    mostrarBanner('error', 'Ingresá valores numéricos válidos para ambas tasas.')
    return
  }

  try {
    const fila = await api.put(`/admin/rubros-actividad/${id}`, {
      tasa_edificio,
      tasa_contenido,
      categoria,
    })
    const datos = state.rubrosActividad.datos ?? []
    const idx = datos.findIndex((r) => r.id === Number(id))
    if (idx !== -1) datos[idx] = { ...datos[idx], ...fila }
    state.rubroActividadEnEdicion.delete(Number(id))
    mostrarBanner('success', 'Tipo de riesgo actualizado.')
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el tipo de riesgo.')
  }
}

async function eliminarTasa(id) {
  const ramoId = state.ramoTasasSeleccionado
  const entry = state.tasasPorRamo[ramoId]
  const tasa = entry?.historial.find((t) => t.id === id)
  const nombreCobertura = tasa?.coberturas_catalogo?.nombre ?? 'esta tasa'
  if (
    !confirm(
      `¿Eliminar la versión de "${nombreCobertura}" cargada el ${tasa?.vigente_desde ?? ''}? Si era la vigente, vuelve a regir la versión anterior.`
    )
  )
    return

  try {
    await api.delete(`/admin/tasas/${id}`)
    mostrarBanner('success', 'Tasa eliminada.')
    await cargarTasasDeRamo(ramoId)
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar la tasa.')
  }
}

async function cargarTasasDeRamo(ramoId) {
  state.tasasPorRamo[ramoId] = {
    loading: true,
    error: '',
    historial: state.tasasPorRamo[ramoId]?.historial ?? [],
  }
  renderApp()
  try {
    const historial = await api.get(`/admin/ramos/${ramoId}/tasas`)
    state.tasasPorRamo[ramoId] = { loading: false, error: '', historial }
  } catch (err) {
    state.tasasPorRamo[ramoId] = {
      loading: false,
      error: err.message || 'No se pudo cargar el historial de tasas.',
      historial: [],
    }
  }
  renderApp()
}

async function cargarCatalogoDeRamo(ramoId) {
  if (state.catalogoPorRamo[ramoId]) return // catálogo de coberturas no cambia en la sesión
  try {
    state.catalogoPorRamo[ramoId] = await api.get(`/ramos/${ramoId}/coberturas-catalogo`)
  } catch {
    state.catalogoPorRamo[ramoId] = []
  }
}

function abrirModalTasa() {
  state.elementoDisparadorModal = document.activeElement
  state.modalTasa = {
    error: '',
    guardando: false,
    cobertura_id: '',
    tasa_valor: '',
    unidad: 'permil',
    vigente_desde: new Date().toISOString().slice(0, 10),
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

function cerrarModalTasa() {
  state.modalTasa = null
  renderApp()
  if (state.elementoDisparadorModal) {
    state.elementoDisparadorModal.focus()
    state.elementoDisparadorModal = null
  }
}

async function guardarModalTasa(form) {
  const ramoId = state.ramoTasasSeleccionado
  const cobertura_id = Number(form.cobertura_id.value)
  const tasa_valor = Number(form.tasa_valor.value)
  const unidad = form.unidad.value
  const vigente_desde = form.vigente_desde.value

  if (!cobertura_id) {
    state.modalTasa.error = 'Elegí una cobertura.'
    renderApp()
    return
  }
  if (Number.isNaN(tasa_valor)) {
    state.modalTasa.error = 'Ingresá un valor de tasa válido.'
    renderApp()
    return
  }

  state.modalTasa.error = ''
  state.modalTasa.guardando = true
  renderApp()

  try {
    await api.post('/admin/tasas', {
      ramo_id: Number(ramoId),
      cobertura_id,
      tasa_valor,
      unidad,
      vigente_desde,
    })
    cerrarModalTasa()
    mostrarBanner('success', 'Nueva versión de tasa creada.')
    await cargarTasasDeRamo(ramoId)
  } catch (err) {
    state.modalTasa.guardando = false
    state.modalTasa.error = err.message || 'No se pudo crear la tasa.'
    renderApp()
  }
}

// ---------------------------------------------------------------------------
// Coberturas por plan: carga y acciones
// ---------------------------------------------------------------------------

async function seleccionarRamoCoberturas(ramoId) {
  // Mismo criterio que ramoTasasSeleccionado: guardar el string crudo del <select>,
  // castear con Number() recién al armar el payload que va al backend.
  state.ramoCoberturasSeleccionado = ramoId || null
  state.planCoberturasSeleccionado = null
  renderApp()
  if (!state.ramoCoberturasSeleccionado) return
  await Promise.all([
    cargarPlanesDeRamoCob(state.ramoCoberturasSeleccionado),
    cargarCatalogoDeRamo(state.ramoCoberturasSeleccionado),
  ])
}

async function cargarPlanesDeRamoCob(ramoId) {
  state.planesPorRamoCob[ramoId] = { loading: true, error: '', datos: [] }
  renderApp()
  try {
    const datos = await api.get(`/admin/planes?ramoId=${encodeURIComponent(ramoId)}`)
    state.planesPorRamoCob[ramoId] = { loading: false, error: '', datos }
  } catch (err) {
    state.planesPorRamoCob[ramoId] = {
      loading: false,
      error: err.message || 'No se pudieron cargar los planes del ramo.',
      datos: [],
    }
  }
  renderApp()
}

async function seleccionarPlanCoberturas(planId) {
  state.planCoberturasSeleccionado = planId || null
  renderApp()
  if (!state.planCoberturasSeleccionado) return
  await cargarCoberturasDelPlan(state.planCoberturasSeleccionado)
}

async function cargarCoberturasDelPlan(planId) {
  state.coberturasDelPlan[planId] = { loading: true, error: '', datos: [] }
  renderApp()
  try {
    const datos = await api.get(`/admin/planes/${planId}/coberturas`)
    state.coberturasDelPlan[planId] = { loading: false, error: '', datos }
  } catch (err) {
    state.coberturasDelPlan[planId] = {
      loading: false,
      error: err.message || 'No se pudieron cargar las coberturas del plan.',
      datos: [],
    }
  }
  renderApp()
}

async function toggleCoberturaDefecto(planCoberturaId, planId, incluidaPorDefecto) {
  try {
    const fila = await api.put(`/admin/plan-coberturas/${planCoberturaId}`, {
      incluida_por_defecto: incluidaPorDefecto,
    })
    const entry = state.coberturasDelPlan[planId]
    const idx = entry?.datos.findIndex((c) => c.id === Number(planCoberturaId))
    if (entry && idx !== -1) entry.datos[idx] = { ...entry.datos[idx], ...fila }
    mostrarBanner(
      'success',
      `Cobertura ${incluidaPorDefecto ? 'marcada' : 'desmarcada'} por defecto.`
    )
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la cobertura.')
  }
}

function habilitarEdicionCobertura(planCoberturaId) {
  habilitarEdicionInline(state.coberturaEnEdicion, planCoberturaId)
}

function cancelarEdicionCobertura(planCoberturaId) {
  cancelarEdicionInline(state.coberturaEnEdicion, planCoberturaId)
}

async function guardarMontoFranquicia(planCoberturaId, planId, form) {
  const montoValor = form.monto.value
  const franquiciaValor = form.franquicia.value
  const monto = montoValor === '' ? null : Number(montoValor)
  const franquicia = franquiciaValor === '' ? null : Number(franquiciaValor)

  try {
    const fila = await api.put(`/admin/plan-coberturas/${planCoberturaId}`, { monto, franquicia })
    const entry = state.coberturasDelPlan[planId]
    const idx = entry?.datos.findIndex((c) => c.id === Number(planCoberturaId))
    if (entry && idx !== -1) entry.datos[idx] = { ...entry.datos[idx], ...fila }
    state.coberturaEnEdicion.delete(Number(planCoberturaId))
    mostrarBanner('success', 'Cobertura actualizada.')
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la cobertura.')
  }
}

async function eliminarCoberturaDelPlan(planCoberturaId, planId) {
  if (!confirm('¿Quitar esta cobertura del plan?')) return
  try {
    await api.delete(`/admin/plan-coberturas/${planCoberturaId}`)
    mostrarBanner('success', 'Cobertura quitada del plan.')
    await cargarCoberturasDelPlan(planId)
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo quitar la cobertura.')
  }
}

function abrirModalCobertura() {
  state.elementoDisparadorModal = document.activeElement
  state.modalCobertura = {
    error: '',
    guardando: false,
    cobertura_id: '',
    incluida_por_defecto: true,
    monto: '',
    franquicia: '',
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

function cerrarModalCobertura() {
  state.modalCobertura = null
  renderApp()
  if (state.elementoDisparadorModal) {
    state.elementoDisparadorModal.focus()
    state.elementoDisparadorModal = null
  }
}

async function guardarModalCobertura(form) {
  const planId = state.planCoberturasSeleccionado
  const cobertura_id = Number(form.cobertura_id.value)
  const incluida_por_defecto = form.incluida_por_defecto.checked
  const montoValor = form.monto.value
  const franquiciaValor = form.franquicia.value

  if (!cobertura_id) {
    state.modalCobertura.error = 'Elegí una cobertura.'
    renderApp()
    return
  }

  state.modalCobertura.error = ''
  state.modalCobertura.guardando = true
  renderApp()

  try {
    await api.post(`/admin/planes/${planId}/coberturas`, {
      cobertura_id,
      incluida_por_defecto,
      monto: montoValor === '' ? null : Number(montoValor),
      franquicia: franquiciaValor === '' ? null : Number(franquiciaValor),
    })
    cerrarModalCobertura()
    mostrarBanner('success', 'Cobertura agregada al plan.')
    await cargarCoberturasDelPlan(planId)
  } catch (err) {
    state.modalCobertura.guardando = false
    state.modalCobertura.error = err.message || 'No se pudo agregar la cobertura.'
    renderApp()
  }
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
