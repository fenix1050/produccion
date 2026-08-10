import { api, auth } from '../shared/api.js'
import { getRamos } from '../shared/catalogo.js'
import { atraparFoco } from '../shared/dom.js'
import { fmtGsInput } from '../shared/format.js'
import { logger } from '../shared/logger.js'
import { state, app } from './state.js'
import { RAMOS_CON_CALCULO } from './constants.js'
import { prefillDatosDesdeCotizacion } from './body-builder.js'
import { renderLivePanel } from './render/render-cotizacion-vivo.js'
import { renderApp } from './render/render-shell.js'
import {
  mostrarBanner,
  setView,
  cargarCoberturasCatalogo,
  cargarPlanCoberturas,
  calcularPreview,
  scheduleCalculate,
  addCoberturaLinea,
  removeCoberturaLinea,
  updateCoberturaLinea,
  toggleCoberturaAdicionalPorCodigo,
  selectMoneda,
  selectRamo,
  selectPlan,
  emitirCartaOferta,
  cerrarModalProgresoCarta,
} from './actions.js'

// Cotizador Tajy — App Shell + Datos + Resultado (Fase 6, alcance MRC plan Normal).
// Recreación en Vanilla JS del handoff de diseño original (mockup ya migrado y eliminado
// tras la implementación de "Diseño 2" en frontend/cotizar).

async function init() {
  // Cambio session-httponly-cookie: ya no hay token en localStorage para chequear de
  // forma síncrona — hay que esperar auth.cargarSesion() (GET /auth/me) antes del gate.
  // Se cachea en memoria (shared/api.js), así que renderAjusteField() más abajo (que lee
  // auth.getUsuario() de forma síncrona durante el render) ya la encuentra resuelta.
  const usuario = await auth.cargarSesion()
  if (!usuario) {
    window.location.href = '../login/'
    return
  }
  try {
    state.ramosActivos = await getRamos()
  } catch (err) {
    logger.error('No se pudo cargar la lista de ramos', err)
    state.ramosActivos = []
  }

  const params = new URLSearchParams(location.search)
  const editarId = params.get('editar')
  if (editarId) {
    await cargarParaEditar(Number(editarId))
  } else {
    const ramoParam = params.get('ramo')
    if (ramoParam) {
      await selectRamo(ramoParam)
    }
  }

  renderApp()
}

// ---------------------------------------------------------------------------
// Edición de una cotización existente (?editar=<id> en la URL, ver historial.js) — ventana de
// 30 días validada en el backend (cotizacion.service.js actualizarCotizacion). Reconstruye
// state.ramoId/planId/data/coberturasAdicionales/franquiciasPorCobertura a partir del detalle
// ya guardado y dispara un cálculo inmediato (no debounced) para que la prima aparezca sin
// esperar el timer de scheduleCalculate.
// ---------------------------------------------------------------------------

async function cargarParaEditar(id) {
  let cotizacion
  try {
    cotizacion = await api.get(`/cotizaciones/${id}`)
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo cargar la cotización para editar.')
    return
  }

  const ramo = state.ramosActivos.find((r) => r.id === cotizacion.ramo_id)
  if (!ramo) {
    mostrarBanner('error', 'No se encontró el ramo de esta cotización.')
    return
  }

  state.editandoId = id
  state.ramoId = ramo.nombre
  state.view = 'form'
  state.planBloqueado = false

  try {
    state.planes = await api.get(`/ramos/${ramo.id}/planes`)
  } catch (err) {
    logger.error('No se pudieron cargar los planes del ramo', err)
    state.planes = []
  }
  state.planId = cotizacion.plan_id

  if (ramo.nombre === 'mrc' || ramo.nombre === 'incendio') {
    try {
      // Cambio "incendio-tasas-por-rubro": el catálogo ahora se filtra por ramo
      // (rubro_actividad_ramo) — cada ramo trae solo sus propios rubros, ya no la
      // lista compartida sin filtrar entre MRC/Incendio/TRO.
      state.rubros = await api.get(`/ramos/rubros-actividad?ramo_id=${ramo.id}`)
    } catch (err) {
      logger.error('No se pudieron cargar los tipos de riesgo', err)
      state.rubros = []
    }
  }

  if (ramo.nombre === 'mrc') {
    await cargarCoberturasCatalogo(ramo.id)
    await cargarPlanCoberturas(state.planId)
  }

  const plan = state.planes.find((p) => p.id === state.planId)
  prefillDatosDesdeCotizacion(ramo.nombre, plan, cotizacion)

  if (RAMOS_CON_CALCULO.includes(ramo.nombre)) {
    await calcularPreview()
  }
}

async function cerrarSesion() {
  await auth.logout()
  window.location.href = '../login/'
}

// ---------------------------------------------------------------------------
// Acciones de estado
// ---------------------------------------------------------------------------

function selectFormaPago(codigo) {
  state.formaPagoCodigo = codigo
  renderLivePanel()
  if (state.view === 'result') renderApp()
}

function selectFranquicia(codigoCobertura, valor) {
  state.franquiciasPorCobertura[codigoCobertura] = valor
}

function updateField(key, value) {
  state.data[key] = value
  if (RAMOS_CON_CALCULO.includes(state.ramoId)) {
    scheduleCalculate()
  }
}

// ---------------------------------------------------------------------------
// Eventos (delegación sobre #app, registrada una única vez — renderApp() reemplaza el
// innerHTML de #app pero no el nodo #app en sí, así que estos listeners sobreviven a
// cada re-render sin necesidad de volver a engancharlos).
// ---------------------------------------------------------------------------

// Respeta data-stop-propagation (el modal de progreso): un click dentro del modal que no
// caiga sobre su propio data-action no debe "escapar" hacia el data-action del backdrop
// que lo contiene — mismo patrón que resolveActionTarget() de historial.js.
function resolveActionTarget(e) {
  const target = e.target.closest('[data-action]')
  if (!target || target.disabled) return null
  const stopEl = e.target.closest('[data-stop-propagation]')
  if (stopEl && !stopEl.contains(target)) return null
  return target
}

app.addEventListener('click', (e) => {
  const target = resolveActionTarget(e)
  if (!target) return

  const action = target.dataset.action
  if (action === 'logout') cerrarSesion()
  else if (action === 'toggle-sidebar') {
    state.sidebarAbierta = !state.sidebarAbierta
    renderApp()
  } else if (action === 'close-sidebar') {
    state.sidebarAbierta = false
    renderApp()
  } else if (action === 'select-ramo') selectRamo(target.dataset.ramo)
  else if (action === 'select-forma-pago') selectFormaPago(target.dataset.forma)
  else if (action === 'select-moneda') selectMoneda(target.dataset.moneda)
  else if (action === 'show-tab') setView(target.dataset.view)
  else if (action === 'add-cobertura-linea') addCoberturaLinea()
  else if (action === 'remove-cobertura-linea') removeCoberturaLinea(target.dataset.lineaId)
  else if (action === 'toggle-cobertura-checkbox')
    toggleCoberturaAdicionalPorCodigo(target.dataset.codigo, target.checked)
  else if (action === 'emitir-carta') emitirCartaOferta()
  else if (action === 'cerrar-modal-progreso-carta') cerrarModalProgresoCarta()
  else if (action === 'reintentar-carta') emitirCartaOferta()
  else if (action === 'ver-pdf-carta' && state.progresoCarta?.pdfUrl)
    window.open(state.progresoCarta.pdfUrl, '_blank')
})

// Escape cierra el modal de progreso solo si ya llegó a un estado terminal (éxito/error) —
// mientras está 'activo' no se puede cortar la ilusión de progreso (la petición real sigue
// en curso). Tab/Shift+Tab quedan atrapados dentro del modal mientras esté abierto.
document.addEventListener('keydown', (e) => {
  if (!state.progresoCarta) return
  if (e.key === 'Escape') {
    cerrarModalProgresoCarta()
    return
  }
  if (e.key === 'Tab') {
    const modalAbierto = app.querySelector('.progreso-carta-modal')
    if (modalAbierto) atraparFoco(e, modalAbierto)
  }
})

// Formatea un input de dinero in-place (misma lógica para el campo money de una línea de
// cobertura adicional que para capitalEdificio/capitalContenido) y devuelve los dígitos crudos.
function formatMoneyInputInPlace(target) {
  const digitsBeforeCursor = target.value.slice(0, target.selectionStart).replace(/\D/g, '').length
  const digits = target.value.replace(/\D/g, '')
  const formatted = fmtGsInput(digits)
  target.value = formatted

  let seen = 0
  let newCursor = formatted.length
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) seen += 1
    if (seen === digitsBeforeCursor) {
      newCursor = i + 1
      break
    }
  }
  target.setSelectionRange(newCursor, newCursor)
  return digits
}

app.addEventListener('input', (e) => {
  const lineaTarget = e.target.closest('[data-linea-id][data-linea-field]')
  if (lineaTarget) {
    const value =
      lineaTarget.dataset.money === 'true'
        ? formatMoneyInputInPlace(lineaTarget)
        : lineaTarget.value
    updateCoberturaLinea(lineaTarget.dataset.lineaId, lineaTarget.dataset.lineaField, value)
    return
  }

  const target = e.target.closest('[data-field]')
  if (!target) return

  if (target.type === 'checkbox') {
    updateField(target.dataset.field, target.checked)
    renderApp() // muestra/oculta campos condicionales (ej. Suma Renta Diaria)
    return
  }

  if (target.dataset.money === 'true') {
    updateField(target.dataset.field, formatMoneyInputInPlace(target))
    return
  }

  updateField(target.dataset.field, target.value)
})

app.addEventListener('change', (e) => {
  const planSelect = e.target.closest('[data-action-select="select-plan"]')
  if (planSelect) {
    selectPlan(Number(planSelect.value))
    return
  }

  const franquiciaTarget = e.target.closest('[data-franquicia-cobertura]')
  if (franquiciaTarget) {
    selectFranquicia(franquiciaTarget.dataset.franquiciaCobertura, franquiciaTarget.value)
    return
  }

  const lineaTarget = e.target.closest('[data-linea-id][data-linea-field]')
  if (lineaTarget && lineaTarget.tagName === 'SELECT') {
    updateCoberturaLinea(
      lineaTarget.dataset.lineaId,
      lineaTarget.dataset.lineaField,
      lineaTarget.value
    )
    return
  }

  const target = e.target.closest('[data-field]')
  if (!target || target.tagName !== 'SELECT') return
  updateField(target.dataset.field, target.value)
})

init()
