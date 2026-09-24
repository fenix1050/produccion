import { api, auth } from '../shared/api.js'
import { atraparFoco, enfocarPrimerElemento, escapeHtml, renderBanner } from '../shared/dom.js'
import { fmtGsInput, fmtMoneda } from '../shared/format.js'
import { renderSidebarFooter, renderTopbar as renderTopbarShell } from '../shared/sidebar.js'

const app = document.getElementById('app')
const params = new URLSearchParams(window.location.search)

const state = {
  sidebarAbierta: false,
  loading: true,
  saving: false,
  saveState: '',
  banner: null,
  busqueda: '',
  cartas: [],
  carta: null,
  propuesta: null,
  conflicto: false,
  currentStep: null,
  usuario: null,
  textos: { textos: [], puede_gestionar: false, faltantes: [], emision_habilitada: false },
  // Progreso del modal de emisión — mismo patrón que state.progresoCarta en
  // frontend/cotizar/state.js. null = modal cerrado.
  // { paso: 0-1 (índice en PASOS_EMISION_PROPUESTA), estado: 'activo'|'exito'|'error', error?: string }
  progresoEmision: null,
}

let autosaveTimer = null
const AUTOSAVE_DEBOUNCE_MS = 2000
const LOGIN_PATH = '../login/'

// Mismo patrón que PASOS_EMISION_CARTA en frontend/cotizar/constants.js — el paso 0 cubre el
// guardado del borrador (guardar()) y el 1 el único await real de emitir() (POST .../emitir,
// que hace snapshot + PDF + confirmación del lado del backend en una sola llamada).
const PASOS_EMISION_PROPUESTA = ['Guardando borrador', 'Generando Propuesta Formal']

// Reuse the same compact, inline SVG convention as the shared Tajy shell without
// adding a dependency or changing the proposal API surface.
const ICON_PERSON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-6a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM12 14c-4.418 0-8 2.239-8 5v1h2v-1c0-1.304 2.691-3 6-3s6 1.696 6 3v1h2v-1c0-2.761-3.582-5-8-5Z"></path></svg>`
const ICON_PHONE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5h3l1.5 4-2 1.5a14 14 0 0 0 7 7l1.5-2 4 1.5v3a2 2 0 0 1-2 2C11.596 20.5 3.5 12.404 3.5 5.5a2 2 0 0 1 2-2Z"></path></svg>`
const ICON_LOCATION = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"></path><circle cx="12" cy="10" r="2.2"></circle></svg>`
const ICON_SHIELD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 7 3v5.5c0 4.3-2.7 7.8-7 9.5-4.3-1.7-7-5.2-7-9.5V6l7-3Z"></path><path d="m8.8 12.2 2.1 2.1 4.4-4.6"></path></svg>`

function redirectToLogin() {
  const loginUrl = new URL(LOGIN_PATH, window.location.href)
  if (loginUrl.origin !== window.location.origin) return
  window.location.assign(loginUrl.pathname)
}

// Mirror of backend/src/schemas/propuestas.schema.js (a test keeps both values equal): the risk
// description has to fit on page 1 of the Formal Proposal PDF, inside a card that cannot split.
const DESCRIPCION_DETALLADA_MAX_CARACTERES = 1000
const DESCRIPCION_DETALLADA_MAX_LINEAS = 15

function medirDescripcion(value) {
  const normalizado = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim()
  return {
    caracteres: normalizado.length,
    lineas: normalizado ? normalizado.split('\n').length : 0,
  }
}

function descripcionDetalladaExcedeLimite(value) {
  const { caracteres, lineas } = medirDescripcion(value)
  return (
    caracteres > DESCRIPCION_DETALLADA_MAX_CARACTERES || lineas > DESCRIPCION_DETALLADA_MAX_LINEAS
  )
}

function textoContadorDescripcion(value) {
  const { caracteres, lineas } = medirDescripcion(value)
  return `${caracteres}/${DESCRIPCION_DETALLADA_MAX_CARACTERES} caracteres · ${lineas}/${DESCRIPCION_DETALLADA_MAX_LINEAS} líneas`
}

function renderContadorDescripcion(value) {
  const excedido = descripcionDetalladaExcedeLimite(value)
  return `<small class="pf-field__counter${excedido ? ' pf-field__counter--excedido' : ''}" data-descripcion-contador aria-live="polite">${escapeHtml(textoContadorDescripcion(value))}${excedido ? ' — acortá la descripción para poder emitir' : ''}</small>`
}

// Updates only the counter node (no full render) so typing in the textarea keeps focus and caret.
function actualizarContadorDescripcion(textarea) {
  const contador = textarea.closest('.pf-field')?.querySelector('[data-descripcion-contador]')
  if (!contador) return
  const excedido = descripcionDetalladaExcedeLimite(textarea.value)
  contador.textContent = `${textoContadorDescripcion(textarea.value)}${excedido ? ' — acortá la descripción para poder emitir' : ''}`
  contador.classList.toggle('pf-field__counter--excedido', excedido)
}

function booleanoFormulario(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function fmtFecha(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-PY')
}

function formatearRuc(value) {
  const raw = String(value ?? '').trim()
  if (!raw || /[^\d\s.-]/.test(raw)) return raw
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const tieneVerificador = raw.includes('-') || digits.length >= 8
  const cuerpo = tieneVerificador ? digits.slice(0, -1) : digits
  const verificador = tieneVerificador ? digits.slice(-1) : ''
  return `${cuerpo}${verificador ? `-${verificador}` : ''}`
}

function formatearTelefono(value) {
  const digits = String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 9)
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean).join('-')
}

// A diferencia del RUC, la cédula NUNCA lleva dígito verificador — formatearRuc()
// asumía uno a partir de 8 dígitos, lo cual rompía cédulas largas (ver Kevin,
// 2026-09-23: "80028528-9 ... y al ser solo cédula, debería quedar como 5.592.751").
function formatearCi(value) {
  const raw = String(value ?? '').trim()
  if (!raw || /[^\d\s.]/.test(raw)) return raw
  return fmtGsInput(raw.replace(/\D/g, ''))
}

function parseGsInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : null
}

function formatearInputPreservandoCursor(target) {
  const formatter =
    target.dataset.format === 'ruc'
      ? formatearRuc
      : target.dataset.format === 'ci'
        ? formatearCi
        : target.dataset.format === 'gs'
          ? (value) => fmtGsInput(String(value ?? '').replace(/\D/g, ''))
          : target.dataset.format === 'telefono'
            ? formatearTelefono
            : null
  if (!formatter) return

  const currentValue = target.value
  const formattedValue = formatter(currentValue)
  if (formattedValue === currentValue) return
  const cursor = target.selectionStart ?? currentValue.length
  const digitsBeforeCursor = currentValue.slice(0, cursor).replace(/\D/g, '').length
  target.value = formattedValue
  if (document.activeElement !== target || typeof target.setSelectionRange !== 'function') return
  if (digitsBeforeCursor === 0) {
    target.setSelectionRange(0, 0)
    return
  }
  let seenDigits = 0
  let nextCursor = formattedValue.length
  for (let index = 0; index < formattedValue.length; index += 1) {
    if (/\d/.test(formattedValue[index])) seenDigits += 1
    if (seenDigits === digitsBeforeCursor) {
      nextCursor = index + 1
      break
    }
  }
  target.setSelectionRange(nextCursor, nextCursor)
}

function requiredMark() {
  return '<span class="pf-required-mark" aria-hidden="true">*</span>'
}

function draftActual() {
  return state.propuesta?.draft_json ?? {}
}

function valor(path, fallback = '') {
  return path.split('.').reduce((actual, key) => actual?.[key], draftActual()) ?? fallback
}

async function cargarCartas() {
  state.loading = true
  render()
  try {
    const query = new URLSearchParams({ busqueda: state.busqueda, limite: '50' })
    state.cartas = await api.get(`/propuestas/cartas-aptas?${query}`)
  } catch (error) {
    state.banner = { tipo: 'error', texto: error.message }
  } finally {
    state.loading = false
    render()
  }
}

async function abrirCarta(cartaId) {
  state.loading = true
  state.conflicto = false
  render()
  try {
    state.carta = await api.get(`/propuestas/cartas/${cartaId}`)
    const propuesta = await api.post(`/propuestas/cartas/${cartaId}/borrador`, {})
    state.propuesta = propuesta
    state.currentStep = determinarPasoInicial(propuesta)
    state.saveState = propuesta.creado ? 'Borrador creado' : 'Borrador recuperado'
    const url = new URL(window.location.href)
    url.searchParams.delete('propuesta')
    url.searchParams.set('carta', cartaId)
    window.history.replaceState({}, '', url)
  } catch (error) {
    state.banner = { tipo: 'error', texto: error.message }
    state.carta = null
    state.propuesta = null
  } finally {
    state.loading = false
    render()
  }
}

async function abrirPropuesta(propuestaId) {
  state.loading = true
  state.conflicto = false
  render()
  try {
    const propuesta = await api.get(`/propuestas/${propuestaId}`)
    state.carta = propuesta.carta_detalle
    state.propuesta = propuesta
    state.currentStep = determinarPasoInicial(propuesta)
    state.saveState = 'Propuesta cargada'
    const url = new URL(window.location.href)
    url.searchParams.delete('carta')
    url.searchParams.set('propuesta', propuestaId)
    window.history.replaceState({}, '', url)
  } catch (error) {
    state.banner = { tipo: 'error', texto: error.message }
    state.carta = null
    state.propuesta = null
  } finally {
    state.loading = false
    render()
  }
}

async function recargarBorrador() {
  if (!state.propuesta) return
  try {
    state.propuesta = await api.get(`/propuestas/${state.propuesta.id}`)
    state.currentStep = determinarPasoInicial(state.propuesta)
    state.conflicto = false
    state.saveState = 'Versión actual cargada'
    render()
  } catch (error) {
    state.banner = { tipo: 'error', texto: error.message }
    render()
  }
}

function leerFormulario() {
  const form = app.querySelector('#propuesta-form')
  if (!form) return null
  const data = new FormData(form)
  const has = (name) => Boolean(form.elements.namedItem(name))
  const text = (name) => data.get(name)?.trim() || undefined
  const previous = draftActual()
  const previousParts = previous.partes ?? {}
  const previousInsured = previousParts.asegurado ?? {}
  const previousTomador = previousParts.tomador ?? {}
  const previousRepresentative = previousParts.representante_legal ?? {}
  const previousPlaFt = previous.pla_ft ?? {}
  const asegurado = { ...previousInsured }
  const tomador = { ...previousTomador }
  const representanteLegal = { ...previousRepresentative }
  const plaFt = { ...previousPlaFt }

  const insuredFields = {
    tipo_persona: (value) => value || undefined,
    nombre_razon_social: () => text('nombre_razon_social'),
    documento_tipo: (value) => value || undefined,
    documento: () => text('documento'),
    ruc: () => text('ruc'),
    telefono: () => text('telefono'),
    email: () => text('email'),
    direccion: () => text('direccion'),
    actividad_economica: () => text('actividad_economica'),
    fecha_nacimiento: (value) => value || undefined,
    sexo: (value) => value || undefined,
    nacionalidad: () => text('nacionalidad'),
    estado_civil: () => text('estado_civil'),
    ocupacion: () => text('ocupacion'),
    ciudad: () => text('ciudad'),
    ingreso_mensual: (value) => parseGsInput(value),
    lugar_trabajo: () => text('lugar_trabajo'),
  }
  Object.entries(insuredFields).forEach(([name, transform]) => {
    if (has(name)) asegurado[name] = transform(data.get(name))
  })

  const tomadorFields = {
    nombre_razon_social: 'tomador_nombre',
    documento: 'tomador_documento',
    direccion: 'tomador_direccion',
    ciudad: 'tomador_ciudad',
    telefono: 'tomador_telefono',
    email: 'tomador_email',
  }
  Object.entries(tomadorFields).forEach(([name, fieldName]) => {
    if (has(fieldName)) tomador[name] = text(fieldName)
  })
  const representativeFields = {
    nombre: 'representante_nombre',
    documento: 'representante_documento',
    cargo: 'representante_cargo',
  }
  Object.entries(representativeFields).forEach(([name, fieldName]) => {
    if (has(fieldName)) representanteLegal[name] = text(fieldName)
  })

  const booleanFields = {
    es_pep: 'es_pep',
    sujeto_obligado: 'sujeto_obligado',
    proveedor_estado: 'proveedor_estado',
  }
  Object.entries(booleanFields).forEach(([name, fieldName]) => {
    if (has(fieldName)) plaFt[name] = booleanoFormulario(data.get(fieldName))
  })
  if (has('pep_institucion')) plaFt.pep_institucion = text('pep_institucion')
  if (has('pep_cargo')) plaFt.pep_cargo = text('pep_cargo')
  if (has('origen_fondos_descripcion'))
    plaFt.origen_fondos_descripcion = text('origen_fondos_descripcion')

  const draft = {
    ...previous,
    partes: {
      ...previousParts,
      asegurado,
      tomador,
      representante_legal: representanteLegal,
    },
    pla_ft: plaFt,
  }
  if (has('tomador_igual_asegurado')) {
    draft.partes.tomador_igual_asegurado = data.get('tomador_igual_asegurado') === 'on'
  }
  if (has('descripcion_detallada')) draft.descripcion_detallada = text('descripcion_detallada')
  if (has('observaciones')) draft.observaciones = text('observaciones')
  if (has('tipo_firma')) draft.tipo_firma = data.get('tipo_firma') || undefined
  return draft
}

function seleccionActual() {
  const varianteElement = app.querySelector('#cotizacion-variante-id')
  const planElement = app.querySelector('#cotizacion-plan-pago-id')
  const varianteId = varianteElement
    ? Number(varianteElement.value) || null
    : (state.propuesta?.cotizacion_variante_id ?? null)
  const planPagoId = planElement
    ? Number(planElement.value) || null
    : (state.propuesta?.cotizacion_plan_pago_id ?? null)
  return { varianteId, planPagoId }
}

function capturarVistaFormulario() {
  const form = app.querySelector('#propuesta-form')
  const active = document.activeElement
  if (!form || !active || !form.contains(active)) return null

  return {
    activeFieldId: active.id,
    activeFieldName: active.name,
    activeFieldIndex: Array.from(form.elements).indexOf(active),
    selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    selectionDirection: active.selectionDirection,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  }
}

function renderPreservandoVista() {
  const vista = capturarVistaFormulario()
  render()
  if (!vista) return

  const form = app.querySelector('#propuesta-form')
  const field =
    (vista.activeFieldId && document.getElementById(vista.activeFieldId)) ||
    (vista.activeFieldIndex >= 0 ? form?.elements[vista.activeFieldIndex] : null) ||
    (vista.activeFieldName
      ? Array.from(form?.elements ?? []).find((element) => element.name === vista.activeFieldName)
      : null)
  field?.focus({ preventScroll: true })
  if (field && vista.selectionStart !== null && typeof field.setSelectionRange === 'function') {
    field.setSelectionRange(vista.selectionStart, vista.selectionEnd, vista.selectionDirection)
  }
  if (typeof window.scrollTo === 'function') window.scrollTo(vista.scrollX, vista.scrollY)
}

async function guardar({ silencioso = false } = {}) {
  if (!state.propuesta || state.saving || state.conflicto) return false
  const draft = leerFormulario()
  const { varianteId, planPagoId } = seleccionActual()
  if (Boolean(varianteId) !== Boolean(planPagoId)) {
    state.banner = {
      tipo: 'error',
      texto: 'Seleccione una variante y una forma de pago compatibles.',
    }
    renderPreservandoVista()
    return false
  }

  state.saving = true
  state.saveState = 'Guardando…'
  renderSaveIndicator()
  try {
    state.propuesta = await api.put(`/propuestas/${state.propuesta.id}`, {
      revision: state.propuesta.revision,
      cotizacion_variante_id: varianteId,
      cotizacion_plan_pago_id: planPagoId,
      draft_json: draft,
    })
    state.saveState = `Guardado · revisión ${state.propuesta.revision}`
    state.banner = null
    if (!silencioso) render()
    return true
  } catch (error) {
    if (error.body?.codigo === 'PF_REVISION_CONFLICT') {
      state.conflicto = true
      state.saveState = 'Conflicto de revisión'
      state.banner = {
        tipo: 'error',
        texto:
          'Este borrador cambió en otra pestaña. Recargue la versión actual antes de continuar.',
      }
    } else {
      state.saveState = 'No guardado'
      state.banner = { tipo: 'error', texto: error.message }
    }
    renderPreservandoVista()
    return false
  } finally {
    state.saving = false
    renderSaveIndicator()
  }
}

// Elemento con foco al abrir el modal de progreso de emisión — se le devuelve el foco al
// cerrar (mismo patrón que elementoDisparadorModalCarta en cotizar/actions.js).
let elementoDisparadorModalEmision = null

async function emitir() {
  if (state.progresoEmision?.estado === 'activo') return
  const readiness = obtenerReadinessActual()
  if (!readiness.listo) {
    state.currentStep = [1, 2, 3, 4].find((step) => !pasoListo(step, readiness)) ?? 2
    render()
    return
  }

  elementoDisparadorModalEmision = document.activeElement
  state.progresoEmision = { paso: 0, estado: 'activo' }
  render()
  enfocarPrimerElemento(app.querySelector('.progreso-carta-modal'))

  const saved = await guardar({ silencioso: true })
  if (!saved || state.conflicto) {
    state.progresoEmision = {
      paso: 0,
      estado: 'error',
      error: state.banner?.texto ?? 'No se pudo guardar el borrador.',
    }
    render()
    enfocarPrimerElemento(app.querySelector('.progreso-carta-modal'))
    return
  }

  state.progresoEmision = { paso: 1, estado: 'activo' }
  state.saving = true
  render()
  try {
    const proposal = await api.post(`/propuestas/${state.propuesta.id}/emitir`, {
      revision: state.propuesta.revision,
    })
    state.propuesta = { ...state.propuesta, ...proposal }
    state.progresoEmision = { paso: 1, estado: 'exito' }
    state.banner = { tipo: 'success', texto: `Propuesta N° ${proposal.numero_propuesta} emitida.` }
  } catch (error) {
    state.progresoEmision = { paso: 1, estado: 'error', error: error.message }
  } finally {
    state.saving = false
    render()
    enfocarPrimerElemento(app.querySelector('.progreso-carta-modal'))
  }
}

// Cierra el modal de progreso de emisión — solo llamable desde estados terminales
// ('exito'/'error'), nunca mientras está 'activo' (mismo patrón que
// cerrarModalProgresoCarta() en cotizar/actions.js).
function cerrarModalProgresoEmision() {
  if (state.progresoEmision?.estado === 'activo') return
  state.progresoEmision = null
  render()
  if (elementoDisparadorModalEmision) {
    elementoDisparadorModalEmision.focus()
    elementoDisparadorModalEmision = null
  }
}

async function descargarPdf() {
  try {
    const blob = await api.getBlob(`/propuestas/${state.propuesta.id}/pdf`)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `propuesta-${state.propuesta.numero_propuesta}.pdf`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    state.banner = { tipo: 'error', texto: error.message }
    render()
  }
}

async function anular() {
  const motivo = window.prompt('Indique el motivo de la anulación:')
  if (!motivo?.trim()) return
  try {
    const proposal = await api.post(`/propuestas/${state.propuesta.id}/anular`, { motivo })
    state.propuesta = { ...state.propuesta, ...proposal }
    state.banner = {
      tipo: 'success',
      texto: 'Propuesta anulada. Puede emitir un reemplazo desde esta Carta Oferta.',
    }
  } catch (error) {
    state.banner = { tipo: 'error', texto: error.message }
  }
  render()
}

function programarAutosave() {
  window.clearTimeout(autosaveTimer)
  if (state.propuesta) {
    state.propuesta.draft_json = leerFormulario() ?? state.propuesta.draft_json
    const { varianteId, planPagoId } = seleccionActual()
    state.propuesta.cotizacion_variante_id = varianteId
    state.propuesta.cotizacion_plan_pago_id = planPagoId
    if (Boolean(varianteId) !== Boolean(planPagoId)) {
      state.saveState = 'Seleccione una forma de pago'
      renderSaveIndicator()
      return
    }
  }
  state.saveState = 'Cambios pendientes'
  renderSaveIndicator()
  autosaveTimer = window.setTimeout(() => guardar({ silencioso: true }), AUTOSAVE_DEBOUNCE_MS)
}

function renderSaveIndicator() {
  app.querySelectorAll('[data-save-indicator]').forEach((indicator) => {
    indicator.textContent = state.saveState
  })
}

function sanitizarMarkup(markup) {
  const parsed = new DOMParser().parseFromString(markup, 'text/html')
  parsed
    .querySelectorAll('script, iframe, object, embed, style')
    .forEach((element) => element.remove())
  parsed.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || ['href', 'src', 'action'].includes(name)) {
        if (name.startsWith('on') || /^\s*javascript:/i.test(attribute.value)) {
          element.removeAttribute(attribute.name)
        }
      }
    })
  })
  return Array.from(parsed.body.childNodes)
}

// Modal de progreso de emisión — mismo marcado y clases (.progreso-carta-modal y afines,
// definidas en shared/cotizador.css) que renderModalProgresoCarta() en
// frontend/cotizar/render/render-shell.js, reusadas tal cual para que la emisión de una
// Propuesta Formal tenga la misma animación que emitir una Carta Oferta en el cotizador.
// Sin botón "Ver PDF" en el estado de éxito: a diferencia del cotizador (que recién crea el
// PDF acá), esta pantalla ya ofrece "Descargar PDF" de forma permanente una vez emitida.
function renderModalProgresoEmision() {
  const p = state.progresoEmision
  if (!p) return ''

  const stepsHtml = PASOS_EMISION_PROPUESTA.map((nombre, index) => {
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
    ((p.estado === 'exito' ? PASOS_EMISION_PROPUESTA.length : p.paso) /
      PASOS_EMISION_PROPUESTA.length) *
      100
  )

  const permiteCerrar = p.estado === 'exito' || p.estado === 'error'

  const resultadoHtml =
    p.estado === 'exito'
      ? `
        <div class="progreso-resultado progreso-resultado--exito" role="status">
          <div><strong>Propuesta Formal emitida</strong><p>El PDF interno quedó listo para descargar.</p></div>
        </div>
        <div class="admin-modal__actions">
          <button type="button" class="resumen-sistema__cta" data-action="cerrar-modal-progreso-emision">Cerrar</button>
        </div>
      `
      : p.estado === 'error'
        ? `
        <div class="progreso-resultado progreso-resultado--error" role="alert">
          <div><strong>No pudimos emitir la Propuesta Formal</strong><p>${escapeHtml(p.error || 'Ocurrió un error inesperado.')}</p></div>
        </div>
        <div class="admin-modal__actions">
          <button type="button" class="btn-outline" data-action="cerrar-modal-progreso-emision">Cerrar</button>
          <button type="button" class="resumen-sistema__cta" data-action="reintentar-emision">Reintentar</button>
        </div>
      `
        : ''

  return `
    <div class="admin-modal-backdrop" ${permiteCerrar ? 'data-action="cerrar-modal-progreso-emision"' : ''}>
      <div class="admin-modal progreso-carta-modal" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="progreso-emision-title">
        <div class="admin-modal__title" id="progreso-emision-title">Emisión de la Propuesta Formal</div>
        <div class="progreso-track" role="progressbar" aria-label="Progreso de la emisión" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${porcentaje}">
          <div class="progreso-fill" style="width: ${porcentaje}%"></div>
        </div>
        <ol class="progreso-steps" aria-live="polite">
          ${stepsHtml}
        </ol>
        <div class="progreso-terminal-slot">
          <div class="progreso-terminal-slot__content">${resultadoHtml}</div>
        </div>
      </div>
    </div>
  `
}

function render() {
  const markup = `
    ${renderTopbarShell({
      sidebarAbierta: state.sidebarAbierta,
      active: 'propuestas',
      breadcrumb:
        '<div class="topbar__breadcrumb"><span class="topbar__crumb-item topbar__crumb-item--current">Propuesta Formal</span></div>',
    })}
    <div class="app-body">
      <div class="sidebar-overlay ${state.sidebarAbierta ? 'sidebar-overlay--visible' : ''}" data-action="close-sidebar"></div>
      <aside class="sidebar ${state.sidebarAbierta ? 'sidebar--abierta' : ''}">
        <div class="sidebar__nav"><div class="sidebar__section-label">Gestión</div>${renderSidebarFooter('propuestas')}</div>
      </aside>
      <main class="main main--propuestas">
        <div class="main-header">
          <div><div class="main-header__title">Preparar Propuesta Formal</div><div class="main-header__subtitle">Borrador MRC basado en una Carta Oferta emitida</div></div>
          ${state.propuesta ? `<div class="pf-save" data-save-indicator role="status" aria-live="polite">${escapeHtml(state.saveState)}</div>` : ''}
        </div>
        <div class="admin-content pf-content">
          ${renderBanner(state.banner)}
          ${state.loading ? '<div class="pf-loading"><span class="spinner"></span> Cargando…</div>' : state.propuesta ? renderEditor() : renderSelector()}
        </div>
      </main>
        </div>
    ${renderModalProgresoEmision()}`
  app.replaceChildren(...sanitizarMarkup(markup))
}

function renderSelector() {
  const cartas = state.cartas
    .map(
      (carta) => `
      <button type="button" class="pf-carta" data-action="abrir-carta" data-id="${escapeHtml(carta.id)}">
        <div><span class="pf-carta__numero">${escapeHtml(carta.numero_carta)} · v${escapeHtml(carta.version)}</span><strong>${escapeHtml(carta.cliente_nombre || 'Sin cliente')}</strong></div>
        <div class="pf-carta__meta"><span>Vence ${fmtFecha(carta.fecha_vencimiento)}</span><span>${carta.propuesta_borrador_id ? 'Borrador existente' : 'Sin iniciar'}</span></div>
      </button>`
    )
    .join('')

  return `
    <section class="panel card pf-selector">
      <div class="card__title">Carta Oferta de origen</div>
      <div class="card__body">
        <form class="pf-search" id="pf-search"><label for="pf-busqueda">Buscar por número o cliente</label><div><input class="field-input" id="pf-busqueda" value="${escapeHtml(state.busqueda)}" placeholder="Ej.: MRC-104 o razón social" /><button class="btn-primary" type="submit">Buscar</button></div></form>
        <div class="pf-cartas">${cartas || '<p class="pf-empty">No hay Cartas Oferta MRC aptas con este criterio.</p>'}</div>
      </div>
    </section>`
}

function renderEditor() {
  const carta = state.carta
  const propuesta = state.propuesta
  const variantes = carta.variantes ?? []
  const { varianteId, planPagoId } = seleccionActual()
  // MRC/Incendio/Vida-AP always generate one variant per quotation; select it silently.
  const varianteUnica = variantes.length === 1 ? variantes[0] : null
  const varianteActual = variantes.find((item) => item.id === varianteId) ?? varianteUnica
  const pagos = varianteActual?.cotizacion_plan_pago ?? []
  const readiness = obtenerReadinessActual()
  const emitted = ['emitida', 'anulada'].includes(propuesta.estado)
  const currentStep = state.currentStep ?? determinarPasoInicial(propuesta)
  const readinessPercent = calcularWizardReadinessPercent(propuesta, readiness)
  const pendientes = readiness.pendientes ?? []
  const pendientesActuales = pendientesDelPaso(pendientes, currentStep)

  return `
        ${renderWizardProgress(propuesta, readiness, currentStep)}
        <div class="pf-layout">
          <div class="pf-main">
            <section class="pf-origin" aria-label="Carta Oferta de origen">
              <div class="pf-origin__icon" aria-hidden="true">▣</div>
              <div class="pf-origin__content">
                <div class="pf-origin__topline"><span class="pf-origin__eyebrow">Origen verificado</span><button type="button" class="pf-back" data-action="volver-selector">← Cambiar Carta</button></div>
                <strong>${escapeHtml(carta.numero_carta)} · versión ${escapeHtml(carta.version)}</strong>
                <small>${escapeHtml(carta.cliente_nombre || 'Sin cliente')} · ${escapeHtml(carta.plan?.nombre || 'MRC')}</small>
                <div class="pf-origin__details"><span>Documento base de la propuesta</span><span>Estado: ${escapeHtml(carta.estado || 'Emitida')}</span></div>
              </div>
            </section>
            ${state.conflicto ? '<button type="button" class="btn-outline" data-action="recargar-borrador">Recargar versión actual</button>' : ''}
            <form id="propuesta-form" class="pf-form"><fieldset class="pf-form__fieldset" ${emitted ? 'disabled' : ''}>
              ${renderStepPanel(currentStep, variantes, varianteActual, pagos, planPagoId, carta.moneda, propuesta)}
            </fieldset></form>
            ${renderWizardActions(propuesta, emitted, readiness, currentStep)}
          </div>
          <aside class="pf-review" aria-label="Resumen de revisión">
            <div class="pf-review__eyebrow">REVISIÓN INFORMATIVA</div>
            <div class="pf-review__heading"><div><span class="pf-review__kicker">Estado del borrador</span><h2>Progreso de la propuesta</h2></div><span class="pf-review__status ${readiness.listo ? 'pf-review__status--ready' : ''}" aria-hidden="true">${readiness.listo ? '✓' : '!'}</span></div>
            <div class="pf-review__meter-wrap"><div class="pf-review__meter-label"><span>Progreso de revisión</span><strong>${readinessPercent}%</strong></div><div class="pf-review__meter" role="progressbar" aria-label="Progreso de la propuesta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${readinessPercent}"><span class="${readinessPercent === 100 ? 'pf-review__meter-fill--complete' : ''}" style="width: ${readinessPercent}%"></span></div></div>
            <p class="pf-review__summary">${pendientes.length ? `Faltan ${escapeHtml(pendientes.length)} ${pendientes.length === 1 ? 'campo' : 'campos'} por completar` : 'Todos los campos requeridos están completos.'}</p>
            ${pendientes.length ? '<p class="pf-review__next">Completa la información para continuar.</p>' : ''}
            ${renderReviewStatuses(readiness, currentStep)}
            <div class="pf-review__pending-header"><strong>Campos pendientes en este paso</strong><span>${pendientesActuales.length}</span></div>
            <ul class="pf-pending-list">${pendientesActuales.length ? pendientesActuales.map((item) => `<li><span aria-hidden="true">!</span>${escapeHtml(etiquetaPendiente(item))}</li>`).join('') : '<li class="pf-pending-list__empty"><span aria-hidden="true">✓</span>No hay campos pendientes en este paso</li>'}</ul>
            ${renderReviewTip(currentStep, readiness, pendientes.length)}
            ${renderReplacementHistory(propuesta)}
          </aside>
        </div>`
}

function renderStepPanel(
  step,
  variantes,
  varianteActual,
  pagos,
  pagoSeleccionado,
  moneda,
  propuesta
) {
  if (step === 1) return renderSeleccion(variantes, varianteActual, pagos, pagoSeleccionado, moneda)
  if (step === 2) return renderAseguradoPanel()
  if (step === 3) return renderTomadorPanel()
  if (step === 4) return renderValidacionesPanel()
  return renderRevisionPanel(propuesta)
}

function renderAseguradoPanel() {
  const tipoPersona = valor('partes.asegurado.tipo_persona')
  const tipoDocumento = valor('partes.asegurado.documento_tipo', 'ci')
  return `<section class="pf-step-panel">
    <header class="pf-section-heading">
      <span class="pf-section-heading__icon" aria-hidden="true">${ICON_PERSON}</span>
      <div><h2>Datos del asegurado</h2><p>Completa la información de la persona o empresa que será asegurada.</p></div>
    </header>
    <div class="pf-subcards">
      <section class="pf-subcard" aria-labelledby="pf-personal-title">
        <header class="pf-subcard__header"><span class="pf-subcard__icon" aria-hidden="true">${ICON_PERSON}</span><div><h3 id="pf-personal-title">Datos personales</h3><p>Información básica del asegurado.</p></div></header>
        <div class="pf-subcard__body pf-fields">
          ${selectField(
            'tipo_persona',
            'Tipo de persona',
            [
              ['', 'Seleccione'],
              ['fisica', 'Persona física'],
              ['juridica', 'Persona jurídica'],
            ],
            tipoPersona,
            true
          )}
          ${inputField('nombre_razon_social', 'Nombre o razón social', valor('partes.asegurado.nombre_razon_social'), 'text', true)}
          ${selectField(
            'documento_tipo',
            'Tipo de documento',
            [
              ['ci', 'C.I.'],
              ['ruc', 'R.U.C.'],
            ],
            tipoDocumento,
            true
          )}
          ${
            tipoDocumento === 'ruc'
              ? inputField('ruc', 'R.U.C.', valor('partes.asegurado.ruc'), 'text', true, {
                  format: 'ruc',
                })
              : inputField('documento', 'C.I.', valor('partes.asegurado.documento'), 'text', true, {
                  format: 'ci',
                })
          }
          ${inputField('actividad_economica', 'Actividad económica', valor('partes.asegurado.actividad_economica'), 'text', true)}
          ${inputField('fecha_nacimiento', 'Fecha de nacimiento', valor('partes.asegurado.fecha_nacimiento'), 'date', tipoPersona === 'fisica')}
          ${selectField(
            'sexo',
            'Sexo',
            [
              ['', 'Seleccione'],
              ['Femenino', 'Femenino'],
              ['Masculino', 'Masculino'],
            ],
            valor('partes.asegurado.sexo'),
            tipoPersona === 'fisica'
          )}
          ${inputField('nacionalidad', 'Nacionalidad', valor('partes.asegurado.nacionalidad'), 'text', tipoPersona === 'fisica')}
          ${inputField('estado_civil', 'Estado civil', valor('partes.asegurado.estado_civil'), 'text', tipoPersona === 'fisica')}
          ${inputField('ocupacion', 'Ocupación', valor('partes.asegurado.ocupacion'), 'text', tipoPersona === 'fisica')}
          ${inputField('ingreso_mensual', 'Ingreso mensual (opcional)', valor('partes.asegurado.ingreso_mensual'), 'text', false, { format: 'gs', inputMode: 'numeric' })}
          ${inputField('lugar_trabajo', 'Lugar de trabajo (opcional)', valor('partes.asegurado.lugar_trabajo'))}
        </div>
      </section>
      <section class="pf-subcard" aria-labelledby="pf-contact-title">
        <header class="pf-subcard__header"><span class="pf-subcard__icon" aria-hidden="true">${ICON_PHONE}</span><div><h3 id="pf-contact-title">Contacto</h3><p>Medios de contacto del asegurado.</p></div></header>
        <div class="pf-subcard__body pf-fields">
          ${phoneField('telefono', 'Teléfono', valor('partes.asegurado.telefono'), true)}
          ${inputField('email', 'Correo electrónico', valor('partes.asegurado.email'), 'email', true)}
        </div>
      </section>
      <section class="pf-subcard" aria-labelledby="pf-address-title">
        <header class="pf-subcard__header"><span class="pf-subcard__icon" aria-hidden="true">${ICON_LOCATION}</span><div><h3 id="pf-address-title">Dirección</h3><p>Domicilio del asegurado.</p></div></header>
        <div class="pf-subcard__body pf-fields">
          ${inputField('ciudad', 'Ciudad', valor('partes.asegurado.ciudad'), 'text', true)}
          <label class="pf-field pf-field--wide"><span>Dirección${requiredMark()}</span><textarea name="direccion" rows="2" required>${escapeHtml(valor('partes.asegurado.direccion'))}</textarea></label>
        </div>
      </section>
    </div>
  </section>`
}

function renderTomadorPanel() {
  const igual = valor('partes.tomador_igual_asegurado', true)
  const tipoPersona = valor('partes.asegurado.tipo_persona')
  const required = igual === false
  return `<section class="pf-step-panel">
    <header class="pf-section-heading">
      <span class="pf-section-heading__icon" aria-hidden="true">${ICON_PERSON}</span>
      <div><h2>Datos del tomador</h2><p>Confirmá la relación con el asegurado y la representación legal.</p></div>
    </header>
    <div class="pf-subcards">
      <section class="pf-subcard" aria-labelledby="pf-tomador-title">
        <header class="pf-subcard__header"><div><h3 id="pf-tomador-title">Tomador</h3><p>Indicá si es la misma persona o completá sus datos.</p></div></header>
        <div class="pf-subcard__body pf-fields">
          <label class="pf-check pf-field--wide"><input type="checkbox" name="tomador_igual_asegurado" ${igual ? 'checked' : ''} /> El tomador es la misma persona que el asegurado</label>
          ${igual ? '<p class="pf-inline-note pf-field--wide">Se utilizarán los datos del asegurado para el tomador.</p>' : `${inputField('tomador_nombre', 'Nombre o razón social', valor('partes.tomador.nombre_razon_social'), 'text', required)}${inputField('tomador_documento', 'Documento del tomador', valor('partes.tomador.documento'), 'text', required, { format: 'ruc' })}${inputField('tomador_direccion', 'Dirección del tomador', valor('partes.tomador.direccion'), 'text', required)}${inputField('tomador_ciudad', 'Ciudad del tomador', valor('partes.tomador.ciudad'), 'text', required)}${inputField('tomador_telefono', 'Teléfono del tomador', valor('partes.tomador.telefono'), 'text', required)}${inputField('tomador_email', 'Correo del tomador', valor('partes.tomador.email'), 'email', required)}`}
        </div>
      </section>
      ${tipoPersona === 'juridica' ? `<section class="pf-subcard" aria-labelledby="pf-representative-title"><header class="pf-subcard__header"><div><h3 id="pf-representative-title">Representante legal</h3><p>Completá los datos de quien firma en nombre de la persona jurídica.</p></div></header><div class="pf-subcard__body pf-fields">${inputField('representante_nombre', 'Nombre del representante', valor('partes.representante_legal.nombre'), 'text', true)}${inputField('representante_documento', 'Documento del representante', valor('partes.representante_legal.documento'), 'text', true, { format: 'ruc' })}${inputField('representante_cargo', 'Cargo del representante', valor('partes.representante_legal.cargo'), 'text', true)}</div></section>` : ''}
    </div>
  </section>`
}

function renderValidacionesPanel() {
  return `<section class="pf-step-panel">
    <header class="pf-section-heading">
      <span class="pf-section-heading__icon" aria-hidden="true">✓</span>
      <div><h2>Validaciones</h2><p>Completá los datos de cumplimiento y perfil que forman parte de la propuesta.</p></div>
    </header>
    <div class="pf-subcards">
      <section class="pf-subcard" aria-labelledby="pf-pla-title">
        <header class="pf-subcard__header"><div><h3 id="pf-pla-title">Declaraciones PLA-FT</h3><p>Respondé según la información disponible.</p></div></header>
        <div class="pf-subcard__body pf-fields">
          ${selectField(
            'es_pep',
            '¿Es una Persona Expuesta Políticamente?',
            [
              ['', 'Seleccione'],
              ['false', 'No'],
              ['true', 'Sí'],
            ],
            String(valor('pla_ft.es_pep', ''))
          )}
          ${inputField('pep_institucion', 'Institución pública', valor('pla_ft.pep_institucion'))}
          ${inputField('pep_cargo', 'Cargo público', valor('pla_ft.pep_cargo'))}
        </div>
      </section>
      <section class="pf-subcard" aria-labelledby="pf-profile-title">
        <header class="pf-subcard__header"><div><h3 id="pf-profile-title">Perfil regulatorio</h3><p>Conservá las respuestas declaradas por el asegurado.</p></div></header>
        <div class="pf-subcard__body pf-fields">
          ${selectField(
            'sujeto_obligado',
            '¿Es sujeto obligado?',
            [
              ['', 'Seleccione'],
              ['false', 'No'],
              ['true', 'Sí'],
            ],
            String(valor('pla_ft.sujeto_obligado', ''))
          )}
          ${selectField(
            'proveedor_estado',
            '¿Es proveedor o contratista del Estado?',
            [
              ['', 'Sin responder'],
              ['false', 'No'],
              ['true', 'Sí'],
            ],
            String(valor('pla_ft.proveedor_estado', ''))
          )}
          <label class="pf-field pf-field--wide"><span>Origen de fondos (opcional)</span><textarea name="origen_fondos_descripcion" rows="3">${escapeHtml(valor('pla_ft.origen_fondos_descripcion'))}</textarea></label>
        </div>
      </section>
    </div>
  </section>`
}

function renderRevisionPanel(propuesta) {
  const insured = valor('partes.asegurado.nombre_razon_social') || 'Sin completar'
  const document = valor('partes.asegurado.documento') || 'Sin completar'
  const signature = valor('tipo_firma') || 'Sin seleccionar'
  return `<section class="pf-step-panel">
    <header class="pf-section-heading">
      <span class="pf-section-heading__icon" aria-hidden="true">05</span>
      <div><h2>Revisión y emisión</h2><p>Verificá el resumen antes de ejecutar una acción.</p></div>
    </header>
    <div class="pf-subcards">
      <section class="pf-subcard" aria-labelledby="pf-signature-title">
        <header class="pf-subcard__header"><div><h3 id="pf-signature-title">Firma y descripción</h3><p>Completá los datos finales de la Propuesta Formal.</p></div></header>
        <div class="pf-subcard__body pf-fields">
          ${selectField(
            'tipo_firma',
            'Modalidad de firma',
            [
              ['', 'Seleccione'],
              ['manual', 'Manual'],
              ['digital', 'Digital'],
            ],
            valor('tipo_firma'),
            true
          )}
          <label class="pf-field pf-field--wide"><span>Descripción detallada (opcional)</span><textarea name="descripcion_detallada" rows="3" maxlength="${DESCRIPCION_DETALLADA_MAX_CARACTERES}">${escapeHtml(valor('descripcion_detallada'))}</textarea>${renderContadorDescripcion(valor('descripcion_detallada'))}</label>
          <label class="pf-field pf-field--wide"><span>Observaciones (opcional)</span><textarea name="observaciones" rows="3">${escapeHtml(valor('observaciones'))}</textarea></label>
        </div>
      </section>
      <section class="pf-subcard" aria-labelledby="pf-final-review-title">
        <header class="pf-subcard__header"><div><h3 id="pf-final-review-title">Revisión final</h3><p>Estos datos se conservarán junto con la emisión.</p></div></header>
        <div class="pf-subcard__body pf-review-summary"><div><span>Asegurado</span><strong>${escapeHtml(insured)}</strong></div><div><span>Documento</span><strong>${escapeHtml(document)}</strong></div><div><span>Firma</span><strong>${escapeHtml(signature)}</strong></div><p>${propuesta.estado === 'borrador' ? 'La emisión generará y conservará el PDF interno de la Propuesta Formal.' : 'Esta propuesta conserva sus acciones de emisión y gestión en este paso.'}</p></div>
      </section>
    </div>
  </section>`
}

// Mismo criterio que puedeAnular() en backend/src/services/propuestas/listado.service.js
// y el guard de emision.service.js:142 — el listado ya lo respeta vía el flag puede_anular
// que manda el backend, pero este wizard (recién emitida) no tenía ningún chequeo de rol.
function puedeAnular(usuario) {
  return Boolean(usuario) && (usuario.rol === 'admin' || Boolean(usuario.puede_anular_propuestas))
}

function renderAccionSecundariaEmitida(propuesta) {
  if (propuesta.estado !== 'emitida') {
    return '<button type="button" class="btn-outline" data-action="reemplazar">Preparar reemplazo</button>'
  }
  if (!puedeAnular(state.usuario)) return ''
  return '<button type="button" class="btn-outline" data-action="anular">Anular Propuesta</button>'
}

function renderWizardActions(propuesta, emitted, readiness, currentStep) {
  const navigation =
    !emitted && currentStep > 1
      ? '<button type="button" class="btn-outline" data-action="paso-atras">Atrás</button>'
      : ''
  const next =
    currentStep < 5
      ? '<button type="button" class="btn-primary" data-action="paso-continuar">Continuar</button>'
      : ''
  const saveAction = `<button type="button" class="btn-primary pf-save-button" data-action="guardar" ${state.saving || state.conflicto ? 'disabled' : ''}>Guardar borrador</button>`
  const finalActions = emitted
    ? `<button type="button" class="btn-primary" data-action="descargar-pdf">Descargar PDF</button>${renderAccionSecundariaEmitida(propuesta)}`
    : currentStep === 5
      ? `${saveAction}<button type="button" class="btn-outline pf-emit" data-action="emitir" ${!readiness.emision_habilitada || !state.textos.emision_habilitada || state.saving || state.conflicto ? 'disabled' : ''}>Emitir Propuesta Formal</button>`
      : `${saveAction}${next}`
  return `<div class="pf-actions-bar"><div class="pf-actions-bar__status"><span class="pf-actions-bar__dot ${emitted ? 'pf-actions-bar__dot--complete' : ''}" aria-hidden="true"></span><div><strong>${emitted ? 'Documento emitido' : 'Borrador editable'}</strong><small data-save-indicator role="status" aria-live="polite">${escapeHtml(state.saveState)}</small></div></div><div class="pf-actions-bar__back">${navigation}</div><div class="pf-actions-bar__buttons">${finalActions}</div>${!emitted && currentStep === 5 ? `<small class="pf-actions-bar__hint">${state.textos.emision_habilitada ? 'La emisión genera y conserva un PDF interno sin firma.' : `Faltan textos oficiales MRC: ${(state.textos.faltantes ?? []).map((item) => escapeHtml(item)).join(', ') || 'cargando textos'}.`}</small>` : ''}</div>`
}

function renderReviewTip(currentStep, readiness, pendientesCount) {
  const tips = {
    1: [
      'Selección comercial',
      'Elegí únicamente una variante y una forma de pago que ya estén presentes en la Carta Oferta.',
    ],
    2: [
      'Datos del asegurado',
      'Usá la información declarada en la Carta y completá los datos que falten antes de continuar.',
    ],
    3: [
      'Partes de la propuesta',
      'Si el tomador es distinto, sus datos y los de la representación legal deben quedar completos.',
    ],
    4: [
      'Validaciones',
      'Revisá las declaraciones de cumplimiento y el perfil regulatorio sin agregar información que no corresponda.',
    ],
    5: [
      readiness.listo ? 'Lista para emitir' : 'Antes de emitir',
      readiness.listo
        ? 'Guardá el borrador y verificá el resumen final antes de emitir la Propuesta Formal.'
        : `Todavía ${pendientesCount === 1 ? 'falta' : 'faltan'} ${pendientesCount} ${pendientesCount === 1 ? 'dato' : 'datos'} obligatorios.`,
    ],
  }
  const [title, text] = tips[currentStep] ?? tips[1]
  return `<div class="pf-review__tip"><span class="pf-review__tip-icon" aria-hidden="true">${ICON_SHIELD}</span><div><strong>${title}</strong><p>${text}</p></div></div>`
}

function pendientesDelPaso(pendientes, step) {
  return pendientes.filter((code) => {
    if (code === 'seleccion_comercial' || code.startsWith('carta:')) return step === 1
    if (code.startsWith('asegurado.')) return step === 2
    if (code.startsWith('tomador.') || code.startsWith('representante_legal')) return step === 3
    if (code === 'tipo_firma') return step === 5
    if (code === 'descripcion_detallada') return step === 5
    return step === 4
  })
}

function renderReviewStatuses(readiness, currentStep) {
  return `<ol class="pf-review__steps" aria-label="Estado de los pasos">${[1, 2, 3, 4, 5]
    .map((step) => {
      const current = step === currentStep
      const complete = pasoListo(step, readiness)
      const status = current ? 'En progreso' : complete ? 'Completado' : 'Pendiente'
      return `<li class="pf-review__step pf-review__step--${current ? 'current' : complete ? 'complete' : 'pending'}"><span>${current ? step : complete ? '✓' : step}</span><div><strong>${NOMBRES_PASOS[step - 1]}</strong><small>${status}</small></div></li>`
    })
    .join('')}</ol>`
}

function renderWizardProgress(propuesta, readiness, currentStep) {
  const description =
    propuesta.estado === 'emitida'
      ? 'Propuesta emitida'
      : propuesta.estado === 'anulada'
        ? 'Propuesta anulada'
        : `Paso ${currentStep} de 5`
  return `<section class="pf-progress" aria-label="Progreso de la Propuesta Formal"><div class="pf-progress__intro"><span>${description}</span><strong>${NOMBRES_PASOS[currentStep - 1]}</strong></div><ol class="pf-steps" aria-label="Pasos de la propuesta">${[
    1, 2, 3, 4, 5,
  ]
    .map((step) => {
      const complete = pasoListo(step, readiness)
      const current = step === currentStep
      const canOpen = current || complete
      const status = current ? 'En progreso' : complete ? 'Completado' : 'Pendiente'
      return `<li class="pf-step pf-step--${current ? 'current' : complete ? 'complete' : 'pending'}"><button type="button" class="pf-step__button" data-action="ir-paso" data-step="${step}" ${canOpen ? '' : 'disabled'} aria-label="${escapeHtml(`${NOMBRES_PASOS[step - 1]}, ${status}`)}" ${current ? 'aria-current="step"' : ''}><span class="pf-step__number">${complete && !current ? '✓' : String(step).padStart(2, '0')}</span><span class="pf-step__copy"><span class="pf-step__label">${NOMBRES_PASOS[step - 1]}</span><small class="pf-step__status">${status}</small></span></button></li>`
    })
    .join('')}</ol></section>`
}

const NOMBRES_PASOS = [
  'Carta y selección',
  'Asegurado',
  'Tomador',
  'Validaciones',
  'Revisión y emisión',
]

function obtenerReadinessActual() {
  const serverReadiness = state.propuesta?.readiness ?? { pendientes: [] }
  const pendientes = calcularPendientesLocales()
  return {
    ...serverReadiness,
    pendientes,
    listo: pendientes.length === 0,
    emision_habilitada: pendientes.length === 0,
    pasoMaximoAlcanzado: pasoMaximoAlcanzadoDeDraft(state.propuesta?.draft_json, pendientes),
  }
}

function calcularPendientesLocales() {
  const propuesta = state.propuesta ?? {}
  return calcularPendientesFor(propuesta, seleccionActual())
}

function calcularPendientesFor(propuesta, selection = {}) {
  const draft = propuesta?.draft_json ?? {}
  const insured = draft.partes?.asegurado ?? {}
  const pendientes = (propuesta?.readiness?.pendientes ?? []).filter((item) =>
    item.startsWith('carta:')
  )
  const varianteId = selection.varianteId ?? propuesta?.cotizacion_variante_id
  const planPagoId = selection.planPagoId ?? propuesta?.cotizacion_plan_pago_id
  if (!varianteId || !planPagoId) pendientes.push('seleccion_comercial')
  for (const field of [
    'tipo_persona',
    'nombre_razon_social',
    'direccion',
    'ciudad',
    'telefono',
    'email',
    'actividad_economica',
  ])
    if (!insured[field]) pendientes.push(`asegurado.${field}`)
  if ((insured.documento_tipo ?? 'ci') === 'ruc') {
    if (!insured.ruc) pendientes.push('asegurado.ruc')
  } else if (!insured.documento) pendientes.push('asegurado.documento')
  if (insured.tipo_persona === 'fisica')
    for (const field of ['fecha_nacimiento', 'sexo', 'nacionalidad', 'estado_civil', 'ocupacion'])
      if (!insured[field]) pendientes.push(`asegurado.${field}`)
  if (insured.tipo_persona === 'juridica')
    for (const field of ['nombre', 'documento', 'cargo'])
      if (!draft.partes?.representante_legal?.[field])
        pendientes.push(`representante_legal.${field}`)
  if (draft.partes?.tomador_igual_asegurado === false) {
    for (const field of [
      'nombre_razon_social',
      'documento',
      'direccion',
      'ciudad',
      'telefono',
      'email',
    ])
      if (!draft.partes?.tomador?.[field]) pendientes.push(`tomador.${field}`)
    const documentoAsegurado =
      (insured.documento_tipo ?? 'ci') === 'ruc' ? insured.ruc : insured.documento
    if (draft.partes?.tomador?.documento === documentoAsegurado)
      pendientes.push('tomador.identidad_distinta')
  }
  if (!draft.tipo_firma) pendientes.push('tipo_firma')
  if (descripcionDetalladaExcedeLimite(draft.descripcion_detallada))
    pendientes.push('descripcion_detallada')
  return [...new Set(pendientes)]
}

function calcularCamposRequeridos(propuesta) {
  const draft = propuesta?.draft_json ?? {}
  const insured = draft.partes?.asegurado ?? {}
  const required = new Set(
    (propuesta?.readiness?.pendientes ?? []).filter((item) => item.startsWith('carta:'))
  )
  required.add('seleccion_comercial')
  for (const field of [
    'tipo_persona',
    'nombre_razon_social',
    'direccion',
    'ciudad',
    'telefono',
    'email',
    'actividad_economica',
  ])
    required.add(`asegurado.${field}`)
  required.add((insured.documento_tipo ?? 'ci') === 'ruc' ? 'asegurado.ruc' : 'asegurado.documento')
  if (insured.tipo_persona === 'fisica')
    for (const field of ['fecha_nacimiento', 'sexo', 'nacionalidad', 'estado_civil', 'ocupacion'])
      required.add(`asegurado.${field}`)
  if (insured.tipo_persona === 'juridica')
    for (const field of ['nombre', 'documento', 'cargo'])
      required.add(`representante_legal.${field}`)
  if (draft.partes?.tomador_igual_asegurado === false) {
    for (const field of [
      'nombre_razon_social',
      'documento',
      'direccion',
      'ciudad',
      'telefono',
      'email',
    ])
      required.add(`tomador.${field}`)
    if (draft.partes?.tomador?.documento === insured.documento)
      required.add('tomador.identidad_distinta')
  }
  required.add('tipo_firma')
  return [...required]
}

function pasoCamposCompletos(step, pendientes) {
  if (step === 1)
    return !pendientes.some((item) => item === 'seleccion_comercial' || item.startsWith('carta:'))
  if (step === 2) return !pendientes.some((item) => item.startsWith('asegurado.'))
  if (step === 3)
    return !pendientes.some(
      (item) => item.startsWith('tomador.') || item.startsWith('representante_legal')
    )
  if (step === 4) return !pendientes.some((item) => item.startsWith('pla_ft.'))
  return true
}

// Tomador (paso 3) solo exige campos si se desmarca "es la misma persona", y PLA-FT
// (paso 4) es enteramente opcional en el schema — pasoCamposCompletos() los da por
// completos desde el arranque. Sin este piso de "alcanzado", el wizard mostraba el check
// verde en esos dos pasos aunque el usuario nunca los hubiera visitado.
function pasoAlcanzado(step, pasoMaximoAlcanzado) {
  return (pasoMaximoAlcanzado ?? 1) >= step
}

function pasoMaximoAlcanzadoDeDraft(draft, pendientes) {
  if (typeof draft?.paso_maximo_alcanzado === 'number') return draft.paso_maximo_alcanzado
  // Borradores guardados antes de este fix no traen el campo: reconstruimos el progreso
  // real solo hasta donde hay campos obligatorios de verdad (pasos 1 y 2) y forzamos a
  // visitar de nuevo Tomador/Validaciones en vez de asumirlos completos sin evidencia.
  if (pasoCamposCompletos(1, pendientes) && pasoCamposCompletos(2, pendientes)) return 2
  if (pasoCamposCompletos(1, pendientes)) return 1
  return 1
}

function pasoListo(step, readiness) {
  if (step === 5) return Boolean(readiness?.listo)
  const pendientes = readiness?.pendientes ?? []
  return (
    pasoCamposCompletos(step, pendientes) && pasoAlcanzado(step, readiness?.pasoMaximoAlcanzado)
  )
}

function determinarPasoInicial(propuesta) {
  if (['emitida', 'anulada'].includes(propuesta?.estado)) return 5
  const pendientes = calcularPendientesFor(propuesta)
  const readiness = {
    pendientes,
    pasoMaximoAlcanzado: pasoMaximoAlcanzadoDeDraft(propuesta?.draft_json, pendientes),
  }
  for (const step of [1, 2, 3, 4]) if (!pasoListo(step, readiness)) return step
  return 5
}

function calcularWizardReadinessPercent(propuesta, readiness) {
  const required = calcularCamposRequeridos(propuesta)
  if (!required.length) return 100
  const pendientes = new Set(readiness?.pendientes ?? [])
  const complete = required.filter((field) => !pendientes.has(field)).length
  return Math.round((complete / required.length) * 100)
}

function validarPaso(step) {
  const form = app.querySelector('#propuesta-form')
  if (!form) return false
  if (state.propuesta) state.propuesta.draft_json = leerFormulario()
  form.querySelectorAll(':invalid').forEach((field) => field.setCustomValidity(''))
  if (step === 1) {
    const variant = form.querySelector('#cotizacion-variante-id')
    const payment = form.querySelector('#cotizacion-plan-pago-id')
    if (!variant?.value) variant?.setCustomValidity('Seleccioná una variante.')
    if (!payment?.value) payment?.setCustomValidity('Seleccioná una forma de pago.')
    if (variant?.value && payment?.value && !seleccionActual().varianteId)
      variant.setCustomValidity('Seleccioná una variante válida.')
  }
  const valid = form.reportValidity()
  if (!valid) {
    const firstInvalid = form.querySelector(':invalid')
    firstInvalid?.focus()
  }
  return valid
}

function avanzarPaso() {
  if (state.currentStep >= 5 || !validarPaso(state.currentStep)) return
  state.currentStep += 1
  registrarPasoAlcanzado(state.currentStep)
  render()
}

// Marca que el usuario ya pisó este paso, para que pasoAlcanzado() deje de darlo por
// completo "gratis" cuando no tiene campos obligatorios propios (ver pasoCamposCompletos).
function registrarPasoAlcanzado(step) {
  if (!state.propuesta) return
  const draft = state.propuesta.draft_json ?? {}
  const actual = typeof draft.paso_maximo_alcanzado === 'number' ? draft.paso_maximo_alcanzado : 1
  state.propuesta.draft_json = { ...draft, paso_maximo_alcanzado: Math.max(actual, step) }
}

function retrocederPaso() {
  if (state.currentStep <= 1) return
  state.currentStep -= 1
  render()
}

function irAPaso(step) {
  const readiness = obtenerReadinessActual()
  if (step < 1 || step > 5 || (step !== state.currentStep && !pasoListo(step, readiness))) return
  state.currentStep = step
  render()
}

function renderReplacementHistory(propuesta) {
  const reemplazo = propuesta.reemplazada_por_propuesta
  if (propuesta.estado !== 'anulada' || !reemplazo) return ''

  return `<section class="pf-replacement" aria-label="Historial de reemplazo"><span>Historial de reemplazo</span><p>Esta propuesta fue reemplazada por una propuesta vigente.</p><a href="?propuesta=${encodeURIComponent(reemplazo.id)}">Propuesta N° ${escapeHtml(reemplazo.numero_propuesta)} <small>Estado: ${escapeHtml(reemplazo.estado)}</small></a></section>`
}

function renderSeleccion(variantes, varianteActual, pagos, pagoSeleccionado, moneda) {
  const campoVariante =
    variantes.length === 1
      ? `<input type="hidden" id="cotizacion-variante-id" value="${escapeHtml(variantes[0].id)}" />`
      : `<label class="pf-field"><span>Variante</span><select id="cotizacion-variante-id" class="field-input"><option value="">Seleccione</option>${variantes.map((v) => `<option value="${escapeHtml(v.id)}" ${v.id === varianteActual?.id ? 'selected' : ''}>${escapeHtml(v.numero_variante || `Variante ${v.id}`)} · ${fmtMoneda(v.prima, moneda)}</option>`).join('')}</select></label>`
  return `<section class="panel card"><div class="card__title pf-card-title"><span class="pf-card-title__icon" aria-hidden="true">01</span><div><strong>Carta y selección</strong><small>Variante y forma de pago persistidos en la Carta Oferta</small></div></div><div class="card__body pf-selection">
        <div class="pf-group-label pf-field--wide"><span>Selección comercial</span><small>Elegí una alternativa ya calculada, sin modificar los importes de la Carta Oferta.</small></div>
        ${campoVariante}
        <label class="pf-field"><span>Forma de pago${requiredMark()}</span><select id="cotizacion-plan-pago-id" class="field-input" required><option value="">Seleccione</option>${pagos.map((p) => `<option value="${escapeHtml(p.id)}" ${p.id === pagoSeleccionado ? 'selected' : ''}>${escapeHtml(p.formas_pago?.nombre_display || 'Forma de pago')} · ${fmtMoneda(p.premio_total, moneda)}</option>`).join('')}</select></label>
        <p>Los importes son de solo lectura y provienen de la cotización persistida.</p>
      </div></section>`
}

const INPUT_TYPES = new Set(['text', 'email', 'date', 'number'])

function inputField(name, label, value, type = 'text', required = false, options = {}) {
  const safeType = INPUT_TYPES.has(type) ? type : 'text'
  const formattedValue =
    options.format === 'ruc'
      ? formatearRuc(value)
      : options.format === 'ci'
        ? formatearCi(value)
        : options.format === 'gs'
          ? fmtGsInput(String(value ?? '').replace(/\D/g, ''))
          : (value ?? '')
  const formatAttribute = options.format ? `data-format="${options.format}"` : ''
  const inputModeAttribute = options.inputMode ? `inputmode="${options.inputMode}"` : ''
  return `<label class="pf-field"><span>${escapeHtml(label)}${required ? requiredMark() : ''}</span><input class="field-input" type="${safeType}" name="${escapeHtml(name)}" value="${escapeHtml(formattedValue)}" ${inputModeAttribute} ${formatAttribute} ${required ? 'required' : ''} /></label>`
}

function phoneField(name, label, value, required = false) {
  return `<label class="pf-field"><span>${escapeHtml(label)}${required ? requiredMark() : ''}</span><span class="pf-phone"><span class="pf-phone__prefix" aria-hidden="true">🇵🇾 +595</span><input class="field-input" type="text" inputmode="numeric" data-format="telefono" name="${escapeHtml(name)}" value="${escapeHtml(formatearTelefono(value))}" placeholder="123-456-789" ${required ? 'required' : ''} /></span></label>`
}

function selectField(name, label, options, selected, required = false) {
  const selectedValue = String(selected ?? '')
  return `<label class="pf-field"><span>${escapeHtml(label)}${required ? requiredMark() : ''}</span><select class="field-input" name="${escapeHtml(name)}" ${required ? 'required' : ''}>${options
    .map(([value, text]) => {
      const optionValue = String(value ?? '')
      return `<option value="${escapeHtml(optionValue)}" ${selectedValue === optionValue ? 'selected' : ''}>${escapeHtml(text)}</option>`
    })
    .join('')}</select></label>`
}

function etiquetaPendiente(code) {
  const labels = {
    seleccion_comercial: 'Variante y forma de pago',
    'asegurado.tipo_persona': 'Tipo de persona',
    'asegurado.nombre_razon_social': 'Nombre o razón social',
    'asegurado.documento': 'C.I.',
    'asegurado.ruc': 'R.U.C.',
    'asegurado.direccion': 'Dirección',
    'asegurado.ciudad': 'Ciudad',
    'asegurado.telefono': 'Teléfono',
    'asegurado.email': 'Correo electrónico',
    'asegurado.actividad_economica': 'Actividad económica',
    representante_legal: 'Representante legal',
    'representante_legal.nombre': 'Nombre del representante',
    'representante_legal.documento': 'Documento del representante',
    'representante_legal.cargo': 'Cargo del representante',
    tomador: 'Datos del tomador',
    'tomador.nombre_razon_social': 'Nombre del tomador',
    'tomador.documento': 'Documento del tomador',
    'tomador.direccion': 'Dirección del tomador',
    'tomador.ciudad': 'Ciudad del tomador',
    'tomador.telefono': 'Teléfono del tomador',
    'tomador.email': 'Correo del tomador',
    'tomador.identidad_distinta': 'Documento distinto al asegurado',
    'asegurado.fecha_nacimiento': 'Fecha de nacimiento',
    'asegurado.sexo': 'Sexo',
    'asegurado.nacionalidad': 'Nacionalidad',
    'asegurado.estado_civil': 'Estado civil',
    'asegurado.ocupacion': 'Ocupación',
    tipo_firma: 'Modalidad de firma',
    descripcion_detallada: 'Descripción detallada (demasiado larga)',
  }
  if (labels[code]) return labels[code]
  if (code.startsWith('carta:')) return 'Carta Oferta apta para continuar'
  return 'Información requerida'
}

app.addEventListener('submit', (event) => {
  if (event.target.id === 'pf-search') {
    event.preventDefault()
    state.busqueda = event.target.querySelector('#pf-busqueda').value.trim()
    cargarCartas()
  }
})

app.addEventListener('input', (event) => {
  if (!event.target.closest('#propuesta-form')) return
  formatearInputPreservandoCursor(event.target)
  if (event.target.name === 'descripcion_detallada') actualizarContadorDescripcion(event.target)
  programarAutosave()
})

app.addEventListener('change', (event) => {
  if (event.target.id === 'cotizacion-variante-id') {
    state.propuesta.draft_json = leerFormulario()
    state.propuesta.cotizacion_variante_id = Number(event.target.value) || null
    state.propuesta.cotizacion_plan_pago_id = null
    render()
    if (state.propuesta.cotizacion_variante_id) {
      state.saveState = 'Seleccione una forma de pago'
      renderSaveIndicator()
    } else {
      programarAutosave()
    }
    return
  }
  // Estos campos cambian el readiness del paso 5 (botón Emitir) o el layout del propio
  // formulario — el resto del listener solo dispara autosave sin re-render, así que sin
  // este render() el botón queda con el `disabled` calculado antes del cambio hasta la
  // próxima navegación de paso.
  if (
    event.target.name === 'tipo_persona' ||
    event.target.name === 'documento_tipo' ||
    event.target.name === 'tomador_igual_asegurado' ||
    event.target.name === 'tipo_firma' ||
    event.target.name === 'descripcion_detallada'
  ) {
    state.propuesta.draft_json = leerFormulario()
    programarAutosave()
    render()
    return
  }
  if (event.target.closest('#propuesta-form') || event.target.id === 'cotizacion-plan-pago-id') {
    programarAutosave()
  }
})

// Respeta data-stop-propagation (el modal de progreso de emisión): un click dentro del
// modal que no caiga sobre su propio data-action no debe "escapar" hacia el data-action
// del backdrop que lo contiene — mismo patrón que resolveActionTarget() de cotizar/events.js.
function resolveActionTarget(event) {
  const target = event.target.closest('[data-action]')
  if (!target || target.disabled) return null
  const stopEl = event.target.closest('[data-stop-propagation]')
  if (stopEl && !stopEl.contains(target)) return null
  return target
}

app.addEventListener('click', (event) => {
  const target = resolveActionTarget(event)
  if (!target) return
  const action = target.dataset.action
  if (action === 'abrir-carta') abrirCarta(Number(target.dataset.id))
  if (action === 'guardar') guardar()
  if (action === 'emitir') emitir()
  if (action === 'descargar-pdf') descargarPdf()
  if (action === 'anular') anular()
  if (action === 'reemplazar') abrirCarta(state.carta.id)
  if (action === 'paso-continuar') avanzarPaso()
  if (action === 'paso-atras') retrocederPaso()
  if (action === 'ir-paso') irAPaso(Number(target.dataset.step))
  if (action === 'recargar-borrador') recargarBorrador()
  if (action === 'cerrar-modal-progreso-emision') cerrarModalProgresoEmision()
  if (action === 'reintentar-emision') emitir()
  if (action === 'volver-selector') {
    window.clearTimeout(autosaveTimer)
    state.carta = null
    state.propuesta = null
    state.banner = null
    window.history.replaceState({}, '', window.location.pathname)
    render()
  }
  if (action === 'toggle-sidebar') {
    state.sidebarAbierta = !state.sidebarAbierta
    render()
  }
  if (action === 'close-sidebar') {
    state.sidebarAbierta = false
    render()
  }
  if (action === 'logout') auth.logout().then(redirectToLogin)
})

// Escape cierra el modal de progreso de emisión solo si ya llegó a un estado terminal
// (éxito/error) — mientras está 'activo' no se corta la ilusión de progreso (la petición
// real sigue en curso). Tab/Shift+Tab quedan atrapados dentro del modal mientras esté
// abierto. Mismo patrón que cotizar/events.js para renderModalProgresoCarta().
document.addEventListener('keydown', (e) => {
  if (!state.progresoEmision) return
  if (e.key === 'Escape') {
    cerrarModalProgresoEmision()
    return
  }
  if (e.key === 'Tab') {
    const modalAbierto = app.querySelector('.progreso-carta-modal')
    if (modalAbierto) atraparFoco(e, modalAbierto)
  }
})

async function init() {
  const usuario = await auth.cargarSesion()
  if (!usuario) return
  state.usuario = usuario
  state.textos = await api.get('/propuestas/textos').catch(() => state.textos)
  const propuestaId = Number(params.get('propuesta'))
  const cartaId = Number(params.get('carta'))
  if (propuestaId) await abrirPropuesta(propuestaId)
  else if (cartaId) await abrirCarta(cartaId)
  else await cargarCartas()
}

init()
