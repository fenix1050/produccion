import { api } from '../shared/api.js';

// Cotizador Tajy — App Shell + Datos + Resultado (Fase 6, alcance MRC plan Normal).
// Recreación en Vanilla JS del handoff de diseño `design_handoff_cotizador/Cotizador-B.dc.html`
// (framework de mockup "x-dc" — NO se copia literal, es solo referencia visual/de copy).
// La pantalla de Login del handoff no se implementa: no hay auth en el backend todavía.

// ---- Metadata de ramos mostrados en el sidebar (5 ramos reales del sistema) ----
// El código de 2 letras y el estado (disponible/pausa/próximamente) son decisión de UI —
// no vienen de la base. El resto de los ramos seedeados (auto-flota, tro, transporte) no
// se muestran acá: no fueron pedidos para este flujo.
const RAMOS_UI = [
  { nombre: 'auto', code: 'AU', label: 'Auto Individual', estado: 'pausa' },
  { nombre: 'mrc', code: 'MR', label: 'Multirriesgo Comercio', estado: 'disponible' },
  { nombre: 'incendio', code: 'IN', label: 'Incendio', estado: 'disponible' },
  { nombre: 'vida-ap', code: 'VA', label: 'Vida y Accidentes Personales', estado: 'disponible' },
  { nombre: 'hogar', code: 'MH', label: 'Multirriesgo Hogar', estado: 'proximamente' },
];

// Único ramo con calculador real conectado en esta pasada (ver CLAUDE.md — MRC primero).
const RAMO_CON_CALCULO = 'mrc';

const CLIENT_FIELDS = [
  { key: 'clienteNombre', label: 'Nombre del asegurado', placeholder: 'Juan Pérez', span: 2 },
  { key: 'cedula', label: 'RUC / Cédula de identidad', placeholder: '4.123.456', span: 1 },
  { key: 'direccion', label: 'Dirección', placeholder: 'Av. España 1234, Asunción', span: 1 },
];

const CIUDADES = ['Asunción', 'Ciudad del Este', 'Encarnación', 'Otra'];

const DEBOUNCE_MS = 450;

const state = {
  ramosActivos: [],
  ramoId: null,
  planes: [],
  planId: null,
  rubros: [],
  view: 'form', // 'form' | 'result'
  data: {},
  preview: null,
  previewError: null,
  loadingPreview: false,
  // Forma de pago elegida por el agente en el cotizador (sección "Cotización en vivo").
  // Se conserva mientras dure la cotización y es la que después va a mostrarse también
  // en "Detalle del plan" y en la Carta Oferta (cuando se implemente) — ver PLAN_DESARROLLO.md
  // sección 5: las 4 formas de pago se calculan siempre en simultáneo, pero el agente
  // presenta una sola al cliente.
  formaPagoCodigo: null,
};

let debounceTimer = null;
const app = document.getElementById('app');

async function init() {
  try {
    state.ramosActivos = await api.get('/ramos');
  } catch (err) {
    console.error('No se pudo cargar la lista de ramos', err);
    state.ramosActivos = [];
  }
  renderApp();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtGs(n) {
  const num = Math.round(Number(n) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

function ramoInfo(nombre) {
  return RAMOS_UI.find((r) => r.nombre === nombre) || null;
}

function ramoActivo(nombre) {
  return state.ramosActivos.find((r) => r.nombre === nombre) || null;
}

// ---------------------------------------------------------------------------
// Acciones de estado
// ---------------------------------------------------------------------------

async function selectRamo(nombre) {
  state.ramoId = nombre;
  state.view = 'form';
  state.data = {};
  state.planId = null;
  state.planes = [];
  state.rubros = [];
  state.preview = null;
  state.previewError = null;
  state.formaPagoCodigo = null;
  renderApp();

  const ramo = ramoActivo(nombre);
  if (!ramo) return;

  try {
    state.planes = await api.get(`/ramos/${ramo.id}/planes`);
  } catch (err) {
    console.error('No se pudieron cargar los planes del ramo', err);
    state.planes = [];
  }

  if (nombre === RAMO_CON_CALCULO) {
    // Preselecciona el único plan calculable hoy (RPF confirmado).
    const planCalculable = state.planes.find((p) => p.prima_tecnica_minima != null);
    state.planId = planCalculable ? planCalculable.id : state.planes[0]?.id ?? null;

    try {
      state.rubros = await api.get('/ramos/rubros-actividad?grupo=MRC');
    } catch (err) {
      console.error('No se pudieron cargar los rubros de actividad', err);
      state.rubros = [];
    }
  } else {
    state.planId = state.planes[0]?.id ?? null;
  }

  renderApp();
}

function selectPlan(planId) {
  const plan = state.planes.find((p) => p.id === planId);
  if (!plan || plan.prima_tecnica_minima == null) return; // plan sin RPF confirmado: bloqueado
  state.planId = planId;
  renderApp();
  scheduleCalculate();
}

function selectFormaPago(codigo) {
  state.formaPagoCodigo = codigo;
  renderLivePanel();
  if (state.view === 'result') renderApp();
}

function setView(view) {
  state.view = view;
  renderApp();
}

function updateField(key, value) {
  state.data[key] = value;
  if (state.ramoId === RAMO_CON_CALCULO) {
    scheduleCalculate();
  }
}

function scheduleCalculate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(calcularPreview, DEBOUNCE_MS);
}

function datosMinimosCompletos() {
  if (state.ramoId !== RAMO_CON_CALCULO || !state.planId) return false;
  const d = state.data;
  const capitalEdificio = Number(d.capitalEdificio) || 0;
  const capitalContenido = Number(d.capitalContenido) || 0;
  return Boolean(d.rubroActividad) && Boolean(d.ciudad) && (capitalEdificio > 0 || capitalContenido > 0);
}

async function calcularPreview() {
  if (!datosMinimosCompletos()) {
    state.preview = null;
    state.previewError = null;
    renderLivePanel();
    if (state.view === 'result') renderApp();
    return;
  }

  const d = state.data;
  const body = {
    plan_id: state.planId,
    capital_asegurado: (Number(d.capitalEdificio) || 0) + (Number(d.capitalContenido) || 0),
    riesgo_datos: {
      cedula: d.cedula || '',
      direccion: d.direccion || '',
      rubro_actividad: d.rubroActividad || '',
      ciudad: d.ciudad || '',
      capital_edificio: Number(d.capitalEdificio) || 0,
      capital_contenido: Number(d.capitalContenido) || 0,
    },
    descuentos: [],
    recargos: [],
    cliente_nombre: d.clienteNombre || '',
  };

  state.loadingPreview = true;
  renderLivePanel();

  try {
    const resultado = await api.post('/cotizaciones/calcular', body);
    state.preview = resultado;
    state.previewError = null;
    // Primera vez que llega un cálculo: default a "Contado" (sin RPF) si el agente
    // todavía no eligió forma de pago. Si ya había una elegida, se respeta.
    if (!state.formaPagoCodigo) {
      state.formaPagoCodigo = resultado.variantes?.[0]?.formasPago?.find((fp) => fp.codigo === 'contado')?.codigo
        ?? resultado.variantes?.[0]?.formasPago?.[0]?.codigo
        ?? null;
    }
  } catch (err) {
    state.preview = null;
    state.previewError = err.message || 'No se pudo calcular la cotización.';
  } finally {
    state.loadingPreview = false;
    renderLivePanel();
    if (state.view === 'result') renderApp();
  }
}

// ---------------------------------------------------------------------------
// Forma de pago: las 4 (Contado, Crédito/Cobrador, Boca de Cobranza, Tarjeta de Crédito)
// siempre se calculan en simultáneo (ver PLAN_DESARROLLO.md sección 5) — acá el agente
// elige UNA para presentarle al cliente en el cotizador. Esa elección se conserva en
// state.formaPagoCodigo y es la que se vuelve a mostrar en "Detalle del plan" y, más
// adelante, en la Carta Oferta.
// ---------------------------------------------------------------------------

function formasPagoDisponibles() {
  return state.preview?.variantes?.[0]?.formasPago ?? [];
}

function formaPagoSeleccionada() {
  const formas = formasPagoDisponibles();
  if (!formas.length) return null;
  return formas.find((fp) => fp.codigo === state.formaPagoCodigo) || formas[0];
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderApp() {
  const ramo = state.ramoId ? ramoInfo(state.ramoId) : null;

  let contenido;
  if (!ramo) {
    contenido = renderEmptyState();
  } else if (ramo.estado === 'pausa' || ramo.estado === 'proximamente') {
    contenido = renderRamoNoDisponible(ramo);
  } else if (state.view === 'form') {
    contenido = renderDatosView(ramo);
  } else {
    contenido = renderResultadoView(ramo);
  }

  app.innerHTML = `
    ${renderSidebar()}
    <div class="main">
      ${renderHeader(ramo)}
      ${ramo && state.ramoId === RAMO_CON_CALCULO && ramo.estado === 'disponible' ? renderPlanRow() : ''}
      ${contenido}
    </div>
  `;
}

function renderSidebar() {
  const rows = RAMOS_UI.map((r) => {
    const activa = r.nombre === state.ramoId;
    const estadoTexto = r.estado === 'pausa' ? 'En pausa' : r.estado === 'proximamente' ? 'Próximamente' : '';
    return `
      <div class="ramo-row ${activa ? 'ramo-row--activa' : ''} ${r.estado !== 'disponible' ? `ramo-row--${r.estado}` : ''}" data-action="select-ramo" data-ramo="${r.nombre}">
        <div class="ramo-row__badge">${r.code}</div>
        <div class="ramo-row__label">${r.label}</div>
        ${estadoTexto ? `<div class="ramo-row__estado">${estadoTexto}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="sidebar">
      <div class="sidebar__brand">
        <img src="../../logo/logo.png" alt="Tajy" />
        <div class="sidebar__brand-name">Tajy · Cotizador</div>
      </div>
      <div class="sidebar__section-label">Ramo a cotizar</div>
      <div class="ramo-list">${rows}</div>
      <div class="sidebar__footer">
        <div class="nav-item">📋 Historial de cotizaciones</div>
        <div class="nav-item">⚙️ Configuración (admin)</div>
        <div class="sidebar__agent">
          <div class="sidebar__agent-avatar">AG</div>
          <div>
            <div class="sidebar__agent-name">Agente</div>
            <div class="sidebar__agent-role">Analista comercial</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderHeader(ramo) {
  const subtitle = ramo ? `Cotizando ${ramo.label} para el cliente` : 'Elegí un ramo para comenzar';
  const showTabs = Boolean(ramo) && ramo.estado !== 'pausa' && ramo.estado !== 'proximamente';

  return `
    <div class="main-header">
      <div>
        <div class="main-header__title">Nueva cotización</div>
        <div class="main-header__subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${showTabs ? `
        <div class="tabs">
          <button class="tab-btn ${state.view === 'form' ? 'tab-btn--active' : ''}" data-action="show-tab" data-view="form">Datos</button>
          <button class="tab-btn ${state.view === 'result' ? 'tab-btn--active' : ''}" data-action="show-tab" data-view="result">Detalle del plan</button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderPlanRow() {
  const pills = state.planes.map((p) => {
    const activo = p.id === state.planId;
    const calculable = p.prima_tecnica_minima != null;
    return `
      <button
        class="plan-pill ${activo ? 'plan-pill--active' : ''} ${!calculable ? 'plan-pill--disabled' : ''}"
        data-action="select-plan"
        data-plan-id="${p.id}"
        ${!calculable ? 'title="RPF pendiente de confirmar — todavía no se puede cotizar este plan" disabled' : ''}
      >${escapeHtml(p.nombre)}</button>
    `;
  }).join('');

  return `
    <div class="plan-row">
      <div class="plan-row__label">Plan a presentar:</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${pills}</div>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state__title">Seleccioná un ramo en el panel izquierdo</div>
      <div class="empty-state__subtitle">El formulario y la cotización aparecerán acá.</div>
    </div>
  `;
}

function renderRamoNoDisponible(ramo) {
  const mensaje = ramo.estado === 'pausa'
    ? 'Auto Individual está en pausa (Fase 2 pausada por prioridad de Kevin) — no se puede cotizar desde acá por ahora.'
    : 'Multirriesgo Hogar todavía no fue solicitado por el cliente — próximamente.';
  return `
    <div class="empty-state">
      <div class="empty-state__title">${escapeHtml(ramo.label)}</div>
      <div class="empty-state__subtitle">${escapeHtml(mensaje)}</div>
    </div>
  `;
}

function renderDatosView(ramo) {
  const esCalculable = state.ramoId === RAMO_CON_CALCULO;

  const camposEspecificos = esCalculable ? `
    <div class="field">
      <label>Rubro de actividad</label>
      <select class="field-input" data-field="rubroActividad">
        <option value="">Seleccioná un rubro…</option>
        ${state.rubros.map((r) => `<option value="${escapeHtml(r.nombre)}" ${state.data.rubroActividad === r.nombre ? 'selected' : ''}>${escapeHtml(r.nombre)}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Ciudad</label>
      <select class="field-input" data-field="ciudad">
        <option value="">Seleccioná una ciudad…</option>
        ${CIUDADES.map((c) => `<option value="${c}" ${state.data.ciudad === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Capital Edificio (Gs.)</label>
      <input class="field-input" type="number" min="0" data-field="capitalEdificio" placeholder="450000000" value="${escapeHtml(state.data.capitalEdificio ?? '')}" />
    </div>
    <div class="field">
      <label>Capital Contenido (Gs.)</label>
      <input class="field-input" type="number" min="0" data-field="capitalContenido" placeholder="120000000" value="${escapeHtml(state.data.capitalContenido ?? '')}" />
    </div>
  ` : `
    <div class="field field--span2">
      <div class="live-summary__pending" style="margin-top:4px;">
        Este ramo todavía no tiene su calculador conectado en el cotizador — el formulario de datos
        específicos se agrega en otra tarea. Podés cargar los datos del cliente mientras tanto.
      </div>
    </div>
  `;

  return `
    <div class="datos-view panel">
      <div class="datos-view__form">
        <div class="datos-view__form-inner">
          <div class="form-heading">
            <div class="form-heading__badge">${ramo.code}</div>
            <div class="form-heading__label">${escapeHtml(ramo.label)}</div>
          </div>
          <div class="field-grid">
            ${CLIENT_FIELDS.map((f) => `
              <div class="field ${f.span === 2 ? 'field--span2' : ''}">
                <label>${f.label}</label>
                <input class="field-input" type="text" data-field="${f.key}" placeholder="${f.placeholder}" value="${escapeHtml(state.data[f.key] ?? '')}" />
              </div>
            `).join('')}
            ${camposEspecificos}
          </div>
          <button class="btn-primary form-cta" data-action="show-tab" data-view="result">Ver detalle completo →</button>
        </div>
      </div>
      <div class="live-summary" id="live-summary">${renderLivePanelContent()}</div>
    </div>
  `;
}

function renderLivePanelContent() {
  if (state.ramoId !== RAMO_CON_CALCULO) {
    return `
      <div class="live-summary__label">Cotización en vivo</div>
      <div class="live-summary__pending">Cálculo pendiente de confirmación de tasas para este ramo.</div>
    `;
  }

  if (state.previewError) {
    return `
      <div class="live-summary__label">Cotización en vivo</div>
      <div class="live-summary__error">${escapeHtml(state.previewError)}</div>
    `;
  }

  if (!state.preview) {
    return `
      <div class="live-summary__label">Cotización en vivo</div>
      <div class="live-summary__pending">${state.loadingPreview ? 'Calculando…' : 'Completá Rubro, Ciudad y al menos un Capital para ver la prima.'}</div>
    `;
  }

  const fp = formaPagoSeleccionada();
  const coberturasCount = state.preview.coberturas?.length ?? 0;

  return `
    <div class="live-summary__label">Cotización en vivo</div>
    ${renderFormaPagoPills()}
    <div class="live-summary__price">${fmtGs(fp.cuota || fp.premio)}</div>
    <div class="live-summary__sub">Gs. / mes · ${fmtGs(fp.premio)} Gs. premio total</div>
    <div class="live-summary__divider"></div>
    <div class="live-summary__rows">
      <div class="live-summary__row"><span>Franquicia</span><span>Sin franquicia</span></div>
      <div class="live-summary__row"><span>Forma de pago</span><span>${escapeHtml(fp.nombre_display)}</span></div>
      <div class="live-summary__row"><span>Vigencia</span><span>12 meses</span></div>
      <div class="live-summary__row"><span>Coberturas</span><span>${coberturasCount} incluidas</span></div>
    </div>
    <div class="live-summary__hint">El monto se recalcula automáticamente a medida que completás los datos.</div>
  `;
}

// Selector de forma de pago — mismo look de pill que el selector de plan. Vive en el
// panel de cotización en vivo (donde el agente arma la cotización); "Detalle del plan"
// solo muestra la elegida, de solo lectura (ver renderResultadoView).
function renderFormaPagoPills() {
  const formas = formasPagoDisponibles();
  if (!formas.length) return '';

  const pills = formas.map((fp) => {
    const activo = fp.codigo === state.formaPagoCodigo;
    return `
      <button
        class="plan-pill ${activo ? 'plan-pill--active' : ''}"
        data-action="select-forma-pago"
        data-forma="${fp.codigo}"
      >${escapeHtml(fp.nombre_display)}</button>
    `;
  }).join('');

  return `
    <div class="forma-pago-row">
      <div class="forma-pago-row__label">Forma de pago:</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">${pills}</div>
    </div>
  `;
}

function renderLivePanel() {
  const el = document.getElementById('live-summary');
  if (el) el.innerHTML = renderLivePanelContent();
}

function renderResultadoView(ramo) {
  const esCalculable = state.ramoId === RAMO_CON_CALCULO;
  const plan = state.planes.find((p) => p.id === state.planId);
  const planLabel = plan ? plan.nombre : '—';

  if (!esCalculable || !state.preview) {
    return `
      <div class="resultado-view panel">
        <div class="resultado-view__inner">
          <div class="resultado-hero">
            <div>
              <div class="resultado-hero__label">Plan ${escapeHtml(planLabel)} · ${escapeHtml(ramo.label)}</div>
              <div class="resultado-hero__price">— <span>Gs. / mes</span></div>
            </div>
            <button class="btn-primary" data-action="emitir-carta" disabled title="Requiere una cotización calculada">Emitir carta oferta</button>
          </div>
          <div class="empty-state" style="padding:12px 0;">
            <div class="empty-state__subtitle">
              ${esCalculable ? 'Completá los datos del riesgo en la pestaña "Datos" para ver el detalle del plan.' : 'Cálculo pendiente de confirmación de tasas para este ramo.'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  const fp = formaPagoSeleccionada();
  const coberturas = state.preview.coberturas || [];

  return `
    <div class="resultado-view panel">
      <div class="resultado-view__inner">
        <div class="resultado-hero">
          <div>
            <div class="resultado-hero__label">Plan ${escapeHtml(planLabel)} · ${escapeHtml(ramo.label)}</div>
            <div class="resultado-hero__price">${fmtGs(fp.cuota || fp.premio)} <span>Gs. / mes</span></div>
          </div>
          <button class="btn-primary" data-action="emitir-carta">Emitir carta oferta</button>
        </div>
        <div class="resultado-grid">
          <div class="card">
            <div class="card__title">Coberturas incluidas</div>
            ${coberturas.map((c) => `
              <div class="cobertura-row">
                <div class="cobertura-row__name">
                  <div class="cobertura-row__check">✓</div>
                  <div>${escapeHtml(c.nombre)}</div>
                </div>
                <div class="cobertura-row__monto">${typeof c.monto === 'number' ? `${fmtGs(c.monto)} Gs.` : escapeHtml(c.monto ?? '—')}</div>
              </div>
            `).join('')}
          </div>
          <div class="card card--pink">
            <div class="card__title">Resumen</div>
            <div class="resumen-rows">
              <div class="live-summary__row"><span>Franquicia</span><span>Sin franquicia</span></div>
              <div class="live-summary__row"><span>Forma de pago</span><span>${escapeHtml(fp.nombre_display)}</span></div>
              <div class="live-summary__row"><span>Premio total</span><span>${fmtGs(fp.premio)} Gs.</span></div>
            </div>
            <button class="btn-outline" style="width:100%;margin-top:20px;" data-action="show-tab" data-view="form">Editar datos / forma de pago</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Eventos (delegación sobre #app, registrada una única vez — renderApp() reemplaza el
// innerHTML de #app pero no el nodo #app en sí, así que estos listeners sobreviven a
// cada re-render sin necesidad de volver a engancharlos).
// ---------------------------------------------------------------------------

app.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target || target.disabled) return;

  const action = target.dataset.action;
  if (action === 'select-ramo') selectRamo(target.dataset.ramo);
  else if (action === 'select-plan') selectPlan(Number(target.dataset.planId));
  else if (action === 'select-forma-pago') selectFormaPago(target.dataset.forma);
  else if (action === 'show-tab') setView(target.dataset.view);
  else if (action === 'emitir-carta') {
    alert('La generación de la Carta Oferta todavía no está implementada (queda para otra tarea).');
  }
});

app.addEventListener('input', (e) => {
  const target = e.target.closest('[data-field]');
  if (!target) return;
  updateField(target.dataset.field, target.value);
});

app.addEventListener('change', (e) => {
  const target = e.target.closest('[data-field]');
  if (!target || target.tagName !== 'SELECT') return;
  updateField(target.dataset.field, target.value);
});

init();
