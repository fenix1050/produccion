import { escapeHtml } from '../../shared/dom.js'
import { fmtGsInput, unidadMoneda } from '../../shared/format.js'
import { state } from '../state.js'
import { CIUDADES, OBJETOS_RIESGO_CAMPOS } from '../constants.js'
import { monedaEfectiva, sugerenciaInspeccion } from '../domain-rules.js'
import { idParaCampo } from './render-campos.js'

// Campos "Tipo de Riesgo"/"Ciudad"/capitales del esqueleto MRC — reusado por MRC e Incendio
// (plan "Edificio y Contenido"), que comparten el mismo motor de tasas por rubro.
export function camposEdificioContenido(sublimiteField) {
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

export function campoSublimitePorcentaje(field, label) {
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
export function camposObjetoRiesgo(plan) {
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
