import { api, auth } from '../shared/api.js'
import { getRamos } from '../shared/catalogo.js'
import {
  ICON_INFO,
  ICON_SUBLIMITE_GENERICO,
  ICON_ARROW_LEFT as ICON_ARROW_LEFT_ROUND,
} from '../shared/nav-icons.js'
import { atraparFoco, enfocarPrimerElemento, escapeHtml, renderBanner } from '../shared/dom.js'
import { renderSidebarFooter, renderTopbar as renderTopbarShell } from '../shared/sidebar.js'
import { fmtGs, fmtGsInput, fmtMonto, unidadMoneda } from '../shared/format.js'
import { logger } from '../shared/logger.js'
import { state, app } from './state.js'
import {
  RAMOS_UI,
  RAMO_ICONOS,
  RAMOS_CON_CALCULO,
  CLIENT_FIELDS,
  CIUDADES,
  FRANQUICIA_OPCIONES,
  RAMOS_CON_AJUSTES,
  OBJETOS_RIESGO_CAMPOS,
  MOTIVO_BLOQUEO_ID,
  DEBOUNCE_MS,
  CODIGOS_COBERTURA_EXCLUIDOS_BASE,
  LIMITE_REPETICION_COBERTURA_MRC,
  LIMITE_REPETICION_COBERTURA_MRC_DEFAULT,
  SUBLIMITE_ICONOS,
  ICON_TAG,
  PASOS_EMISION_CARTA,
  ICON_PLUS,
  COTIZADOR_VERSION,
} from './constants.js'
import {
  planEsCalculable,
  franquiciaValorPorDefecto,
  franquiciasPorCoberturaParaBody,
  monedaEfectiva,
  monedaCotizacionActual,
  sugerenciaInspeccion,
  descuentosParaBody,
  recargosParaBody,
  sublimitesFijosMrc,
  datosMinimosCompletos,
  capitalAseguradoParaBody,
  formasPagoDisponibles,
  formaPagoSeleccionada,
  puedeAvanzarADetalle,
  capitalTotalAsegurado,
} from './domain-rules.js'

// Cotizador Tajy — App Shell + Datos + Resultado (Fase 6, alcance MRC plan Normal).
// Recreación en Vanilla JS del handoff de diseño original (mockup ya migrado y eliminado
// tras la implementación de "Diseño 2" en frontend/cotizar).

function selectMoneda(moneda) {
  state.data.moneda = moneda
  renderApp()
  scheduleCalculate()
}

let debounceTimer = null
// Elemento con foco al abrir el modal de progreso de emisión — se le devuelve el foco al cerrar
// (mismo patrón que elementoDisparadorModal en historial.js).
let elementoDisparadorModalCarta = null

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

// Traduce `cotizacion.riesgo_datos` (shape guardado por cada calculador — ver
// armarRiesgoDatos()) de vuelta a los campos de state.data que usa el formulario.
function prefillDatosDesdeCotizacion(ramoNombre, plan, cotizacion) {
  const rd = cotizacion.riesgo_datos || {}
  state.data.clienteNombre = cotizacion.cliente_nombre || ''
  // `moneda` es una columna de cabecera de `cotizaciones` (no vive en `riesgo_datos`) — se
  // restaura acá para cualquier ramo, aunque hoy solo Incendio (Maquinaria/objeto_riesgo) la usa
  // para algo distinto de PYG por defecto (ver monedaEfectiva()).
  state.data.moneda = cotizacion.moneda || 'PYG'

  if (ramoNombre === 'mrc') {
    state.data.cedula = rd.cedula || ''
    state.data.direccion = rd.direccion || ''
    state.data.rubroActividad = rd.rubro_actividad || ''
    state.data.ciudad = rd.ciudad || ''
    state.data.capitalEdificio = rd.capital_edificio || ''
    state.data.capitalContenido = rd.capital_contenido || ''

    // Los sublímites fijos del plan y el de Ventanilla (ver sublimitesFijosMrc()) ya se
    // re-agregan solos en armarRiesgoDatos() — no deben duplicarse acá como línea editable de
    // "Coberturas adicionales". sublimitesFijosMrc() todavía no puede calcular Ventanilla acá
    // (depende de state.coberturasAdicionales, que recién se llena en esta misma asignación) —
    // se usa CODIGOS_COBERTURA_EXCLUIDOS_BASE para cubrir ese caso sin depender del orden.
    const codigosFijos = new Set([
      ...CODIGOS_COBERTURA_EXCLUIDOS_BASE,
      ...sublimitesFijosMrc().map((s) => s.codigo),
    ])
    state.coberturasAdicionales = (rd.coberturas_adicionales || [])
      .filter((c) => c.codigo && !codigosFijos.has(c.codigo))
      .map((c) => ({ id: idLinea(), codigo: c.codigo, sumaAsegurada: c.suma_asegurada }))

    for (const [codigo, monto] of Object.entries(rd.franquicias_por_cobertura || {})) {
      state.franquiciasPorCobertura[codigo] = franquiciaValorPorDefecto(monto)
    }
  } else if (ramoNombre === 'incendio') {
    if (plan?.nombre === 'MAQUINARIA BASICO') {
      state.data.capitalMaquinaria = rd.capital_maquinaria || ''
      if (rd.sublimite_vandalismo_porcentaje != null) {
        state.data.sublimiteVandalismoPorcentaje = rd.sublimite_vandalismo_porcentaje
      }
    } else if (plan?.tipo_mecanica === 'objeto_riesgo') {
      state.data.rubroActividad = rd.rubro_actividad || ''
      for (const { stateKey, riesgoKey } of OBJETOS_RIESGO_CAMPOS) {
        state.data[stateKey] = rd[riesgoKey] || ''
      }
    } else {
      state.data.rubroActividad = rd.rubro_actividad || ''
      state.data.capitalEdificio = rd.capital_edificio || ''
      state.data.capitalContenido = rd.capital_contenido || ''
      if (rd.sublimite_fenomenos_naturales_porcentaje != null) {
        state.data.sublimiteFenomenosNaturalesPorcentaje =
          rd.sublimite_fenomenos_naturales_porcentaje
      }
    }
  } else if (ramoNombre === 'vida-ap') {
    state.data.capitalAsegurado = rd.capital_asegurado || ''
    if (rd.edad != null) state.data.edad = rd.edad
    if (rd.incluye_renta_diaria) {
      state.data.incluyeRentaDiaria = true
      state.data.sumaRentaDiaria = rd.suma_renta_diaria || ''
    }
  }

  // Descuento/recargo manual — se prefillea con el monto YA topado que quedó guardado
  // (cotizacion_ajustes), no con el % crudo que haya tipeado el agente en su momento (ese dato
  // no se persiste por separado, ver comentario de insertAjustes en cotizaciones.repository.js).
  if (RAMOS_CON_AJUSTES.includes(ramoNombre)) {
    const variante = cotizacion.cotizacion_variantes?.[0]
    const ajustes = variante?.cotizacion_ajustes || []
    const descuento = ajustes.find((a) => a.tipo === 'descuento')
    const recargo = ajustes.find((a) => a.tipo === 'recargo')
    if (descuento) state.data.descuentoMonto = descuento.monto
    if (recargo) state.data.recargoMonto = recargo.monto
  }

  const cuotas = cotizacion.cotizacion_variantes?.[0]?.cotizacion_plan_pago?.[0]?.cantidad_cuotas
  if (cuotas != null) state.data.cuotas = cuotas
}

async function cerrarSesion() {
  await auth.logout()
  window.location.href = '../login/'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mostrarBanner(tipo, texto) {
  state.banner = { tipo, texto }
  renderApp()
}

// El estado 'disponible'/'proximamente' de un ramo ya no es un valor fijo de RAMOS_UI: se
// deriva del flag `activo` de la tabla `ramos` (togglable desde el panel admin, sección
// Ramos, solo rol admin). RAMOS_UI ahora solo aporta metadata de UI (code/label/estado
// original, usado como fallback si `/ramos` no cargó — ver init()).
function ramoInfo(nombre) {
  const base = RAMOS_UI.find((r) => r.nombre === nombre)
  if (!base) return null
  const estado = ramoActivo(nombre) ? 'disponible' : 'proximamente'
  return { ...base, estado }
}

function ramoActivo(nombre) {
  return state.ramosActivos.find((r) => r.nombre === nombre) || null
}

// ---------------------------------------------------------------------------
// Acciones de estado
// ---------------------------------------------------------------------------

async function selectRamo(nombre) {
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
  state.preview = null
  state.previewError = null
  state.formaPagoCodigo = null
  renderApp()

  const ramo = ramoActivo(nombre)
  if (!ramo) return

  try {
    state.planes = await api.get(`/ramos/${ramo.id}/planes`)
  } catch (err) {
    logger.error('No se pudieron cargar los planes del ramo', err)
    state.planes = []
  }

  if (RAMOS_CON_CALCULO.includes(nombre)) {
    // Preselecciona el primer plan calculable hoy (RPF/tasas confirmados).
    const planCalculable = state.planes.find((p) => planEsCalculable(nombre, p))
    state.planId = planCalculable ? planCalculable.id : (state.planes[0]?.id ?? null)
    state.data.cuotas = planCalculable?.cuotas_default ?? null
    state.data.descuentoPorcentaje = planCalculable?.descuento_default ?? null

    if (nombre === 'mrc' || nombre === 'incendio') {
      try {
        // Cambio "incendio-tasas-por-rubro": filtrado por ramo (rubro_actividad_ramo).
        // Incendio solo usa esta lista para el plan "Edificio y Contenido" (Maquinaria
        // Básico no); un rubro multi-ramo (ej. "CHANCHERIAS") aparece en ambos selectores.
        state.rubros = await api.get(`/ramos/rubros-actividad?ramo_id=${ramo.id}`)
      } catch (err) {
        logger.error('No se pudieron cargar los tipos de riesgo', err)
        state.rubros = []
      }
    }

    if (nombre === 'mrc') {
      // El catálogo de coberturas es por RAMO, no por plan (mismas coberturas disponibles
      // para "Normal" y "Protección Total") — se carga una sola vez acá. Solo MRC usa
      // "Coberturas adicionales" en esta pasada.
      await cargarCoberturasCatalogo(ramo.id)
      if (state.planId) await cargarPlanCoberturas(state.planId)
    }
  } else {
    state.planId = state.planes[0]?.id ?? null
  }

  renderApp()
}

function selectPlan(planId) {
  if (state.planBloqueado) return // ya se pasó a "Detalle del plan": el plan queda fijo
  const plan = state.planes.find((p) => p.id === planId)
  if (!plan || !planEsCalculable(state.ramoId, plan)) return // plan sin RPF/tasas confirmadas: bloqueado
  state.planId = planId
  state.data.cuotas = plan.cuotas_default ?? null
  state.data.descuentoPorcentaje = plan.descuento_default ?? null
  state.coberturasAdicionales = []
  renderApp()
  scheduleCalculate()
  if (state.ramoId === 'mrc') {
    cargarPlanCoberturas(planId).then(renderApp)
  }
}

// Catálogo COMPLETO de coberturas del ramo (coberturas_catalogo vía GET /ramos/:id/coberturas-catalogo)
// — a diferencia de GET /planes/:id/coberturas (plan_coberturas), que en MRC solo trae los
// sublímites por defecto, no las coberturas principales (Robo contenido, Cristales, etc.).
// Se usa para poblar el selector de "Coberturas adicionales" con nombre + categoría.
async function cargarCoberturasCatalogo(ramoId) {
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
async function cargarPlanCoberturas(planId) {
  try {
    state.planCoberturas = await api.get(`/planes/${planId}/coberturas`)
  } catch (err) {
    logger.error('No se pudo cargar las coberturas fijas del plan', err)
    state.planCoberturas = []
  }
}

// Opciones seleccionables en "Coberturas adicionales": el catálogo del ramo sin las 2 fijas
// (tienen su propio campo), sin sublimite_cctv (sin tasa cargada todavía — no cotizable), y sin
// los sublímites fijos por defecto del plan actual (ver sublimitesFijosMrc()).
function coberturasDisponibles() {
  const excluidos = [
    ...CODIGOS_COBERTURA_EXCLUIDOS_BASE,
    ...sublimitesFijosMrc().map((s) => s.codigo),
  ]
  return state.coberturasCatalogo.filter((c) => !excluidos.includes(c.codigo))
}

function selectFormaPago(codigo) {
  state.formaPagoCodigo = codigo
  renderLivePanel()
  if (state.view === 'result') renderApp()
}

function selectFranquicia(codigoCobertura, valor) {
  state.franquiciasPorCobertura[codigoCobertura] = valor
}

function setView(view) {
  state.view = view
  if (view === 'result') state.planBloqueado = true
  renderApp()
}

function updateField(key, value) {
  state.data[key] = value
  if (RAMOS_CON_CALCULO.includes(state.ramoId)) {
    scheduleCalculate()
  }
}

function scheduleCalculate() {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(calcularPreview, DEBOUNCE_MS)
}

// ---------------------------------------------------------------------------
// Coberturas adicionales: líneas cobertura/sublímite más allá de Incendio Edificio/Contenido.
// ---------------------------------------------------------------------------

// crypto.randomUUID() exige contexto seguro (HTTPS o localhost) — cae acá
// si se accede por HTTP a una IP directa. Solo hace falta un id único de fila.
function idLinea() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `linea-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function addCoberturaLinea() {
  state.coberturasAdicionales.push({ id: idLinea(), codigo: '', sumaAsegurada: '' })
  renderApp() // fila nueva: hace falta re-render completo
}

function removeCoberturaLinea(id) {
  state.coberturasAdicionales = state.coberturasAdicionales.filter((l) => l.id !== id)
  renderApp()
  scheduleCalculate()
}

// Modo checkbox de "Coberturas adicionales" (roles sin puede_agregar_cobertura_libre, ver
// CODIGOS_COBERTURA_EXCLUIDOS_BASE/renderCoberturasAdicionalesCheckbox, Ajuste MC.xlsx ítem #6,
// 2026-08-05): cada código mapea a lo sumo una línea (sin la repetición x2 de robo_contenido
// que sí permite el flujo libre — simplificación a propósito para este modo restringido).
function toggleCoberturaAdicionalPorCodigo(codigo, marcado) {
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

function updateCoberturaLinea(id, field, value) {
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

function armarRiesgoDatosMrc(plan) {
  const d = state.data
  return {
    cedula: d.cedula || '',
    direccion: d.direccion || '',
    rubro_actividad: d.rubroActividad || '',
    ciudad: d.ciudad || '',
    capital_edificio: Number(d.capitalEdificio) || 0,
    capital_contenido: Number(d.capitalContenido) || 0,
    coberturas_adicionales: [
      ...sublimitesFijosMrc().map((s) => ({ codigo: s.codigo, suma_asegurada: s.monto })),
      ...state.coberturasAdicionales
        .filter((l) => l.codigo && Number(l.sumaAsegurada) > 0)
        .map((l) => ({ codigo: l.codigo, suma_asegurada: Number(l.sumaAsegurada) })),
    ],
    franquicias_por_cobertura: franquiciasPorCoberturaParaBody(),
  }
}

function armarRiesgoDatosIncendio(plan) {
  const d = state.data
  if (plan.nombre === 'MAQUINARIA BASICO') {
    return {
      capital_maquinaria: Number(d.capitalMaquinaria) || 0,
      ...(d.sublimiteVandalismoPorcentaje !== undefined && d.sublimiteVandalismoPorcentaje !== ''
        ? { sublimite_vandalismo_porcentaje: Number(d.sublimiteVandalismoPorcentaje) }
        : {}),
    }
  }
  if (plan.tipo_mecanica === 'objeto_riesgo') {
    // Los 4 objetos de riesgo son opcionales (ver incendio-planes-objeto-riesgo#Optional risk
    // objects) — se manda el número declarado (0 si no se cargó), el backend solo suma los
    // que tengan capital > 0 (ver calcularPorObjetoRiesgo en incendio.calculator.js).
    const objetosDeclarados = {}
    for (const { stateKey, riesgoKey } of OBJETOS_RIESGO_CAMPOS) {
      objetosDeclarados[riesgoKey] = Number(d[stateKey]) || 0
    }
    return {
      rubro_actividad: d.rubroActividad || '',
      ...objetosDeclarados,
    }
  }
  return {
    rubro_actividad: d.rubroActividad || '',
    capital_edificio: Number(d.capitalEdificio) || 0,
    capital_contenido: Number(d.capitalContenido) || 0,
    ...(d.sublimiteFenomenosNaturalesPorcentaje !== undefined &&
    d.sublimiteFenomenosNaturalesPorcentaje !== ''
      ? {
          sublimite_fenomenos_naturales_porcentaje: Number(d.sublimiteFenomenosNaturalesPorcentaje),
        }
      : {}),
  }
}

function armarRiesgoDatosVidaAp(plan) {
  const d = state.data
  const base = { capital_asegurado: Number(d.capitalAsegurado) || 0 }
  if (plan.nombre === 'PROTECCION FAMILIAR') return base

  base.edad = Number(d.edad) || null
  if (
    plan.nombre === 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO' ||
    plan.nombre === 'ACCIDENTES PERSONALES - SECTOR PRIVADO'
  ) {
    if (d.incluyeRentaDiaria) {
      base.incluye_renta_diaria = true
      base.suma_renta_diaria = Number(d.sumaRentaDiaria) || 0
    }
  }
  return base
}

// switch en vez de un dispatch table por objeto: CodeQL (js/unvalidated-dynamic-method-call)
// marca cualquier invocación dinámica `obj[key]()` con key derivada de state.ramoId, sin
// reconocer Object.create(null)/hasOwnProperty/typeof como saneamiento. Un switch con case
// literales llama directo a la función nombrada, sin invocación dinámica por clave.
// Arma el `riesgo_datos` esperado por el calculador del ramo/plan actual (ver
// incendio.calculator.js / vida-ap.calculator.js para el shape exacto).
function armarRiesgoDatos(plan) {
  switch (state.ramoId) {
    case 'mrc':
      return armarRiesgoDatosMrc(plan)
    case 'incendio':
      return armarRiesgoDatosIncendio(plan)
    case 'vida-ap':
      return armarRiesgoDatosVidaAp(plan)
    default:
      return {}
  }
}

async function calcularPreview() {
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

// Guarda la cotización (POST /cotizaciones, si es la primera vez que se emite carta para esta
// pasada por el formulario) y descarga el PDF de la Carta Oferta. Reutiliza exactamente el mismo
// body que calcularPreview — el backend valida y calcula de nuevo antes de persistir.
async function emitirCartaOferta() {
  if (state.emitiendoCarta || !state.preview) return

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
function cerrarModalProgresoCarta() {
  if (state.progresoCarta?.estado === 'activo') return
  if (state.progresoCarta?.pdfUrl) URL.revokeObjectURL(state.progresoCarta.pdfUrl)
  state.progresoCarta = null
  renderApp()
  if (elementoDisparadorModalCarta) {
    elementoDisparadorModalCarta.focus()
    elementoDisparadorModalCarta = null
  }
}

// El botón "Ver detalle completo" y la pestaña "Detalle del plan" viven fuera del subárbol que
// renderLivePanel() actualiza — sin esto quedaban con el estado `disabled` del último render
// completo (ej. mientras el capital todavía era insuficiente) y nunca se desbloqueaban al llegar
// a un cálculo válido. Se actualizan acá directo sobre el DOM en vez de un renderApp() completo,
// para no perder el foco/cursor de los inputs mientras el agente sigue tipeando.
function syncAvanceButtons() {
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
// Render
// ---------------------------------------------------------------------------

function renderApp() {
  const ramo = state.ramoId ? ramoInfo(state.ramoId) : null

  let contenido
  if (!ramo) {
    contenido = renderEmptyState()
  } else if (ramo.estado === 'pausa' || ramo.estado === 'proximamente') {
    contenido = renderRamoNoDisponible(ramo)
  } else if (state.view === 'form') {
    contenido = renderDatosView(ramo)
  } else {
    contenido = renderResultadoView(ramo)
  }

  app.innerHTML = `
    ${renderTopbar(ramo)}
    <div class="app-body">
      <div class="sidebar-overlay ${state.sidebarAbierta ? 'sidebar-overlay--visible' : ''}" data-action="close-sidebar"></div>
      ${renderSidebar()}
      <main class="main">
        ${renderHeader(ramo)}
        ${renderBanner(state.banner)}
        ${contenido}
      </main>
    </div>
    ${renderModalProgresoCarta()}
  `
}

function renderTopbar(ramo) {
  return renderTopbarShell({
    sidebarAbierta: state.sidebarAbierta,
    breadcrumb: ramo
      ? `
      <div class="topbar__breadcrumb">
        <span class="topbar__crumb-item">Cotizaciones</span>
        <span class="topbar__crumb-sep">›</span>
        <span class="topbar__crumb-item topbar__crumb-item--current">Nueva cotización</span>
      </div>
    `
      : '<div></div>',
  })
}

function renderSidebar() {
  const rows = RAMOS_UI.map((base) => {
    const r = ramoInfo(base.nombre)
    const activa = r.nombre === state.ramoId
    const estadoTexto = r.estado === 'proximamente' ? 'Próximamente' : ''
    return `
      <div class="ramo-row ${activa ? 'ramo-row--activa' : ''} ${r.estado !== 'disponible' ? `ramo-row--${r.estado}` : ''}" data-action="select-ramo" data-ramo="${r.nombre}">
        <div class="ramo-row__icon">${RAMO_ICONOS[r.nombre] || ''}</div>
        <div class="ramo-row__label">${r.label}</div>
        ${estadoTexto ? `<div class="ramo-row__estado">${estadoTexto}</div>` : ''}
      </div>
    `
  }).join('')

  return `
    <div class="sidebar ${state.sidebarAbierta ? 'sidebar--abierta' : ''}">
      <div class="sidebar__section-label">Cotizar</div>
      <div class="ramo-list">${rows}</div>
      <div class="sidebar__footer">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('cotizar')}
        <div class="sidebar__credit">Powered by <strong>Kevin Ruiz Diaz</strong> v${COTIZADOR_VERSION}</div>
      </div>
    </div>
  `
}

function renderHeader(ramo) {
  const subtitle = ramo ? `Cotizando ${ramo.label}` : 'Elegí una sección para comenzar'
  const showTabs = Boolean(ramo) && ramo.estado !== 'pausa' && ramo.estado !== 'proximamente'
  const bloqueado = !puedeAvanzarADetalle()

  return `
    <div class="main-header">
      <div>
        ${ramo ? '' : '<div class="main-header__title">Nueva cotización</div>'}
        <div class="main-header__subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${
        showTabs
          ? `
        <div class="tabs">
          <button class="tab-btn ${state.view === 'form' ? 'tab-btn--active' : ''}" data-action="show-tab" data-view="form">Datos</button>
          <button
            id="tab-detalle-plan"
            class="tab-btn ${state.view === 'result' ? 'tab-btn--active' : ''}"
            data-action="show-tab"
            data-view="result"
            ${bloqueado ? `disabled title="Corregí el capital declarado antes de avanzar — ver el mensaje de alerta" aria-disabled="true" aria-describedby="${MOTIVO_BLOQUEO_ID}"` : ''}
          >Detalle del plan</button>
        </div>
      `
          : ''
      }
    </div>
  `
}

function renderPlanRow() {
  const options = state.planes
    .map((p) => {
      const calculable = planEsCalculable(state.ramoId, p)
      const sufijo = calculable ? '' : ' (pendiente de confirmación)'
      return `
      <option value="${p.id}" ${p.id === state.planId ? 'selected' : ''} ${!calculable ? 'disabled' : ''}>
        ${escapeHtml(p.nombre)}${sufijo}
      </option>
    `
    })
    .join('')

  return `
    <div class="plan-row">
      <div class="plan-row__box">
        <div class="plan-row__label">Plan a presentar</div>
        <select
          class="field-input plan-row__select"
          data-action-select="select-plan"
          aria-label="Plan a presentar"
          ${state.planBloqueado ? 'disabled title="El plan ya no se puede cambiar: se pasó a \'Detalle del plan\'. Empezá una cotización nueva para elegir otro plan."' : ''}
        >${options}</select>
      </div>
    </div>
  `
}

// Referencia visual de avance (1. Datos del plan → 2. Detalle del plan → 3. Carta oferta).
// "Carta oferta" no tiene un state.view propio — se emite como acción (PDF) dentro de
// "Detalle del plan" (ver emitirCartaOferta()) — así que ese paso queda siempre pendiente,
// solo marca el recorrido esperado, no un estado navegable.
function renderStepper() {
  const pasos = [
    { n: 1, label: 'Datos del plan', activo: state.view === 'form' },
    { n: 2, label: 'Detalle del plan', activo: state.view === 'result' },
    { n: 3, label: 'Carta oferta', activo: false },
  ]

  return `
    <div class="stepper-row">
      <div class="stepper">
        ${pasos
          .map(
            (p, i) => `
          <div class="stepper__step">
            <div class="stepper__circle ${p.activo ? 'stepper__circle--active' : ''}">${p.n}</div>
            <div class="stepper__label ${p.activo ? 'stepper__label--active' : ''}">${escapeHtml(p.label)}</div>
          </div>
          ${i < pasos.length - 1 ? '<div class="stepper__connector"></div>' : ''}
        `
          )
          .join('')}
      </div>
    </div>
  `
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state__icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M14 2v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="empty-state__title">Seleccioná un ramo en el panel izquierdo</div>
      <div class="empty-state__subtitle">El formulario y la cotización aparecerán acá.</div>
    </div>
  `
}

function renderRamoNoDisponible(ramo) {
  return `
    <div class="empty-state">
      <div class="empty-state__title">${escapeHtml(ramo.label)}</div>
      <div class="empty-state__subtitle">Próximamente.</div>
    </div>
  `
}

// id="campo-..." derivado del data-field (camelCase -> kebab-case) para asociar cada
// <label for="..."> con su input/select sin tener que hardcodear un id por campo.
function idParaCampo(fieldKey) {
  return `campo-${fieldKey.replace(/([A-Z])/g, '-$1').toLowerCase()}`
}

// Campos "Tipo de Riesgo"/"Ciudad"/capitales del esqueleto MRC — reusado por MRC e Incendio
// (plan "Edificio y Contenido"), que comparten el mismo motor de tasas por rubro.
function camposEdificioContenido(sublimiteField) {
  return `
    <div class="field">
      <label for="${idParaCampo('rubroActividad')}">Tipo de Riesgo</label>
      <select class="field-input" id="${idParaCampo('rubroActividad')}" data-field="rubroActividad">
        <option value="">Seleccioná un tipo de riesgo…</option>
        ${state.rubros.map((r) => `<option value="${escapeHtml(r.nombre)}" ${state.data.rubroActividad === r.nombre ? 'selected' : ''}>${escapeHtml(r.nombre)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="${idParaCampo('ciudad')}">Ciudad</label>
      <select class="field-input" id="${idParaCampo('ciudad')}" data-field="ciudad">
        <option value="">Seleccioná una ciudad…</option>
        ${CIUDADES.map((c) => `<option value="${c}" ${state.data.ciudad === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="${idParaCampo('capitalEdificio')}">Incendio Edificio (Gs.)</label>
      <input class="field-input" id="${idParaCampo('capitalEdificio')}" type="text" inputmode="numeric" data-field="capitalEdificio" data-money="true" placeholder="450.000.000" value="${fmtGsInput(state.data.capitalEdificio)}" />
    </div>
    <div class="field">
      <label for="${idParaCampo('capitalContenido')}">Incendio Contenido (Gs.)</label>
      <input class="field-input" id="${idParaCampo('capitalContenido')}" type="text" inputmode="numeric" data-field="capitalContenido" data-money="true" placeholder="120.000.000" value="${fmtGsInput(state.data.capitalContenido)}" />
    </div>
    ${sublimiteField || ''}
  `
}

function campoSublimitePorcentaje(field, label) {
  return `
    <div class="field">
      <label for="${idParaCampo(field)}">${label}</label>
      <input class="field-input" id="${idParaCampo(field)}" type="number" min="0" max="50" data-field="${field}" placeholder="0-50" value="${escapeHtml(state.data[field] ?? '')}" />
    </div>
  `
}

// Selector Gs./USD — mismo look de pill que el selector de forma de pago (ver
// renderFormaPagoPills). Solo se ofrece en planes de mecánica `objeto_riesgo` (Hipotecario,
// con/sin Inspección): el resto de los ramos/planes sigue fijo en Gs. (o USD fijo para Maquinaria
// Básico, sin selector — ver monedaEfectiva()).
function renderMonedaSelector() {
  const monedaActual = state.data.moneda || 'PYG'
  const opciones = [
    { valor: 'PYG', label: 'Gs.' },
    { valor: 'USD', label: 'USD' },
  ]
  const pills = opciones
    .map(
      (o) => `
      <button
        type="button"
        class="plan-pill ${o.valor === monedaActual ? 'plan-pill--active' : ''}"
        data-action="select-moneda"
        data-moneda="${o.valor}"
      >${o.label}</button>
    `
    )
    .join('')

  return `
    <div class="field field--span2">
      <label id="moneda-cotizacion-label">Moneda de la cotización</label>
      <div class="forma-pago-row__pills" role="group" aria-labelledby="moneda-cotizacion-label">${pills}</div>
    </div>
  `
}

// Campos del plan con mecánica `objeto_riesgo` (migración 035/036/038 — Hipotecario, con/sin
// Inspección): "Tipo de Riesgo" (reusa `state.rubros`, ya cargado para mrc/incendio — ver
// selectRamo/cargarParaEditar; el campo real que espera el backend es `rubro_actividad`,
// confirmado por Kevin como el mismo campo que identifica el "Tipo de Riesgo" acá, ej. "VIVIENDA
// FAMILIAR"), el selector de moneda, y los 4 objetos de riesgo opcionales (Edificio,
// Instalaciones, Contenido Mueble y Equipos, Contenido Mercadería — ninguno es obligatorio, ver
// incendio-planes-objeto-riesgo#Optional risk objects).
function camposObjetoRiesgo(plan) {
  const moneda = monedaEfectiva(plan)
  const unidad = unidadMoneda(moneda)
  const sugerencia = sugerenciaInspeccion(plan)

  const camposCapital = OBJETOS_RIESGO_CAMPOS.map(
    ({ stateKey, label }) => `
      <div class="field">
        <label for="${idParaCampo(stateKey)}">${label} (${unidad})</label>
        <input class="field-input" id="${idParaCampo(stateKey)}" type="text" inputmode="numeric" data-field="${stateKey}" data-money="true" placeholder="0" value="${fmtGsInput(state.data[stateKey])}" />
      </div>
    `
  ).join('')

  return `
    <div class="field">
      <label for="${idParaCampo('rubroActividad')}">Tipo de Riesgo</label>
      <select class="field-input" id="${idParaCampo('rubroActividad')}" data-field="rubroActividad">
        <option value="">Seleccioná un tipo de riesgo…</option>
        ${state.rubros.map((r) => `<option value="${escapeHtml(r.nombre)}" ${state.data.rubroActividad === r.nombre ? 'selected' : ''}>${escapeHtml(r.nombre)}</option>`).join('')}
      </select>
    </div>
    ${renderMonedaSelector()}
    ${camposCapital}
    ${
      sugerencia
        ? `<div class="field field--span2"><div class="live-summary__pending live-summary__pending--gap">${escapeHtml(sugerencia)}</div></div>`
        : ''
    }
  `
}

function camposEspecificosMrc() {
  const puedeAgregarLibre = auth.getUsuario()?.puede_agregar_cobertura_libre !== false
  return `
    ${camposEdificioContenido()}
    <div class="field field--span2">
      ${
        puedeAgregarLibre
          ? renderCoberturasAdicionales(coberturasDisponibles())
          : renderCoberturasAdicionalesCheckbox(coberturasDisponibles())
      }
    </div>
  `
}

function camposEspecificosIncendio(plan) {
  if (!plan) {
    return `<div class="field field--span2"><div class="live-summary__pending">Seleccioná un plan para ver el formulario.</div></div>`
  }
  if (plan.nombre === 'MAQUINARIA BASICO') {
    return `
      <div class="field">
        <label for="${idParaCampo('capitalMaquinaria')}">Capital Maquinaria (USD)</label>
        <input class="field-input" id="${idParaCampo('capitalMaquinaria')}" type="text" inputmode="numeric" data-field="capitalMaquinaria" data-money="true" placeholder="50.000" value="${fmtGsInput(state.data.capitalMaquinaria)}" />
      </div>
      ${campoSublimitePorcentaje('sublimiteVandalismoPorcentaje', 'Sublímite Vandalismo (%)')}
    `
  }
  if (plan.tipo_mecanica === 'objeto_riesgo') {
    return camposObjetoRiesgo(plan)
  }
  return camposEdificioContenido(
    campoSublimitePorcentaje(
      'sublimiteFenomenosNaturalesPorcentaje',
      'Sublímite Fenómenos Naturales (%)'
    )
  )
}

function camposEspecificosVidaAp(plan) {
  if (!plan) {
    return `<div class="field field--span2"><div class="live-summary__pending">Seleccioná un plan para ver el formulario.</div></div>`
  }
  const campoCapital = `
    <div class="field">
      <label for="${idParaCampo('capitalAsegurado')}">Capital Asegurado (Gs.)</label>
      <input class="field-input" id="${idParaCampo('capitalAsegurado')}" type="text" inputmode="numeric" data-field="capitalAsegurado" data-money="true" placeholder="100.000.000" value="${fmtGsInput(state.data.capitalAsegurado)}" />
    </div>
  `

  if (plan.nombre === 'PROTECCION FAMILIAR') {
    return campoCapital
  }

  const campoEdad = `
    <div class="field">
      <label for="${idParaCampo('edad')}">Edad</label>
      <input class="field-input" id="${idParaCampo('edad')}" type="number" min="0" max="99" data-field="edad" placeholder="35" value="${escapeHtml(state.data.edad ?? '')}" />
    </div>
  `

  if (
    plan.nombre === 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO' ||
    plan.nombre === 'ACCIDENTES PERSONALES - SECTOR PRIVADO'
  ) {
    const incluyeRenta = Boolean(state.data.incluyeRentaDiaria)
    return `
      ${campoCapital}
      ${campoEdad}
      <div class="field field--span2">
        <label class="field-checkbox-label">
          <input type="checkbox" data-field="incluyeRentaDiaria" ${incluyeRenta ? 'checked' : ''} />
          Incluir Renta Diaria
        </label>
      </div>
      ${
        incluyeRenta
          ? `
        <div class="field">
          <label for="${idParaCampo('sumaRentaDiaria')}">Suma Renta Diaria (Gs.)</label>
          <input class="field-input" id="${idParaCampo('sumaRentaDiaria')}" type="text" inputmode="numeric" data-field="sumaRentaDiaria" data-money="true" placeholder="50.000" value="${fmtGsInput(state.data.sumaRentaDiaria)}" />
        </div>
      `
          : ''
      }
    `
  }

  // VIDA DIRECTIVOS Y EMPLEADOS
  return `${campoCapital}${campoEdad}`
}

function camposEspecificosPendiente() {
  return `
    <div class="field field--span2">
      <div class="live-summary__pending live-summary__pending--gap">
        Este ramo todavía no tiene su calculador conectado en el cotizador — el formulario de datos
        específicos se agrega en otra tarea. Podés cargar los datos del cliente mientras tanto.
      </div>
    </div>
  `
}

function camposEspecificosParaRamo(ramo, plan) {
  switch (ramo.nombre) {
    case 'mrc':
      return camposEspecificosMrc()
    case 'incendio':
      return camposEspecificosIncendio(plan)
    case 'vida-ap':
      return camposEspecificosVidaAp(plan)
    default:
      return camposEspecificosPendiente()
  }
}

function renderDatosView(ramo) {
  const esCalculable = RAMOS_CON_CALCULO.includes(state.ramoId)
  const plan = state.planes.find((p) => p.id === state.planId)

  const camposEspecificos = esCalculable
    ? camposEspecificosParaRamo(ramo, plan)
    : camposEspecificosParaRamo({ nombre: null }, null)

  return `
    <div class="datos-view panel">
      <div class="datos-view__form">
        ${esCalculable && ramo.estado === 'disponible' ? renderStepper() + renderPlanRow() : ''}
        <div class="datos-view__form-inner">
          <div class="form-heading">
            <div class="form-heading__label">Datos del asegurado</div>
          </div>
          <div class="datos-view__form-body">
            <div class="field-grid">
              ${CLIENT_FIELDS.map(
                (f) => `
                <div class="field ${f.span === 2 ? 'field--span2' : ''}">
                  <label for="${idParaCampo(f.key)}">${f.label}</label>
                  <input class="field-input" id="${idParaCampo(f.key)}" type="text" inputmode="${f.money ? 'numeric' : 'text'}" data-field="${f.key}" ${f.money ? 'data-money="true"' : ''} placeholder="${f.placeholder}" value="${escapeHtml(f.money ? fmtGsInput(state.data[f.key]) : (state.data[f.key] ?? ''))}" />
                </div>
              `
              ).join('')}
              ${camposEspecificos}
            </div>
            <button
              id="btn-ver-detalle"
              class="btn-primary form-cta"
              data-action="show-tab"
              data-view="result"
              ${puedeAvanzarADetalle() ? '' : `disabled title="Corregí el capital declarado antes de avanzar — ver el mensaje de alerta" aria-disabled="true" aria-describedby="${MOTIVO_BLOQUEO_ID}"`}
            >Ver detalle completo →</button>
          </div>
        </div>
      </div>
      <div class="live-summary" id="live-summary">${renderLivePanelContent()}</div>
    </div>
  `
}

// true si todavía queda al menos un código de `catalogoDisponible` que no llegó a su límite de
// repetición (ver LIMITE_REPETICION_COBERTURA_MRC) — usado para deshabilitar tanto el "+ Agregar
// cobertura" del selector libre (Datos) como el "Agregar cobertura adicional" de "Detalle del
// plan" una vez que ya se cargó el máximo de coberturas disponibles para el plan.
function quedanCoberturasAdicionalesPorAgregar(catalogoDisponible) {
  const conteo = new Map()
  for (const l of state.coberturasAdicionales) {
    if (!l.codigo) continue
    conteo.set(l.codigo, (conteo.get(l.codigo) || 0) + 1)
  }
  return catalogoDisponible.some((c) => {
    const limite =
      LIMITE_REPETICION_COBERTURA_MRC[c.codigo] ?? LIMITE_REPETICION_COBERTURA_MRC_DEFAULT
    return (conteo.get(c.codigo) || 0) < limite
  })
}

// Sección "Coberturas adicionales": líneas cobertura/sublímite más allá de Incendio Edificio/
// Contenido. `catalogoDisponible` ya viene sin las 2 fijas y sin sublimite_cctv (ver
// coberturasDisponibles()).
function renderCoberturasAdicionales(catalogoDisponible) {
  // Cuenta de veces que cada código ya está elegido en OTRAS filas — el select de cada fila
  // excluye los códigos que llegaron a su límite (ver LIMITE_REPETICION_COBERTURA_MRC),
  // manteniendo siempre disponible el propio valor actual de la fila.
  const conteoPorCodigo = (codigoExcluir) => {
    const conteo = new Map()
    for (const l of state.coberturasAdicionales) {
      if (!l.codigo || l.codigo === codigoExcluir) continue
      conteo.set(l.codigo, (conteo.get(l.codigo) || 0) + 1)
    }
    return conteo
  }

  const opciones = (codigoActual) => {
    const conteo = conteoPorCodigo(codigoActual)
    return catalogoDisponible
      .filter((c) => {
        const limite =
          LIMITE_REPETICION_COBERTURA_MRC[c.codigo] ?? LIMITE_REPETICION_COBERTURA_MRC_DEFAULT
        return (conteo.get(c.codigo) || 0) < limite
      })
      .map(
        (c) => `
    <option value="${escapeHtml(c.codigo)}" ${c.codigo === codigoActual ? 'selected' : ''}>
      ${escapeHtml(c.nombre)}${c.categoria === 'Sublímites' ? ' · Sublímite' : ''}
    </option>
  `
      )
      .join('')
  }

  // Cada fila es repetible (el agente puede agregar varias líneas de cobertura), así que
  // el id de cada campo usa l.id (clave estable de la fila, ver agregarCoberturaLinea) para
  // no duplicar ids en el DOM. Los <label> son visualmente ocultos (.sr-only): el layout ya
  // usa el placeholder como pista visual y agregar 2 labels visibles por fila no entra.
  const filas = state.coberturasAdicionales
    .map(
      (l) => `
    <div class="cobertura-adicional-row" data-linea-id="${l.id}">
      <label class="sr-only" for="cobertura-linea-${l.id}-codigo">Cobertura de la línea</label>
      <select class="field-input" id="cobertura-linea-${l.id}-codigo" data-linea-id="${l.id}" data-linea-field="codigo">
        <option value="">Seleccioná una cobertura…</option>
        ${opciones(l.codigo)}
      </select>
      <label class="sr-only" for="cobertura-linea-${l.id}-suma">Suma asegurada de la línea (Gs.)</label>
      <input
        class="field-input"
        id="cobertura-linea-${l.id}-suma"
        type="text"
        inputmode="numeric"
        data-linea-id="${l.id}"
        data-linea-field="sumaAsegurada"
        data-money="true"
        placeholder="Suma asegurada (Gs.)"
        value="${fmtGsInput(l.sumaAsegurada)}"
      />
      <button type="button" class="btn-outline cobertura-adicional-row__quitar" data-action="remove-cobertura-linea" data-linea-id="${l.id}">Quitar</button>
    </div>
  `
    )
    .join('')

  const quedanCoberturasPorAgregar = quedanCoberturasAdicionalesPorAgregar(catalogoDisponible)

  return `
    <div class="coberturas-adicionales" role="group" aria-labelledby="coberturas-adicionales-label">
      <label id="coberturas-adicionales-label">Coberturas adicionales</label>
      ${filas}
      <button type="button" class="btn-outline" data-action="add-cobertura-linea" ${quedanCoberturasPorAgregar ? '' : 'disabled title="Ya agregaste el máximo de coberturas disponibles"'}>+ Agregar cobertura</button>
    </div>
  `
}

// Variante de "Coberturas adicionales" para roles sin puede_agregar_cobertura_libre (Ajuste
// MC.xlsx ítem #6): en vez del selector libre + botón "+ Agregar cobertura", una lista fija de
// checkboxes (una por cobertura disponible del catálogo) — al tildar una aparece su campo de
// suma asegurada. Reutiliza state.coberturasAdicionales/toggleCoberturaAdicionalPorCodigo, así
// que el resto del flujo (armarRiesgoDatosMrc, prefill, cálculo) no distingue el modo.
function renderCoberturasAdicionalesCheckbox(catalogoDisponible) {
  const filas = catalogoDisponible
    .map((c) => {
      const linea = state.coberturasAdicionales.find((l) => l.codigo === c.codigo)
      const marcado = Boolean(linea)
      return `
    <div class="cobertura-adicional-checkbox-row">
      <label class="field-checkbox-label">
        <input type="checkbox" data-action="toggle-cobertura-checkbox" data-codigo="${escapeHtml(c.codigo)}" ${marcado ? 'checked' : ''} />
        ${escapeHtml(c.nombre)}${c.categoria === 'Sublímites' ? ' · Sublímite' : ''}
      </label>
      ${
        marcado
          ? `
        <label class="sr-only" for="cobertura-linea-${linea.id}-suma">Suma asegurada de ${escapeHtml(c.nombre)} (Gs.)</label>
        <input
          class="field-input cobertura-adicional-checkbox-row__monto"
          id="cobertura-linea-${linea.id}-suma"
          type="text"
          inputmode="numeric"
          data-linea-id="${linea.id}"
          data-linea-field="sumaAsegurada"
          data-money="true"
          placeholder="Suma asegurada (Gs.)"
          value="${fmtGsInput(linea.sumaAsegurada)}"
        />`
          : ''
      }
    </div>
  `
    })
    .join('')

  return `
    <div class="coberturas-adicionales coberturas-adicionales--checkbox" role="group" aria-labelledby="coberturas-adicionales-label">
      <label id="coberturas-adicionales-label">Coberturas adicionales</label>
      ${filas || '<div class="empty-state__subtitle">No hay coberturas adicionales disponibles para este plan.</div>'}
    </div>
  `
}

// El panel "Cotización en vivo" (columna derecha) suele quedar con espacio libre debajo de su
// contenido (columna de ancho fijo, altura estirada por flex) — el bloque "Sublímites" fijos de
// MRC se agrega ahí abajo para aprovecharlo, en vez de competir por lugar en el formulario de
// la izquierda (ver sublimitesFijosMrc(), decisión de Kevin 2026-07-15).
function renderLivePanelContent() {
  return `${renderLivePanelBody()}${state.ramoId === 'mrc' ? renderSublimitesFijosMrc() : ''}`
}

function renderLiveLabel() {
  return `<div class="live-summary__label"><span class="live-summary__dot"></span>Cotización en vivo</div>`
}

function renderLivePanelBody() {
  if (!RAMOS_CON_CALCULO.includes(state.ramoId)) {
    return `
      ${renderLiveLabel()}
      <div class="live-summary__pending">Cálculo pendiente de confirmación de tasas para este ramo.</div>
    `
  }

  if (state.previewError) {
    return `
      ${renderLiveLabel()}
      <div class="live-summary__error" id="${MOTIVO_BLOQUEO_ID}">${escapeHtml(state.previewError)}</div>
    `
  }

  if (!state.preview) {
    return `
      ${renderLiveLabel()}
      <div class="live-summary__pending" id="${MOTIVO_BLOQUEO_ID}">${state.loadingPreview ? 'Calculando…' : 'Completá los datos del riesgo para ver la prima.'}</div>
    `
  }

  const fp = formaPagoSeleccionada()
  const coberturasCount = state.preview.coberturas?.length ?? 0
  const moneda = monedaCotizacionActual()
  const unidad = unidadMoneda(moneda)
  const plan = state.planes.find((p) => p.id === state.planId)

  // Capital total asegurado + tasa efectiva (costo/capital), pedido de Kevin 2026-08-07
  // ampliando el ítem #7 del Ajuste MC.xlsx (2026-08-05, que lo había dejado solo en MRC) a
  // Incendio y Vida/AP. MRC sigue usando capitalTotalAsegurado() (ya shippeado, suma también
  // las coberturas adicionales que cuentan para la suma asegurada total) — Incendio/Vida-AP no
  // devuelven ese desglose por cobertura, así que usan el mismo capital que ya se manda al
  // backend en el body (capitalAseguradoParaBody).
  // Numerador y unidad confirmados contra docs/insumos/Version 01 - Calculo Varios.xlsx (hoja
  // MRC, fila "Tasa Global"): esa celda es `Costo total / Suma total × 1000` (‰, no %) — con
  // Costo total = 3.847.000 y Suma total = 970.000.000 da 3,97, en la misma escala que cada
  // tasa individual de la planilla (1‰, 2‰, 8‰...). El "Costo" (`fp.cuota_sin_iva||fp.premio_sin_iva`,
  // ver renderLivePanelBody) todavía incluye RPF/cuotas — NO es este numerador: acá se usa la
  // prima cruda del calculador (`state.preview.prima`), que es la misma que arma la planilla
  // (suma de capital×tasa por cobertura, sublímites fijos incluidos vía coberturas_adicionales).
  const capitalTotal =
    state.ramoId === 'mrc' ? capitalTotalAsegurado() : capitalAseguradoParaBody(plan)
  const primaBase = state.preview.prima
  const tasaEfectiva =
    capitalTotal > 0 && Number.isFinite(primaBase) ? (primaBase / capitalTotal) * 1000 : null

  return `
    ${renderLiveLabel()}
    ${renderFormaPagoPills()}
    <div class="live-summary__price-label">Costo (sin IVA) ${ICON_INFO}</div>
    <div class="live-summary__price">${fmtMonto(fp.premio_sin_iva, moneda)} <span class="live-summary__price-unit">${unidad}</span></div>
    <div class="live-summary__sub">${
      fp.cuota_sin_iva
        ? `${unidad} / mes · ${fmtMonto(fp.cuota_sin_iva, moneda)} ${unidad} cuota sin IVA`
        : `${unidad} · ${fmtMonto(fp.premio_sin_iva, moneda)} ${unidad} premio total sin IVA`
    }</div>
    <div class="live-summary__divider"></div>
    ${renderCuotasSelect()}
    <div class="live-summary__rows">
      <div class="live-summary__row"><span>Forma de pago</span><span>${escapeHtml(fp.nombre_display)}</span></div>
      <div class="live-summary__row"><span>Cuotas</span><span>Inicial + ${fp.cantidad_cuotas} cuotas</span></div>
      <div class="live-summary__row"><span>Coberturas</span><span>${coberturasCount} incluidas</span></div>
      ${capitalTotal > 0 ? `<div class="live-summary__row"><span>Capital total asegurado</span><span>${fmtMonto(capitalTotal, moneda)} ${unidad}</span></div>` : ''}
      ${tasaEfectiva != null ? `<div class="live-summary__row"><span>Tasa efectiva (costo/capital)</span><span>${tasaEfectiva.toLocaleString('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ‰</span></div>` : ''}
    </div>
    <div class="live-summary__hint">El monto se recalcula automáticamente a medida que completás los datos.</div>
  `
}

// Sublímites fijos del plan MRC actual — van siempre incluidos con monto fijo, no son
// "coberturas" que el agente elija (ver sublimitesFijosMrc()), así que se muestran acá con su
// propio título en vez de mezclarse bajo "Coberturas adicionales".
function renderSublimitesFijosMrc() {
  const filas = sublimitesFijosMrc()
    .map(
      (s) => `
      <div class="live-summary__row live-summary__row--icon">
        <span class="live-summary__row-name">
          <span class="live-summary__row-icon">${SUBLIMITE_ICONOS[s.codigo] || ICON_SUBLIMITE_GENERICO}</span>
          ${escapeHtml(s.nombre)}
        </span>
        <span>${fmtGs(s.monto)} Gs.</span>
      </div>
    `
    )
    .join('')

  return `
    <div class="live-summary__divider"></div>
    <div class="live-summary__label">Sublímites incluidos</div>
    <div class="live-summary__rows live-summary__rows--dashed">${filas}</div>
  `
}

// Cantidad de cuotas: el monto de cada cuota es siempre REDONDEAR.SUP(Premio/12, 1000)
// (fórmula fija, PLAN_DESARROLLO.md sección 5) — este selector no cambia ese monto, define
// cuántas cuotas paga el cliente en total (tope: plan.cuotas_maximo), dato que se guarda en
// `cotizacion_planes_pago.cantidad_cuotas` para la Carta Oferta.
function renderCuotasSelect() {
  const plan = state.planes.find((p) => p.id === state.planId)
  if (!plan?.cuotas_maximo || plan.cuotas_maximo <= 1) return ''

  const actual = Number(state.data.cuotas) || plan.cuotas_default || plan.cuotas_maximo
  const opciones = Array.from({ length: plan.cuotas_maximo }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${n === actual ? 'selected' : ''}>${n} cuotas</option>`)
    .join('')

  return `
    <div class="field field--gap-bottom">
      <label for="${idParaCampo('cuotas')}">Cantidad de cuotas</label>
      <select class="field-input" id="${idParaCampo('cuotas')}" data-field="cuotas">${opciones}</select>
    </div>
  `
}

// Selector de forma de pago — mismo look de pill que el selector de plan. Vive en el
// panel de cotización en vivo (donde el agente arma la cotización); "Detalle del plan"
// solo muestra la elegida, de solo lectura (ver renderResultadoView).
function renderFormaPagoPills() {
  const formas = formasPagoDisponibles()
  if (!formas.length) return ''

  const pills = formas
    .map((fp) => {
      const activo = fp.codigo === state.formaPagoCodigo
      return `
      <button
        class="plan-pill ${activo ? 'plan-pill--active' : ''}"
        data-action="select-forma-pago"
        data-forma="${fp.codigo}"
      >${escapeHtml(fp.nombre_display)}</button>
    `
    })
    .join('')

  return `
    <div class="forma-pago-row">
      <div class="forma-pago-row__label">Forma de pago:</div>
      <div class="forma-pago-row__pills">${pills}</div>
    </div>
  `
}

// Reemplaza el innerHTML completo del panel "Cotización en vivo" en cada recálculo (ver
// DEBOUNCE_MS en calcularPreview()) — eso recrea el <select> de cuotas aunque su valor no haya
// cambiado, perdiendo el foco si el agente lo estaba navegando con teclado en ese momento.
// Se restaura el foco explícitamente después del re-render en vez de reescribir el motor de
// render, que también sirve para otros campos vivos dentro de este panel (ej. selects de forma
// de pago) por el mismo motivo.
function renderLivePanel() {
  const el = document.getElementById('live-summary')
  if (!el) return

  const activo = document.activeElement
  const enElPanel = Boolean(activo && el.contains(activo))
  const campoField = enElPanel ? activo.dataset?.field : null
  const campoId = enElPanel && !campoField ? activo.id : null
  const selectionStart =
    enElPanel && typeof activo.selectionStart === 'number' ? activo.selectionStart : null
  const selectionEnd =
    enElPanel && typeof activo.selectionEnd === 'number' ? activo.selectionEnd : null

  el.innerHTML = renderLivePanelContent()

  if (!campoField && !campoId) return
  const restaurado = campoField
    ? el.querySelector(`[data-field="${campoField}"]`)
    : campoId
      ? document.getElementById(campoId)
      : null
  if (!restaurado) return
  restaurado.focus({ preventScroll: true })
  if (
    selectionStart != null &&
    selectionEnd != null &&
    typeof restaurado.setSelectionRange === 'function'
  ) {
    restaurado.setSelectionRange(selectionStart, selectionEnd)
  }
}

function renderResultadoVacio(ramo, plan, planLabel, esCalculable) {
  return `
    <div class="resultado-view panel">
      <div class="resultado-view__inner">
        ${esCalculable ? `<div class="stepper-wrap">${renderStepper()}</div>` : ''}
        <div class="resultado-hero">
          <div>
            <div class="resultado-hero__label">Plan ${escapeHtml(planLabel)} · ${escapeHtml(ramo.label)}</div>
            <div class="resultado-hero__price">— <span>Gs. / mes</span></div>
          </div>
          <button class="btn-primary" data-action="emitir-carta" disabled title="Requiere una cotización calculada">Emitir carta oferta</button>
        </div>
        <div class="empty-state empty-state--compact">
          <div class="empty-state__subtitle">
            ${esCalculable ? 'Completá los datos del riesgo en la pestaña "Datos" para ver el detalle del plan.' : 'Cálculo pendiente de confirmación de tasas para este ramo.'}
          </div>
        </div>
      </div>
    </div>
  `
}

function renderResultadoCompleto(ramo, plan, planLabel) {
  const fp = formaPagoSeleccionada()
  const coberturas = state.preview.coberturas || []
  // "Coberturas adicionales" solo existe en el formulario de MRC (ver camposEspecificosMrc) —
  // en otros ramos no hay límite que evaluar, así que el botón queda siempre habilitado.
  const puedeAgregarMasCoberturas =
    ramo.nombre !== 'mrc' || quedanCoberturasAdicionalesPorAgregar(coberturasDisponibles())

  return `
    <div class="resultado-view panel">
      <div class="resultado-view__inner">
        <div class="resultado-layout">
          <div class="resultado-layout__main">
            ${renderStepper()}
            <div class="plan-info-card">
              <div>
                <div class="plan-info-card__title">${escapeHtml(planLabel)}</div>
                <div class="plan-info-card__pills">
                  <span class="plan-info-card__badge plan-info-card__badge--neutral">${escapeHtml(ramo.label)}</span>
                  <span class="plan-info-card__badge plan-info-card__badge--success">${escapeHtml(fp.nombre_display)}</span>
                </div>
              </div>
              <button class="link-button" data-action="show-tab" data-view="form">${ICON_ARROW_LEFT_ROUND} Cambiar datos</button>
            </div>
            <div class="coberturas-section">
              <div class="coberturas-section__title">Coberturas incluidas</div>
              <div class="coberturas-lista">
                ${[...coberturas]
                  // Los sub-límites fijos del plan no van en este listado de "Coberturas incluidas"
                  // (a pedido de Kevin, 2026-07-15) — se muestran aparte en renderSublimitesFijosMrc.
                  .filter((c) => !sublimitesFijosMrc().some((s) => s.codigo === c.codigo))
                  .sort(
                    (a, b) =>
                      (a.tipo_aplicacion === 'sublimite' ? 1 : 0) -
                      (b.tipo_aplicacion === 'sublimite' ? 1 : 0)
                  )
                  .map((c) => {
                    const esSublimite = c.tipo_aplicacion === 'sublimite'
                    return `
                    <div class="cobertura-card">
                      <div class="cobertura-card__status ${esSublimite ? 'cobertura-card__status--warning' : ''}">${esSublimite ? '!' : '✓'}</div>
                      <div class="cobertura-card__icon">${SUBLIMITE_ICONOS[c.codigo] || ICON_SUBLIMITE_GENERICO}</div>
                      <div class="cobertura-card__main">
                        <div class="cobertura-card__name">${escapeHtml(c.nombre)}</div>
                        ${renderFranquiciaSelect(c)}
                      </div>
                      <div class="cobertura-card__monto">
                        <span>Suma asegurada</span>
                        <div>${typeof c.monto === 'number' ? `${fmtMonto(c.monto, monedaCotizacionActual())} <em>${unidadMoneda(monedaCotizacionActual())}</em>` : escapeHtml(c.monto ?? '—')}</div>
                      </div>
                    </div>
                  `
                  })
                  .join('')}
              </div>
              <button
                class="cobertura-card__agregar"
                data-action="show-tab"
                data-view="form"
                ${puedeAgregarMasCoberturas ? '' : 'disabled title="Ya agregaste todas las coberturas adicionales disponibles para este plan"'}
              >${ICON_PLUS} Agregar cobertura adicional</button>
            </div>
          </div>
          <div class="resultado-layout__aside">
            ${renderResumenCotizacion(plan)}
          </div>
        </div>
      </div>
    </div>
  `
}

function renderResultadoView(ramo) {
  const esCalculable = RAMOS_CON_CALCULO.includes(state.ramoId)
  const plan = state.planes.find((p) => p.id === state.planId)
  const planLabel = plan ? plan.nombre : '—'

  if (!esCalculable || !state.preview) {
    return renderResultadoVacio(ramo, plan, planLabel, esCalculable)
  }

  return renderResultadoCompleto(ramo, plan, planLabel)
}

// Bloque "Suma Asegurada / Costo Contado / Costo Financiado" — mismo formato que la pantalla
// del sistema de escritorio real. A diferencia del resto de "Detalle del plan" (que sigue la
// forma de pago elegida en las pills), este bloque siempre muestra Contado y el financiado a
// través de Cobrador en simultáneo, sin importar cuál esté seleccionada.
// Selector de franquicia/deducible por cobertura — el asegurado decide qué franquicia le
// interesa y el agente la elige acá para que figure en la propuesta. No afecta la prima ya
// calculada (confirmado por Kevin, 2026-07-13): es solo el texto que se va a mostrar.
function renderFranquiciaSelect(cobertura) {
  const seleccionado =
    state.franquiciasPorCobertura[cobertura.codigo] ??
    franquiciaValorPorDefecto(cobertura.franquicia_default)

  const opciones = FRANQUICIA_OPCIONES.map(
    (o) =>
      `<option value="${o.valor}" ${o.valor === seleccionado ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('')

  return `
    <div class="cobertura-row__franquicia-label">Franquicia</div>
    <select class="cobertura-row__franquicia" data-franquicia-cobertura="${cobertura.codigo}" aria-label="Franquicia">${opciones}</select>
  `
}

// Card único del sidebar de "Detalle del plan" — reemplaza los 2 cards separados que había
// antes (resumen Contado/Financiado + Ajustes) por un único "Resumen de la cotización" con
// secciones separadas por líneas finas, terminando en el botón de "Emitir carta oferta" (antes
// vivía en una barra fija al pie de la pantalla — ver decisión de rediseño, 2026-07-22).
// El bloque "Financiado" refleja la forma de pago realmente elegida en las pills de "Datos"
// (formaPagoSeleccionada()) — antes quedaba hardcodeada a Cobrador sin importar la selección
// real, algo que Análisis de Riesgo confirmó como bug (Ajuste MC.xlsx, ítem #4). Si el agente
// eligió Contado, no hay "Financiado" que mostrar aparte (Cuota=0 por regla de negocio).
function renderResumenCotizacion(plan) {
  const variante = state.preview?.variantes?.[0]
  const contado = variante?.formasPago.find((f) => f.codigo === 'contado')
  const formaSeleccionada = formaPagoSeleccionada()
  const financiado = formaSeleccionada?.codigo !== 'contado' ? formaSeleccionada : null
  const sumaAsegurada = capitalTotalAsegurado()
  const moneda = monedaEfectiva(plan)
  const unidad = unidadMoneda(moneda)

  return `
    <div class="resumen-sistema">
      <div class="resumen-sistema__block">
        <div class="resumen-sistema__title">Resumen de la cotización</div>
        <div class="resumen-sistema__total-label">Suma asegurada total</div>
        <div class="resumen-sistema__total-value">${fmtMonto(sumaAsegurada, moneda)} <em>${unidad}</em></div>
      </div>
      ${
        contado
          ? `
        <div class="resumen-sistema__divider"></div>
        <div class="resumen-sistema__block">
          <div class="resumen-sistema__block-title">Pago contado</div>
          <div class="resumen-sistema__row">
            <span>Costo total</span>
            <span>${fmtMonto(contado.premio, moneda)} <em>${unidad}</em></span>
          </div>
        </div>
      `
          : ''
      }
      ${
        financiado
          ? `
        <div class="resumen-sistema__divider"></div>
        <div class="resumen-sistema__block">
          <div class="resumen-sistema__block-title">Financiado</div>
          <div class="resumen-sistema__row">
            <span>Inicial</span>
            <span>${fmtMonto(financiado.inicial, moneda)} <em>${unidad}</em></span>
          </div>
          <div class="resumen-sistema__row">
            <span>${financiado.cantidad_cuotas} cuotas de</span>
            <span>${fmtMonto(financiado.cuota, moneda)} <em>${unidad}</em></span>
          </div>
          <div class="resumen-sistema__subdivider"></div>
          <div class="resumen-sistema__row resumen-sistema__row--stacked">
            <span>Premio financiado</span>
            <div>
              <div>${fmtMonto(financiado.premio, moneda)} <em>${unidad}</em></div>
              <small>Inicial ${unidad} ${fmtMonto(financiado.inicial, moneda)}</small>
            </div>
          </div>
        </div>
      `
          : ''
      }
      ${renderAjustesDescuentoRecargo(plan)}
      <div class="resumen-sistema__spacer"></div>
      <div class="resumen-sistema__cta-wrap">
        <button class="resumen-sistema__cta" data-action="emitir-carta" ${state.emitiendoCarta ? 'disabled' : ''}>
          ${ICON_TAG} ${state.emitiendoCarta ? 'Generando…' : state.editandoId ? 'Guardar cambios' : 'Emitir carta oferta'}
        </button>
        <div class="resumen-sistema__hint--center">Se generará la carta oferta con el detalle del plan seleccionado.</div>
      </div>
    </div>
  `
}

// Descuento/recargo manual del agente — solo mrc/incendio (ver RAMOS_CON_AJUSTES). El tope real
// lo aplica el backend (sumarAjustes en el calculador); acá solo se muestra como texto de ayuda
// para que el agente sepa hasta cuánto puede cargar antes de que el backend lo clampee. Dos
// campos fijos (Gs. y %) en vez de un input + selector de tipo — el agente carga uno de los dos.
// Apenas tipea en uno, el otro se deshabilita (y se limpia) para evitar que queden los dos
// cargados a la vez y ajustesParaBody tenga que desambiguar en silencio cuál usar.
function renderAjusteField(prefijo, label, plan) {
  const topePlan = prefijo === 'descuento' ? plan?.descuento_maximo : plan?.recargo_maximo
  const usuario = auth.getUsuario()
  // Tope propio del usuario (Fase 5, ver Editar usuario en admin) — el backend siempre aplica
  // el más restrictivo de los dos; acá solo se refleja para que el agente no cargue de más
  // y lo vea clampeado sin explicación. Nota: es el valor cacheado al loguearse, si un admin
  // edita el tope del usuario en la misma sesión, este texto queda desactualizado hasta el
  // próximo login — el backend igual aplica el valor real y fresco en cada cotización.
  const topeUsuario =
    prefijo === 'descuento' ? usuario?.descuento_maximo_pct : usuario?.recargo_maximo_pct
  const tope =
    topePlan == null
      ? (topeUsuario ?? null)
      : topeUsuario == null
        ? topePlan
        : Math.min(topePlan, topeUsuario)
  const montoCargado = state.data[`${prefijo}Monto`] != null && state.data[`${prefijo}Monto`] !== ''
  const porcentajeCargado =
    state.data[`${prefijo}Porcentaje`] != null && state.data[`${prefijo}Porcentaje`] !== ''
  // Descuento fijo de plan (ver plan.descuento_default, cambio "mrc-plan-descuento-fijo"):
  // el backend siempre fuerza el 10% del plan para quien no tenga el permiso, sin importar
  // lo que se envíe acá — este disabled es solo cortesía visual, la regla real vive en
  // resolverDescuentos() (cotizacion.service.js).
  const bloqueado =
    prefijo === 'descuento' &&
    plan?.descuento_default != null &&
    !usuario?.puede_editar_descuento_plan

  // Permiso puramente cosmético (cambio "permiso-ver-descuento-plan"): si el campo ya está
  // bloqueado (no editable) y el usuario tampoco tiene permiso de VERLO, no se renderiza. No
  // amplía la condición de `bloqueado` (ver spec: alineación con cotizacion_combinada queda
  // fuera de alcance) — el Recargo no se ve afectado porque `bloqueado` ya está gateado a
  // `prefijo === 'descuento'`. `=== false` explícito: localStorage viejo (pre-migración) sin
  // el campo cacheado se comporta como hoy (se muestra).
  const oculto = bloqueado && usuario?.puede_ver_descuento_plan === false
  if (oculto) return ''

  // Un solo <label> visual describe 2 inputs (monto/porcentaje, mutuamente excluyentes) —
  // for/id de a uno solo no alcanza acá, así que se asocian los dos con aria-labelledby
  // sobre el mismo id de label (técnica WCAG válida para "un label, varios controles").
  const labelId = `${idParaCampo(prefijo)}-label`
  return `
    <div class="field">
      <label id="${labelId}">${label}</label>
      <div class="field-row">
        <input
          class="field-input"
          id="${idParaCampo(`${prefijo}Monto`)}"
          type="text"
          inputmode="numeric"
          data-field="${prefijo}Monto"
          data-money="true"
          placeholder="Gs."
          aria-labelledby="${labelId}"
          value="${escapeHtml(fmtGsInput(state.data[`${prefijo}Monto`]))}"
          ${porcentajeCargado || bloqueado ? 'disabled' : ''}
        />
        <input
          class="field-input"
          id="${idParaCampo(`${prefijo}Porcentaje`)}"
          type="number"
          min="0"
          data-field="${prefijo}Porcentaje"
          placeholder="%"
          aria-labelledby="${labelId}"
          value="${escapeHtml(String(state.data[`${prefijo}Porcentaje`] ?? ''))}"
          ${montoCargado || bloqueado ? 'disabled' : ''}
        />
      </div>
      <small class="field-row-hint">${bloqueado ? 'Descuento fijo del plan' : tope != null ? `Tope aplicable: ${tope}% de la prima` : 'Sin tope confirmado para este plan'}</small>
    </div>
  `
}

function renderAjustesDescuentoRecargo(plan) {
  if (!RAMOS_CON_AJUSTES.includes(state.ramoId)) return ''
  return `
    <div class="resumen-sistema__divider"></div>
    <div class="resumen-sistema__block">
      <div class="resumen-sistema__block-title">Ajustes (opcionales)</div>
      <div class="resumen-sistema__ajustes">
        ${renderAjusteField('descuento', 'Descuento', plan)}
        ${renderAjusteField('recargo', 'Recargo', plan)}
      </div>
    </div>
  `
}

// ---------------------------------------------------------------------------
// Modal de progreso de emisión — mismo patrón de modal que renderModalDetalle() de
// historial.js (admin-modal-backdrop + admin-modal + focus trap), con marcado propio
// (.progreso-carta-modal) porque cotizar/index.html no importa admin.css.
// ---------------------------------------------------------------------------

function renderModalProgresoCarta() {
  const p = state.progresoCarta
  if (!p) return ''

  const stepsHtml = PASOS_EMISION_CARTA.map((nombre, index) => {
    const estadoPaso =
      p.estado === 'error' && index === p.paso
        ? 'error'
        : index < p.paso || (index === p.paso && p.estado === 'exito')
          ? 'completado'
          : index === p.paso
            ? 'activo'
            : 'pendiente'
    const marcador =
      estadoPaso === 'completado'
        ? '<span class="progreso-step__check" aria-hidden="true">✓</span>'
        : estadoPaso === 'activo'
          ? '<span class="spinner" aria-hidden="true"></span>'
          : estadoPaso === 'error'
            ? '<span class="progreso-step__check" aria-hidden="true">!</span>'
            : `<span>${index + 1}</span>`
    return `
      <li class="progreso-step progreso-step--${estadoPaso}">
        <span class="progreso-step__marker">${marcador}</span>
        <span class="progreso-step__label">${escapeHtml(nombre)}</span>
      </li>
    `
  }).join('')

  const porcentaje = Math.round(
    ((p.estado === 'exito' ? PASOS_EMISION_CARTA.length : p.paso) / PASOS_EMISION_CARTA.length) *
      100
  )

  const permiteCerrar = p.estado === 'exito' || p.estado === 'error'

  const resultadoHtml =
    p.estado === 'exito'
      ? `
        <div class="progreso-resultado progreso-resultado--exito" role="status">
          <div><strong>Cotización generada correctamente</strong><p>La Carta Oferta está lista para revisar y descargar.</p></div>
        </div>
        <div class="admin-modal__actions">
          <button type="button" class="btn-outline" data-action="cerrar-modal-progreso-carta">Cerrar</button>
          <button type="button" class="resumen-sistema__cta" data-action="ver-pdf-carta">Ver PDF</button>
        </div>
      `
      : p.estado === 'error'
        ? `
        <div class="progreso-resultado progreso-resultado--error" role="alert">
          <div><strong>No pudimos completar la Carta Oferta</strong><p>${escapeHtml(p.error || 'Ocurrió un error inesperado.')}</p></div>
        </div>
        <div class="admin-modal__actions">
          <button type="button" class="btn-outline" data-action="cerrar-modal-progreso-carta">Cerrar</button>
          <button type="button" class="resumen-sistema__cta" data-action="reintentar-carta">Reintentar</button>
        </div>
      `
        : ''

  return `
    <div class="admin-modal-backdrop" ${permiteCerrar ? 'data-action="cerrar-modal-progreso-carta"' : ''}>
      <div class="admin-modal progreso-carta-modal" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="progreso-carta-title">
        <div class="admin-modal__title" id="progreso-carta-title">Proceso de cotización</div>
        <div class="progreso-track" role="progressbar" aria-label="Progreso de la emisión" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${porcentaje}">
          <div class="progreso-fill" style="width: ${porcentaje}%"></div>
        </div>
        <ol class="progreso-steps" aria-live="polite">
          ${stepsHtml}
        </ol>
        ${resultadoHtml}
      </div>
    </div>
  `
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
