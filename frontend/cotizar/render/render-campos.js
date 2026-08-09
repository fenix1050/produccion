import { escapeHtml } from '../../shared/dom.js'
import { state } from '../state.js'
import { formasPagoDisponibles } from '../domain-rules.js'

// id="campo-..." derivado del data-field (camelCase -> kebab-case) para asociar cada
// <label for="..."> con su input/select sin tener que hardcodear un id por campo.
export function idParaCampo(fieldKey) {
  return `campo-${fieldKey.replace(/([A-Z])/g, '-$1').toLowerCase()}`
}

// Cantidad de cuotas: el monto de cada cuota es siempre REDONDEAR.SUP(Premio/12, 1000)
// (fórmula fija, PLAN_DESARROLLO.md sección 5) — este selector no cambia ese monto, define
// cuántas cuotas paga el cliente en total (tope: plan.cuotas_maximo), dato que se guarda en
// `cotizacion_planes_pago.cantidad_cuotas` para la Carta Oferta.
export function renderCuotasSelect() {
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
export function renderFormaPagoPills() {
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
