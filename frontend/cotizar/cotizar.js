import { api, auth } from '../shared/api.js';
import { ICON_RAMO_AUTO, ICON_RAMO_MRC, ICON_RAMO_INCENDIO, ICON_RAMO_VIDA_AP, ICON_RAMO_HOGAR, ICON_INFO, ICON_SUBLIMITE_AGUA, ICON_SUBLIMITE_ELECTRICOS, ICON_SUBLIMITE_GRANIZO, ICON_SUBLIMITE_MURALLAS, ICON_SUBLIMITE_GENERICO, ICON_ARROW_LEFT as ICON_ARROW_LEFT_ROUND, ICON_X_CIRCLE } from '../shared/nav-icons.js';
import { escapeHtml } from '../shared/dom.js';
import { renderSidebarFooter, renderTopbarUser } from '../shared/sidebar.js';
import { fmtGs, fmtGsInput } from '../shared/format.js';

// Cotizador Tajy — App Shell + Datos + Resultado (Fase 6, alcance MRC plan Normal).
// Recreación en Vanilla JS del handoff de diseño original (mockup ya migrado y eliminado
// tras la implementación de "Diseño 2" en frontend/cotizar).

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

// Íconos por ramo — se usan tanto en el badge de la vista Datos (form-heading__badge)
// como en el nav del sidebar (.ramo-row__icon), Diseño 2 (docs/mockups/diseno-2-app-shell.html).
const RAMO_ICONOS = {
  auto: ICON_RAMO_AUTO,
  mrc: ICON_RAMO_MRC,
  incendio: ICON_RAMO_INCENDIO,
  'vida-ap': ICON_RAMO_VIDA_AP,
  hogar: ICON_RAMO_HOGAR,
};

// Ramos con calculador real conectado en esta pasada (ver CLAUDE.md — MRC primero, luego
// Incendio, luego Vida-AP).
const RAMOS_CON_CALCULO = ['mrc', 'incendio', 'vida-ap'];

// Nombres de plan cuyo criterio de "calculable" no es prima_tecnica_minima (MRC/Incendio),
// sino directamente esta lista fija — ver vida-ap.calculator.js (PLANES_NO_IMPLEMENTADOS).
const PLANES_VIDA_AP_CALCULABLES = [
  'PROTECCION FAMILIAR',
  'ACCIDENTES PERSONALES - SECTOR COOPERATIVO',
  'ACCIDENTES PERSONALES - SECTOR PRIVADO',
  'VIDA DIRECTIVOS Y EMPLEADOS',
];

// Criterio de "plan calculable" (RPF/tasas confirmados) según el ramo — MRC e Incendio usan
// prima_tecnica_minima; Vida-AP no maneja ese piso (decisión de Kevin) y usa la lista fija de
// planes con calculador implementado.
function planEsCalculable(ramoNombre, plan) {
  if (!plan) return false;
  if (ramoNombre === 'vida-ap') return PLANES_VIDA_AP_CALCULABLES.includes(plan.nombre);
  return plan.prima_tecnica_minima != null;
}

const CLIENT_FIELDS = [
  { key: 'clienteNombre', label: 'Nombre del asegurado', placeholder: 'Juan Pérez', span: 2 },
  { key: 'cedula', label: 'RUC / Cédula de identidad', placeholder: '4.123.456', span: 1, money: true },
  { key: 'direccion', label: 'Ubicación del Riesgo', placeholder: 'Av. España 1234, Asunción', span: 1 },
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

// Traduce el mapa de selección en UI (codigo -> valor de FRANQUICIA_OPCIONES) al mapa
// codigo -> monto que espera el backend (riesgo_datos.franquicias_por_cobertura).
function franquiciasPorCoberturaParaBody() {
  const resultado = {};
  for (const [codigo, valor] of Object.entries(state.franquiciasPorCobertura)) {
    const opcion = FRANQUICIA_OPCIONES.find((o) => o.valor === valor);
    resultado[codigo] = opcion ? opcion.monto : null;
  }
  return resultado;
}

// Ramos que hoy soportan descuento/recargo manual del agente en "Detalle del plan" — los
// calculadores de mrc/incendio ya implementan sumarAjustes con tope plan.descuento_maximo /
// plan.recargo_maximo (ver mrc.calculator.js / incendio.calculator.js). Vida/AP no tiene ese
// patrón todavía, no se ofrece ahí.
const RAMOS_CON_AJUSTES = ['mrc', 'incendio'];

// Traduce el descuento/recargo cargado en "Detalle del plan" (state.data.descuentoMonto /
// state.data.descuentoPorcentaje — dos campos fijos, uno en Gs. y otro en %, en vez de un input
// + selector) al array que espera el body de POST /cotizaciones/calcular y POST /cotizaciones
// (ver ajusteSchema en mrc.schema.js / incendio.schema.js: requiere `descripcion`, y monto O
// porcentaje). El tope real (plan.descuento_maximo / plan.recargo_maximo) lo aplica el backend
// (sumarAjustes) — acá solo se arma el ajuste crudo, sin clampear. Si el agente cargó los dos
// campos a la vez, se prioriza el monto en Gs. (caso borde, no bloqueamos con validación extra).
function ajustesParaBody(prefijo, descripcion) {
  if (!RAMOS_CON_AJUSTES.includes(state.ramoId)) return [];
  const monto = Number(state.data[`${prefijo}Monto`]) || 0;
  if (monto > 0) return [{ descripcion, monto }];
  const porcentaje = Number(state.data[`${prefijo}Porcentaje`]) || 0;
  if (porcentaje > 0) return [{ descripcion, porcentaje }];
  return [];
}

function descuentosParaBody() {
  return ajustesParaBody('descuento', 'Descuento aplicado por el agente');
}

function recargosParaBody() {
  return ajustesParaBody('recargo', 'Recargo aplicado por el agente');
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
  // Filas de `plan_coberturas` (con `coberturas_catalogo` embebido) del plan MRC elegido — de
  // acá salen los sublímites fijos por defecto (WU6, 2026-07-17: antes hardcodeados en
  // SUBLIMITES_FIJOS_MRC). Se carga una vez al elegir plan, vía GET /planes/:id/coberturas.
  planCoberturas: [],
  // Líneas de coberturas/sublímites adicionales que el agente agrega a mano, más allá de las
  // 2 fijas (Incendio Edificio / Incendio Contenido). Cada línea: { id, codigo, sumaAsegurada }.
  coberturasAdicionales: [],
  // true mientras se guarda la cotización y se genera el PDF, para deshabilitar el botón y
  // evitar doble click (crearía 2 cotizaciones con números correlativos distintos).
  emitiendoCarta: false,
  // Id de la cotización que se está editando (via ?editar=<id> — ver historial.js, botón
  // "Editar" dentro de la ventana de 30 días). null = flujo normal de alta. Si está seteado,
  // emitirCartaOferta() hace PUT /cotizaciones/:id en vez de POST /cotizaciones.
  editandoId: null,
};

// Códigos que no deben ofrecerse en "Coberturas adicionales": las 2 fijas ya tienen su propio
// campo en el formulario, sublimite_cctv todavía no tiene tasa cargada (no cotizable), y
// 'equipos_electronicos' (la cobertura, distinta del sublímite) queda representada por ese
// mismo sublímite fijo en MRC — confirmado por el área técnica, 2026-07-15: en esta rama no se
// ofrece por separado. Los sublímites fijos por defecto (WU6, 2026-07-17: ya no hardcodeados,
// ver sublimitesFijosMrc()) se agregan a esta lista de exclusión en tiempo real.
const CODIGOS_COBERTURA_EXCLUIDOS_BASE = [
  'incendio_edificio',
  'incendio_contenido',
  'sublimite_cctv',
  'equipos_electronicos',
];

// Ícono por código de sublímite en el panel "Cotización en vivo" — códigos reales de MRC
// (migración 012/019), fallback genérico para cualquier código sin ícono propio definido.
const SUBLIMITE_ICONOS = {
  sublimite_danos_agua: ICON_SUBLIMITE_AGUA,
  sublimite_equipos_electronicos: ICON_SUBLIMITE_ELECTRICOS,
  sublimite_granizo: ICON_SUBLIMITE_GRANIZO,
  sublimite_murallas_cercos: ICON_SUBLIMITE_MURALLAS,
  incendio_edificio: ICON_RAMO_HOGAR,
  incendio_contenido: ICON_RAMO_INCENDIO,
};

// Ícono de precio para el footnote de "Detalle del plan" — no vive en nav-icons.js porque
// es específico de esta franja de resumen, no de la navegación.
const ICON_TAG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 .44 1.06l8 8a1.5 1.5 0 0 0 2.12 0l6.5-6.5a1.5 1.5 0 0 0 0-2.12l-8-8A1.5 1.5 0 0 0 11.5 3.5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><circle cx="8.2" cy="8.2" r="1.4" fill="currentColor"></circle></svg>`;
const ICON_PLUS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>`;

// Sublímites de MRC fijos por defecto — leídos de `plan_coberturas.incluida_por_defecto` del
// plan elegido (WU6, 2026-07-17), en vez de la vieja constante hardcodeada SUBLIMITES_FIJOS_MRC.
// El agente no los elige ni les cambia el monto, así que se muestran aparte en el panel
// "Sublímites" (ver renderSublimitesFijosMrc), no como fila editable/quitable en "Coberturas
// adicionales". Excluye explícitamente Incendio Edificio/Contenido: esas 2 no viven en
// `plan_coberturas` (se cotizan por Capital Edificio/Contenido, campo propio del formulario),
// pero se filtran igual por defensividad ante un dato inesperado.
function sublimitesFijosMrc() {
  return state.planCoberturas
    .filter((pc) => pc.incluida_por_defecto && !CODIGOS_COBERTURA_EXCLUIDOS_BASE.includes(pc.coberturas_catalogo?.codigo))
    .map((pc) => ({
      codigo: pc.coberturas_catalogo?.codigo,
      nombre: pc.coberturas_catalogo?.nombre ?? pc.coberturas_catalogo?.codigo,
      monto: pc.monto,
    }))
    .filter((s) => s.codigo);
}

let debounceTimer = null;
const app = document.getElementById('app');

async function init() {
  if (!auth.isLoggedIn()) {
    window.location.href = '../login/';
    return;
  }
  try {
    state.ramosActivos = await api.get('/ramos');
  } catch (err) {
    console.error('No se pudo cargar la lista de ramos', err);
    state.ramosActivos = [];
  }

  const params = new URLSearchParams(location.search);
  const editarId = params.get('editar');
  if (editarId) {
    await cargarParaEditar(Number(editarId));
  } else {
    const ramoParam = params.get('ramo');
    if (ramoParam) {
      await selectRamo(ramoParam);
    }
  }

  renderApp();
}

// ---------------------------------------------------------------------------
// Edición de una cotización existente (?editar=<id> en la URL, ver historial.js) — ventana de
// 30 días validada en el backend (cotizacion.service.js actualizarCotizacion). Reconstruye
// state.ramoId/planId/data/coberturasAdicionales/franquiciasPorCobertura a partir del detalle
// ya guardado y dispara un cálculo inmediato (no debounced) para que la prima aparezca sin
// esperar el timer de scheduleCalculate.
// ---------------------------------------------------------------------------

async function cargarParaEditar(id) {
  let cotizacion;
  try {
    cotizacion = await api.get(`/cotizaciones/${id}`);
  } catch (err) {
    alert(err.message || 'No se pudo cargar la cotización para editar.');
    return;
  }

  const ramo = state.ramosActivos.find((r) => r.id === cotizacion.ramo_id);
  if (!ramo) {
    alert('No se encontró el ramo de esta cotización.');
    return;
  }

  state.editandoId = id;
  state.ramoId = ramo.nombre;
  state.view = 'form';

  try {
    state.planes = await api.get(`/ramos/${ramo.id}/planes`);
  } catch (err) {
    console.error('No se pudieron cargar los planes del ramo', err);
    state.planes = [];
  }
  state.planId = cotizacion.plan_id;

  if (ramo.nombre === 'mrc' || ramo.nombre === 'incendio') {
    try {
      state.rubros = await api.get('/ramos/rubros-actividad');
    } catch (err) {
      console.error('No se pudieron cargar los tipos de riesgo', err);
      state.rubros = [];
    }
  }

  if (ramo.nombre === 'mrc') {
    await cargarCoberturasCatalogo(ramo.id);
    await cargarPlanCoberturas(state.planId);
  }

  const plan = state.planes.find((p) => p.id === state.planId);
  prefillDatosDesdeCotizacion(ramo.nombre, plan, cotizacion);

  if (RAMOS_CON_CALCULO.includes(ramo.nombre)) {
    await calcularPreview();
  }
}

// Traduce `cotizacion.riesgo_datos` (shape guardado por cada calculador — ver
// armarRiesgoDatos()) de vuelta a los campos de state.data que usa el formulario.
function prefillDatosDesdeCotizacion(ramoNombre, plan, cotizacion) {
  const rd = cotizacion.riesgo_datos || {};
  state.data.clienteNombre = cotizacion.cliente_nombre || '';

  if (ramoNombre === 'mrc') {
    state.data.cedula = rd.cedula || '';
    state.data.direccion = rd.direccion || '';
    state.data.rubroActividad = rd.rubro_actividad || '';
    state.data.ciudad = rd.ciudad || '';
    state.data.capitalEdificio = rd.capital_edificio || '';
    state.data.capitalContenido = rd.capital_contenido || '';

    // Los sublímites fijos del plan (ver sublimitesFijosMrc()) ya se re-agregan solos en
    // armarRiesgoDatos() — no deben duplicarse acá como línea editable de "Coberturas adicionales".
    const codigosFijos = new Set(sublimitesFijosMrc().map((s) => s.codigo));
    state.coberturasAdicionales = (rd.coberturas_adicionales || [])
      .filter((c) => c.codigo && !codigosFijos.has(c.codigo))
      .map((c) => ({ id: crypto.randomUUID(), codigo: c.codigo, sumaAsegurada: c.suma_asegurada }));

    for (const [codigo, monto] of Object.entries(rd.franquicias_por_cobertura || {})) {
      state.franquiciasPorCobertura[codigo] = franquiciaValorPorDefecto(monto);
    }
  } else if (ramoNombre === 'incendio') {
    if (plan?.nombre === 'MAQUINARIA BASICO') {
      state.data.capitalMaquinaria = rd.capital_maquinaria || '';
      if (rd.sublimite_vandalismo_porcentaje != null) {
        state.data.sublimiteVandalismoPorcentaje = rd.sublimite_vandalismo_porcentaje;
      }
    } else {
      state.data.rubroActividad = rd.rubro_actividad || '';
      state.data.capitalEdificio = rd.capital_edificio || '';
      state.data.capitalContenido = rd.capital_contenido || '';
      if (rd.sublimite_fenomenos_naturales_porcentaje != null) {
        state.data.sublimiteFenomenosNaturalesPorcentaje = rd.sublimite_fenomenos_naturales_porcentaje;
      }
    }
  } else if (ramoNombre === 'vida-ap') {
    state.data.capitalAsegurado = rd.capital_asegurado || '';
    if (rd.edad != null) state.data.edad = rd.edad;
    if (rd.incluye_renta_diaria) {
      state.data.incluyeRentaDiaria = true;
      state.data.sumaRentaDiaria = rd.suma_renta_diaria || '';
    }
  }

  // Descuento/recargo manual — se prefillea con el monto YA topado que quedó guardado
  // (cotizacion_ajustes), no con el % crudo que haya tipeado el agente en su momento (ese dato
  // no se persiste por separado, ver comentario de insertAjustes en cotizaciones.repository.js).
  if (RAMOS_CON_AJUSTES.includes(ramoNombre)) {
    const variante = cotizacion.cotizacion_variantes?.[0];
    const ajustes = variante?.cotizacion_ajustes || [];
    const descuento = ajustes.find((a) => a.tipo === 'descuento');
    const recargo = ajustes.find((a) => a.tipo === 'recargo');
    if (descuento) state.data.descuentoMonto = descuento.monto;
    if (recargo) state.data.recargoMonto = recargo.monto;
  }

  const cuotas = cotizacion.cotizacion_variantes?.[0]?.cotizacion_plan_pago?.[0]?.cantidad_cuotas;
  if (cuotas != null) state.data.cuotas = cuotas;
}

function cerrarSesion() {
  auth.clearSession();
  window.location.href = '../login/';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  // Salir del modo edición al cambiar de ramo manualmente: el backend rechaza un PUT que cambie
  // el ramo de una cotización existente (actualizarCotizacion, cotizacion.service.js), así que
  // sin este reset el agente llenaría todo el formulario de otro ramo para recién enterarse del
  // 422 al guardar — detectado en review-readability/risk de la feature de edición.
  state.editandoId = null;
  state.ramoId = nombre;
  state.view = 'form';
  state.data = {};
  state.planId = null;
  state.planes = [];
  state.franquiciasPorCobertura = {};
  state.rubros = [];
  state.coberturasCatalogo = [];
  state.planCoberturas = [];
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

  if (RAMOS_CON_CALCULO.includes(nombre)) {
    // Preselecciona el primer plan calculable hoy (RPF/tasas confirmados).
    const planCalculable = state.planes.find((p) => planEsCalculable(nombre, p));
    state.planId = planCalculable ? planCalculable.id : state.planes[0]?.id ?? null;
    state.data.cuotas = planCalculable?.cuotas_default ?? null;

    if (nombre === 'mrc' || nombre === 'incendio') {
      try {
        // Sin filtro de grupo: la pantalla "Tipo de Riesgo" del sistema de escritorio
        // muestra los 49 rubros juntos (MRC y TRO comparten la misma lista visual). Incendio
        // solo usa esta lista para el plan "Edificio y Contenido" (Maquinaria Básico no).
        state.rubros = await api.get('/ramos/rubros-actividad');
      } catch (err) {
        console.error('No se pudieron cargar los tipos de riesgo', err);
        state.rubros = [];
      }
    }

    if (nombre === 'mrc') {
      // El catálogo de coberturas es por RAMO, no por plan (mismas coberturas disponibles
      // para "Normal" y "Protección Total") — se carga una sola vez acá. Solo MRC usa
      // "Coberturas adicionales" en esta pasada.
      await cargarCoberturasCatalogo(ramo.id);
      if (state.planId) await cargarPlanCoberturas(state.planId);
    }
  } else {
    state.planId = state.planes[0]?.id ?? null;
  }

  renderApp();
}

function selectPlan(planId) {
  const plan = state.planes.find((p) => p.id === planId);
  if (!plan || !planEsCalculable(state.ramoId, plan)) return; // plan sin RPF/tasas confirmadas: bloqueado
  state.planId = planId;
  state.data.cuotas = plan.cuotas_default ?? null;
  state.coberturasAdicionales = [];
  renderApp();
  scheduleCalculate();
  if (state.ramoId === 'mrc') {
    cargarPlanCoberturas(planId).then(renderApp);
  }
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

// Coberturas fijas del PLAN (plan_coberturas + coberturas_catalogo embebido), de donde salen
// los sublímites fijos por defecto (ver sublimitesFijosMrc()) — a diferencia del catálogo
// completo del ramo (cargarCoberturasCatalogo), esto sí varía por plan. Se recarga cada vez que
// el agente cambia de plan; un array vacío (plan sin filas en plan_coberturas todavía) no rompe
// el flujo — sublimitesFijosMrc() simplemente no devuelve filas.
async function cargarPlanCoberturas(planId) {
  try {
    state.planCoberturas = await api.get(`/planes/${planId}/coberturas`);
  } catch (err) {
    console.error('No se pudo cargar las coberturas fijas del plan', err);
    state.planCoberturas = [];
  }
}

// Opciones seleccionables en "Coberturas adicionales": el catálogo del ramo sin las 2 fijas
// (tienen su propio campo), sin sublimite_cctv (sin tasa cargada todavía — no cotizable), y sin
// los sublímites fijos por defecto del plan actual (ver sublimitesFijosMrc()).
function coberturasDisponibles() {
  const excluidos = [...CODIGOS_COBERTURA_EXCLUIDOS_BASE, ...sublimitesFijosMrc().map((s) => s.codigo)];
  return state.coberturasCatalogo.filter((c) => !excluidos.includes(c.codigo));
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
  if (RAMOS_CON_CALCULO.includes(state.ramoId)) {
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
  if (!RAMOS_CON_CALCULO.includes(state.ramoId) || !state.planId) return false;
  const plan = state.planes.find((p) => p.id === state.planId);
  if (!planEsCalculable(state.ramoId, plan)) return false;
  const d = state.data;

  if (state.ramoId === 'mrc') {
    const capitalEdificio = Number(d.capitalEdificio) || 0;
    const capitalContenido = Number(d.capitalContenido) || 0;
    return Boolean(d.rubroActividad) && Boolean(d.ciudad) && (capitalEdificio > 0 || capitalContenido > 0);
  }

  if (state.ramoId === 'incendio') {
    if (plan.nombre === 'MAQUINARIA BASICO') {
      return (Number(d.capitalMaquinaria) || 0) > 0;
    }
    const capitalEdificio = Number(d.capitalEdificio) || 0;
    const capitalContenido = Number(d.capitalContenido) || 0;
    return Boolean(d.rubroActividad) && Boolean(d.ciudad) && (capitalEdificio > 0 || capitalContenido > 0);
  }

  if (state.ramoId === 'vida-ap') {
    const capitalAsegurado = Number(d.capitalAsegurado) || 0;
    if (plan.nombre === 'PROTECCION FAMILIAR') return capitalAsegurado > 0;
    return capitalAsegurado > 0 && Boolean(d.edad);
  }

  return false;
}

// `capital_asegurado` es una columna propia de `cotizaciones` (no del cálculo de prima en sí,
// cada calculador usa sus propios campos de riesgo_datos) — se manda siempre en el body porque
// el schema de validación de cada ramo lo exige (ver schemas/mrc|incendio|vida-ap.schema.js).
function capitalAseguradoParaBody(plan) {
  const d = state.data;

  if (state.ramoId === 'mrc') {
    return (Number(d.capitalEdificio) || 0) + (Number(d.capitalContenido) || 0);
  }

  if (state.ramoId === 'incendio') {
    if (plan?.nombre === 'MAQUINARIA BASICO') return Number(d.capitalMaquinaria) || 0;
    return (Number(d.capitalEdificio) || 0) + (Number(d.capitalContenido) || 0);
  }

  if (state.ramoId === 'vida-ap') {
    return Number(d.capitalAsegurado) || 0;
  }

  return 0;
}

// Arma el `riesgo_datos` esperado por el calculador del ramo/plan actual (ver
// incendio.calculator.js / vida-ap.calculator.js para el shape exacto).
function armarRiesgoDatos(plan) {
  const d = state.data;

  if (state.ramoId === 'mrc') {
    return {
      cedula: d.cedula || '',
      direccion: d.direccion || '',
      rubro_actividad: d.rubroActividad || '',
      ciudad: d.ciudad || '',
      capital_edificio: Number(d.capitalEdificio) || 0,
      capital_contenido: Number(d.capitalContenido) || 0,
      coberturas_adicionales: [
        ...sublimitesFijosMrc().map((s) => ({ codigo: s.codigo, suma_asegurada: s.monto })),
        ...state.coberturasAdicionales
          .filter((l) => l.codigo && Number(l.sumaAsegurada) > 0)
          .map((l) => ({ codigo: l.codigo, suma_asegurada: Number(l.sumaAsegurada) })),
      ],
      franquicias_por_cobertura: franquiciasPorCoberturaParaBody(),
    };
  }

  if (state.ramoId === 'incendio') {
    if (plan.nombre === 'MAQUINARIA BASICO') {
      return {
        capital_maquinaria: Number(d.capitalMaquinaria) || 0,
        ...(d.sublimiteVandalismoPorcentaje !== undefined && d.sublimiteVandalismoPorcentaje !== ''
          ? { sublimite_vandalismo_porcentaje: Number(d.sublimiteVandalismoPorcentaje) }
          : {}),
      };
    }
    return {
      rubro_actividad: d.rubroActividad || '',
      capital_edificio: Number(d.capitalEdificio) || 0,
      capital_contenido: Number(d.capitalContenido) || 0,
      ...(d.sublimiteFenomenosNaturalesPorcentaje !== undefined && d.sublimiteFenomenosNaturalesPorcentaje !== ''
        ? { sublimite_fenomenos_naturales_porcentaje: Number(d.sublimiteFenomenosNaturalesPorcentaje) }
        : {}),
    };
  }

  if (state.ramoId === 'vida-ap') {
    const base = { capital_asegurado: Number(d.capitalAsegurado) || 0 };
    if (plan.nombre === 'PROTECCION FAMILIAR') return base;

    base.edad = Number(d.edad) || null;
    if (plan.nombre === 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO' || plan.nombre === 'ACCIDENTES PERSONALES - SECTOR PRIVADO') {
      if (d.incluyeRentaDiaria) {
        base.incluye_renta_diaria = true;
        base.suma_renta_diaria = Number(d.sumaRentaDiaria) || 0;
      }
    }
    return base;
  }

  return {};
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
  const plan = state.planes.find((p) => p.id === state.planId);
  const body = {
    plan_id: state.planId,
    capital_asegurado: capitalAseguradoParaBody(plan),
    riesgo_datos: armarRiesgoDatos(plan),
    descuentos: descuentosParaBody(),
    recargos: recargosParaBody(),
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

// Guarda la cotización (POST /cotizaciones, si es la primera vez que se emite carta para esta
// pasada por el formulario) y descarga el PDF de la Carta Oferta. Reutiliza exactamente el mismo
// body que calcularPreview — el backend valida y calcula de nuevo antes de persistir.
async function emitirCartaOferta() {
  if (state.emitiendoCarta || !state.preview) return;

  const d = state.data;
  const plan = state.planes.find((p) => p.id === state.planId);
  const body = {
    plan_id: state.planId,
    capital_asegurado: capitalAseguradoParaBody(plan),
    riesgo_datos: armarRiesgoDatos(plan),
    descuentos: descuentosParaBody(),
    recargos: recargosParaBody(),
    cliente_nombre: d.clienteNombre || '',
    ...(d.cuotas ? { cuotas: Number(d.cuotas) } : {}),
  };

  state.emitiendoCarta = true;
  renderApp();

  try {
    const cotizacion = state.editandoId
      ? await api.put(`/cotizaciones/${state.editandoId}`, body)
      : await api.post('/cotizaciones', body);
    const blob = await api.getBlob(`/cotizaciones/${cotizacion.id}/pdf-oferta`);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    alert(err.message || 'No se pudo generar la Carta Oferta.');
  } finally {
    state.emitiendoCarta = false;
    renderApp();
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
    ${renderTopbar(ramo)}
    <div class="app-body">
      ${renderSidebar()}
      <div class="main">
        ${renderHeader(ramo)}
        ${contenido}
      </div>
    </div>
  `;
}

// Versión del cotizador mostrada en el topbar y en el pie de página del sidebar (chrome de
// UI, no viene de la base) — única fuente de verdad para que ambas queden siempre de la mano.
// Se incrementa a mano cuando haya un cambio visible que valga la pena versionar.
const COTIZADOR_VERSION = '1.0.1';

function renderTopbar(ramo) {
  return `
    <div class="topbar">
      <div class="topbar__red-block">
        <img class="topbar__logo" src="../login/assets/logo-rojo-con-negro.svg" alt="Aseguradora Tajy" />
        <div class="topbar__brand-text">
          <div class="topbar__brand-sub">Sistema de Cotización de Pólizas</div>
        </div>
      </div>
      <div class="topbar__crumb-area">
        ${ramo ? `
          <div class="topbar__breadcrumb">
            <span class="topbar__crumb-item">Cotizaciones</span>
            <span class="topbar__crumb-sep">›</span>
            <span class="topbar__crumb-item topbar__crumb-item--current">Nueva cotización</span>
          </div>
        ` : '<div></div>'}
        ${renderTopbarUser()}
      </div>
    </div>
  `;
}

function renderSidebar() {
  const rows = RAMOS_UI.map((r) => {
    const activa = r.nombre === state.ramoId;
    const estadoTexto = r.estado === 'pausa' ? 'En pausa' : r.estado === 'proximamente' ? 'Próximamente' : '';
    return `
      <div class="ramo-row ${activa ? 'ramo-row--activa' : ''} ${r.estado !== 'disponible' ? `ramo-row--${r.estado}` : ''}" data-action="select-ramo" data-ramo="${r.nombre}">
        <div class="ramo-row__icon">${RAMO_ICONOS[r.nombre] || ''}</div>
        <div class="ramo-row__label">${r.label}</div>
        ${estadoTexto ? `<div class="ramo-row__estado">${estadoTexto}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="sidebar">
      <div class="sidebar__section-label">Cotizar</div>
      <div class="ramo-list">${rows}</div>
      <div class="sidebar__footer">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('cotizar')}
        <div class="sidebar__credit">Powered by <strong>Kevin Ruiz Diaz</strong> v${COTIZADOR_VERSION}</div>
      </div>
    </div>
  `;
}

function renderHeader(ramo) {
  const subtitle = ramo ? `Cotizando ${ramo.label} para el cliente` : 'Elegí una sección para comenzar';
  const showTabs = Boolean(ramo) && ramo.estado !== 'pausa' && ramo.estado !== 'proximamente';
  const bloqueado = !puedeAvanzarADetalle();

  return `
    <div class="main-header">
      <div>
        ${ramo ? '' : '<div class="main-header__title">Nueva cotización</div>'}
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
  if (!RAMOS_CON_CALCULO.includes(state.ramoId)) return true;
  return Boolean(state.preview) && !state.previewError;
}

function renderPlanRow() {
  const options = state.planes.map((p) => {
    const calculable = planEsCalculable(state.ramoId, p);
    const sufijo = calculable ? '' : ' (pendiente de confirmación)';
    return `
      <option value="${p.id}" ${p.id === state.planId ? 'selected' : ''} ${!calculable ? 'disabled' : ''}>
        ${escapeHtml(p.nombre)}${sufijo}
      </option>
    `;
  }).join('');

  return `
    <div class="plan-row">
      <div class="plan-row__box">
        <div class="plan-row__label">Plan a presentar</div>
        <select class="field-input plan-row__select" data-action-select="select-plan">${options}</select>
      </div>
    </div>
  `;
}

// Referencia visual de avance (1. Datos del plan → 2. Detalle del plan → 3. Carta oferta).
// "Carta oferta" no tiene un state.view propio — se emite como acción (PDF) dentro de
// "Detalle del plan" (ver emitirCartaOferta()) — así que ese paso queda siempre pendiente,
// solo marca el recorrido esperado, no un estado navegable.
function renderStepper() {
  const pasos = [
    { n: 1, label: 'Datos del plan', activo: state.view === 'form' },
    { n: 2, label: 'Detalle del plan', activo: state.view === 'result' },
    { n: 3, label: 'Carta oferta', activo: false },
  ];

  return `
    <div class="stepper-row">
      <div class="stepper">
        ${pasos.map((p, i) => `
          <div class="stepper__step">
            <div class="stepper__circle ${p.activo ? 'stepper__circle--active' : ''}">${p.n}</div>
            <div class="stepper__label ${p.activo ? 'stepper__label--active' : ''}">${escapeHtml(p.label)}</div>
          </div>
          ${i < pasos.length - 1 ? '<div class="stepper__connector"></div>' : ''}
        `).join('')}
      </div>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state__icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M14 2v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          <path d="M8.5 12h7M8.5 15.5h7M8.5 8.5h2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </div>
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

// Campos "Tipo de Riesgo"/"Ciudad"/capitales del esqueleto MRC — reusado por MRC e Incendio
// (plan "Edificio y Contenido"), que comparten el mismo motor de tasas por rubro.
function camposEdificioContenido(sublimiteField) {
  return `
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
    ${sublimiteField || ''}
  `;
}

function campoSublimitePorcentaje(field, label) {
  return `
    <div class="field">
      <label>${label}</label>
      <input class="field-input" type="number" min="0" max="50" data-field="${field}" placeholder="0-50" value="${escapeHtml(state.data[field] ?? '')}" />
    </div>
  `;
}

function camposEspecificosParaRamo(ramo, plan) {
  if (ramo.nombre === 'mrc') {
    return `
      ${camposEdificioContenido()}
      <div class="field field--span2">
        ${renderCoberturasAdicionales(coberturasDisponibles())}
      </div>
    `;
  }

  if (ramo.nombre === 'incendio') {
    if (!plan) {
      return `<div class="field field--span2"><div class="live-summary__pending">Seleccioná un plan para ver el formulario.</div></div>`;
    }
    if (plan.nombre === 'MAQUINARIA BASICO') {
      return `
        <div class="field">
          <label>Capital Maquinaria (USD)</label>
          <input class="field-input" type="text" inputmode="numeric" data-field="capitalMaquinaria" data-money="true" placeholder="50.000" value="${fmtGsInput(state.data.capitalMaquinaria)}" />
        </div>
        ${campoSublimitePorcentaje('sublimiteVandalismoPorcentaje', 'Sublímite Vandalismo (%)')}
      `;
    }
    return camposEdificioContenido(campoSublimitePorcentaje('sublimiteFenomenosNaturalesPorcentaje', 'Sublímite Fenómenos Naturales (%)'));
  }

  if (ramo.nombre === 'vida-ap') {
    if (!plan) {
      return `<div class="field field--span2"><div class="live-summary__pending">Seleccioná un plan para ver el formulario.</div></div>`;
    }
    const campoCapital = `
      <div class="field">
        <label>Capital Asegurado (Gs.)</label>
        <input class="field-input" type="text" inputmode="numeric" data-field="capitalAsegurado" data-money="true" placeholder="100.000.000" value="${fmtGsInput(state.data.capitalAsegurado)}" />
      </div>
    `;

    if (plan.nombre === 'PROTECCION FAMILIAR') {
      return campoCapital;
    }

    const campoEdad = `
      <div class="field">
        <label>Edad</label>
        <input class="field-input" type="number" min="0" max="99" data-field="edad" placeholder="35" value="${escapeHtml(state.data.edad ?? '')}" />
      </div>
    `;

    if (plan.nombre === 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO' || plan.nombre === 'ACCIDENTES PERSONALES - SECTOR PRIVADO') {
      const incluyeRenta = Boolean(state.data.incluyeRentaDiaria);
      return `
        ${campoCapital}
        ${campoEdad}
        <div class="field field--span2">
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" data-field="incluyeRentaDiaria" ${incluyeRenta ? 'checked' : ''} />
            Incluir Renta Diaria
          </label>
        </div>
        ${incluyeRenta ? `
          <div class="field">
            <label>Suma Renta Diaria (Gs.)</label>
            <input class="field-input" type="text" inputmode="numeric" data-field="sumaRentaDiaria" data-money="true" placeholder="50.000" value="${fmtGsInput(state.data.sumaRentaDiaria)}" />
          </div>
        ` : ''}
      `;
    }

    // VIDA DIRECTIVOS Y EMPLEADOS
    return `${campoCapital}${campoEdad}`;
  }

  return `
    <div class="field field--span2">
      <div class="live-summary__pending" style="margin-top:4px;">
        Este ramo todavía no tiene su calculador conectado en el cotizador — el formulario de datos
        específicos se agrega en otra tarea. Podés cargar los datos del cliente mientras tanto.
      </div>
    </div>
  `;
}

function renderDatosView(ramo) {
  const esCalculable = RAMOS_CON_CALCULO.includes(state.ramoId);
  const plan = state.planes.find((p) => p.id === state.planId);

  const camposEspecificos = esCalculable
    ? camposEspecificosParaRamo(ramo, plan)
    : camposEspecificosParaRamo({ nombre: null }, null);

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
              ${CLIENT_FIELDS.map((f) => `
                <div class="field ${f.span === 2 ? 'field--span2' : ''}">
                  <label>${f.label}</label>
                  <input class="field-input" type="text" inputmode="${f.money ? 'numeric' : 'text'}" data-field="${f.key}" ${f.money ? 'data-money="true"' : ''} placeholder="${f.placeholder}" value="${escapeHtml(f.money ? fmtGsInput(state.data[f.key]) : (state.data[f.key] ?? ''))}" />
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
      </div>
      ${renderExclusionesCard(plan)}
      <div class="live-summary" id="live-summary">${renderLivePanelContent()}</div>
    </div>
  `;
}

// Card de exclusiones del plan, visible ya en "Datos del plan" (antes solo aparecía en
// "Detalle del plan", removida de ahí en el rediseño de 70686b9) — ocupa el espacio libre
// junto al formulario de datos del asegurado. Vacío si el plan no tiene texto cargado
// (texto_exclusiones_generales), como Incendio/Vida-AP mientras no tengan template propio.
function renderExclusionesCard(plan) {
  if (!plan?.texto_exclusiones_generales) return '';

  const items = plan.texto_exclusiones_generales.split('\n').filter(Boolean);

  return `
    <div class="card exclusiones-card">
      <div class="card__title">Exclusiones</div>
      <div class="card__body">
        <ul class="texto-legal-list">
          ${items.map((linea) => `
            <li>
              <span class="texto-legal-list__icon" style="color: var(--tajy-red)">${ICON_X_CIRCLE}</span>
              <span>${escapeHtml(linea)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
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
      ${filas}
      <button type="button" class="btn-outline" data-action="add-cobertura-linea">+ Agregar cobertura</button>
    </div>
  `;
}

// El panel "Cotización en vivo" (columna derecha) suele quedar con espacio libre debajo de su
// contenido (columna de ancho fijo, altura estirada por flex) — el bloque "Sublímites" fijos de
// MRC se agrega ahí abajo para aprovecharlo, en vez de competir por lugar en el formulario de
// la izquierda (ver sublimitesFijosMrc(), decisión de Kevin 2026-07-15).
function renderLivePanelContent() {
  return `${renderLivePanelBody()}${state.ramoId === 'mrc' ? renderSublimitesFijosMrc() : ''}`;
}

function renderLiveLabel() {
  return `<div class="live-summary__label"><span class="live-summary__dot"></span>Cotización en vivo</div>`;
}

function renderLivePanelBody() {
  if (!RAMOS_CON_CALCULO.includes(state.ramoId)) {
    return `
      ${renderLiveLabel()}
      <div class="live-summary__pending">Cálculo pendiente de confirmación de tasas para este ramo.</div>
    `;
  }

  if (state.previewError) {
    return `
      ${renderLiveLabel()}
      <div class="live-summary__error">${escapeHtml(state.previewError)}</div>
    `;
  }

  if (!state.preview) {
    return `
      ${renderLiveLabel()}
      <div class="live-summary__pending">${state.loadingPreview ? 'Calculando…' : 'Completá los datos del riesgo para ver la prima.'}</div>
    `;
  }

  const fp = formaPagoSeleccionada();
  const coberturasCount = state.preview.coberturas?.length ?? 0;

  return `
    ${renderLiveLabel()}
    ${renderFormaPagoPills()}
    <div class="live-summary__price-label">Prima total ${ICON_INFO}</div>
    <div class="live-summary__price">${fmtGs(fp.cuota || fp.premio)} <span class="live-summary__price-unit">Gs.</span></div>
    <div class="live-summary__sub">Gs.${fp.codigo === 'contado' ? '' : ' / mes'} · ${fmtGs(fp.premio)} Gs. premio total</div>
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

// Sublímites fijos del plan MRC actual — van siempre incluidos con monto fijo, no son
// "coberturas" que el agente elija (ver sublimitesFijosMrc()), así que se muestran acá con su
// propio título en vez de mezclarse bajo "Coberturas adicionales".
function renderSublimitesFijosMrc() {
  const filas = sublimitesFijosMrc().map((s) => `
      <div class="live-summary__row live-summary__row--icon">
        <span class="live-summary__row-name">
          <span class="live-summary__row-icon">${SUBLIMITE_ICONOS[s.codigo] || ICON_SUBLIMITE_GENERICO}</span>
          ${escapeHtml(s.nombre)}
        </span>
        <span>${fmtGs(s.monto)} Gs.</span>
      </div>
    `).join('');

  return `
    <div class="live-summary__divider"></div>
    <div class="live-summary__label">Sublímites incluidos</div>
    <div class="live-summary__rows live-summary__rows--dashed">${filas}</div>
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
  const esCalculable = RAMOS_CON_CALCULO.includes(state.ramoId);
  const plan = state.planes.find((p) => p.id === state.planId);
  const planLabel = plan ? plan.nombre : '—';

  if (!esCalculable || !state.preview) {
    return `
      <div class="resultado-view panel">
        <div class="resultado-view__inner">
          ${esCalculable ? `<div style="margin-bottom:16px;">${renderStepper()}</div>` : ''}
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
              <div class="coberturas-section__title">Coberturas incluidas</div>
              <div class="coberturas-lista">
                ${[...coberturas]
                  // Los sub-límites fijos del plan no van en este listado de "Coberturas incluidas"
                  // (a pedido de Kevin, 2026-07-15) — se muestran aparte en renderSublimitesFijosMrc.
                  .filter((c) => !sublimitesFijosMrc().some((s) => s.codigo === c.codigo))
                  .sort((a, b) => (a.tipo_aplicacion === 'sublimite' ? 1 : 0) - (b.tipo_aplicacion === 'sublimite' ? 1 : 0))
                  .map((c) => {
                    const esSublimite = c.tipo_aplicacion === 'sublimite';
                    return `
                    <div class="cobertura-card">
                      <div class="cobertura-card__status ${esSublimite ? 'cobertura-card__status--warning' : ''}">${esSublimite ? '!' : '✓'}</div>
                      <div class="cobertura-card__icon">${SUBLIMITE_ICONOS[c.codigo] || ICON_SUBLIMITE_GENERICO}</div>
                      <div class="cobertura-card__main">
                        <div class="cobertura-card__name">${escapeHtml(c.nombre)}</div>
                        ${renderFranquiciaSelect(c)}
                      </div>
                      <div class="cobertura-card__monto">
                        <span>Suma asegurada</span>
                        <div>${typeof c.monto === 'number' ? `${fmtGs(c.monto)} <em>Gs.</em>` : escapeHtml(c.monto ?? '—')}</div>
                      </div>
                    </div>
                  `;
                  }).join('')}
              </div>
              <button class="cobertura-card__agregar" data-action="show-tab" data-view="form">${ICON_PLUS} Agregar cobertura adicional</button>
            </div>
          </div>
          <div class="resultado-layout__aside">
            ${renderResumenCotizacion(plan, fp)}
          </div>
        </div>
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
    <div class="cobertura-row__franquicia-label">Franquicia</div>
    <select class="cobertura-row__franquicia" data-franquicia-cobertura="${cobertura.codigo}">${opciones}</select>
  `;
}

// Card único del sidebar de "Detalle del plan" — reemplaza los 2 cards separados que había
// antes (resumen Contado/Financiado + Ajustes) por un único "Resumen de la cotización" con
// secciones separadas por líneas finas, terminando en el botón de "Emitir carta oferta" (antes
// vivía en una barra fija al pie de la pantalla — ver decisión de rediseño, 2026-07-22).
function renderResumenCotizacion(plan, fp) {
  const variante = state.preview?.variantes?.[0];
  const contado = variante?.formasPago.find((f) => f.codigo === 'contado');
  const financiado = variante?.formasPago.find((f) => f.codigo === 'cobrador');
  // Suma de las líneas de "Coberturas incluidas" que cuentan como suma asegurada propia
  // (Incendio Edificio/Contenido + coberturas adicionales que agregó el agente) — igual que
  // "Suma total Gs." en el Excel del cliente (Version 01 - Calculo Varios.xlsx). Los
  // sub-límites nunca suman al total (a pedido de Kevin, 2026-07-15), ni "Robo valores
  // ventanilla" (sub-límite de "Valores en caja fuerte", marcado con
  // incluye_en_suma_asegurada_total = false en la migración 020).
  const sumaAsegurada = (state.preview.coberturas || []).reduce((acc, c) => {
    const esSublimite = c.tipo_aplicacion === 'sublimite';
    const cuentaParaTotal = !esSublimite && c.incluye_en_suma_asegurada_total !== false;
    return acc + (cuentaParaTotal ? Number(c.monto) || 0 : 0);
  }, 0);

  return `
    <div class="resumen-sistema">
      <div class="resumen-sistema__block">
        <div class="resumen-sistema__title">Resumen de la cotización</div>
        <div class="resumen-sistema__total-label">Suma asegurada total</div>
        <div class="resumen-sistema__total-value">${fmtGs(sumaAsegurada)} <em>Gs.</em></div>
      </div>
      ${contado ? `
        <div class="resumen-sistema__divider"></div>
        <div class="resumen-sistema__block">
          <div class="resumen-sistema__block-title">Pago contado</div>
          <div class="resumen-sistema__row">
            <span>Costo total</span>
            <span>${fmtGs(contado.premio)} <em>Gs.</em></span>
          </div>
        </div>
      ` : ''}
      ${financiado ? `
        <div class="resumen-sistema__divider"></div>
        <div class="resumen-sistema__block">
          <div class="resumen-sistema__block-title">Financiado</div>
          <div class="resumen-sistema__row">
            <span>Inicial</span>
            <span>${fmtGs(financiado.inicial)} <em>Gs.</em></span>
          </div>
          <div class="resumen-sistema__row">
            <span>${financiado.cantidad_cuotas} cuotas de</span>
            <span>${fmtGs(financiado.cuota)} <em>Gs.</em></span>
          </div>
          <div class="resumen-sistema__subdivider"></div>
          <div class="resumen-sistema__row resumen-sistema__row--stacked">
            <span>Premio financiado</span>
            <div>
              <div>${fmtGs(financiado.premio)} <em>Gs.</em></div>
              <small>Inicial Gs. ${fmtGs(financiado.inicial)}</small>
            </div>
          </div>
        </div>
      ` : ''}
      ${renderAjustesDescuentoRecargo(plan)}
      <div class="resumen-sistema__spacer"></div>
      <div class="resumen-sistema__cta-wrap">
        <button class="resumen-sistema__cta" data-action="emitir-carta" ${state.emitiendoCarta ? 'disabled' : ''}>
          ${ICON_TAG} ${state.emitiendoCarta ? 'Generando…' : (state.editandoId ? 'Guardar cambios' : 'Emitir carta oferta')}
        </button>
        <div class="resumen-sistema__hint--center">Se generará la carta oferta con el detalle del plan seleccionado.</div>
      </div>
    </div>
  `;
}

// Descuento/recargo manual del agente — solo mrc/incendio (ver RAMOS_CON_AJUSTES). El tope real
// lo aplica el backend (sumarAjustes en el calculador); acá solo se muestra como texto de ayuda
// para que el agente sepa hasta cuánto puede cargar antes de que el backend lo clampee. Dos
// campos fijos (Gs. y %) en vez de un input + selector de tipo — el agente carga uno de los dos.
// Apenas tipea en uno, el otro se deshabilita (y se limpia) para evitar que queden los dos
// cargados a la vez y ajustesParaBody tenga que desambiguar en silencio cuál usar.
function renderAjusteField(prefijo, label, plan) {
  const topePlan = prefijo === 'descuento' ? plan?.descuento_maximo : plan?.recargo_maximo;
  const usuario = auth.getUsuario();
  // Tope propio del usuario (Fase 5, ver Editar usuario en admin) — el backend siempre aplica
  // el más restrictivo de los dos; acá solo se refleja para que el agente no cargue de más
  // y lo vea clampeado sin explicación. Nota: es el valor cacheado al loguearse, si un admin
  // edita el tope del usuario en la misma sesión, este texto queda desactualizado hasta el
  // próximo login — el backend igual aplica el valor real y fresco en cada cotización.
  const topeUsuario = prefijo === 'descuento' ? usuario?.descuento_maximo_pct : usuario?.recargo_maximo_pct;
  const tope = topePlan == null ? topeUsuario ?? null : topeUsuario == null ? topePlan : Math.min(topePlan, topeUsuario);
  const montoCargado = state.data[`${prefijo}Monto`] != null && state.data[`${prefijo}Monto`] !== '';
  const porcentajeCargado = state.data[`${prefijo}Porcentaje`] != null && state.data[`${prefijo}Porcentaje`] !== '';

  return `
    <div class="field">
      <label>${label}</label>
      <div style="display:flex;gap:6px;">
        <input
          class="field-input"
          type="text"
          inputmode="numeric"
          data-field="${prefijo}Monto"
          data-money="true"
          placeholder="Gs."
          value="${escapeHtml(fmtGsInput(state.data[`${prefijo}Monto`]))}"
          ${porcentajeCargado ? 'disabled' : ''}
          style="flex:1;"
        />
        <input
          class="field-input"
          type="number"
          min="0"
          data-field="${prefijo}Porcentaje"
          placeholder="%"
          value="${escapeHtml(String(state.data[`${prefijo}Porcentaje`] ?? ''))}"
          ${montoCargado ? 'disabled' : ''}
          style="flex:1;"
        />
      </div>
      <small style="color:#8a8a8a;font-size:11px;">${tope != null ? `Tope aplicable: ${tope}% de la prima` : 'Sin tope confirmado para este plan'}</small>
    </div>
  `;
}

function renderAjustesDescuentoRecargo(plan) {
  if (!RAMOS_CON_AJUSTES.includes(state.ramoId)) return '';
  return `
    <div class="resumen-sistema__divider"></div>
    <div class="resumen-sistema__block">
      <div class="resumen-sistema__block-title">Ajustes (opcionales)</div>
      <div class="resumen-sistema__ajustes">
        ${renderAjusteField('descuento', 'Descuento', plan)}
        ${renderAjusteField('recargo', 'Recargo', plan)}
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
  if (action === 'logout') cerrarSesion();
  else if (action === 'select-ramo') selectRamo(target.dataset.ramo);
  else if (action === 'select-plan') selectPlan(Number(target.dataset.planId));
  else if (action === 'select-forma-pago') selectFormaPago(target.dataset.forma);
  else if (action === 'show-tab') setView(target.dataset.view);
  else if (action === 'add-cobertura-linea') addCoberturaLinea();
  else if (action === 'remove-cobertura-linea') removeCoberturaLinea(target.dataset.lineaId);
  else if (action === 'emitir-carta') emitirCartaOferta();
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

  if (target.type === 'checkbox') {
    updateField(target.dataset.field, target.checked);
    renderApp(); // muestra/oculta campos condicionales (ej. Suma Renta Diaria)
    return;
  }

  if (target.dataset.money === 'true') {
    updateField(target.dataset.field, formatMoneyInputInPlace(target));
    return;
  }

  updateField(target.dataset.field, target.value);
});

app.addEventListener('change', (e) => {
  const planSelect = e.target.closest('[data-action-select="select-plan"]');
  if (planSelect) {
    selectPlan(Number(planSelect.value));
    return;
  }

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
