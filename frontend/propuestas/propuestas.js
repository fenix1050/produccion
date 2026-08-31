import { api, auth } from '../shared/api.js'
import { escapeHtml, renderBanner } from '../shared/dom.js'
import { fmtMoneda } from '../shared/format.js'
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
}

let autosaveTimer = null

function booleanoFormulario(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function fmtFecha(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-PY')
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
    state.saveState = propuesta.creado ? 'Borrador creado' : 'Borrador recuperado'
    const url = new URL(window.location.href)
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

async function recargarBorrador() {
  if (!state.propuesta) return
  try {
    state.propuesta = await api.get(`/propuestas/${state.propuesta.id}`)
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
  return {
    partes: {
      asegurado: {
        tipo_persona: data.get('tipo_persona') || undefined,
        nombre_razon_social: data.get('nombre_razon_social')?.trim(),
        documento: data.get('documento')?.trim(),
        telefono: data.get('telefono')?.trim(),
        email: data.get('email')?.trim(),
        direccion: data.get('direccion')?.trim(),
        actividad_economica: data.get('actividad_economica')?.trim(),
      },
      tomador_igual_asegurado: data.get('tomador_igual_asegurado') === 'on',
    },
    pla_ft: {
      es_pep: booleanoFormulario(data.get('es_pep')),
      pep_institucion: data.get('pep_institucion')?.trim(),
      pep_cargo: data.get('pep_cargo')?.trim(),
      sujeto_obligado: booleanoFormulario(data.get('sujeto_obligado')),
      origen_fondos_descripcion: data.get('origen_fondos_descripcion')?.trim(),
    },
  }
}

function seleccionActual() {
  const varianteId = Number(app.querySelector('#cotizacion-variante-id')?.value) || null
  const planPagoId = Number(app.querySelector('#cotizacion-plan-pago-id')?.value) || null
  return { varianteId, planPagoId }
}

async function guardar() {
  if (!state.propuesta || state.saving || state.conflicto) return
  const draft = leerFormulario()
  const { varianteId, planPagoId } = seleccionActual()
  if (Boolean(varianteId) !== Boolean(planPagoId)) {
    state.banner = {
      tipo: 'error',
      texto: 'Seleccione una variante y una forma de pago compatibles.',
    }
    render()
    return
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
    render()
  } catch (error) {
    if (error.status === 409) {
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
    render()
  } finally {
    state.saving = false
    renderSaveIndicator()
  }
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
  autosaveTimer = window.setTimeout(guardar, 900)
}

function renderSaveIndicator() {
  const indicator = app.querySelector('[data-save-indicator]')
  if (indicator) indicator.textContent = state.saveState
}

function render() {
  app.innerHTML = `
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
      <main class="main">
        <div class="main-header">
          <div><div class="main-header__title">Preparar Propuesta Formal</div><div class="main-header__subtitle">Borrador MRC basado en una Carta Oferta emitida</div></div>
          ${state.propuesta ? `<div class="pf-save" data-save-indicator>${escapeHtml(state.saveState)}</div>` : ''}
        </div>
        <div class="admin-content pf-content">
          ${renderBanner(state.banner)}
          ${state.loading ? '<div class="pf-loading"><span class="spinner"></span> Cargando…</div>' : state.propuesta ? renderEditor() : renderSelector()}
        </div>
      </main>
    </div>`
}

function renderSelector() {
  const cartas = state.cartas
    .map(
      (carta) => `
      <button type="button" class="pf-carta" data-action="abrir-carta" data-id="${carta.id}">
        <div><span class="pf-carta__numero">${escapeHtml(carta.numero_carta)} · v${carta.version}</span><strong>${escapeHtml(carta.cliente_nombre || 'Sin cliente')}</strong></div>
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
  const varianteSeleccionada = propuesta.cotizacion_variante_id
  const pagoSeleccionado = propuesta.cotizacion_plan_pago_id
  const variantes = carta.variantes ?? []
  const varianteActual = variantes.find((item) => item.id === varianteSeleccionada) ?? null
  const pagos = varianteActual?.cotizacion_plan_pago ?? []
  const readiness = propuesta.readiness ?? { pendientes: [] }

  return `
    <div class="pf-layout">
      <div class="pf-main">
        <section class="pf-origin">
          <button type="button" class="pf-back" data-action="volver-selector">← Cambiar Carta</button>
          <div><span>Carta Oferta</span><strong>${escapeHtml(carta.numero_carta)} · versión ${carta.version}</strong><small>${escapeHtml(carta.cliente_nombre || 'Sin cliente')} · ${escapeHtml(carta.plan?.nombre || 'MRC')}</small></div>
        </section>
        ${state.conflicto ? '<button type="button" class="btn-outline" data-action="recargar-borrador">Recargar versión actual</button>' : ''}
        <form id="propuesta-form" class="pf-form">
          ${renderSeleccion(variantes, varianteActual, pagos, pagoSeleccionado, carta.moneda)}
          <section class="panel card"><div class="card__title">Partes y contacto</div><div class="card__body pf-fields">
            ${selectField(
              'tipo_persona',
              'Tipo de persona',
              [
                ['', 'Seleccione'],
                ['fisica', 'Persona física'],
                ['juridica', 'Persona jurídica'],
              ],
              valor('partes.asegurado.tipo_persona')
            )}
            ${inputField('nombre_razon_social', 'Nombre o razón social', valor('partes.asegurado.nombre_razon_social'))}
            ${inputField('documento', 'Documento o RUC', valor('partes.asegurado.documento'))}
            ${inputField('telefono', 'Teléfono', valor('partes.asegurado.telefono'))}
            ${inputField('email', 'Correo electrónico', valor('partes.asegurado.email'), 'email')}
            ${inputField('actividad_economica', 'Actividad económica', valor('partes.asegurado.actividad_economica'))}
            <label class="pf-field pf-field--wide"><span>Dirección</span><textarea name="direccion" rows="2">${escapeHtml(valor('partes.asegurado.direccion'))}</textarea></label>
            <label class="pf-check pf-field--wide"><input type="checkbox" name="tomador_igual_asegurado" ${valor('partes.tomador_igual_asegurado', true) ? 'checked' : ''} /> El tomador es la misma persona que el asegurado</label>
          </div></section>
          <section class="panel card"><div class="card__title">KYC y PLA-FT</div><div class="card__body pf-fields">
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
            <label class="pf-field pf-field--wide"><span>Origen de fondos</span><textarea name="origen_fondos_descripcion" rows="3" placeholder="Describa actividad, concepto y procedencia">${escapeHtml(valor('pla_ft.origen_fondos_descripcion'))}</textarea></label>
          </div></section>
        </form>
      </div>
      <aside class="pf-review">
        <div class="pf-review__eyebrow">Revisión informativa</div>
        <h2>${readiness.listo ? 'Borrador completo para revisión' : 'Información pendiente'}</h2>
        <p>${readiness.pendientes.length ? `${readiness.pendientes.length} punto(s) por completar.` : 'Los controles básicos de PF-2 están completos.'}</p>
        <ul>${readiness.pendientes.map((item) => `<li>${escapeHtml(etiquetaPendiente(item))}</li>`).join('')}</ul>
        <button type="button" class="btn-primary pf-save-button" data-action="guardar" ${state.saving || state.conflicto ? 'disabled' : ''}>Guardar borrador</button>
        <button type="button" class="btn-outline pf-emit" disabled aria-disabled="true" title="Disponible en PF-3">Emitir Propuesta Formal</button>
        <small>La emisión y el PDF se implementarán en PF-3.</small>
      </aside>
    </div>`
}

function renderSeleccion(variantes, varianteActual, pagos, pagoSeleccionado, moneda) {
  return `<section class="panel card"><div class="card__title">Selección comercial</div><div class="card__body pf-selection">
    <label class="pf-field"><span>Variante</span><select id="cotizacion-variante-id" class="field-input"><option value="">Seleccione</option>${variantes.map((v) => `<option value="${v.id}" ${v.id === varianteActual?.id ? 'selected' : ''}>${escapeHtml(v.numero_variante || `Variante ${v.id}`)} · ${fmtMoneda(v.prima, moneda)}</option>`).join('')}</select></label>
    <label class="pf-field"><span>Forma de pago</span><select id="cotizacion-plan-pago-id" class="field-input"><option value="">Seleccione</option>${pagos.map((p) => `<option value="${p.id}" ${p.id === pagoSeleccionado ? 'selected' : ''}>${escapeHtml(p.formas_pago?.nombre_display || 'Forma de pago')} · ${fmtMoneda(p.premio_total, moneda)}</option>`).join('')}</select></label>
    <p>Los importes son de solo lectura y provienen de la cotización persistida.</p>
  </div></section>`
}

function inputField(name, label, value, type = 'text') {
  return `<label class="pf-field"><span>${label}</span><input class="field-input" type="${type}" name="${name}" value="${escapeHtml(value)}" /></label>`
}

function selectField(name, label, options, selected) {
  return `<label class="pf-field"><span>${label}</span><select class="field-input" name="${name}">${options.map(([value, text]) => `<option value="${value}" ${String(selected) === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`
}

function etiquetaPendiente(code) {
  const labels = {
    seleccion_comercial: 'Variante y forma de pago',
    'asegurado.tipo_persona': 'Tipo de persona',
    'asegurado.nombre_razon_social': 'Nombre o razón social',
    'asegurado.documento': 'Documento o RUC',
    'asegurado.direccion': 'Dirección',
    'asegurado.contacto': 'Teléfono o correo electrónico',
    'asegurado.actividad_economica': 'Actividad económica',
    'pla_ft.es_pep': 'Declaración PEP',
    'pla_ft.detalle_pep': 'Institución y cargo PEP',
    'pla_ft.sujeto_obligado': 'Declaración de sujeto obligado',
    'pla_ft.origen_fondos': 'Origen de fondos',
  }
  return labels[code] || code.replace('carta:', 'Carta Oferta: ')
}

app.addEventListener('submit', (event) => {
  if (event.target.id !== 'pf-search') return
  event.preventDefault()
  state.busqueda = event.target.querySelector('#pf-busqueda').value.trim()
  cargarCartas()
})

app.addEventListener('input', (event) => {
  if (event.target.closest('#propuesta-form')) programarAutosave()
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
  if (event.target.closest('#propuesta-form') || event.target.id === 'cotizacion-plan-pago-id') {
    programarAutosave()
  }
})

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]')
  if (!target || target.disabled) return
  const action = target.dataset.action
  if (action === 'abrir-carta') abrirCarta(Number(target.dataset.id))
  if (action === 'guardar') guardar()
  if (action === 'recargar-borrador') recargarBorrador()
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
  if (action === 'logout') auth.logout().then(() => (window.location.href = '../login/'))
})

async function init() {
  const usuario = await auth.cargarSesion()
  if (!usuario) return
  const cartaId = Number(params.get('carta'))
  if (cartaId) await abrirCarta(cartaId)
  else await cargarCartas()
}

init()
