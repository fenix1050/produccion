import { api, auth } from '../shared/api.js'
import { getRamos } from '../shared/catalogo.js'
import { atraparFoco, enfocarPrimerElemento, escapeHtml, renderBanner } from '../shared/dom.js'
import { renderSidebarFooter, renderTopbar as renderTopbarShell } from '../shared/sidebar.js'
import { fmtGsInput } from '../shared/format.js'
import { logger } from '../shared/logger.js'
import { state, app } from './state.js'
import {
  RAMOS_UI,
  RAMO_ICONOS,
  RAMOS_CON_CALCULO,
  CLIENT_FIELDS,
  MOTIVO_BLOQUEO_ID,
  DEBOUNCE_MS,
  LIMITE_REPETICION_COBERTURA_MRC,
  LIMITE_REPETICION_COBERTURA_MRC_DEFAULT,
  PASOS_EMISION_CARTA,
  COTIZADOR_VERSION,
} from './constants.js'
import {
  planEsCalculable,
  franquiciaValorPorDefecto,
  monedaEfectiva,
  descuentosParaBody,
  recargosParaBody,
  datosMinimosCompletos,
  capitalAseguradoParaBody,
  puedeAvanzarADetalle,
  coberturasDisponibles,
  quedanCoberturasAdicionalesPorAgregar,
} from './domain-rules.js'
import { prefillDatosDesdeCotizacion, idLinea, armarRiesgoDatos } from './body-builder.js'
import { idParaCampo } from './render/render-campos.js'
import { renderLivePanel, renderLivePanelContent } from './render/render-cotizacion-vivo.js'
import { renderStepper, renderResultadoView } from './render/render-detalle-plan.js'
import {
  camposEdificioContenido,
  campoSublimitePorcentaje,
  camposObjetoRiesgo,
} from './render/render-datos.js'

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
