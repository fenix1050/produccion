import { auth } from '../../shared/api.js'
import {
  ICON_SUBLIMITE_GENERICO,
  ICON_ARROW_LEFT as ICON_ARROW_LEFT_ROUND,
} from '../../shared/nav-icons.js'
import { escapeHtml } from '../../shared/dom.js'
import { fmtGsInput, fmtMonto, unidadMoneda } from '../../shared/format.js'
import { state } from '../state.js'
import {
  FRANQUICIA_OPCIONES,
  RAMOS_CON_AJUSTES,
  ICON_TAG,
  RAMOS_CON_CALCULO,
  COBERTURA_ICONOS,
  CODIGOS_FRANQUICIA_NULA_MRC,
  CODIGOS_MRC_OCULTOS_EN_DETALLE_PLAN,
} from '../constants.js'
import {
  franquiciaValorPorDefecto,
  puedeSeleccionarFranquicia,
  monedaEfectiva,
  formaPagoSeleccionada,
  capitalTotalAsegurado,
  monedaCotizacionActual,
} from '../domain-rules.js'
import { idParaCampo } from './render-campos.js'

// Selector de franquicia/deducible por cobertura. No afecta la prima ya calculada: es solo el
// texto que se va a mostrar en la propuesta.
function etiquetaFranquicia(monto) {
  return monto == null
    ? 'Sin deducible'
    : `10% en todo y cada siniestro, mínimo Gs. ${Number(monto).toLocaleString('es-PY')}`
}

export function renderFranquiciaSelect(cobertura) {
  if (!puedeSeleccionarFranquicia(auth.getUsuario())) {
    return `<span>Franquicia: ${escapeHtml(etiquetaFranquicia(cobertura.franquicia_default))}</span>`
  }

  const seleccionado =
    state.franquiciasPorCobertura[cobertura.codigo] ??
    franquiciaValorPorDefecto(cobertura.franquicia_default)
  const permiteSinDeducible = CODIGOS_FRANQUICIA_NULA_MRC.has(cobertura.codigo)
  const opcionesDisponibles = FRANQUICIA_OPCIONES.filter(
    (opcion) => opcion.monto != null || permiteSinDeducible
  )
  if (!opcionesDisponibles.some((opcion) => opcion.valor === seleccionado)) {
    opcionesDisponibles.push({
      valor: seleccionado,
      monto: cobertura.franquicia_default,
      label: etiquetaFranquicia(cobertura.franquicia_default),
    })
  }
  const opciones = opcionesDisponibles
    .map(
      (opcion) =>
        `<option value="${opcion.valor}" ${opcion.valor === seleccionado ? 'selected' : ''}>${escapeHtml(opcion.label)}</option>`
    )
    .join('')

  return `
    <label class="cobertura-row__franquicia-label">Franquicia
      <select class="cobertura-row__franquicia" data-franquicia-cobertura="${cobertura.codigo}" aria-label="Franquicia">${opciones}</select>
    </label>
  `
}

function shouldHideMrcCoverageInPlanDetail(cobertura) {
  return state.ramoId === 'mrc' && CODIGOS_MRC_OCULTOS_EN_DETALLE_PLAN.has(cobertura.codigo)
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

export function renderAjustesDescuentoRecargo(plan) {
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

// Bloque "Suma Asegurada / Costo Contado / Costo Financiado" — mismo formato que la pantalla
// del sistema de escritorio real. A diferencia del resto de "Detalle del plan" (que sigue la
// forma de pago elegida en las pills), este bloque siempre muestra Contado y el financiado a
// través de Cobrador en simultáneo, sin importar cuál esté seleccionada.
// Card único del sidebar de "Detalle del plan" — reemplaza los 2 cards separados que había
// antes (resumen Contado/Financiado + Ajustes) por un único "Resumen de la cotización" con
// secciones separadas por líneas finas, terminando en el botón de "Emitir carta oferta" (antes
// vivía en una barra fija al pie de la pantalla — ver decisión de rediseño, 2026-07-22).
// El bloque "Financiado" refleja la forma de pago realmente elegida en las pills de "Datos"
// (formaPagoSeleccionada()) — antes quedaba hardcodeada a Cobrador sin importar la selección
// real, algo que Análisis de Riesgo confirmó como bug (Ajuste MC.xlsx, ítem #4). Si el agente
// eligió Contado, no hay "Financiado" que mostrar aparte (Cuota=0 por regla de negocio).
export function renderResumenCotizacion(plan) {
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

// Referencia visual de avance (1. Datos del plan → 2. Detalle del plan → 3. Carta oferta).
// "Carta oferta" no tiene un state.view propio — se emite como acción (PDF) dentro de
// "Detalle del plan" (ver emitirCartaOferta()) — así que ese paso queda siempre pendiente,
// solo marca el recorrido esperado, no un estado navegable. Exportada: también la usa
// renderDatosView (cotizar.js, junto a renderPlanRow), no solo renderResultado*.
export function renderStepper() {
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
              <h2 class="coberturas-section__title">Coberturas incluidas</h2>
              <div class="coberturas-lista">
                ${[...coberturas]
                  .filter((c) => !shouldHideMrcCoverageInPlanDetail(c))
                  .sort(
                    (a, b) =>
                      (a.tipo_aplicacion === 'sublimite' ? 1 : 0) -
                      (b.tipo_aplicacion === 'sublimite' ? 1 : 0)
                  )
                  .map((c) => {
                    return `
                    <div class="cobertura-card">
                      <div class="cobertura-card__status" aria-hidden="true">✓</div>
                      <div class="cobertura-card__icon" aria-hidden="true">${COBERTURA_ICONOS[c.codigo] || ICON_SUBLIMITE_GENERICO}</div>
                      <div class="cobertura-card__main">
                        <h3 class="cobertura-card__name">${escapeHtml(c.nombre)}</h3>
                        <div class="cobertura-card__franquicia">${renderFranquiciaSelect(c)}</div>
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

export function renderResultadoView(ramo) {
  const esCalculable = RAMOS_CON_CALCULO.includes(state.ramoId)
  const plan = state.planes.find((p) => p.id === state.planId)
  const planLabel = plan ? plan.nombre : '—'

  if (!esCalculable || !state.preview) {
    return renderResultadoVacio(ramo, plan, planLabel, esCalculable)
  }

  return renderResultadoCompleto(ramo, plan, planLabel)
}
