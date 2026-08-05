import { api } from '../shared/api.js'
import { getRamos } from '../shared/catalogo.js'
import { state } from './state.js'
import { renderApp, mostrarBanner } from './render/shell.js'
import { habilitarEdicionInline, cancelarEdicionInline } from './inline-edit.js'
import { cargarCurvaRpf } from './rpf-cuotas.js'

// ---------------------------------------------------------------------------
// Planes: carga y acciones
// ---------------------------------------------------------------------------

export async function cargarPlanes() {
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

  // Curva GLOBAL de R.P.F. (cambio `rpf-variable-mrc`), independiente del resultado de
  // arriba — un fallo cargando planes no debe impedir ver/editar la curva, y viceversa.
  if (!state.curvaRpf.datos && !state.curvaRpf.loading) {
    cargarCurvaRpf()
  }
}

export async function togglePlanActivo(planId, activo) {
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

export function habilitarEdicionPrima(planId) {
  habilitarEdicionInline(state.primaEnEdicion, planId)
}

export function cancelarEdicionPrima(planId) {
  cancelarEdicionInline(state.primaEnEdicion, planId)
}

export async function guardarPrimaTecnicaMinima(planId, form) {
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

export function habilitarEdicionTopes(planId) {
  habilitarEdicionInline(state.topesEnEdicion, planId)
}

export function cancelarEdicionTopes(planId) {
  cancelarEdicionInline(state.topesEnEdicion, planId)
}

// Separado de guardarPrimaTecnicaMinima/PUT /admin/planes/:id a propósito: descuento_maximo
// y recargo_maximo van por un endpoint propio (PUT /admin/planes/:id/topes) gateado
// server-side por rol admin literal (requireRole('admin')), no por el permiso delegable
// puede_editar_planes — ver admin.routes.js y docs/ESTADO_PROYECTO.md.
export async function guardarPlanTopes(planId, form) {
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

export async function toggleFormasPago(planId) {
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

export async function toggleFormaPagoHabilitada(planFormaPagoId, planId, habilitada) {
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

export function habilitarEdicionTasaRpf(planFormaPagoId) {
  habilitarEdicionInline(state.tasaRpfEnEdicion, planFormaPagoId)
}

export function cancelarEdicionTasaRpf(planFormaPagoId) {
  cancelarEdicionInline(state.tasaRpfEnEdicion, planFormaPagoId)
}

export async function guardarTasaRpf(planFormaPagoId, planId, form) {
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

export async function eliminarPlan(id) {
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
