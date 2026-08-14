import { api, auth } from '../shared/api.js'
import { getRamos } from '../shared/catalogo.js'
import { enfocarPrimerElemento } from '../shared/dom.js'
import { logger } from '../shared/logger.js'
import { state, app } from './state.js'
import {
  RAMOS_CON_CALCULO,
  RAMOS_CON_CARTA_OFERTA,
  MOTIVO_BLOQUEO_ID,
  DEBOUNCE_MS,
} from './constants.js'
import {
  planEsCalculable,
  puedeAvanzarADetalle,
  datosMinimosCompletos,
  capitalAseguradoParaBody,
  descuentosParaBody,
  recargosParaBody,
  monedaEfectiva,
  franquiciaValorPorDefecto,
  coberturasPrincipalesFijasMrc,
} from './domain-rules.js'
import { armarRiesgoDatos, idLinea, prefillDatosDesdeCotizacion } from './body-builder.js'
import { ramoActivo, renderApp } from './render/render-shell.js'
import { renderLivePanel } from './render/render-cotizacion-vivo.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function mostrarBanner(tipo, texto) {
  state.banner = { tipo, texto }
  renderApp()
}

// Click en un tab/botón bloqueado (aria-disabled) — el guard real vive en events.js, que
// ahora llama esto en vez de ignorar el click en silencio. Sacude el control y resalta el
// motivo real, que ya vive en el panel "Cotización en vivo" (ver MOTIVO_BLOQUEO_ID) pero es
// fácil de pasar por alto porque queda fuera del tab que el agente está mirando.
export function feedbackAvanceBloqueado(target) {
  target.classList.remove('shake')
  void target.offsetWidth
  target.classList.add('shake')

  const motivo = document.getElementById(MOTIVO_BLOQUEO_ID)
  if (!motivo) return
  motivo.classList.remove('motivo-bloqueo--flash')
  void motivo.offsetWidth
  motivo.classList.add('motivo-bloqueo--flash')
  motivo.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
  state.loadingCoberturasCatalogo = true
  renderApp()
  try {
    state.coberturasCatalogo = await api.get(`/ramos/${ramoId}/coberturas-catalogo`)
  } catch (err) {
    logger.error('No se pudo cargar el catálogo de coberturas del ramo', err)
    mostrarBanner('error', 'No se pudo cargar el catálogo de coberturas del ramo.')
    state.coberturasCatalogo = []
  } finally {
    state.loadingCoberturasCatalogo = false
  }
  renderApp()
}

// Coberturas fijas del PLAN (plan_coberturas + coberturas_catalogo embebido), de donde salen
// los sublímites fijos por defecto (ver sublimitesFijosMrc()) — a diferencia del catálogo
// completo del ramo (cargarCoberturasCatalogo), esto sí varía por plan. Se recarga cada vez que
// el agente cambia de plan; un array vacío (plan sin filas en plan_coberturas todavía) no rompe
// el flujo — sublimitesFijosMrc() simplemente no devuelve filas.
export async function cargarPlanCoberturas(planId) {
  state.loadingPlanCoberturas = true
  renderApp()
  try {
    state.planCoberturas = await api.get(`/planes/${planId}/coberturas`)
  } catch (err) {
    logger.error('No se pudo cargar las coberturas fijas del plan', err)
    mostrarBanner('error', 'No se pudo cargar las coberturas fijas del plan.')
    state.planCoberturas = []
  } finally {
    state.loadingPlanCoberturas = false
  }
  renderApp()
}

// Agrega una línea vacía de "Coberturas adicionales" por cada Cobertura Principal que el plan
// trae marcada "Por defecto" (2026-08-10, ver coberturasPrincipalesFijasMrc()) — a diferencia
// de los sublímites fijos, estas no tienen un monto de plan: quedan precargadas en el
// formulario (tildadas en modo checkbox / con fila propia en el selector libre) para que el
// agente solo tenga que completar la suma asegurada, no buscarlas de nuevo en el catálogo.
// No pisa líneas que ya existan para ese código (evita duplicar si se llama más de una vez).
function preagregarCoberturasPrincipalesFijasMrc() {
  const codigosExistentes = new Set(state.coberturasAdicionales.map((l) => l.codigo))
  const nuevas = coberturasPrincipalesFijasMrc()
    .filter((c) => !codigosExistentes.has(c.codigo))
    .map((c) => ({ id: idLinea(), codigo: c.codigo, sumaAsegurada: '' }))
  if (nuevas.length) {
    state.coberturasAdicionales = [...state.coberturasAdicionales, ...nuevas]
    // Se marcan abiertas (sin monto todavía) pero SIN robar el foco (D6): esta precarga corre
    // sin intención directa del agente, a diferencia del toggle/select manual.
    for (const l of nuevas) state.coberturasAdicionalesEditando.add(l.id)
  }
}

// El botón "Ver detalle completo" y la pestaña "Detalle del plan" viven fuera del subárbol que
// renderLivePanel() actualiza — sin esto quedaban con el estado bloqueado del último render
// completo (ej. mientras el capital todavía era insuficiente) y nunca se desbloqueaban al llegar
// a un cálculo válido. Se actualizan acá directo sobre el DOM en vez de un renderApp() completo,
// para no perder el foco/cursor de los inputs mientras el agente sigue tipeando.
//
// No se usa el atributo `disabled` nativo (solo `aria-disabled`, ver aplicarAriaBloqueo) —
// `disabled` saca el elemento del orden de tabulación, y con la lista de checkboxes de
// "Coberturas adicionales" (coberturas-adicionales-redesign) justo antes de este botón, tabular
// hasta acá con el formulario incompleto se quedaba sin nada enfocable, el foco caía a <body> y
// el siguiente Tab terminaba en el botón hamburguesa del sidebar en pantallas ≤1024px, abriendo
// el cajón encima del formulario. El guard real que impide la acción con `aria-disabled="true"`
// está en el click handler de events.js.
export function syncAvanceButtons() {
  const habilitado = puedeAvanzarADetalle()
  const title = habilitado
    ? ''
    : 'Corregí el capital declarado antes de avanzar — ver el mensaje de alerta'

  const boton = document.getElementById('btn-ver-detalle')
  if (boton) {
    boton.title = title
    aplicarAriaBloqueo(boton, habilitado)
  }

  const tab = document.getElementById('tab-detalle-plan')
  if (tab) {
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

// A coverage amount is persisted on every keystroke so the live preview stays current. These
// maps preserve the value at the start of an explicit edit session and defer blur acceptance
// until the click that moved focus has finished against the current DOM.
const montosInicialesEdicion = new Map()
const cierresEdicionMontoPendientes = new Map()

function montoCoberturaValido(linea) {
  return Number(linea?.sumaAsegurada) > 0
}

function limpiarSesionEdicionMonto(id) {
  montosInicialesEdicion.delete(id)
  const cierrePendiente = cierresEdicionMontoPendientes.get(id)
  if (cierrePendiente !== undefined) clearTimeout(cierrePendiente)
  cierresEdicionMontoPendientes.delete(id)
}

function limpiarSesionesEdicionMonto() {
  for (const cierrePendiente of cierresEdicionMontoPendientes.values()) {
    clearTimeout(cierrePendiente)
  }
  cierresEdicionMontoPendientes.clear()
  montosInicialesEdicion.clear()
}

function focoActual() {
  const elemento = document.activeElement
  const monto = elemento?.closest?.('[data-linea-id][data-linea-field="sumaAsegurada"]')
  return {
    id: elemento?.id || null,
    lineaMontoId: monto?.dataset.lineaId || null,
  }
}

function restaurarFocoTrasRender(foco) {
  if (foco.lineaMontoId) {
    focusMontoCobertura(foco.lineaMontoId)
    return
  }
  if (foco.id) document.getElementById(foco.id)?.focus({ preventScroll: true })
}

export function addCoberturaLinea() {
  state.coberturasAdicionales.push({ id: idLinea(), codigo: '', sumaAsegurada: '' })
  renderApp() // fila nueva: hace falta re-render completo
}

export function removeCoberturaLinea(id) {
  state.coberturasAdicionales = state.coberturasAdicionales.filter((l) => l.id !== id)
  state.coberturasAdicionalesEditando.delete(id)
  limpiarSesionEdicionMonto(id)
  renderApp()
  scheduleCalculate()
}

// Modo checkbox de "Coberturas adicionales" (roles sin puede_agregar_cobertura_libre, ver
// CODIGOS_COBERTURA_EXCLUIDOS_BASE/renderCoberturasAdicionalesCheckbox, Ajuste MC.xlsx ítem #6,
// 2026-08-05): cada código mapea a lo sumo una línea (sin la repetición x2 de robo_contenido
// que sí permite el flujo libre — simplificación a propósito para este modo restringido).
export function toggleCoberturaAdicionalPorCodigo(codigo, marcado) {
  if (marcado) {
    let linea = state.coberturasAdicionales.find((l) => l.codigo === codigo)
    if (!linea) {
      linea = { id: idLinea(), codigo, sumaAsegurada: '' }
      state.coberturasAdicionales.push(linea)
    }
    // Auto-apertura del modo edición (coberturas-adicionales-redesign, D6): al tildar una
    // cobertura sin monto cargado todavía, se abre directo el input en vez de dejar el "—"
    // bloqueado detrás del lápiz — evita un click extra en el caso más común (fila recién
    // agregada).
    if (!linea.sumaAsegurada) state.coberturasAdicionalesEditando.add(linea.id)
    renderApp()
    scheduleCalculate()
    if (!linea.sumaAsegurada) focusMontoCobertura(linea.id)
    return
  }

  for (const l of state.coberturasAdicionales) {
    if (l.codigo === codigo) {
      state.coberturasAdicionalesEditando.delete(l.id)
      limpiarSesionEdicionMonto(l.id)
    }
  }
  state.coberturasAdicionales = state.coberturasAdicionales.filter((l) => l.codigo !== codigo)
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
    // Auto-apertura del modo edición (D6, mismo criterio que toggleCoberturaAdicionalPorCodigo):
    // al elegir una cobertura en el selector libre sin monto cargado todavía, se abre el input.
    // Al vaciar el <select> ("Seleccioná una cobertura…") se cierra: no tiene sentido editar el
    // monto de una línea sin cobertura elegida (queda bloqueada con el candado).
    if (value && !linea.sumaAsegurada) state.coberturasAdicionalesEditando.add(id)
    else if (!value) state.coberturasAdicionalesEditando.delete(id)
    renderApp()
    if (value) focusMontoCobertura(id)
  }
  scheduleCalculate()
}

// Insured-sum editing mode for an additional-coverage line.
export function habilitarEdicionMontoCobertura(id) {
  const linea = state.coberturasAdicionales.find((l) => l.id === id)
  if (!linea) return
  if (!state.coberturasAdicionalesEditando.has(id)) {
    montosInicialesEdicion.set(id, linea.sumaAsegurada)
  }
  state.coberturasAdicionalesEditando.add(id)
  renderApp()
  focusMontoCobertura(id)
}

export function aceptarEdicionMontoCobertura(id) {
  const linea = state.coberturasAdicionales.find((l) => l.id === id)
  if (!montoCoberturaValido(linea)) return false
  const foco = focoActual()
  state.coberturasAdicionalesEditando.delete(id)
  limpiarSesionEdicionMonto(id)
  renderApp()
  restaurarFocoTrasRender(foco)
  return true
}

export function cancelarEdicionMontoCobertura(id) {
  const linea = state.coberturasAdicionales.find((l) => l.id === id)
  if (!linea) return false

  linea.sumaAsegurada = montosInicialesEdicion.get(id) ?? ''
  if (!montoCoberturaValido(linea)) {
    renderApp()
    focusMontoCobertura(id)
    scheduleCalculate()
    return false
  }

  state.coberturasAdicionalesEditando.delete(id)
  limpiarSesionEdicionMonto(id)
  renderApp()
  scheduleCalculate()
  return true
}

export function diferirAceptacionMontoCobertura(id) {
  const cierrePendiente = cierresEdicionMontoPendientes.get(id)
  if (cierrePendiente !== undefined) clearTimeout(cierrePendiente)

  const cierreDiferido = setTimeout(() => {
    cierresEdicionMontoPendientes.delete(id)
    const input = document.getElementById(`cobertura-linea-${id}-suma`)
    if (input === document.activeElement) return
    aceptarEdicionMontoCobertura(id)
  }, 0)
  cierresEdicionMontoPendientes.set(id, cierreDiferido)
}

// Enfoca el input de "Suma asegurada" de la línea `id` y deja el cursor al final del valor ya
// cargado — llamado después de renderApp() porque el nodo se recrea en cada render completo.
// No se llama desde preagregarCoberturasPrincipalesFijasMrc() (ver D6): esa precarga corre sin
// intención directa del agente, robarle el foco lo sacaría del selector de plan.
export function focusMontoCobertura(id) {
  const input = document.getElementById(`cobertura-linea-${id}-suma`)
  if (!input) return
  input.focus({ preventScroll: true })
  const len = input.value.length
  input.setSelectionRange(len, len)
}

// Token de secuencia: cada llamada a calcularPreview() lo incrementa y guarda el suyo. Si al
// resolver el fetch el token global ya avanzó, significa que hubo una llamada más nueva (el
// agente siguió tecleando) — se descarta la respuesta vieja en vez de dejarla pisar el preview
// más reciente (A3, issue #87: respuestas de red pueden llegar fuera de orden).
let previewRequestId = 0

export async function calcularPreview() {
  const requestId = ++previewRequestId

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
    if (requestId !== previewRequestId) return // hubo una llamada más nueva, descartar esta

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
    if (requestId === previewRequestId) {
      state.preview = null
      state.previewError = err.message || 'No se pudo calcular la cotización.'
    }
  } finally {
    if (requestId === previewRequestId) {
      state.loadingPreview = false
      renderLivePanel()
      if (state.view === 'result') renderApp()
      syncAvanceButtons()
    }
  }
}

export function selectMoneda(moneda) {
  state.data.moneda = moneda
  renderApp()
  scheduleCalculate()
}

// ---------------------------------------------------------------------------
// Ramo / plan / emisión de Carta Oferta
// ---------------------------------------------------------------------------

export async function selectRamo(nombre) {
  // Salir del modo edición al cambiar de ramo manualmente: el backend rechaza un PUT que cambie
  // el ramo de una cotización existente (actualizarCotizacion, cotizacion.service.js), así que
  // sin este reset el agente llenaría todo el formulario de otro ramo para recién enterarse del
  // 422 al guardar — detectado en review-readability/risk de la feature de edición.
  state.editandoId = null
  state.ramoId = nombre
  state.view = 'form'
  state.planBloqueado = false
  state.sidebarAbierta = false
  state.data = {}
  state.planId = null
  state.planes = []
  state.franquiciasPorCobertura = {}
  state.rubros = []
  state.coberturasCatalogo = []
  state.planCoberturas = []
  state.coberturasAdicionales = []
  state.coberturasAdicionalesEditando.clear()
  limpiarSesionesEdicionMonto()
  state.preview = null
  state.previewError = null
  state.formaPagoCodigo = null

  const ramo = ramoActivo(nombre)
  if (!ramo) {
    renderApp()
    return
  }

  // El reset de arriba y este skeleton de planes van en el MISMO render (nada async entre
  // medio) — separarlos en dos renderApp() consecutivos solo agrega un flash de pantalla
  // completa sin ningún cambio visible entre uno y otro (bug reportado por Kevin: "al iniciar
  // el cotizador hace como 3 refresh continuos", 2026-08-14).
  state.loadingPlanes = true
  renderApp()
  try {
    state.planes = await api.get(`/ramos/${ramo.id}/planes`)
  } catch (err) {
    logger.error('No se pudieron cargar los planes del ramo', err)
    mostrarBanner('error', 'No se pudieron cargar los planes del ramo.')
    state.planes = []
  } finally {
    state.loadingPlanes = false
  }

  if (RAMOS_CON_CALCULO.includes(nombre)) {
    // Preselecciona el primer plan calculable hoy (RPF/tasas confirmados).
    const planCalculable = state.planes.find((p) => planEsCalculable(nombre, p))
    state.planId = planCalculable ? planCalculable.id : (state.planes[0]?.id ?? null)
    state.data.cuotas = planCalculable?.cuotas_default ?? null
    state.data.descuentoPorcentaje = planCalculable?.descuento_default ?? null

    if (nombre === 'mrc' || nombre === 'incendio') {
      // Mismo motivo que arriba: "planes cargados" y "skeleton de rubros" van juntos en un
      // solo render — nada async entre medio.
      state.loadingRubros = true
      renderApp()
      try {
        // Cambio "incendio-tasas-por-rubro": filtrado por ramo (rubro_actividad_ramo).
        // Incendio solo usa esta lista para el plan "Edificio y Contenido" (Maquinaria
        // Básico no); un rubro multi-ramo (ej. "CHANCHERIAS") aparece en ambos selectores.
        state.rubros = await api.get(`/ramos/rubros-actividad?ramo_id=${ramo.id}`)
      } catch (err) {
        logger.error('No se pudieron cargar los tipos de riesgo', err)
        mostrarBanner('error', 'No se pudieron cargar los tipos de riesgo.')
        state.rubros = []
      } finally {
        state.loadingRubros = false
      }
      // Sin renderApp() acá: el bloque MRC de abajo (cargarCoberturasCatalogo) ya renderiza al
      // arrancar, y el resto de los ramos cae directo al renderApp() final de la función — nada
      // queda sin pintar.
    }

    if (nombre === 'mrc') {
      // El catálogo de coberturas es por RAMO, no por plan (mismas coberturas disponibles
      // para "Normal" y "Protección Total") — se carga una sola vez acá. Solo MRC usa
      // "Coberturas adicionales" en esta pasada.
      await cargarCoberturasCatalogo(ramo.id)
      if (state.planId) {
        await cargarPlanCoberturas(state.planId)
        preagregarCoberturasPrincipalesFijasMrc()
      }
    }
  } else {
    state.planId = state.planes[0]?.id ?? null
  }

  renderApp()
}

export function selectPlan(planId) {
  if (state.planBloqueado) return // ya se pasó a "Detalle del plan": el plan queda fijo
  const plan = state.planes.find((p) => p.id === planId)
  if (!plan || !planEsCalculable(state.ramoId, plan)) return // plan sin RPF/tasas confirmadas: bloqueado
  state.planId = planId
  state.data.cuotas = plan.cuotas_default ?? null
  state.data.descuentoPorcentaje = plan.descuento_default ?? null
  state.coberturasAdicionales = []
  state.coberturasAdicionalesEditando.clear()
  limpiarSesionesEdicionMonto()
  renderApp()
  scheduleCalculate()
  if (state.ramoId === 'mrc') {
    cargarPlanCoberturas(planId).then(() => {
      preagregarCoberturasPrincipalesFijasMrc()
      renderApp()
    })
  }
}

// Elemento con foco al abrir el modal de progreso de emisión — se le devuelve el foco al cerrar
// (mismo patrón que elementoDisparadorModal en historial.js).
let elementoDisparadorModalCarta = null

// Guarda la cotización (POST /cotizaciones, si es la primera vez que se emite carta para esta
// pasada por el formulario) y descarga el PDF de la Carta Oferta. Reutiliza exactamente el mismo
// body que calcularPreview — el backend valida y calcula de nuevo antes de persistir.
export async function emitirCartaOferta() {
  if (state.emitiendoCarta || !state.preview) return

  const ramoEmision = ramoActivo(state.ramoId)
  if (!RAMOS_CON_CARTA_OFERTA.includes(ramoEmision?.calculador)) {
    mostrarBanner(
      'error',
      `La Carta Oferta de ${ramoEmision?.nombre_display ?? state.ramoId} todavía no está disponible.`
    )
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

  state.emitiendoCarta = true
  state.progresoCarta = { paso: 0, estado: 'activo' }
  elementoDisparadorModalCarta = document.activeElement
  renderApp()
  enfocarPrimerElemento(app.querySelector('.progreso-carta-modal'))

  try {
    state.progresoCarta = { paso: 1, estado: 'activo' }
    renderApp()
    const cotizacion = state.editandoId
      ? await api.put(`/cotizaciones/${state.editandoId}`, body)
      : await api.post('/cotizaciones', body)

    state.progresoCarta = { paso: 2, estado: 'activo' }
    renderApp()
    const blob = await api.getBlob(`/cotizaciones/${cotizacion.id}/pdf-oferta`)

    // No se abre la pestaña sola acá: el modal queda visible durante todo el proceso y el
    // usuario la abre a mano con el botón "Ver PDF" del estado de éxito — un click real,
    // así que el navegador nunca lo bloquea como pop-up (a diferencia de abrirla después de
    // un await, sin gesto del usuario en el mismo tick).
    state.progresoCarta = { paso: 3, estado: 'exito', pdfUrl: URL.createObjectURL(blob) }
  } catch (err) {
    state.progresoCarta = {
      ...state.progresoCarta,
      estado: 'error',
      error: err.message || 'No se pudo generar la Carta Oferta.',
    }
    mostrarBanner('error', err.message || 'No se pudo generar la Carta Oferta.')
  } finally {
    state.emitiendoCarta = false
    renderApp()
    // El bloque de resultado (éxito/error) recién aparece en este render — se enfoca su
    // primer control (Ver PDF/Cerrar/Reintentar) para que el flujo por teclado no quede varado.
    enfocarPrimerElemento(app.querySelector('.progreso-carta-modal'))
  }
}

// Cierra el modal de progreso — solo llamable desde los estados terminales ('exito'/'error'),
// nunca mientras está 'activo' (ver renderModalProgresoCarta/onKeydown).
export function cerrarModalProgresoCarta() {
  if (state.progresoCarta?.estado === 'activo') return
  if (state.progresoCarta?.pdfUrl) URL.revokeObjectURL(state.progresoCarta.pdfUrl)
  state.progresoCarta = null
  renderApp()
  if (elementoDisparadorModalCarta) {
    elementoDisparadorModalCarta.focus()
    elementoDisparadorModalCarta = null
  }
}

// ---------------------------------------------------------------------------
// Arranque de la app / edición de una cotización existente
// ---------------------------------------------------------------------------

export async function init() {
  // Cambio session-httponly-cookie: ya no hay token en localStorage para chequear de
  // forma síncrona — hay que esperar auth.cargarSesion() (GET /auth/me) antes del gate.
  // Se cachea en memoria (shared/api.js), así que renderAjusteField() más abajo (que lee
  // auth.getUsuario() de forma síncrona durante el render) ya la encuentra resuelta.
  const usuario = await auth.cargarSesion()
  if (!usuario) {
    window.location.href = '../login/'
    return
  }
  state.loadingRamos = true
  renderApp()
  try {
    state.ramosActivos = await getRamos()
  } catch (err) {
    logger.error('No se pudo cargar la lista de ramos', err)
    mostrarBanner('error', 'No se pudo cargar la lista de ramos.')
    state.ramosActivos = []
  } finally {
    state.loadingRamos = false
  }

  // Sin renderApp() acá entre el fetch de ramos y lo que sigue: las tres ramas de abajo ya
  // garantizan su propio render mostrando "ramos cargados" combinado con su siguiente estado
  // (skeleton de planes, o directamente el resultado final) — un render intermedio acá solo
  // repetía el mismo frame dos veces seguidas sin ningún cambio visible entre uno y otro (bug
  // reportado por Kevin: "al iniciar el cotizador hace como 3 refresh continuos", 2026-08-14).
  const params = new URLSearchParams(location.search)
  const editarId = params.get('editar')
  if (editarId) {
    await cargarParaEditar(Number(editarId))
    // cargarParaEditar() no garantiza un render final propio (ver su comentario) — hace falta
    // acá para que la cotización precargada quede pintada.
    renderApp()
    return
  }

  const ramoParam = params.get('ramo')
  if (ramoParam) {
    await selectRamo(ramoParam) // ya renderiza su propio estado final
    return
  }

  renderApp() // ramos cargados, sin ?ramo/?editar en la URL
}

// ---------------------------------------------------------------------------
// Edición de una cotización existente (?editar=<id> en la URL, ver historial.js) — ventana de
// 30 días validada en el backend (cotizacion.service.js actualizarCotizacion). Reconstruye
// state.ramoId/planId/data/coberturasAdicionales/franquiciasPorCobertura a partir del detalle
// ya guardado y dispara un cálculo inmediato (no debounced) para que la prima aparezca sin
// esperar el timer de scheduleCalculate.
// ---------------------------------------------------------------------------

export async function cargarParaEditar(id) {
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

  state.loadingPlanes = true
  renderApp()
  try {
    state.planes = await api.get(`/ramos/${ramo.id}/planes`)
  } catch (err) {
    logger.error('No se pudieron cargar los planes del ramo', err)
    mostrarBanner('error', 'No se pudieron cargar los planes del ramo.')
    state.planes = []
  } finally {
    state.loadingPlanes = false
  }
  state.planId = cotizacion.plan_id

  if (ramo.nombre === 'mrc' || ramo.nombre === 'incendio') {
    // "planes cargados" y "skeleton de rubros" van en el MISMO render (nada async entre medio)
    // — separarlos solo agrega un flash de pantalla completa sin cambio visible (bug reportado
    // por Kevin: "al iniciar el cotizador hace como 3 refresh continuos", 2026-08-14).
    state.loadingRubros = true
    renderApp()
    try {
      // Cambio "incendio-tasas-por-rubro": el catálogo ahora se filtra por ramo
      // (rubro_actividad_ramo) — cada ramo trae solo sus propios rubros, ya no la
      // lista compartida sin filtrar entre MRC/Incendio/TRO.
      state.rubros = await api.get(`/ramos/rubros-actividad?ramo_id=${ramo.id}`)
    } catch (err) {
      logger.error('No se pudieron cargar los tipos de riesgo', err)
      mostrarBanner('error', 'No se pudieron cargar los tipos de riesgo.')
      state.rubros = []
    } finally {
      state.loadingRubros = false
    }
    // Este renderApp() sí hace falta: a diferencia de selectRamo(), acá nada más garantiza
    // pintar el estado final antes de prefillDatosDesdeCotizacion (calcularPreview() más abajo
    // solo re-renderiza completo si state.view === 'result', que no es el caso en este flujo).
    renderApp()
  } else {
    renderApp() // planes cargados, sin bloque de rubros después — hace falta pintarlo acá
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
