import { api, auth } from '../shared/api.js'
import { getRamos } from '../shared/catalogo.js'
import { enfocarPrimerElemento, atraparFoco } from '../shared/dom.js'
import { capitalizar } from '../shared/format.js'
import { state, app } from './state.js'
import { seccionesVisibles } from './secciones.js'
import { ramoUsaRubrosActividad } from './render/tasas.js'
import { renderApp, mostrarBanner } from './render/shell.js'

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
// Usuarios: carga y acciones
// ---------------------------------------------------------------------------

async function cargarUsuarios() {
  state.loadingUsuarios = true
  state.usuariosError = ''
  renderApp()
  try {
    state.usuarios = await api.get('/admin/usuarios')
  } catch (err) {
    state.usuarios = []
    state.usuariosError = err.message || 'No se pudo cargar la lista de usuarios.'
  } finally {
    state.loadingUsuarios = false
    renderApp()
  }
}

function abrirModalCrear() {
  state.elementoDisparadorModal = document.activeElement
  const rolDefault = state.roles.find((r) => r.nombre === 'agente') ?? state.roles[0]
  state.modal = {
    tipo: 'crear',
    error: '',
    guardando: false,
    nombre: '',
    email: '',
    rol_id: rolDefault?.id ?? '',
    password: '',
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

function abrirModalEditar(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId)
  if (!usuario) return
  state.elementoDisparadorModal = document.activeElement
  const rolActual = state.roles.find((r) => r.nombre === usuario.rol)
  state.modal = {
    tipo: 'editar',
    usuario,
    error: '',
    guardando: false,
    nombre: usuario.nombre,
    email: usuario.email,
    rol_id: usuario.rol_id ?? rolActual?.id ?? '',
    activo: Boolean(usuario.activo),
    descuento_maximo_pct: usuario.descuento_maximo_pct,
    recargo_maximo_pct: usuario.recargo_maximo_pct,
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

function abrirModalPassword(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId)
  if (!usuario) return
  state.elementoDisparadorModal = document.activeElement
  state.modal = { tipo: 'password', usuario, error: '', guardando: false, password: '' }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

function cerrarModal() {
  state.modal = null
  renderApp()
  if (state.elementoDisparadorModal) {
    state.elementoDisparadorModal.focus()
    state.elementoDisparadorModal = null
  }
}

async function desactivarUsuario(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId)
  if (!usuario) return
  if (!confirm(`¿Desactivar a ${usuario.nombre}? No va a poder iniciar sesión.`)) return

  try {
    await api.put(`/admin/usuarios/${usuarioId}`, { activo: false })
    mostrarBanner('success', `${usuario.nombre} fue desactivado.`)
    await cargarUsuarios()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo desactivar el usuario.')
  }
}

async function eliminarUsuario(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId)
  if (!usuario) return
  if (!confirm(`¿Eliminar a ${usuario.nombre} definitivamente? Esta acción no se puede deshacer.`))
    return

  try {
    await api.delete(`/admin/usuarios/${usuarioId}`)
    mostrarBanner('success', `${usuario.nombre} fue eliminado.`)
    await cargarUsuarios()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar el usuario.')
  }
}

async function guardarModalCrear(form) {
  const nombre = form.nombre.value.trim()
  const email = form.email.value.trim()
  const rol_id = Number(form.rol_id.value)
  const password = form.password.value

  if (!nombre || !email) {
    state.modal.error = 'Completá nombre y email.'
    renderApp()
    return
  }
  if (!rol_id) {
    state.modal.error = 'Elegí un rol.'
    renderApp()
    return
  }
  if (password.length < 8) {
    state.modal.error = 'La contraseña debe tener al menos 8 caracteres.'
    renderApp()
    return
  }

  state.modal.error = ''
  state.modal.guardando = true
  renderApp()

  try {
    await api.post('/admin/usuarios', { nombre, email, rol_id, password })
    cerrarModal()
    mostrarBanner('success', `Usuario ${nombre} creado.`)
    await cargarUsuarios()
  } catch (err) {
    state.modal.guardando = false
    state.modal.error = err.message || 'No se pudo crear el usuario.'
    renderApp()
  }
}

async function guardarModalEditar(form) {
  const usuario = state.modal.usuario
  const nombre = form.nombre.value.trim()
  const email = form.email.value.trim()
  const rol_id = Number(form.rol_id.value)
  const activo = form.activo.checked
  // Campo vacío = sin tope propio (usa el tope del plan tal cual) -> se manda null.
  const descuentoMaximoPct =
    form.descuento_maximo_pct.value === '' ? null : Number(form.descuento_maximo_pct.value)
  const recargoMaximoPct =
    form.recargo_maximo_pct.value === '' ? null : Number(form.recargo_maximo_pct.value)

  if (!nombre || !email) {
    state.modal.error = 'Completá nombre y email.'
    renderApp()
    return
  }
  if (!rol_id) {
    state.modal.error = 'Elegí un rol.'
    renderApp()
    return
  }

  state.modal.error = ''
  state.modal.guardando = true
  renderApp()

  try {
    await api.put(`/admin/usuarios/${usuario.id}`, {
      nombre,
      email,
      rol_id,
      activo,
      descuento_maximo_pct: descuentoMaximoPct,
      recargo_maximo_pct: recargoMaximoPct,
    })
    cerrarModal()
    mostrarBanner('success', `Usuario ${usuario.nombre} actualizado.`)
    await cargarUsuarios()
  } catch (err) {
    state.modal.guardando = false
    state.modal.error = err.message || 'No se pudo actualizar el usuario.'
    renderApp()
  }
}

async function guardarModalPassword(form) {
  const usuario = state.modal.usuario
  const password = form.password.value

  if (password.length < 8) {
    state.modal.error = 'La contraseña debe tener al menos 8 caracteres.'
    renderApp()
    return
  }

  state.modal.error = ''
  state.modal.guardando = true
  renderApp()

  try {
    await api.put(`/admin/usuarios/${usuario.id}/password`, { password })
    cerrarModal()
    mostrarBanner('success', `Contraseña de ${usuario.nombre} actualizada.`)
  } catch (err) {
    state.modal.guardando = false
    state.modal.error = err.message || 'No se pudo actualizar la contraseña.'
    renderApp()
  }
}

// ---------------------------------------------------------------------------
// Roles: carga y acciones (migración 031)
// ---------------------------------------------------------------------------

async function cargarRoles() {
  state.loadingRoles = true
  state.rolesError = ''
  renderApp()
  try {
    state.roles = await api.get('/admin/roles')
  } catch (err) {
    state.roles = []
    state.rolesError = err.message || 'No se pudo cargar la lista de roles.'
  } finally {
    state.loadingRoles = false
    renderApp()
  }
}

async function eliminarRol(rolId) {
  const rol = state.roles.find((r) => r.id === rolId)
  if (!rol) return
  if (
    !confirm(
      `¿Eliminar el rol "${capitalizar(rol.nombre)}" definitivamente? Esta acción no se puede deshacer.`
    )
  )
    return

  try {
    await api.delete(`/admin/roles/${rolId}`)
    mostrarBanner('success', `Rol "${capitalizar(rol.nombre)}" eliminado.`)
    await cargarRoles()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar el rol.')
  }
}

function abrirModalRolCrear() {
  state.elementoDisparadorModal = document.activeElement
  state.modalRol = {
    tipo: 'crear',
    error: '',
    guardando: false,
    nombre: '',
    puede_editar_tasas: false,
    puede_gestionar_usuarios: false,
    puede_editar_coberturas: false,
    puede_editar_planes: false,
    puede_editar_descuento_plan: false,
    puede_ver_descuento_plan: true,
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

function abrirModalRolEditar(rolId) {
  const rol = state.roles.find((r) => r.id === rolId)
  if (!rol || rol.es_sistema) return // roles del sistema no son editables desde el panel
  state.elementoDisparadorModal = document.activeElement
  state.modalRol = {
    tipo: 'editar',
    rolId: rol.id,
    error: '',
    guardando: false,
    nombre: rol.nombre,
    puede_editar_tasas: Boolean(rol.puede_editar_tasas),
    puede_gestionar_usuarios: Boolean(rol.puede_gestionar_usuarios),
    puede_editar_coberturas: Boolean(rol.puede_editar_coberturas),
    puede_editar_planes: Boolean(rol.puede_editar_planes),
    puede_editar_descuento_plan: Boolean(rol.puede_editar_descuento_plan),
    puede_ver_descuento_plan: Boolean(rol.puede_ver_descuento_plan),
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

function cerrarModalRol() {
  state.modalRol = null
  renderApp()
  if (state.elementoDisparadorModal) {
    state.elementoDisparadorModal.focus()
    state.elementoDisparadorModal = null
  }
}

async function guardarModalRol(form) {
  const nombre = form.nombre.value.trim()
  const datos = {
    nombre,
    puede_editar_tasas: form.puede_editar_tasas.checked,
    puede_gestionar_usuarios: form.puede_gestionar_usuarios.checked,
    puede_editar_coberturas: form.puede_editar_coberturas.checked,
    puede_editar_planes: form.puede_editar_planes.checked,
    puede_editar_descuento_plan: form.puede_editar_descuento_plan.checked,
    puede_ver_descuento_plan: form.puede_ver_descuento_plan.checked,
  }

  if (!nombre) {
    state.modalRol.error = 'Completá el nombre del rol.'
    renderApp()
    return
  }

  state.modalRol.error = ''
  state.modalRol.guardando = true
  renderApp()

  try {
    if (state.modalRol.tipo === 'crear') {
      await api.post('/admin/roles', datos)
      mostrarBanner('success', `Rol ${nombre} creado.`)
    } else {
      await api.put(`/admin/roles/${state.modalRol.rolId}`, datos)
      mostrarBanner('success', `Rol ${nombre} actualizado.`)
    }
    cerrarModalRol()
    await cargarRoles()
    // Repuebla el select de rol de un modal de usuario abierto, si lo hay, para que
    // el rol recién creado/editado aparezca sin tener que cerrar y reabrir el modal.
    renderApp()
  } catch (err) {
    state.modalRol.guardando = false
    state.modalRol.error = err.message || 'No se pudo guardar el rol.'
    renderApp()
  }
}

// ---------------------------------------------------------------------------
// Ramos: carga y acciones (gate: rol admin, ver seccionesVisibles())
// ---------------------------------------------------------------------------

async function cargarRamosGestion() {
  state.loadingRamosGestion = true
  state.ramosGestionError = ''
  renderApp()
  try {
    state.ramosGestion = await api.get('/admin/ramos')
  } catch (err) {
    state.ramosGestionError = err.message || 'No se pudieron cargar los ramos.'
  } finally {
    state.loadingRamosGestion = false
    renderApp()
  }
}

async function toggleRamoActivo(ramoId, activo) {
  try {
    await api.put(`/admin/ramos/${ramoId}`, { activo })
    const ramo = state.ramosGestion.find((r) => r.id === Number(ramoId))
    if (ramo) ramo.activo = activo
    mostrarBanner(
      'success',
      activo
        ? 'Ramo activado. Ya aparece disponible en el sidebar del cotizador.'
        : 'Ramo desactivado. Ahora aparece como "Próximamente" en el sidebar del cotizador.'
    )
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el ramo.')
  }
}

// Helpers compartidos por las variantes "editar inline" del panel admin (nombre de ramo,
// prima técnica mínima, topes de plan, tasa RPF, tasa edificio/contenido, monto/franquicia):
// todas comparten el mismo mecanismo de estado (un Set de ids en edición) para habilitar y
// cancelar la edición — la única diferencia entre variantes es qué Set usan, así que las
// funciones nombradas de cada variante (habilitarEdicionTasaRpf, etc.) quedan como wrappers
// finos que delegan acá, sin cambiar la firma que ya usan los switches de onActionClick.
function habilitarEdicionInline(set, id) {
  set.add(id)
  renderApp()
}

function cancelarEdicionInline(set, id) {
  set.delete(id)
  renderApp()
}

function habilitarEdicionNombreRamo(ramoId) {
  habilitarEdicionInline(state.ramoNombreEnEdicion, ramoId)
}

function cancelarEdicionNombreRamo(ramoId) {
  cancelarEdicionInline(state.ramoNombreEnEdicion, ramoId)
}

async function guardarNombreRamo(ramoId, form) {
  const nombre_display = form.nombre_display.value.trim()
  if (!nombre_display) {
    mostrarBanner('error', 'El nombre del ramo no puede quedar vacío.')
    return
  }

  try {
    const ramo = await api.put(`/admin/ramos/${ramoId}`, { nombre_display })
    const entry = state.ramosGestion.find((r) => r.id === Number(ramoId))
    if (entry) entry.nombre_display = ramo.nombre_display
    state.ramoNombreEnEdicion.delete(Number(ramoId))
    mostrarBanner('success', 'Nombre del ramo actualizado.')
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el nombre del ramo.')
  }
}

async function eliminarRamo(ramoId) {
  const ramo = state.ramosGestion.find((r) => r.id === ramoId)
  if (!ramo) return
  if (
    !confirm(
      `¿Eliminar el ramo "${ramo.nombre_display}" definitivamente? Esta acción no se puede deshacer.`
    )
  )
    return

  try {
    await api.delete(`/admin/ramos/${ramoId}`)
    state.ramosGestion = state.ramosGestion.filter((r) => r.id !== ramoId)
    mostrarBanner('success', `Ramo "${ramo.nombre_display}" eliminado.`)
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar el ramo.')
  }
}

// ---------------------------------------------------------------------------
// Planes: carga y acciones
// ---------------------------------------------------------------------------

async function cargarPlanes() {
  state.loadingPlanes = true
  state.planesError = ''
  renderApp()
  try {
    const [ramos, planes] = await Promise.all([getRamos(), api.get('/admin/planes')])
    state.ramos = ramos
    state.planes = planes
  } catch (err) {
    state.planes = []
    state.planesError = err.message || 'No se pudo cargar la lista de planes.'
  } finally {
    state.loadingPlanes = false
    renderApp()
  }
}

async function togglePlanActivo(planId, activo) {
  try {
    await api.put(`/admin/planes/${planId}`, { activo })
    const plan = state.planes.find((p) => p.id === Number(planId))
    if (plan) plan.activo = activo
    mostrarBanner('success', `Plan ${activo ? 'activado' : 'desactivado'}.`)
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el plan.')
  }
}

function habilitarEdicionPrima(planId) {
  habilitarEdicionInline(state.primaEnEdicion, planId)
}

function cancelarEdicionPrima(planId) {
  cancelarEdicionInline(state.primaEnEdicion, planId)
}

async function guardarPrimaTecnicaMinima(planId, form) {
  const campo = form.prima_tecnica_minima_usd ? 'prima_tecnica_minima_usd' : 'prima_tecnica_minima'
  const valor = form[campo].value
  const cambios = { [campo]: valor === '' ? null : Number(valor) }

  const nombre = form.nombre.value.trim()
  if (!nombre) {
    mostrarBanner('error', 'El nombre del plan no puede quedar vacío.')
    return
  }
  cambios.nombre = nombre

  try {
    const plan = await api.put(`/admin/planes/${planId}`, cambios)
    const idx = state.planes.findIndex((p) => p.id === Number(planId))
    if (idx !== -1) state.planes[idx] = { ...state.planes[idx], ...plan }
    state.primaEnEdicion.delete(Number(planId))
    mostrarBanner('success', 'Plan actualizado.')
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el plan.')
  }
}

function habilitarEdicionTopes(planId) {
  habilitarEdicionInline(state.topesEnEdicion, planId)
}

function cancelarEdicionTopes(planId) {
  cancelarEdicionInline(state.topesEnEdicion, planId)
}

// Separado de guardarPrimaTecnicaMinima/PUT /admin/planes/:id a propósito: descuento_maximo
// y recargo_maximo van por un endpoint propio (PUT /admin/planes/:id/topes) gateado
// server-side por rol admin literal (requireRole('admin')), no por el permiso delegable
// puede_editar_planes — ver admin.routes.js y docs/ESTADO_PROYECTO.md.
async function guardarPlanTopes(planId, form) {
  const descuento = form.descuento_maximo.value
  const recargo = form.recargo_maximo.value
  const cambios = {
    descuento_maximo: descuento === '' ? null : Number(descuento),
    recargo_maximo: recargo === '' ? null : Number(recargo),
  }

  try {
    const plan = await api.put(`/admin/planes/${planId}/topes`, cambios)
    const idx = state.planes.findIndex((p) => p.id === Number(planId))
    if (idx !== -1) state.planes[idx] = { ...state.planes[idx], ...plan }
    state.topesEnEdicion.delete(Number(planId))
    mostrarBanner('success', 'Topes del plan actualizados.')
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudieron actualizar los topes del plan.')
  }
}

async function toggleFormasPago(planId) {
  if (state.planExpandido === planId) {
    state.planExpandido = null
    renderApp()
    return
  }
  state.planExpandido = planId
  renderApp()

  if (state.formasPagoPorPlan[planId]?.datos) return // ya cargadas

  state.formasPagoPorPlan[planId] = { loading: true, error: '', datos: [] }
  renderApp()
  try {
    const datos = await api.get(`/admin/planes/${planId}/formas-pago`)
    state.formasPagoPorPlan[planId] = { loading: false, error: '', datos }
  } catch (err) {
    state.formasPagoPorPlan[planId] = {
      loading: false,
      error: err.message || 'No se pudieron cargar las formas de pago.',
      datos: [],
    }
  }
  renderApp()
}

async function toggleFormaPagoHabilitada(planFormaPagoId, planId, habilitada) {
  try {
    await api.put(`/admin/plan-formas-pago/${planFormaPagoId}`, { habilitada })
    const entry = state.formasPagoPorPlan[planId]
    const fila = entry?.datos.find((f) => f.id === Number(planFormaPagoId))
    if (fila) fila.habilitada = habilitada
    mostrarBanner('success', `Forma de pago ${habilitada ? 'habilitada' : 'deshabilitada'}.`)
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la forma de pago.')
  }
}

function habilitarEdicionTasaRpf(planFormaPagoId) {
  habilitarEdicionInline(state.tasaRpfEnEdicion, planFormaPagoId)
}

function cancelarEdicionTasaRpf(planFormaPagoId) {
  cancelarEdicionInline(state.tasaRpfEnEdicion, planFormaPagoId)
}

async function guardarTasaRpf(planFormaPagoId, planId, form) {
  const tasa_rpf = Number(form.tasa_rpf.value)

  try {
    const fila = await api.put(`/admin/plan-formas-pago/${planFormaPagoId}`, { tasa_rpf })
    const entry = state.formasPagoPorPlan[planId]
    const idx = entry?.datos.findIndex((f) => f.id === Number(planFormaPagoId))
    if (entry && idx !== -1) entry.datos[idx] = { ...entry.datos[idx], ...fila }
    state.tasaRpfEnEdicion.delete(Number(planFormaPagoId))
    mostrarBanner('success', 'Tasa RPF actualizada.')
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la tasa RPF.')
  }
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

async function eliminarPlan(id) {
  const plan = state.planes.find((p) => p.id === id)
  const nombre = plan?.nombre ?? 'este plan'
  if (!confirm(`¿Eliminar el plan "${nombre}"? Esta acción no se puede deshacer.`)) return

  try {
    await api.delete(`/admin/planes/${id}`)
    mostrarBanner('success', 'Plan eliminado.')
    await cargarPlanes()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar el plan.')
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
