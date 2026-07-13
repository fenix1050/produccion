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

// Opciones de franquicia/deducible que el agente puede elegir por cobertura, según lo que le
// interese al asegurado — misma lista para cualquier cobertura de MRC (confirmado por Kevin,
// 2026-07-13). Puramente informativo para la propuesta: no cambia la prima ya calculada.
// `monto` es el mínimo de la franquicia (null = "Sin deducible", no aplica %).
const FRANQUICIA_OPCIONES = [
  { valor: 'sin_deducible', label: 'Sin deducible', monto: null },
  { valor: '10_500000', label: '10% en todo y cada siniestro, mínimo Gs. 500.000', monto: 500000 },
  { valor: '10_800000', label: '10% en todo y cada siniestro, mínimo Gs. 800.000', monto: 800000 },
  { valor: '10_1000000', label: '10% en todo y cada siniestro, mínimo Gs. 1.000.000', monto: 1000000 },
  { valor: '10_1200000', label: '10% en todo y cada siniestro, mínimo Gs. 1.200.000', monto: 1200000 },
  { valor: '10_1500000', label: '10% en todo y cada siniestro, mínimo Gs. 1.500.000', monto: 1500000 },
];

function franquiciaValorPorDefecto(franquiciaDefaultMonto) {
  if (!franquiciaDefaultMonto) return 'sin_deducible';
  const match = FRANQUICIA_OPCIONES.find((o) => o.monto === franquiciaDefaultMonto);
  return match ? match.valor : 'sin_deducible';
}

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
  // Franquicia elegida por el agente para cada cobertura (codigo -> valor de FRANQUICIA_OPCIONES).
  // Puramente informativo para la propuesta — no afecta la prima ya calculada.
  franquiciasPorCobertura: {},
  // Catálogo de coberturas del plan actual (plan_coberturas + coberturas_catalogo), usado para
  // poblar el selector de "Coberturas adicionales". Se carga una vez al elegir plan.
  coberturasCatalogo: [],
  // Líneas de coberturas/sublímites adicionales que el agente agrega a mano, más allá de las
  // 2 fijas (Incendio Edificio / Incendio Contenido). Cada línea: { id, codigo, sumaAsegurada }.
  coberturasAdicionales: [],
};

// Códigos que no deben ofrecerse en "Coberturas adicionales": las 2 fijas ya tienen su propio
// campo en el formulario, y sublimite_cctv todavía no tiene tasa cargada (no cotizable).
const CODIGOS_COBERTURA_EXCLUIDOS = ['incendio_edificio', 'incendio_contenido', 'sublimite_cctv'];

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

// Como fmtGs, pero para inputs editables: un capital vacío debe mostrarse vacío,
// no "0" (fmtGs normal trata undefined/"" como 0 para totales/montos ya calculados).
function fmtGsInput(digits) {
  if (digits === undefined || digits === null || digits === '') return '';
  return fmtGs(digits);
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
  state.franquiciasPorCobertura = {};
  state.rubros = [];
  state.coberturasCatalogo = [];
  state.coberturasAdicionales = [];
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
    state.data.cuotas = planCalculable?.cuotas_default ?? null;

    try {
      // Sin filtro de grupo: la pantalla "Tipo de Riesgo" del sistema de escritorio
      // muestra los 49 rubros juntos (MRC y TRO comparten la misma lista visual).
      state.rubros = await api.get('/ramos/rubros-actividad');
    } catch (err) {
      console.error('No se pudieron cargar los tipos de riesgo', err);
      state.rubros = [];
    }

    // El catálogo de coberturas es por RAMO, no por plan (mismas coberturas disponibles
    // para "Normal" y "Protección Total") — se carga una sola vez acá.
    await cargarCoberturasCatalogo(ramo.id);
  } else {
    state.planId = state.planes[0]?.id ?? null;
  }

  renderApp();
}

function selectPlan(planId) {
  const plan = state.planes.find((p) => p.id === planId);
  if (!plan || plan.prima_tecnica_minima == null) return; // plan sin RPF confirmado: bloqueado
  state.planId = planId;
  state.data.cuotas = plan.cuotas_default ?? null;
  state.coberturasAdicionales = [];
  renderApp();
  scheduleCalculate();
}

// Catálogo COMPLETO de coberturas del ramo (coberturas_catalogo vía GET /ramos/:id/coberturas-catalogo)
// — a diferencia de GET /planes/:id/coberturas (plan_coberturas), que en MRC solo trae los
// sublímites por defecto, no las coberturas principales (Robo contenido, Cristales, etc.).
// Se usa para poblar el selector de "Coberturas adicionales" con nombre + categoría.
async function cargarCoberturasCatalogo(ramoId) {
  try {
    state.coberturasCatalogo = await api.get(`/ramos/${ramoId}/coberturas-catalogo`);
  } catch (err) {
    console.error('No se pudo cargar el catálogo de coberturas del ramo', err);
    state.coberturasCatalogo = [];
  }
}

// Opciones seleccionables en "Coberturas adicionales": el catálogo del ramo sin las 2 fijas
// (tienen su propio campo) ni sublimite_cctv (sin tasa cargada todavía — no cotizable).
function coberturasDisponibles() {
  return state.coberturasCatalogo.filter((c) => !CODIGOS_COBERTURA_EXCLUIDOS.includes(c.codigo));
}

function selectFormaPago(codigo) {
  state.formaPagoCodigo = codigo;
  renderLivePanel();
  if (state.view === 'result') renderApp();
}

function selectFranquicia(codigoCobertura, valor) {
  state.franquiciasPorCobertura[codigoCobertura] = valor;
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

// ---------------------------------------------------------------------------
// Coberturas adicionales: líneas cobertura/sublímite más allá de Incendio Edificio/Contenido.
// ---------------------------------------------------------------------------

function addCoberturaLinea() {
  state.coberturasAdicionales.push({ id: crypto.randomUUID(), codigo: '', sumaAsegurada: '' });
  renderApp(); // fila nueva: hace falta re-render completo
}

function removeCoberturaLinea(id) {
  state.coberturasAdicionales = state.coberturasAdicionales.filter((l) => l.id !== id);
  renderApp();
  scheduleCalculate();
}

function updateCoberturaLinea(id, field, value) {
  const linea = state.coberturasAdicionales.find((l) => l.id === id);
  if (!linea) return;
  linea[field] = value;
  scheduleCalculate();
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
    syncAvanceButtons();
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
      coberturas_adicionales: state.coberturasAdicionales
        .filter((l) => l.codigo && Number(l.sumaAsegurada) > 0)
        .map((l) => ({ codigo: l.codigo, suma_asegurada: Number(l.sumaAsegurada) })),
    },
    descuentos: [],
    recargos: [],
    cliente_nombre: d.clienteNombre || '',
    ...(d.cuotas ? { cuotas: Number(d.cuotas) } : {}),
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
    // Defaultea la franquicia de cada cobertura nueva a la de catálogo — sin pisar una que
    // el agente ya haya elegido a mano en esta misma cotización.
    for (const c of resultado.coberturas || []) {
      if (!(c.codigo in state.franquiciasPorCobertura)) {
        state.franquiciasPorCobertura[c.codigo] = franquiciaValorPorDefecto(c.franquicia_default);
      }
    }
  } catch (err) {
    state.preview = null;
    state.previewError = err.message || 'No se pudo calcular la cotización.';
  } finally {
    state.loadingPreview = false;
    renderLivePanel();
    if (state.view === 'result') renderApp();
    syncAvanceButtons();
  }
}

// El botón "Ver detalle completo" y la pestaña "Detalle del plan" viven fuera del subárbol que
// renderLivePanel() actualiza — sin esto quedaban con el estado `disabled` del último render
// completo (ej. mientras el capital todavía era insuficiente) y nunca se desbloqueaban al llegar
// a un cálculo válido. Se actualizan acá directo sobre el DOM en vez de un renderApp() completo,
// para no perder el foco/cursor de los inputs mientras el agente sigue tipeando.
function syncAvanceButtons() {
  const habilitado = puedeAvanzarADetalle();
  const title = habilitado ? '' : 'Corregí el capital declarado antes de avanzar — ver el mensaje de alerta';

  const boton = document.getElementById('btn-ver-detalle');
  if (boton) {
    boton.disabled = !habilitado;
    boton.title = title;
  }

  const tab = document.getElementById('tab-detalle-plan');
  if (tab) {
    tab.disabled = !habilitado;
    tab.title = title;
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
  const bloqueado = !puedeAvanzarADetalle();

  return `
    <div class="main-header">
      <div>
        <div class="main-header__title">Nueva cotización</div>
        <div class="main-header__subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${showTabs ? `
        <div class="tabs">
          <button class="tab-btn ${state.view === 'form' ? 'tab-btn--active' : ''}" data-action="show-tab" data-view="form">Datos</button>
          <button
            id="tab-detalle-plan"
            class="tab-btn ${state.view === 'result' ? 'tab-btn--active' : ''}"
            data-action="show-tab"
            data-view="result"
            ${bloqueado ? 'disabled title="Corregí el capital declarado antes de avanzar — ver el mensaje de alerta"' : ''}
          >Detalle del plan</button>
        </div>
      ` : ''}
    </div>
  `;
}

// El agente no puede pasar a "Detalle del plan" mientras haya una alerta bloqueante
// (prima por debajo de la Prima Técnica Mínima, o capital por encima de la Responsabilidad
// Máxima Cotizable) — ver mrc.calculator.js. Otros ramos (sin calculador conectado todavía)
// no tienen esta restricción.
function puedeAvanzarADetalle() {
  if (state.ramoId !== RAMO_CON_CALCULO) return true;
  return Boolean(state.preview) && !state.previewError;
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
      <label>Tipo de Riesgo</label>
      <select class="field-input" data-field="rubroActividad">
        <option value="">Seleccioná un tipo de riesgo…</option>
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
      <label>Incendio Edificio (Gs.)</label>
      <input class="field-input" type="text" inputmode="numeric" data-field="capitalEdificio" data-money="true" placeholder="450.000.000" value="${fmtGsInput(state.data.capitalEdificio)}" />
    </div>
    <div class="field">
      <label>Incendio Contenido (Gs.)</label>
      <input class="field-input" type="text" inputmode="numeric" data-field="capitalContenido" data-money="true" placeholder="120.000.000" value="${fmtGsInput(state.data.capitalContenido)}" />
    </div>
    <div class="field field--span2">
      ${renderCoberturasAdicionales(coberturasDisponibles())}
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
          <button
            id="btn-ver-detalle"
            class="btn-primary form-cta"
            data-action="show-tab"
            data-view="result"
            ${puedeAvanzarADetalle() ? '' : 'disabled title="Corregí el capital declarado antes de avanzar — ver el mensaje de alerta"'}
          >Ver detalle completo →</button>
        </div>
      </div>
      <div class="live-summary" id="live-summary">${renderLivePanelContent()}</div>
    </div>
  `;
}

// Sección "Coberturas adicionales": líneas cobertura/sublímite más allá de Incendio Edificio/
// Contenido. `catalogoDisponible` ya viene sin las 2 fijas y sin sublimite_cctv (ver
// coberturasDisponibles()).
function renderCoberturasAdicionales(catalogoDisponible) {
  const opciones = (codigoActual) => catalogoDisponible.map((c) => `
    <option value="${escapeHtml(c.codigo)}" ${c.codigo === codigoActual ? 'selected' : ''}>
      ${escapeHtml(c.nombre)}${c.categoria === 'Sublímites' ? ' · Sublímite' : ''}
    </option>
  `).join('');

  const filas = state.coberturasAdicionales.map((l) => `
    <div class="cobertura-adicional-row" data-linea-id="${l.id}">
      <select class="field-input" data-linea-id="${l.id}" data-linea-field="codigo">
        <option value="">Seleccioná una cobertura…</option>
        ${opciones(l.codigo)}
      </select>
      <input
        class="field-input"
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
  `).join('');

  return `
    <div class="coberturas-adicionales">
      <label>Coberturas adicionales</label>
      ${filas || '<div class="live-summary__pending">Todavía no agregaste coberturas adicionales.</div>'}
      <button type="button" class="btn-outline" data-action="add-cobertura-linea">+ Agregar cobertura</button>
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
      <div class="live-summary__pending">${state.loadingPreview ? 'Calculando…' : 'Completá Tipo de Riesgo, Ciudad y al menos un Capital para ver la prima.'}</div>
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
    ${renderCuotasSelect()}
    <div class="live-summary__rows">
      <div class="live-summary__row"><span>Forma de pago</span><span>${escapeHtml(fp.nombre_display)}</span></div>
      <div class="live-summary__row"><span>Cuotas</span><span>Inicial + ${fp.cantidad_cuotas} cuotas</span></div>
      <div class="live-summary__row"><span>Coberturas</span><span>${coberturasCount} incluidas</span></div>
    </div>
    <div class="live-summary__hint">El monto se recalcula automáticamente a medida que completás los datos.</div>
  `;
}

// Cantidad de cuotas: el monto de cada cuota es siempre REDONDEAR.SUP(Premio/12, 1000)
// (fórmula fija, PLAN_DESARROLLO.md sección 5) — este selector no cambia ese monto, define
// cuántas cuotas paga el cliente en total (tope: plan.cuotas_maximo), dato que se guarda en
// `cotizacion_planes_pago.cantidad_cuotas` para la Carta Oferta.
function renderCuotasSelect() {
  const plan = state.planes.find((p) => p.id === state.planId);
  if (!plan?.cuotas_maximo || plan.cuotas_maximo <= 1) return '';

  const actual = Number(state.data.cuotas) || plan.cuotas_default || plan.cuotas_maximo;
  const opciones = Array.from({ length: plan.cuotas_maximo }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${n === actual ? 'selected' : ''}>${n} cuotas</option>`)
    .join('');

  return `
    <div class="field" style="margin-bottom:14px;">
      <label>Cantidad de cuotas</label>
      <select class="field-input" data-field="cuotas">${opciones}</select>
    </div>
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
            <div class="resultado-hero__label">Plan ${escapeHtml(planLabel)} · ${escapeHtml(ramo.label)} · ${escapeHtml(fp.nombre_display)}</div>
            <div class="resultado-hero__price">${fmtGs(fp.cuota || fp.premio)} <span>Gs. / mes</span></div>
          </div>
          <div style="display:flex;gap:10px;">
            <button class="btn-outline" data-action="show-tab" data-view="form">Editar datos / forma de pago</button>
            <button class="btn-primary" data-action="emitir-carta">Emitir carta oferta</button>
          </div>
        </div>
        ${renderResumenContadoFinanciado()}
        <div class="card" style="margin-top:20px;">
          <div class="card__title">Coberturas incluidas</div>
          ${coberturas.map((c) => `
            <div class="cobertura-row">
              <div class="cobertura-row__name">
                <div class="cobertura-row__check">✓</div>
                <div>
                  <span class="cobertura-row__badge cobertura-row__badge--${c.tipo_aplicacion}">${c.tipo_aplicacion === 'sublimite' ? 'Sublímite' : 'Cobertura'}</span>
                  ${escapeHtml(c.nombre)}
                </div>
              </div>
              <div class="cobertura-row__bottom">
                ${renderFranquiciaSelect(c)}
                <div class="cobertura-row__monto">${typeof c.monto === 'number' ? `${fmtGs(c.monto)} Gs.` : escapeHtml(c.monto ?? '—')}</div>
              </div>
            </div>
          `).join('')}
        </div>
        ${renderExclusionesYSublimites(plan)}
      </div>
    </div>
  `;
}

// Bloque "Suma Asegurada / Costo Contado / Costo Financiado" — mismo formato que la pantalla
// del sistema de escritorio real. A diferencia del resto de "Detalle del plan" (que sigue la
// forma de pago elegida en las pills), este bloque siempre muestra Contado y el financiado a
// través de Cobrador en simultáneo, sin importar cuál esté seleccionada.
// Selector de franquicia/deducible por cobertura — el asegurado decide qué franquicia le
// interesa y el agente la elige acá para que figure en la propuesta. No afecta la prima ya
// calculada (confirmado por Kevin, 2026-07-13): es solo el texto que se va a mostrar.
function renderFranquiciaSelect(cobertura) {
  const seleccionado = state.franquiciasPorCobertura[cobertura.codigo]
    ?? franquiciaValorPorDefecto(cobertura.franquicia_default);

  const opciones = FRANQUICIA_OPCIONES.map((o) =>
    `<option value="${o.valor}" ${o.valor === seleccionado ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');

  return `
    <div class="cobertura-row__franquicia-wrap">
      <span class="cobertura-row__franquicia-label">Franquicia:</span>
      <select class="cobertura-row__franquicia" data-franquicia-cobertura="${cobertura.codigo}">${opciones}</select>
    </div>
  `;
}

function renderResumenContadoFinanciado() {
  const variante = state.preview?.variantes?.[0];
  if (!variante) return '';

  const contado = variante.formasPago.find((f) => f.codigo === 'contado');
  const financiado = variante.formasPago.find((f) => f.codigo === 'cobrador');
  // Suma de TODAS las líneas de "Coberturas incluidas" (Incendio Edificio/Contenido +
  // coberturas/sublímites adicionales que agregó el agente) — no solo los 2 capitales fijos,
  // igual que "Suma total Gs." en el Excel del cliente (Version 01 - Calculo Varios.xlsx).
  const sumaAsegurada = (state.preview.coberturas || []).reduce(
    (acc, c) => acc + (Number(c.monto) || 0),
    0
  );

  return `
    <div class="resumen-sistema">
      <div class="resumen-sistema__row resumen-sistema__row--header">
        <span>Suma Asegurada total, Gs.</span>
        <span>${fmtGs(sumaAsegurada)}</span>
      </div>
      ${contado ? `
        <div class="resumen-sistema__row resumen-sistema__row--contado">
          <span>Costo Contado</span>
          <span>Gs. ${fmtGs(contado.premio)} <em>IVA Incluido.-</em></span>
        </div>
      ` : ''}
      ${financiado ? `
        <div class="resumen-sistema__row resumen-sistema__row--financiado">
          <span>Costo Financiado</span>
          <span>Inicial y ${financiado.cantidad_cuotas} cuotas Gs. ${fmtGs(financiado.cuota)}</span>
        </div>
      ` : ''}
    </div>
  `;
}

function renderExclusionesYSublimites(plan) {
  if (!plan?.texto_exclusiones_generales && !plan?.texto_sublimites_generales) return '';

  const bloque = (titulo, texto) => {
    if (!texto) return '';
    const items = texto.split('\n').filter(Boolean);
    return `
      <div class="card">
        <div class="card__title">${titulo}</div>
        <ul class="texto-legal-list">
          ${items.map((linea) => `<li>${escapeHtml(linea)}</li>`).join('')}
        </ul>
      </div>
    `;
  };

  return `
    <div class="resultado-grid" style="margin-top:20px;">
      ${bloque('Exclusiones', plan.texto_exclusiones_generales)}
      ${bloque('Sub-límites', plan.texto_sublimites_generales)}
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
  else if (action === 'add-cobertura-linea') addCoberturaLinea();
  else if (action === 'remove-cobertura-linea') removeCoberturaLinea(target.dataset.lineaId);
  else if (action === 'emitir-carta') {
    alert('La generación de la Carta Oferta todavía no está implementada (queda para otra tarea).');
  }
});

// Formatea un input de dinero in-place (misma lógica para el campo money de una línea de
// cobertura adicional que para capitalEdificio/capitalContenido) y devuelve los dígitos crudos.
function formatMoneyInputInPlace(target) {
  const digitsBeforeCursor = target.value.slice(0, target.selectionStart).replace(/\D/g, '').length;
  const digits = target.value.replace(/\D/g, '');
  const formatted = fmtGsInput(digits);
  target.value = formatted;

  let seen = 0;
  let newCursor = formatted.length;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/\d/.test(formatted[i])) seen += 1;
    if (seen === digitsBeforeCursor) {
      newCursor = i + 1;
      break;
    }
  }
  target.setSelectionRange(newCursor, newCursor);
  return digits;
}

app.addEventListener('input', (e) => {
  const lineaTarget = e.target.closest('[data-linea-id][data-linea-field]');
  if (lineaTarget) {
    const value = lineaTarget.dataset.money === 'true' ? formatMoneyInputInPlace(lineaTarget) : lineaTarget.value;
    updateCoberturaLinea(lineaTarget.dataset.lineaId, lineaTarget.dataset.lineaField, value);
    return;
  }

  const target = e.target.closest('[data-field]');
  if (!target) return;

  if (target.dataset.money === 'true') {
    updateField(target.dataset.field, formatMoneyInputInPlace(target));
    return;
  }

  updateField(target.dataset.field, target.value);
});

app.addEventListener('change', (e) => {
  const franquiciaTarget = e.target.closest('[data-franquicia-cobertura]');
  if (franquiciaTarget) {
    selectFranquicia(franquiciaTarget.dataset.franquiciaCobertura, franquiciaTarget.value);
    return;
  }

  const lineaTarget = e.target.closest('[data-linea-id][data-linea-field]');
  if (lineaTarget && lineaTarget.tagName === 'SELECT') {
    updateCoberturaLinea(lineaTarget.dataset.lineaId, lineaTarget.dataset.lineaField, lineaTarget.value);
    return;
  }

  const target = e.target.closest('[data-field]');
  if (!target || target.tagName !== 'SELECT') return;
  updateField(target.dataset.field, target.value);
});

init();
