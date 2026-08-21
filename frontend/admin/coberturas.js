import { api } from '../shared/api.js'
import { enfocarPrimerElemento } from '../shared/dom.js'
import { state, app } from './state.js'
import { renderApp, mostrarBanner } from './render/shell.js'
import { habilitarEdicionInline, cancelarEdicionInline } from './inline-edit.js'
import { cargarCatalogoDeRamo } from './catalogo-ramo.js'

// ---------------------------------------------------------------------------
// Coberturas por plan: carga y acciones
// ---------------------------------------------------------------------------

function esRamoMrcSeleccionado() {
  return state.ramos.some(
    (ramo) =>
      String(ramo.id) === String(state.ramoCoberturasSeleccionado) &&
      (ramo.nombre === 'mrc' || ramo.calculador === 'mrc')
  )
}

function canonicalizarFranquiciaAdmin(franquicia) {
  if (!esRamoMrcSeleccionado()) return franquicia
  return franquicia == null || franquicia === 0 ? null : franquicia
}

function franquiciaMrcValida(franquicia) {
  if (!esRamoMrcSeleccionado()) return true
  return franquicia == null || (Number.isFinite(franquicia) && franquicia > 0)
}

export async function seleccionarRamoCoberturas(ramoId) {
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

export async function cargarPlanesDeRamoCob(ramoId) {
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

export async function seleccionarPlanCoberturas(planId) {
  state.planCoberturasSeleccionado = planId || null
  renderApp()
  if (!state.planCoberturasSeleccionado) return
  await cargarCoberturasDelPlan(state.planCoberturasSeleccionado)
}

export async function cargarCoberturasDelPlan(planId) {
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

export async function toggleCoberturaDefecto(planCoberturaId, planId, incluidaPorDefecto) {
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

export function habilitarEdicionCobertura(planCoberturaId) {
  habilitarEdicionInline(state.coberturaEnEdicion, planCoberturaId)
}

export function cancelarEdicionCobertura(planCoberturaId) {
  cancelarEdicionInline(state.coberturaEnEdicion, planCoberturaId)
}

export async function guardarMontoFranquicia(planCoberturaId, planId, form) {
  const montoValor = form.monto.value
  const franquiciaValor = form.franquicia.value
  const monto = montoValor === '' ? null : Number(montoValor)
  const franquicia = canonicalizarFranquiciaAdmin(
    franquiciaValor === '' ? null : Number(franquiciaValor)
  )
  if (!franquiciaMrcValida(franquicia)) {
    mostrarBanner('error', 'La franquicia MRC no puede ser negativa.')
    return
  }

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

export async function eliminarCoberturaDelPlan(planCoberturaId, planId) {
  if (!confirm('¿Quitar esta cobertura del plan?')) return
  try {
    await api.delete(`/admin/plan-coberturas/${planCoberturaId}`)
    mostrarBanner('success', 'Cobertura quitada del plan.')
    await cargarCoberturasDelPlan(planId)
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo quitar la cobertura.')
  }
}

export function abrirModalCobertura() {
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

export function cerrarModalCobertura() {
  state.modalCobertura = null
  renderApp()
  if (state.elementoDisparadorModal) {
    state.elementoDisparadorModal.focus()
    state.elementoDisparadorModal = null
  }
}

export async function guardarModalCobertura(form) {
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

  const franquicia = canonicalizarFranquiciaAdmin(
    franquiciaValor === '' ? null : Number(franquiciaValor)
  )
  if (!franquiciaMrcValida(franquicia)) {
    state.modalCobertura.error = 'La franquicia MRC no puede ser negativa.'
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
      franquicia,
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
