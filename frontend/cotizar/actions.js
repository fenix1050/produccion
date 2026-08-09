import { api } from '../shared/api.js'
import { logger } from '../shared/logger.js'
import { state } from './state.js'
import { MOTIVO_BLOQUEO_ID, DEBOUNCE_MS } from './constants.js'
import {
  puedeAvanzarADetalle,
  datosMinimosCompletos,
  capitalAseguradoParaBody,
  descuentosParaBody,
  recargosParaBody,
  monedaEfectiva,
  franquiciaValorPorDefecto,
} from './domain-rules.js'
import { armarRiesgoDatos, idLinea } from './body-builder.js'
import { renderApp } from './render/render-shell.js'
import { renderLivePanel } from './render/render-cotizacion-vivo.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function mostrarBanner(tipo, texto) {
  state.banner = { tipo, texto }
  renderApp()
}

export function setView(view) {
  state.view = view
  if (view === 'result') state.planBloqueado = true
  renderApp()
}

// Catálogo COMPLETO de coberturas del ramo (coberturas_catalogo vía GET /ramos/:id/coberturas-catalogo)
// — a diferencia de GET /planes/:id/coberturas (plan_coberturas), que en MRC solo trae los
// sublímites por defecto, no las coberturas principales (Robo contenido, Cristales, etc.).
// Se usa para poblar el selector de "Coberturas adicionales" con nombre + categoría.
export async function cargarCoberturasCatalogo(ramoId) {
  try {
    state.coberturasCatalogo = await api.get(`/ramos/${ramoId}/coberturas-catalogo`)
  } catch (err) {
    logger.error('No se pudo cargar el catálogo de coberturas del ramo', err)
    state.coberturasCatalogo = []
  }
}

// Coberturas fijas del PLAN (plan_coberturas + coberturas_catalogo embebido), de donde salen
// los sublímites fijos por defecto (ver sublimitesFijosMrc()) — a diferencia del catálogo
// completo del ramo (cargarCoberturasCatalogo), esto sí varía por plan. Se recarga cada vez que
// el agente cambia de plan; un array vacío (plan sin filas en plan_coberturas todavía) no rompe
// el flujo — sublimitesFijosMrc() simplemente no devuelve filas.
export async function cargarPlanCoberturas(planId) {
  try {
    state.planCoberturas = await api.get(`/planes/${planId}/coberturas`)
  } catch (err) {
    logger.error('No se pudo cargar las coberturas fijas del plan', err)
    state.planCoberturas = []
  }
}

// El botón "Ver detalle completo" y la pestaña "Detalle del plan" viven fuera del subárbol que
// renderLivePanel() actualiza — sin esto quedaban con el estado `disabled` del último render
// completo (ej. mientras el capital todavía era insuficiente) y nunca se desbloqueaban al llegar
// a un cálculo válido. Se actualizan acá directo sobre el DOM en vez de un renderApp() completo,
// para no perder el foco/cursor de los inputs mientras el agente sigue tipeando.
export function syncAvanceButtons() {
  const habilitado = puedeAvanzarADetalle()
  const title = habilitado
    ? ''
    : 'Corregí el capital declarado antes de avanzar — ver el mensaje de alerta'

  const boton = document.getElementById('btn-ver-detalle')
  if (boton) {
    boton.disabled = !habilitado
    boton.title = title
    aplicarAriaBloqueo(boton, habilitado)
  }

  const tab = document.getElementById('tab-detalle-plan')
  if (tab) {
    tab.disabled = !habilitado
    tab.title = title
    aplicarAriaBloqueo(tab, habilitado)
  }
}

// El `title` (tooltip) no es accesible para lectores de pantalla ni por tacto — acá se agrega
// la vía accesible equivalente: `aria-disabled` + `aria-describedby` apuntando al mensaje real
// del motivo, ya visible en el panel "Cotización en vivo" (ver MOTIVO_BLOQUEO_ID).
function aplicarAriaBloqueo(el, habilitado) {
  if (habilitado) {
    el.removeAttribute('aria-disabled')
    el.removeAttribute('aria-describedby')
  } else {
    el.setAttribute('aria-disabled', 'true')
    el.setAttribute('aria-describedby', MOTIVO_BLOQUEO_ID)
  }
}

// ---------------------------------------------------------------------------
// Cálculo en vivo
// ---------------------------------------------------------------------------

let debounceTimer = null

export function scheduleCalculate() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(calcularPreview, DEBOUNCE_MS)
}

// ---------------------------------------------------------------------------
// Coberturas adicionales: líneas cobertura/sublímite más allá de Incendio Edificio/Contenido.
// ---------------------------------------------------------------------------

export function addCoberturaLinea() {
  state.coberturasAdicionales.push({ id: idLinea(), codigo: '', sumaAsegurada: '' })
  renderApp() // fila nueva: hace falta re-render completo
}

export function removeCoberturaLinea(id) {
  state.coberturasAdicionales = state.coberturasAdicionales.filter((l) => l.id !== id)
  renderApp()
  scheduleCalculate()
}

// Modo checkbox de "Coberturas adicionales" (roles sin puede_agregar_cobertura_libre, ver
// CODIGOS_COBERTURA_EXCLUIDOS_BASE/renderCoberturasAdicionalesCheckbox, Ajuste MC.xlsx ítem #6,
// 2026-08-05): cada código mapea a lo sumo una línea (sin la repetición x2 de robo_contenido
// que sí permite el flujo libre — simplificación a propósito para este modo restringido).
export function toggleCoberturaAdicionalPorCodigo(codigo, marcado) {
  if (marcado) {
    if (!state.coberturasAdicionales.some((l) => l.codigo === codigo)) {
      state.coberturasAdicionales.push({ id: idLinea(), codigo, sumaAsegurada: '' })
    }
  } else {
    state.coberturasAdicionales = state.coberturasAdicionales.filter((l) => l.codigo !== codigo)
  }
  renderApp()
  scheduleCalculate()
}

export function updateCoberturaLinea(id, field, value) {
  const linea = state.coberturasAdicionales.find((l) => l.id === id)
  if (!linea) return
  linea[field] = value
  if (field === 'codigo') {
    // Re-renderiza para que las demás filas reflejen el límite por cobertura recién elegida
    // (ver renderCoberturasAdicionales/LIMITE_REPETICION_COBERTURA_MRC) — no se hace en cada
    // tecleo de sumaAsegurada para no perder el foco del input mientras el agente escribe.
    renderApp()
  }
  scheduleCalculate()
}

export async function calcularPreview() {
  if (!datosMinimosCompletos()) {
    state.preview = null
    state.previewError = null
    renderLivePanel()
    if (state.view === 'result') renderApp()
    syncAvanceButtons()
    return
  }

  const d = state.data
  const plan = state.planes.find((p) => p.id === state.planId)
  const body = {
    plan_id: state.planId,
    capital_asegurado: capitalAseguradoParaBody(plan),
    riesgo_datos: armarRiesgoDatos(plan),
    descuentos: descuentosParaBody(),
    recargos: recargosParaBody(),
    cliente_nombre: d.clienteNombre || '',
    moneda: monedaEfectiva(plan),
    ...(d.cuotas ? { cuotas: Number(d.cuotas) } : {}),
  }

  state.loadingPreview = true
  renderLivePanel()

  try {
    const resultado = await api.post('/cotizaciones/calcular', body)
    state.preview = resultado
    state.previewError = null
    // Primera vez que llega un cálculo: default a "Contado" (sin RPF) si el agente
    // todavía no eligió forma de pago. Si ya había una elegida, se respeta.
    if (!state.formaPagoCodigo) {
      state.formaPagoCodigo =
        resultado.variantes?.[0]?.formasPago?.find((fp) => fp.codigo === 'contado')?.codigo ??
        resultado.variantes?.[0]?.formasPago?.[0]?.codigo ??
        null
    }
    // Defaultea la franquicia de cada cobertura nueva a la de catálogo — sin pisar una que
    // el agente ya haya elegido a mano en esta misma cotización.
    for (const c of resultado.coberturas || []) {
      if (!(c.codigo in state.franquiciasPorCobertura)) {
        state.franquiciasPorCobertura[c.codigo] = franquiciaValorPorDefecto(c.franquicia_default)
      }
    }
  } catch (err) {
    state.preview = null
    state.previewError = err.message || 'No se pudo calcular la cotización.'
  } finally {
    state.loadingPreview = false
    renderLivePanel()
    if (state.view === 'result') renderApp()
    syncAvanceButtons()
  }
}

export function selectMoneda(moneda) {
  state.data.moneda = moneda
  renderApp()
  scheduleCalculate()
}
