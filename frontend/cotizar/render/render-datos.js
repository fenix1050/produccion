import { escapeHtml } from '../../shared/dom.js'
import { fmtGsInput, unidadMoneda } from '../../shared/format.js'
import { state } from '../state.js'
import {
  CIUDADES,
  OBJETOS_RIESGO_CAMPOS,
  LIMITE_REPETICION_COBERTURA_MRC,
  LIMITE_REPETICION_COBERTURA_MRC_DEFAULT,
} from '../constants.js'
import {
  monedaEfectiva,
  sugerenciaInspeccion,
  quedanCoberturasAdicionalesPorAgregar,
} from '../domain-rules.js'
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

// Sección "Coberturas adicionales": líneas cobertura/sublímite más allá de Incendio Edificio/
// Contenido. `catalogoDisponible` ya viene sin las 2 fijas y sin sublimite_cctv (ver
// coberturasDisponibles()).
export function renderCoberturasAdicionales(catalogoDisponible) {
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
export function renderCoberturasAdicionalesCheckbox(catalogoDisponible) {
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
