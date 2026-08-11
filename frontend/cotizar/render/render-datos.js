import { auth } from '../../shared/api.js'
import { escapeHtml } from '../../shared/dom.js'
import { fmtGsInput, fmtGsConPrefijo, unidadMoneda } from '../../shared/format.js'
import { ICON_PENCIL, ICON_LOCK, ICON_SUBLIMITE_GENERICO } from '../../shared/nav-icons.js'
import { state } from '../state.js'
import {
  CIUDADES,
  OBJETOS_RIESGO_CAMPOS,
  LIMITE_REPETICION_COBERTURA_MRC,
  LIMITE_REPETICION_COBERTURA_MRC_DEFAULT,
  RAMOS_CON_CALCULO,
  CLIENT_FIELDS,
  MOTIVO_BLOQUEO_ID,
  COBERTURA_ICONOS,
} from '../constants.js'
import {
  monedaEfectiva,
  sugerenciaInspeccion,
  quedanCoberturasAdicionalesPorAgregar,
  coberturasDisponibles,
  planEsCalculable,
  puedeAvanzarADetalle,
} from '../domain-rules.js'
import { idParaCampo } from './render-campos.js'
import { renderLivePanelContent } from './render-cotizacion-vivo.js'
import { renderStepper } from './render-detalle-plan.js'

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

// Zona de campo (slot derecho) de la card de "Coberturas adicionales" — 3 estados mutuamente
// excluyentes (design.md sección 2.4):
//  - locked: sin cobertura elegida todavía → placeholder "—" + candado inerte
//  - static (no locked, no editing): "Gs. 100.000.000" si sumaAsegurada tiene monto, "—" si
//    todavía no — el valor real SÍ se muestra acá (Kevin revirtió la regla de "siempre oculto"
//    el 2026-08-10, tras confirmar que el caso que reportó como bug era en realidad el valor
//    real de una cobertura ya cargada, mostrado como se esperaba)
//  - editing: input real con el placeholder "Suma asegurada (Gs.)" adentro, sin la etiqueta
//    aparte arriba — mismo look que el mockup original (Kevin, 2026-08-11: "al final queda
//    mejor así"), a diferencia de la etiqueta persistente que se probó antes
function campoMontoCobertura({ locked, editing, lineaId, sumaAsegurada, nombreAccesible }) {
  const bloque = editing
    ? `
      <div class="cobertura-adicional-card__estatico cobertura-adicional-card__estatico--editando">
        <label class="sr-only" for="cobertura-linea-${lineaId}-suma">Suma asegurada de ${escapeHtml(nombreAccesible)} (Gs.)</label>
        <input
          class="cobertura-adicional-card__input"
          id="cobertura-linea-${lineaId}-suma"
          type="text"
          inputmode="numeric"
          data-linea-id="${lineaId}"
          data-linea-field="sumaAsegurada"
          data-money="true"
          placeholder="Suma asegurada (Gs.)"
          value="${fmtGsInput(sumaAsegurada)}"
        />
      </div>
    `
    : `
      <div class="cobertura-adicional-card__estatico">
        <span class="cobertura-adicional-card__estatico-label">Suma asegurada</span>
        <span class="cobertura-adicional-card__estatico-valor">${sumaAsegurada ? escapeHtml(fmtGsConPrefijo(sumaAsegurada)) : '—'}</span>
      </div>
    `

  if (locked) {
    return `${bloque}<span class="cobertura-adicional-card__lock" title="Elegí una cobertura para cargar la suma asegurada" aria-hidden="true">${ICON_LOCK}</span>`
  }

  // Mismo ícono de lápiz para abrir y cerrar la edición (Kevin: "quiero utilizar el lápiz para
  // representar la edición del monto", en vez del check rojo previo) — solo cambia la acción.
  const accion = editing
    ? { action: 'cerrar-edicion-monto-cobertura', label: `Listo, cerrar edición de ${escapeHtml(nombreAccesible)}` }
    : { action: 'editar-monto-cobertura', label: `Editar suma asegurada de ${escapeHtml(nombreAccesible)}` }

  return `
    ${bloque}
    <button type="button" class="cobertura-adicional-card__accion" data-action="${accion.action}" data-linea-id="${lineaId}" aria-label="${accion.label}">${ICON_PENCIL}</button>
  `
}

// Skin único de "Coberturas adicionales" (coberturas-adicionales-redesign) — reemplaza el
// markup crudo que tenían el selector libre y el modo checkbox por una misma card (design.md
// sección 1-2): icono de COBERTURA_ICONOS, indicador circular en el slot de identidad (mode-
// specific, ver 2.2/2.3), zona de campo con los 3 estados de campoMontoCobertura(), y un slot
// final opcional ("Quitar", solo en modo libre). `modifier` es solo un modificador de ancho de
// columna vía CSS (`--libre`/`--fija`), sin efecto de comportamiento.
function cardCoberturaAdicional({
  modifier,
  locked,
  editing,
  lineaId,
  codigo,
  sub,
  checkHtml,
  mainHtml,
  trailingHtml,
  sumaAsegurada,
  nombreAccesible,
}) {
  const icono = COBERTURA_ICONOS[codigo] || ICON_SUBLIMITE_GENERICO
  const clases = [
    'cobertura-adicional-card',
    `cobertura-adicional-card--${modifier}`,
    locked ? 'is-locked' : '',
    editing ? 'is-editing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return `
    <div class="${clases}" ${lineaId ? `data-linea-id="${lineaId}"` : ''}>
      ${checkHtml}
      <span class="cobertura-adicional-card__icon">${icono}</span>
      <div class="cobertura-adicional-card__main">
        ${mainHtml}
        <span class="cobertura-adicional-card__sub">${sub}</span>
      </div>
      <div class="cobertura-adicional-card__field">
        ${campoMontoCobertura({ locked, editing, lineaId, sumaAsegurada, nombreAccesible })}
      </div>
      ${trailingHtml || ''}
    </div>
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
    .map((l) => {
      const catalogado = catalogoDisponible.find((c) => c.codigo === l.codigo)
      const nombreAccesible = catalogado ? catalogado.nombre : 'la cobertura'
      const locked = !l.codigo
      const editing = state.coberturasAdicionalesEditando.has(l.id)
      const sub = l.codigo
        ? catalogado?.categoria === 'Sublímites'
          ? 'Sublímite'
          : 'Cobertura'
        : 'Elegí una cobertura para cargar la suma asegurada'

      const checkHtml = `
        <span class="cobertura-adicional-card__check cobertura-adicional-card__check--estatico ${l.codigo ? 'is-filled' : ''}" aria-hidden="true">
          <span class="cobertura-adicional-card__dot"></span>
        </span>
      `

      const mainHtml = `
        <label class="sr-only" for="cobertura-linea-${l.id}-codigo">Cobertura de la línea</label>
        <select class="field-input" id="cobertura-linea-${l.id}-codigo" data-linea-id="${l.id}" data-linea-field="codigo">
          <option value="">Seleccioná una cobertura…</option>
          ${opciones(l.codigo)}
        </select>
      `

      const trailingHtml = `<button type="button" class="btn-outline cobertura-adicional-card__quitar" data-action="remove-cobertura-linea" data-linea-id="${l.id}">Quitar</button>`

      return cardCoberturaAdicional({
        modifier: 'libre',
        locked,
        editing,
        lineaId: l.id,
        codigo: l.codigo,
        sub,
        checkHtml,
        mainHtml,
        trailingHtml,
        sumaAsegurada: l.sumaAsegurada,
        nombreAccesible,
      })
    })
    .join('')

  const quedanCoberturasPorAgregar = quedanCoberturasAdicionalesPorAgregar(catalogoDisponible)

  return `
    <div class="coberturas-adicionales" role="group" aria-labelledby="coberturas-adicionales-label">
      <label id="coberturas-adicionales-label">Coberturas adicionales</label>
      ${filas}
      <button type="button" class="btn-outline${quedanCoberturasPorAgregar ? '' : ' is-locked'}" data-action="add-cobertura-linea" ${quedanCoberturasPorAgregar ? '' : 'disabled title="Ya agregaste el máximo de coberturas disponibles"'}>${quedanCoberturasPorAgregar ? '' : `${ICON_LOCK} `}+ Agregar cobertura</button>
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
      const editing = marcado && state.coberturasAdicionalesEditando.has(linea.id)
      const sub = c.categoria === 'Sublímites' ? 'Sublímite' : 'Cobertura'

      const checkHtml = `
        <label class="cobertura-adicional-card__check">
          <input type="checkbox" class="sr-only" data-action="toggle-cobertura-checkbox" data-codigo="${escapeHtml(c.codigo)}" ${marcado ? 'checked' : ''} />
          <span class="cobertura-adicional-card__dot" aria-hidden="true"></span>
          <span class="sr-only">${escapeHtml(c.nombre)}</span>
        </label>
      `

      const mainHtml = `<span class="cobertura-adicional-card__nombre">${escapeHtml(c.nombre)}</span>`

      return cardCoberturaAdicional({
        modifier: 'fija',
        locked: !marcado,
        editing,
        lineaId: linea?.id,
        codigo: c.codigo,
        sub,
        checkHtml,
        mainHtml,
        sumaAsegurada: linea?.sumaAsegurada,
        nombreAccesible: c.nombre,
      })
    })
    .join('')

  return `
    <div class="coberturas-adicionales coberturas-adicionales--checkbox" role="group" aria-labelledby="coberturas-adicionales-label">
      <label id="coberturas-adicionales-label">Coberturas adicionales</label>
      ${filas || '<div class="empty-state__subtitle">No hay coberturas adicionales disponibles para este plan.</div>'}
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

export function camposEspecificosParaRamo(ramo, plan) {
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

export function renderPlanRow() {
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

export function renderDatosView(ramo) {
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
            <!-- Sin atributo disabled nativo a propósito (solo aria-disabled) — ver el comentario
                 de .tab-btn[aria-disabled] en cotizador.css: sacarlo del orden de tabulación hacía
                 que, al llegar acá tabulando, el foco se perdiera y saltara al botón hamburguesa
                 del sidebar en ≤1024px. El guard real está en el click handler de events.js. -->
            <button
              id="btn-ver-detalle"
              class="btn-primary form-cta"
              data-action="show-tab"
              data-view="result"
              ${puedeAvanzarADetalle() ? '' : `title="Corregí el capital declarado antes de avanzar — ver el mensaje de alerta" aria-disabled="true" aria-describedby="${MOTIVO_BLOQUEO_ID}"`}
            >Ver detalle completo →</button>
          </div>
        </div>
      </div>
      <div class="live-summary" id="live-summary">${renderLivePanelContent()}</div>
    </div>
  `
}
