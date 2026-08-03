import { api } from '../shared/api.js'
import { enfocarPrimerElemento } from '../shared/dom.js'
import { state, app } from './state.js'
import { renderApp, mostrarBanner } from './render/shell.js'
import { ramoUsaRubrosActividad } from './render/tasas.js'
import { habilitarEdicionInline, cancelarEdicionInline } from './inline-edit.js'
import { cargarCatalogoDeRamo } from './catalogo-ramo.js'

// ---------------------------------------------------------------------------
// Tasas: carga y acciones
// ---------------------------------------------------------------------------

export async function seleccionarRamoTasas(ramoId) {
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

export async function cargarRubrosActividad(ramoId) {
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

export function habilitarEdicionRubroActividad(id) {
  habilitarEdicionInline(state.rubroActividadEnEdicion, id)
}

export function cancelarEdicionRubroActividad(id) {
  cancelarEdicionInline(state.rubroActividadEnEdicion, id)
}

export async function guardarRubroActividadTasas(id, form) {
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

export async function eliminarTasa(id) {
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

export async function cargarTasasDeRamo(ramoId) {
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

export function abrirModalTasa() {
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

export function cerrarModalTasa() {
  state.modalTasa = null
  renderApp()
  if (state.elementoDisparadorModal) {
    state.elementoDisparadorModal.focus()
    state.elementoDisparadorModal = null
  }
}

export async function guardarModalTasa(form) {
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
