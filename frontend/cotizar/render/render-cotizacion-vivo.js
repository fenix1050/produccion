import { escapeHtml } from '../../shared/dom.js'
import { ICON_INFO, ICON_SUBLIMITE_GENERICO } from '../../shared/nav-icons.js'
import { fmtGs, fmtMonto, unidadMoneda } from '../../shared/format.js'
import { state } from '../state.js'
import { RAMOS_CON_CALCULO, MOTIVO_BLOQUEO_ID, SUBLIMITE_ICONOS } from '../constants.js'
import {
  monedaCotizacionActual,
  formaPagoSeleccionada,
  capitalAseguradoParaBody,
  capitalTotalAsegurado,
  sublimitesFijosMrc,
} from '../domain-rules.js'
import { renderCuotasSelect, renderFormaPagoPills } from './render-campos.js'

// El panel "Cotización en vivo" (columna derecha) suele quedar con espacio libre debajo de su
// contenido (columna de ancho fijo, altura estirada por flex) — el bloque "Sublímites" fijos de
// MRC se agrega ahí abajo para aprovecharlo, en vez de competir por lugar en el formulario de
// la izquierda (ver sublimitesFijosMrc(), decisión de Kevin 2026-07-15).
export function renderLivePanelContent() {
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
        : ''
    }</div>
    <div class="live-summary__divider"></div>
    ${renderCuotasSelect()}
    <div class="live-summary__rows">
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
export function renderSublimitesFijosMrc() {
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

// Reemplaza el innerHTML completo del panel "Cotización en vivo" en cada recálculo (ver
// DEBOUNCE_MS en calcularPreview()) — eso recrea el <select> de cuotas aunque su valor no haya
// cambiado, perdiendo el foco si el agente lo estaba navegando con teclado en ese momento.
// Se restaura el foco explícitamente después del re-render en vez de reescribir el motor de
// render, que también sirve para otros campos vivos dentro de este panel (ej. selects de forma
// de pago) por el mismo motivo.
export function renderLivePanel() {
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
