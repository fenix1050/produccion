import { auth } from '../../shared/api.js'
import { escapeHtml } from '../../shared/dom.js'
import { fmtGsConPrefijo as fmtGs, fmtUsdConPrefijo as fmtUsd } from '../../shared/format.js'
import { state } from '../state.js'
import { renderCampoInline } from './campos-inline.js'
import { renderRpfCuotas } from './rpf-cuotas.js'

// Render de la sección Planes (tabla de planes + formas de pago expandibles) —
// extraído de admin.js (WU admin-module-split, PR5).

export function renderPlanes() {
  const opcionesRamo = state.ramos
    .map(
      (r) => `
    <option value="${r.id}" ${state.ramoFiltro === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `
    )
    .join('')

  return `
    ${renderRpfCuotas()}
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Planes</span>
        <select class="field-input" style="width: auto;" data-action="filtrar-ramo" aria-label="Filtrar por ramo">
          <option value="todos" ${state.ramoFiltro === 'todos' ? 'selected' : ''}>Todos los ramos</option>
          ${opcionesRamo}
        </select>
      </div>
      <div class="card__body">
        ${renderTablaPlanes()}
      </div>
    </div>
  `
}

function renderTablaPlanes() {
  if (state.loadingPlanes) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando planes…</div>'
  }
  if (state.planesError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.planesError)}</div>`
  }

  const planesFiltrados =
    state.ramoFiltro === 'todos'
      ? state.planes
      : state.planes.filter((p) => String(p.ramo_id) === state.ramoFiltro)

  if (!planesFiltrados.length) {
    return '<div class="empty-state__subtitle">No hay planes para mostrar.</div>'
  }

  const filas = planesFiltrados
    .map(
      (p) => `
    <tr>
      <td data-label="Plan">${renderCampoNombrePlan(p)}</td>
      <td data-label="Ramo">${escapeHtml(p.ramos?.nombre_display ?? '')}</td>
      <td data-label="Estado">
        <label class="admin-modal__checkbox">
          <input type="checkbox" data-action="toggle-plan-activo" data-id="${p.id}" ${p.activo ? 'checked' : ''} />
          ${p.activo ? 'Activo' : 'Inactivo'}
        </label>
      </td>
      <td data-label="Prima técnica mínima">${renderCampoPrimaTecnicaMinima(p)}</td>
      <td data-label="Topes desc./recargo (%)">${renderCampoTopes(p)}</td>
      <td data-label="Formas de pago">
        <button class="btn-outline" data-action="toggle-formas-pago" data-id="${p.id}">
          ${state.planExpandido === p.id ? 'Ocultar' : 'Formas de pago'}
        </button>
      </td>
      <td data-label="Acciones">
        <button class="btn-outline" data-action="eliminar-plan" data-id="${p.id}">Eliminar</button>
      </td>
    </tr>
    ${state.planExpandido === p.id ? `<tr class="admin-subrow"><td colspan="7">${renderFormasPagoDelPlan(p.id)}</td></tr>` : ''}
  `
    )
    .join('')

  return `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Plan</th>
            <th>Ramo</th>
            <th>Estado</th>
            <th>Prima técnica mínima</th>
            <th>Topes desc./recargo (%)</th>
            <th>Formas de pago</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}

// Cambio `rpf-variable-mrc`: el escalar viejo `tasa_rpf` deja de editarse desde acá para los
// 3 ramos migrados (MRC/Incendio/Vida-AP, ver `ramos.usa_rpf_por_cuotas`) — ahora usan la
// grilla global de `renderRpfCuotas()`. Auto/Auto-Flota (sin el flag) conservan la columna
// intacta, sin fallback ni modo solo-lectura (design.md Decisión 10, Engram #391 decisión 5).
function renderFormasPagoDelPlan(planId) {
  const entry = state.formasPagoPorPlan[planId]
  if (!entry || entry.loading) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando formas de pago…</div>'
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`
  }
  if (!entry.datos.length) {
    return '<div class="empty-state__subtitle">Este plan no tiene formas de pago configuradas.</div>'
  }

  const plan = state.planes.find((p) => p.id === planId)
  const ramo = state.ramos.find((r) => r.id === plan?.ramo_id)
  const usaCurva = Boolean(ramo?.usa_rpf_por_cuotas)

  const filas = entry.datos
    .map(
      (f) => `
    <tr>
      <td data-label="Forma de pago">${escapeHtml(f.formas_pago?.nombre_display ?? '')}</td>
      ${usaCurva ? '' : `<td data-label="Tasa RPF (%)">${renderCampoTasaRpf(f, planId)}</td>`}
      <td data-label="Estado">
        <label class="admin-modal__checkbox">
          <input type="checkbox" data-action="toggle-forma-pago-habilitada" data-id="${f.id}" data-plan-id="${planId}" ${f.habilitada ? 'checked' : ''} />
          ${f.habilitada ? 'Habilitada' : 'Deshabilitada'}
        </label>
      </td>
    </tr>
  `
    )
    .join('')

  return `
    <div class="admin-table-scroll">
      <table class="admin-table admin-table--nested">
        <thead>
          <tr>
            <th>Forma de pago</th>
            ${usaCurva ? '' : '<th>Tasa RPF (%)</th>'}
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}

function esPlanSoloUsd(plan) {
  return (
    Array.isArray(plan.monedas_permitidas) &&
    plan.monedas_permitidas.length === 1 &&
    plan.monedas_permitidas[0] === 'USD'
  )
}

// El input de nombre (columna PLAN) vive en <td> aparte de este form, así que se
// asocia via el atributo `form` en vez de anidarlo — un <input> puede pertenecer a un
// <form> ubicado en cualquier parte del documento mientras comparta el mismo id.
function renderCampoNombrePlan(plan) {
  if (!state.primaEnEdicion.has(plan.id)) {
    return escapeHtml(plan.nombre)
  }
  return `<input class="field-input field-input--sm" type="text" name="nombre" form="plan-form-${plan.id}" value="${escapeHtml(plan.nombre)}" />`
}

function renderCampoPrimaTecnicaMinima(plan) {
  const soloUsd = esPlanSoloUsd(plan)
  const campo = soloUsd ? 'prima_tecnica_minima_usd' : 'prima_tecnica_minima'
  const valor = plan[campo]
  const fmt = soloUsd ? fmtUsd : fmtGs

  return renderCampoInline({
    editando: state.primaEnEdicion.has(plan.id),
    id: plan.id,
    // formId: compartido con renderCampoNombrePlan (input `form="plan-form-${plan.id}"`
    // en otro <td>) — no cambiar sin revisar ese acoplamiento entre columnas.
    formId: `plan-form-${plan.id}`,
    formAction: 'prima-tecnica-minima',
    accionEditar: 'editar-prima-tecnica-minima',
    accionCancelar: 'cancelar-prima-tecnica-minima',
    lectura: `<span>${valor != null ? escapeHtml(fmt(valor)) : '—'}</span>`,
    campos: [{ tipo: 'number', name: campo, step: '0.01', value: valor, autofocus: true }],
  })
}

// Solo el rol admin literal puede editar estos dos campos (ver guardarPlanTopes /
// admin.routes.js) — un Jefe/Analista de Riesgo puede ver la sección Planes vía
// puede_editar_planes, pero no debe poder subir el tope que limita su propio descuento
// (puede_editar_descuento_plan). Sin el botón "Editar" para ellos, solo lectura.
function renderCampoTopes(plan) {
  const esAdmin = auth.getUsuario()?.rol === 'admin'
  const descuento = plan.descuento_maximo
  const recargo = plan.recargo_maximo

  return renderCampoInline({
    editando: state.topesEnEdicion.has(plan.id),
    id: plan.id,
    formId: `plan-topes-form-${plan.id}`,
    formAction: 'plan-topes',
    accionEditar: 'editar-plan-topes',
    accionCancelar: 'cancelar-plan-topes',
    // Rol admin literal, no permiso delegable puede_editar_planes — ver comentario arriba
    // de esta función y guardarPlanTopes.
    puedeEditar: esAdmin,
    lectura: `
        <span class="admin-valor-fijo__lineas">
          <span>Desc.: ${descuento != null ? escapeHtml(String(descuento)) + '%' : '—'}</span>
          <span>Rec.: ${recargo != null ? escapeHtml(String(recargo)) + '%' : '—'}</span>
        </span>
      `,
    campos: [
      {
        tipo: 'number',
        name: 'descuento_maximo',
        step: '0.01',
        min: '0',
        max: '100',
        value: descuento,
        placeholder: 'Desc. %',
        autofocus: true,
      },
      {
        tipo: 'number',
        name: 'recargo_maximo',
        step: '0.01',
        min: '0',
        max: '100',
        value: recargo,
        placeholder: 'Rec. %',
      },
    ],
  })
}

function renderCampoTasaRpf(formaPagoPlan, planId) {
  return renderCampoInline({
    editando: state.tasaRpfEnEdicion.has(formaPagoPlan.id),
    id: formaPagoPlan.id,
    planId,
    formAction: 'tasa-rpf',
    accionEditar: 'editar-tasa-rpf',
    accionCancelar: 'cancelar-tasa-rpf',
    lectura: `<span>${escapeHtml(String(formaPagoPlan.tasa_rpf))}</span>`,
    campos: [
      {
        tipo: 'number',
        name: 'tasa_rpf',
        step: '0.001',
        value: formaPagoPlan.tasa_rpf,
        autofocus: true,
      },
    ],
  })
}
