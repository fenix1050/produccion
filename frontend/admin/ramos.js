import { api } from '../shared/api.js'
import { state } from './state.js'
import { renderApp, mostrarBanner } from './render/shell.js'
import { habilitarEdicionInline, cancelarEdicionInline } from './inline-edit.js'

// ---------------------------------------------------------------------------
// Ramos: carga y acciones (gate: rol admin, ver seccionesVisibles())
// ---------------------------------------------------------------------------

export async function cargarRamosGestion() {
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

export async function toggleRamoActivo(ramoId, activo) {
  try {
    await api.put(`/admin/ramos/${ramoId}`, { activo })
    const ramo = state.ramosGestion.find((r) => r.id === Number(ramoId))
    if (ramo) ramo.activo = activo
    mostrarBanner(
      'success',
      activo
        ? 'Ramo mostrado. Ya aparece en el sidebar del cotizador.'
        : 'Ramo ocultado. Ya no aparece en el sidebar del cotizador.'
    )
    renderApp()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el ramo.')
  }
}

export function habilitarEdicionNombreRamo(ramoId) {
  habilitarEdicionInline(state.ramoNombreEnEdicion, ramoId)
}

export function cancelarEdicionNombreRamo(ramoId) {
  cancelarEdicionInline(state.ramoNombreEnEdicion, ramoId)
}

export async function guardarNombreRamo(ramoId, form) {
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

export async function eliminarRamo(ramoId) {
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
