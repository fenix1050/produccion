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
  textos: { textos: [], puede_gestionar: false, faltantes: [], emision_habilitada: false },
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
        fecha_nacimiento: data.get('fecha_nacimiento') || undefined,
        nacionalidad: data.get('nacionalidad')?.trim(),
        estado_civil: data.get('estado_civil')?.trim(),
        ocupacion: data.get('ocupacion')?.trim(),
        ciudad: data.get('ciudad')?.trim(),
        ingreso_mensual: data.get('ingreso_mensual') ? Number(data.get('ingreso_mensual')) : null,
        lugar_trabajo: data.get('lugar_trabajo')?.trim(),
      },
      tomador_igual_asegurado: data.get('tomador_igual_asegurado') === 'on',
      tomador: {
        nombre_razon_social: data.get('tomador_nombre')?.trim(),
        documento: data.get('tomador_documento')?.trim(),
        direccion: data.get('tomador_direccion')?.trim(),
        ciudad: data.get('tomador_ciudad')?.trim(),
        telefono: data.get('tomador_telefono')?.trim(),
        email: data.get('tomador_email')?.trim(),
      },
      representante_legal: {
        nombre: data.get('representante_nombre')?.trim(),
        documento: data.get('representante_documento')?.trim(),
        cargo: data.get('representante_cargo')?.trim(),
      },
    },
    pla_ft: {
      es_pep: booleanoFormulario(data.get('es_pep')),
      pep_institucion: data.get('pep_institucion')?.trim(),
      pep_cargo: data.get('pep_cargo')?.trim(),
      sujeto_obligado: booleanoFormulario(data.get('sujeto_obligado')),
      origen_fondos_descripcion: data.get('origen_fondos_descripcion')?.trim(),
      proveedor_estado: booleanoFormulario(data.get('proveedor_estado')),
    },
    descripcion_detallada: data.get('descripcion_detallada')?.trim(),
    observaciones: data.get('observaciones')?.trim(),
    tipo_firma: data.get('tipo_firma') || undefined,
  }
}

function seleccionActual() {
  const varianteId = Number(app.querySelector('#cotizacion-variante-id')?.value) || null
  const planPagoId = Number(app.querySelector('#cotizacion-plan-pago-id')?.value) || null
  return { varianteId, planPagoId }
}

async function guardar() {
  if (!state.propuesta || state.saving || state.conflicto) return false
  const draft = leerFormulario()
  const { varianteId, planPagoId } = seleccionActual()
  if (Boolean(varianteId) !== Boolean(planPagoId)) {
    state.banner = {
      tipo: 'error',
      texto: 'Seleccione una variante y una forma de pago compatibles.',
    }
    render()
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
    render()
    return true
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
    return false
  } finally {
    state.saving = false
    renderSaveIndicator()
  }
}

async function emitir() {
  const form = app.querySelector('#propuesta-form')
  if (!form?.reportValidity()) return
  const saved = await guardar()
  if (!saved || state.conflicto) return
  state.saving = true
  state.saveState = 'Emitiendo PDF…'
  render()
  try {
    const proposal = await api.post(`/propuestas/${state.propuesta.id}/emitir`, {
      revision: state.propuesta.revision,
    })
    state.propuesta = { ...state.propuesta, ...proposal }
    state.banner = { tipo: 'success', texto: `Propuesta N° ${proposal.numero_propuesta} emitida.` }
  } catch (error) {
    state.banner = { tipo: 'error', texto: error.message }
  } finally {
    state.saving = false
    render()
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

async function publicarTexto() {
  const form = app.querySelector('#pf-text-form')
  if (!form?.reportValidity()) return
  const data = new FormData(form)
  try {
    await api.post('/propuestas/textos', {
      clave: data.get('clave').trim(),
      contenido: data.get('contenido').trim(),
      motivo: data.get('motivo').trim(),
    })
    state.textos = await api.get('/propuestas/textos')
    state.banner = { tipo: 'success', texto: 'Texto publicado y versionado.' }
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
  const emitted = ['emitida', 'anulada'].includes(propuesta.estado)

  return `
    <div class="pf-layout">
      <div class="pf-main">
        <section class="pf-origin">
          <button type="button" class="pf-back" data-action="volver-selector">← Cambiar Carta</button>
          <div><span>Carta Oferta</span><strong>${escapeHtml(carta.numero_carta)} · versión ${carta.version}</strong><small>${escapeHtml(carta.cliente_nombre || 'Sin cliente')} · ${escapeHtml(carta.plan?.nombre || 'MRC')}</small></div>
        </section>
        ${state.conflicto ? '<button type="button" class="btn-outline" data-action="recargar-borrador">Recargar versión actual</button>' : ''}
         <form id="propuesta-form" class="pf-form"><fieldset class="pf-form__fieldset" ${emitted ? 'disabled' : ''}>
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
              valor('partes.asegurado.tipo_persona'),
              true
            )}
            ${inputField('nombre_razon_social', 'Nombre o razón social', valor('partes.asegurado.nombre_razon_social'), 'text', true)}
            ${inputField('documento', 'Documento o RUC', valor('partes.asegurado.documento'), 'text', true)}
            ${inputField('telefono', 'Teléfono', valor('partes.asegurado.telefono'), 'text', true)}
            ${inputField('email', 'Correo electrónico', valor('partes.asegurado.email'), 'email', true)}
            ${inputField('actividad_economica', 'Actividad económica', valor('partes.asegurado.actividad_economica'), 'text', true)}
            ${inputField('fecha_nacimiento', 'Fecha de nacimiento (persona física)', valor('partes.asegurado.fecha_nacimiento'), 'date')}
            ${inputField('nacionalidad', 'Nacionalidad (persona física)', valor('partes.asegurado.nacionalidad'))}
            ${inputField('estado_civil', 'Estado civil (persona física)', valor('partes.asegurado.estado_civil'))}
            ${inputField('ocupacion', 'Ocupación (persona física)', valor('partes.asegurado.ocupacion'))}
            ${inputField('ciudad', 'Ciudad', valor('partes.asegurado.ciudad'), 'text', true)}
            ${inputField('ingreso_mensual', 'Ingreso mensual (opcional)', valor('partes.asegurado.ingreso_mensual'), 'number')}
            ${inputField('lugar_trabajo', 'Lugar de trabajo (opcional)', valor('partes.asegurado.lugar_trabajo'))}
            <label class="pf-field pf-field--wide"><span>Dirección</span><textarea name="direccion" rows="2" required>${escapeHtml(valor('partes.asegurado.direccion'))}</textarea></label>
            <label class="pf-check pf-field--wide"><input type="checkbox" name="tomador_igual_asegurado" ${valor('partes.tomador_igual_asegurado', true) ? 'checked' : ''} /> El tomador es la misma persona que el asegurado</label>
            ${inputField('tomador_nombre', 'Tomador si es distinto', valor('partes.tomador.nombre_razon_social'))}
            ${inputField('tomador_documento', 'Documento del tomador', valor('partes.tomador.documento'))}
            ${inputField('tomador_direccion', 'Dirección del tomador', valor('partes.tomador.direccion'))}
            ${inputField('tomador_ciudad', 'Ciudad del tomador', valor('partes.tomador.ciudad'))}
            ${inputField('tomador_telefono', 'Teléfono del tomador', valor('partes.tomador.telefono'))}
            ${inputField('tomador_email', 'Correo del tomador', valor('partes.tomador.email'), 'email')}
            ${inputField('representante_nombre', 'Representante legal (persona jurídica)', valor('partes.representante_legal.nombre'))}
            ${inputField('representante_documento', 'Documento representante', valor('partes.representante_legal.documento'))}
            ${inputField('representante_cargo', 'Cargo representante', valor('partes.representante_legal.cargo'))}
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
            <label class="pf-field pf-field--wide"><span>Descripción detallada (opcional)</span><textarea name="descripcion_detallada" rows="3">${escapeHtml(valor('descripcion_detallada'))}</textarea></label>
            <label class="pf-field pf-field--wide"><span>Observaciones (opcional)</span><textarea name="observaciones" rows="3">${escapeHtml(valor('observaciones'))}</textarea></label>
          </div></section>
         </fieldset></form>
      </div>
      <aside class="pf-review">
        <div class="pf-review__eyebrow">Revisión informativa</div>
         <h2>${propuesta.estado === 'emitida' ? `Propuesta N° ${propuesta.numero_propuesta} emitida` : propuesta.estado === 'anulada' ? `Propuesta N° ${propuesta.numero_propuesta} anulada` : readiness.listo ? 'Borrador completo para revisión' : 'Información pendiente'}</h2>
        <p>${readiness.pendientes.length ? `${readiness.pendientes.length} punto(s) por completar.` : 'Los controles básicos de PF-2 están completos.'}</p>
        <ul>${readiness.pendientes.map((item) => `<li>${escapeHtml(etiquetaPendiente(item))}</li>`).join('')}</ul>
        ${renderReplacementHistory(propuesta)}
         ${!emitted ? `<button type="button" class="btn-primary pf-save-button" data-action="guardar" ${state.saving || state.conflicto ? 'disabled' : ''}>Guardar borrador</button><button type="button" class="btn-outline pf-emit" data-action="emitir" ${!readiness.emision_habilitada || !state.textos.emision_habilitada || state.saving || state.conflicto ? 'disabled' : ''}>Emitir Propuesta Formal</button><small>${state.textos.emision_habilitada ? 'La emisión genera y conserva un PDF interno sin firma.' : `Faltan textos oficiales MRC: ${(state.textos.faltantes ?? []).join(', ') || 'cargando textos'}.`}</small>` : `<button type="button" class="btn-primary" data-action="descargar-pdf">Descargar PDF</button>${propuesta.estado === 'emitida' ? '<button type="button" class="btn-outline" data-action="anular">Anular Propuesta</button>' : '<button type="button" class="btn-outline" data-action="reemplazar">Preparar reemplazo</button>'}`}
         ${state.textos.puede_gestionar ? renderTextControls() : ''}
      </aside>
    </div>`
}

function renderReplacementHistory(propuesta) {
  const reemplazo = propuesta.reemplazada_por_propuesta
  if (propuesta.estado !== 'anulada' || !reemplazo) return ''

  return `<section class="pf-replacement" aria-label="Historial de reemplazo"><span>Historial de reemplazo</span><p>Esta propuesta fue reemplazada por una propuesta vigente.</p><a href="?propuesta=${encodeURIComponent(reemplazo.id)}">Propuesta N° ${escapeHtml(reemplazo.numero_propuesta)} <small>Estado: ${escapeHtml(reemplazo.estado)}</small></a></section>`
}

function renderSeleccion(variantes, varianteActual, pagos, pagoSeleccionado, moneda) {
  return `<section class="panel card"><div class="card__title">Selección comercial</div><div class="card__body pf-selection">
    <label class="pf-field"><span>Variante</span><select id="cotizacion-variante-id" class="field-input"><option value="">Seleccione</option>${variantes.map((v) => `<option value="${v.id}" ${v.id === varianteActual?.id ? 'selected' : ''}>${escapeHtml(v.numero_variante || `Variante ${v.id}`)} · ${fmtMoneda(v.prima, moneda)}</option>`).join('')}</select></label>
    <label class="pf-field"><span>Forma de pago</span><select id="cotizacion-plan-pago-id" class="field-input"><option value="">Seleccione</option>${pagos.map((p) => `<option value="${p.id}" ${p.id === pagoSeleccionado ? 'selected' : ''}>${escapeHtml(p.formas_pago?.nombre_display || 'Forma de pago')} · ${fmtMoneda(p.premio_total, moneda)}</option>`).join('')}</select></label>
    <p>Los importes son de solo lectura y provienen de la cotización persistida.</p>
  </div></section>`
}

function inputField(name, label, value, type = 'text', required = false) {
  return `<label class="pf-field"><span>${label}</span><input class="field-input" type="${type}" name="${name}" value="${escapeHtml(value)}" ${required ? 'required' : ''} /></label>`
}

function renderTextControls() {
  return `<form id="pf-text-form" class="pf-text-form"><strong>Publicar texto MRC</strong><input class="field-input" name="clave" required maxlength="80" placeholder="Ej.: declaraciones" /><textarea name="contenido" required rows="4" placeholder="Texto aprobado"></textarea><input class="field-input" name="motivo" required maxlength="500" placeholder="Motivo de publicación" /><button type="submit" class="btn-outline">Publicar versión</button></form>`
}

function selectField(name, label, options, selected, required = false) {
  return `<label class="pf-field"><span>${label}</span><select class="field-input" name="${name}" ${required ? 'required' : ''}>${options.map(([value, text]) => `<option value="${value}" ${String(selected) === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`
}

function etiquetaPendiente(code) {
  const labels = {
    seleccion_comercial: 'Variante y forma de pago',
    'asegurado.tipo_persona': 'Tipo de persona',
    'asegurado.nombre_razon_social': 'Nombre o razón social',
    'asegurado.documento': 'Documento o RUC',
    'asegurado.direccion': 'Dirección',
    'asegurado.ciudad': 'Ciudad',
    'asegurado.telefono': 'Teléfono',
    'asegurado.email': 'Correo electrónico',
    'asegurado.actividad_economica': 'Actividad económica',
    representante_legal: 'Representante legal',
    tomador: 'Datos del tomador',
    tipo_firma: 'Modalidad de firma',
  }
  return labels[code] || code.replace('carta:', 'Carta Oferta: ')
}

app.addEventListener('submit', (event) => {
  if (event.target.id === 'pf-search') {
    event.preventDefault()
    state.busqueda = event.target.querySelector('#pf-busqueda').value.trim()
    cargarCartas()
  }
  if (event.target.id === 'pf-text-form') {
    event.preventDefault()
    publicarTexto()
  }
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
  if (action === 'emitir') emitir()
  if (action === 'descargar-pdf') descargarPdf()
  if (action === 'anular') anular()
  if (action === 'reemplazar') abrirCarta(state.carta.id)
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
  state.textos = await api.get('/propuestas/textos').catch(() => state.textos)
  const propuestaId = Number(params.get('propuesta'))
  const cartaId = Number(params.get('carta'))
  if (propuestaId) await abrirPropuesta(propuestaId)
  else if (cartaId) await abrirCarta(cartaId)
  else await cargarCartas()
}

init()
