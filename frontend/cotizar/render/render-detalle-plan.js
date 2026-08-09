import { auth } from '../../shared/api.js'
import { escapeHtml } from '../../shared/dom.js'
import { fmtGsInput } from '../../shared/format.js'
import { state } from '../state.js'
import { FRANQUICIA_OPCIONES, RAMOS_CON_AJUSTES } from '../constants.js'
import { franquiciaValorPorDefecto } from '../domain-rules.js'
import { idParaCampo } from './render-campos.js'

// Bloque "Suma Asegurada / Costo Contado / Costo Financiado" — mismo formato que la pantalla
// del sistema de escritorio real. A diferencia del resto de "Detalle del plan" (que sigue la
// forma de pago elegida en las pills), este bloque siempre muestra Contado y el financiado a
// través de Cobrador en simultáneo, sin importar cuál esté seleccionada.
// Selector de franquicia/deducible por cobertura — el asegurado decide qué franquicia le
// interesa y el agente la elige acá para que figure en la propuesta. No afecta la prima ya
// calculada (confirmado por Kevin, 2026-07-13): es solo el texto que se va a mostrar.
export function renderFranquiciaSelect(cobertura) {
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
