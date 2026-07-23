import { api, auth } from '../shared/api.js';
import { crearBadge } from '../shared/badge.js';
import { escapeHtml } from '../shared/dom.js';
import { renderSidebarFooter, renderTopbarUser } from '../shared/sidebar.js';
import { ICON_ADMIN_USUARIOS, ICON_ADMIN_COBERTURAS, ICON_ADMIN_TASAS, ICON_ADMIN_PLANES } from '../shared/nav-icons.js';
import { fmtGsConPrefijo as fmtGs, capitalizar } from '../shared/format.js';

// Panel de Administración del Cotizador Tajy — WU5, primera porción (Usuarios).
// Mismo patrón Vanilla JS que cotizar.js: state + render + delegación de eventos por
// data-action. Coberturas por plan / Tasas / Planes quedan como stub "Próximamente" —
// se implementan en próximas porciones de WU5.

const SECCIONES = [
  { id: 'usuarios', label: 'Usuarios', disponible: true, permiso: 'puede_gestionar_usuarios' },
  { id: 'coberturas', label: 'Coberturas por plan', disponible: true, permiso: 'puede_editar_coberturas' },
  { id: 'tasas', label: 'Tasas', disponible: true, permiso: 'puede_editar_tasas' },
  { id: 'planes', label: 'Planes', disponible: true, permiso: 'puede_editar_planes' },
];

// Íconos SVG por sección — mismo estilo de línea (18x18) que el resto de la nav del
// sidebar (ramos en cotizar.js, links de shared/sidebar.js), separado del array de
// arriba para no mezclar datos de negocio con presentación.
const SECCION_ICONOS = {
  usuarios: ICON_ADMIN_USUARIOS,
  coberturas: ICON_ADMIN_COBERTURAS,
  tasas: ICON_ADMIN_TASAS,
  planes: ICON_ADMIN_PLANES,
};

// Secciones visibles para el usuario logueado según sus permisos parciales
// (mismo patrón que puede_editar_tasas, ver docs/ESTADO_PROYECTO.md sección 20a2).
function seccionesVisibles() {
  const usuario = auth.getUsuario();
  return SECCIONES.filter((s) => Boolean(usuario?.[s.permiso]));
}

const state = {
  seccion: 'usuarios',
  usuarios: [],
  loadingUsuarios: false,
  usuariosError: '',
  banner: null, // { tipo: 'error'|'success', texto }
  modal: null, // { tipo: 'crear'|'editar'|'password', usuario?, error, guardando }

  // Roles configurables (migración 031) — cacheados en memoria al entrar a Usuarios.
  roles: [],
  loadingRoles: false,
  rolesError: '',
  modalRol: null, // { tipo: 'crear'|'editar', rolId?, nombre, puede_*, error, guardando }

  ramos: [],
  planes: [],
  loadingPlanes: false,
  planesError: '',
  ramoFiltro: 'todos',
  planExpandido: null, // id del plan con la fila de formas de pago abierta
  formasPagoPorPlan: {}, // planId -> { loading, error, datos: [] }
  primaEnEdicion: new Set(), // ids de plan con el campo prima_tecnica_minima habilitado para editar
  tasaRpfEnEdicion: new Set(), // ids de plan_formas_pago con la tasa habilitada para editar

  ramoTasasSeleccionado: null,
  tasasPorRamo: {}, // ramoId -> { loading, error, historial: [] }
  catalogoPorRamo: {}, // ramoId -> coberturas_catalogo[] (para el selector del modal de alta)
  modalTasa: null, // { error, guardando, cobertura_id, tasa_valor, unidad, vigente_desde }

  // rubros_actividad: compartida entre MRC e Incendio (no tiene ramo_id propio), se carga
  // una sola vez (no por ramo) — ver seleccionarRamoTasas.
  rubrosActividad: { loading: false, error: '', datos: null },
  rubroActividadEnEdicion: new Set(), // ids de rubros_actividad con tasa_edificio/tasa_contenido habilitados para editar

  ramoCoberturasSeleccionado: null,
  planCoberturasSeleccionado: null,
  planesPorRamoCob: {}, // ramoId -> { loading, error, datos: [] }
  coberturasDelPlan: {}, // planId -> { loading, error, datos: [] }
  coberturaEnEdicion: new Set(), // ids de plan_coberturas con monto/franquicia habilitados para editar
  modalCobertura: null, // { error, guardando, cobertura_id, incluida_por_defecto }
};

const app = document.getElementById('app');

async function init() {
  if (!auth.isLoggedIn()) {
    window.location.href = '../login/';
    return;
  }
  if (!auth.tieneAccesoAdmin()) {
    // El panel admin es para rol 'admin' O cualquier rol custom con al menos un permiso
    // parcial (migración 031) — antes exigía rol==='admin' a secas, lo que dejaba afuera
    // a roles como "Jefe de Análisis de Riesgo" aunque tuvieran los 4 permisos en true.
    // A quien no tiene ningún permiso se lo redirige directo al cotizador (mismo patrón
    // que la sesión expirada en shared/api.js, que también resuelve con un redirect en
    // vez de una pantalla propia).
    window.location.href = '../cotizar/';
    return;
  }

  // Permisos parciales por sección (ver docs/ESTADO_PROYECTO.md sección 20a2): un admin
  // puede no tener acceso a todas las secciones. Se arranca en la primera visible.
  const visibles = seccionesVisibles();
  if (!visibles.length) {
    state.seccion = null;
    renderApp();
    return;
  }
  state.seccion = visibles[0].id;
  renderApp();

  if (state.seccion === 'usuarios') {
    await Promise.all([cargarUsuarios(), cargarRoles()]);
  } else if (state.seccion === 'planes') {
    await cargarPlanes();
  } else if (state.seccion === 'tasas' || state.seccion === 'coberturas') {
    const ramos = await api.get('/ramos');
    state.ramos = ramos;
    renderApp();
  }
}

async function cerrarSesion() {
  await auth.logout();
  window.location.href = '../login/';
}

function mostrarBanner(tipo, texto) {
  state.banner = { tipo, texto };
  renderApp();
}

// ---------------------------------------------------------------------------
// Usuarios: carga y acciones
// ---------------------------------------------------------------------------

async function cargarUsuarios() {
  state.loadingUsuarios = true;
  state.usuariosError = '';
  renderApp();
  try {
    state.usuarios = await api.get('/admin/usuarios');
  } catch (err) {
    state.usuarios = [];
    state.usuariosError = err.message || 'No se pudo cargar la lista de usuarios.';
  } finally {
    state.loadingUsuarios = false;
    renderApp();
  }
}

function abrirModalCrear() {
  const rolDefault = state.roles.find((r) => r.nombre === 'agente') ?? state.roles[0];
  state.modal = {
    tipo: 'crear',
    error: '',
    guardando: false,
    nombre: '',
    email: '',
    rol_id: rolDefault?.id ?? '',
    password: '',
  };
  renderApp();
}

function abrirModalEditar(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) return;
  const rolActual = state.roles.find((r) => r.nombre === usuario.rol);
  state.modal = {
    tipo: 'editar',
    usuario,
    error: '',
    guardando: false,
    nombre: usuario.nombre,
    email: usuario.email,
    rol_id: usuario.rol_id ?? rolActual?.id ?? '',
    activo: Boolean(usuario.activo),
    descuento_maximo_pct: usuario.descuento_maximo_pct,
    recargo_maximo_pct: usuario.recargo_maximo_pct,
  };
  renderApp();
}

function abrirModalPassword(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) return;
  state.modal = { tipo: 'password', usuario, error: '', guardando: false, password: '' };
  renderApp();
}

function cerrarModal() {
  state.modal = null;
  renderApp();
}

async function desactivarUsuario(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) return;
  if (!confirm(`¿Desactivar a ${usuario.nombre}? No va a poder iniciar sesión.`)) return;

  try {
    await api.put(`/admin/usuarios/${usuarioId}`, { activo: false });
    mostrarBanner('success', `${usuario.nombre} fue desactivado.`);
    await cargarUsuarios();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo desactivar el usuario.');
  }
}

async function eliminarUsuario(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId);
  if (!usuario) return;
  if (!confirm(`¿Eliminar a ${usuario.nombre} definitivamente? Esta acción no se puede deshacer.`)) return;

  try {
    await api.delete(`/admin/usuarios/${usuarioId}`);
    mostrarBanner('success', `${usuario.nombre} fue eliminado.`);
    await cargarUsuarios();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar el usuario.');
  }
}

async function guardarModalCrear(form) {
  const nombre = form.nombre.value.trim();
  const email = form.email.value.trim();
  const rol_id = Number(form.rol_id.value);
  const password = form.password.value;

  if (!nombre || !email) {
    state.modal.error = 'Completá nombre y email.';
    renderApp();
    return;
  }
  if (!rol_id) {
    state.modal.error = 'Elegí un rol.';
    renderApp();
    return;
  }
  if (password.length < 8) {
    state.modal.error = 'La contraseña debe tener al menos 8 caracteres.';
    renderApp();
    return;
  }

  state.modal.error = '';
  state.modal.guardando = true;
  renderApp();

  try {
    await api.post('/admin/usuarios', { nombre, email, rol_id, password });
    cerrarModal();
    mostrarBanner('success', `Usuario ${nombre} creado.`);
    await cargarUsuarios();
  } catch (err) {
    state.modal.guardando = false;
    state.modal.error = err.message || 'No se pudo crear el usuario.';
    renderApp();
  }
}

async function guardarModalEditar(form) {
  const usuario = state.modal.usuario;
  const nombre = form.nombre.value.trim();
  const email = form.email.value.trim();
  const rol_id = Number(form.rol_id.value);
  const activo = form.activo.checked;
  // Campo vacío = sin tope propio (usa el tope del plan tal cual) -> se manda null.
  const descuentoMaximoPct = form.descuento_maximo_pct.value === '' ? null : Number(form.descuento_maximo_pct.value);
  const recargoMaximoPct = form.recargo_maximo_pct.value === '' ? null : Number(form.recargo_maximo_pct.value);

  if (!nombre || !email) {
    state.modal.error = 'Completá nombre y email.';
    renderApp();
    return;
  }
  if (!rol_id) {
    state.modal.error = 'Elegí un rol.';
    renderApp();
    return;
  }

  state.modal.error = '';
  state.modal.guardando = true;
  renderApp();

  try {
    await api.put(`/admin/usuarios/${usuario.id}`, {
      nombre,
      email,
      rol_id,
      activo,
      descuento_maximo_pct: descuentoMaximoPct,
      recargo_maximo_pct: recargoMaximoPct,
    });
    cerrarModal();
    mostrarBanner('success', `Usuario ${usuario.nombre} actualizado.`);
    await cargarUsuarios();
  } catch (err) {
    state.modal.guardando = false;
    state.modal.error = err.message || 'No se pudo actualizar el usuario.';
    renderApp();
  }
}

async function guardarModalPassword(form) {
  const usuario = state.modal.usuario;
  const password = form.password.value;

  if (password.length < 8) {
    state.modal.error = 'La contraseña debe tener al menos 8 caracteres.';
    renderApp();
    return;
  }

  state.modal.error = '';
  state.modal.guardando = true;
  renderApp();

  try {
    await api.put(`/admin/usuarios/${usuario.id}/password`, { password });
    cerrarModal();
    mostrarBanner('success', `Contraseña de ${usuario.nombre} actualizada.`);
  } catch (err) {
    state.modal.guardando = false;
    state.modal.error = err.message || 'No se pudo actualizar la contraseña.';
    renderApp();
  }
}

// ---------------------------------------------------------------------------
// Roles: carga y acciones (migración 031)
// ---------------------------------------------------------------------------

async function cargarRoles() {
  state.loadingRoles = true;
  state.rolesError = '';
  renderApp();
  try {
    state.roles = await api.get('/admin/roles');
  } catch (err) {
    state.roles = [];
    state.rolesError = err.message || 'No se pudo cargar la lista de roles.';
  } finally {
    state.loadingRoles = false;
    renderApp();
  }
}

async function eliminarRol(rolId) {
  const rol = state.roles.find((r) => r.id === rolId);
  if (!rol) return;
  if (!confirm(`¿Eliminar el rol "${capitalizar(rol.nombre)}" definitivamente? Esta acción no se puede deshacer.`)) return;

  try {
    await api.delete(`/admin/roles/${rolId}`);
    mostrarBanner('success', `Rol "${capitalizar(rol.nombre)}" eliminado.`);
    await cargarRoles();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar el rol.');
  }
}

function abrirModalRolCrear() {
  state.modalRol = {
    tipo: 'crear',
    error: '',
    guardando: false,
    nombre: '',
    puede_editar_tasas: false,
    puede_gestionar_usuarios: false,
    puede_editar_coberturas: false,
    puede_editar_planes: false,
  };
  renderApp();
}

function abrirModalRolEditar(rolId) {
  const rol = state.roles.find((r) => r.id === rolId);
  if (!rol || rol.es_sistema) return; // roles del sistema no son editables desde el panel
  state.modalRol = {
    tipo: 'editar',
    rolId: rol.id,
    error: '',
    guardando: false,
    nombre: rol.nombre,
    puede_editar_tasas: Boolean(rol.puede_editar_tasas),
    puede_gestionar_usuarios: Boolean(rol.puede_gestionar_usuarios),
    puede_editar_coberturas: Boolean(rol.puede_editar_coberturas),
    puede_editar_planes: Boolean(rol.puede_editar_planes),
  };
  renderApp();
}

function cerrarModalRol() {
  state.modalRol = null;
  renderApp();
}

async function guardarModalRol(form) {
  const nombre = form.nombre.value.trim();
  const datos = {
    nombre,
    puede_editar_tasas: form.puede_editar_tasas.checked,
    puede_gestionar_usuarios: form.puede_gestionar_usuarios.checked,
    puede_editar_coberturas: form.puede_editar_coberturas.checked,
    puede_editar_planes: form.puede_editar_planes.checked,
  };

  if (!nombre) {
    state.modalRol.error = 'Completá el nombre del rol.';
    renderApp();
    return;
  }

  state.modalRol.error = '';
  state.modalRol.guardando = true;
  renderApp();

  try {
    if (state.modalRol.tipo === 'crear') {
      await api.post('/admin/roles', datos);
      mostrarBanner('success', `Rol ${nombre} creado.`);
    } else {
      await api.put(`/admin/roles/${state.modalRol.rolId}`, datos);
      mostrarBanner('success', `Rol ${nombre} actualizado.`);
    }
    cerrarModalRol();
    await cargarRoles();
    // Repuebla el select de rol de un modal de usuario abierto, si lo hay, para que
    // el rol recién creado/editado aparezca sin tener que cerrar y reabrir el modal.
    renderApp();
  } catch (err) {
    state.modalRol.guardando = false;
    state.modalRol.error = err.message || 'No se pudo guardar el rol.';
    renderApp();
  }
}

// ---------------------------------------------------------------------------
// Planes: carga y acciones
// ---------------------------------------------------------------------------

async function cargarPlanes() {
  state.loadingPlanes = true;
  state.planesError = '';
  renderApp();
  try {
    const [ramos, planes] = await Promise.all([
      state.ramos.length ? Promise.resolve(state.ramos) : api.get('/ramos'),
      api.get('/admin/planes'),
    ]);
    state.ramos = ramos;
    state.planes = planes;
  } catch (err) {
    state.planes = [];
    state.planesError = err.message || 'No se pudo cargar la lista de planes.';
  } finally {
    state.loadingPlanes = false;
    renderApp();
  }
}

async function togglePlanActivo(planId, activo) {
  try {
    await api.put(`/admin/planes/${planId}`, { activo });
    const plan = state.planes.find((p) => p.id === Number(planId));
    if (plan) plan.activo = activo;
    mostrarBanner('success', `Plan ${activo ? 'activado' : 'desactivado'}.`);
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el plan.');
  }
}

function habilitarEdicionPrima(planId) {
  state.primaEnEdicion.add(planId);
  renderApp();
}

function cancelarEdicionPrima(planId) {
  state.primaEnEdicion.delete(planId);
  renderApp();
}

async function guardarPrimaTecnicaMinima(planId, form) {
  const valor = form.prima_tecnica_minima.value;
  const prima_tecnica_minima = valor === '' ? null : Number(valor);

  try {
    const plan = await api.put(`/admin/planes/${planId}`, { prima_tecnica_minima });
    const idx = state.planes.findIndex((p) => p.id === Number(planId));
    if (idx !== -1) state.planes[idx] = { ...state.planes[idx], ...plan };
    state.primaEnEdicion.delete(Number(planId));
    mostrarBanner('success', 'Prima técnica mínima actualizada.');
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la prima técnica mínima.');
  }
}

async function toggleFormasPago(planId) {
  if (state.planExpandido === planId) {
    state.planExpandido = null;
    renderApp();
    return;
  }
  state.planExpandido = planId;
  renderApp();

  if (state.formasPagoPorPlan[planId]?.datos) return; // ya cargadas

  state.formasPagoPorPlan[planId] = { loading: true, error: '', datos: [] };
  renderApp();
  try {
    const datos = await api.get(`/admin/planes/${planId}/formas-pago`);
    state.formasPagoPorPlan[planId] = { loading: false, error: '', datos };
  } catch (err) {
    state.formasPagoPorPlan[planId] = {
      loading: false,
      error: err.message || 'No se pudieron cargar las formas de pago.',
      datos: [],
    };
  }
  renderApp();
}

async function toggleFormaPagoHabilitada(planFormaPagoId, planId, habilitada) {
  try {
    await api.put(`/admin/plan-formas-pago/${planFormaPagoId}`, { habilitada });
    const entry = state.formasPagoPorPlan[planId];
    const fila = entry?.datos.find((f) => f.id === Number(planFormaPagoId));
    if (fila) fila.habilitada = habilitada;
    mostrarBanner('success', `Forma de pago ${habilitada ? 'habilitada' : 'deshabilitada'}.`);
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la forma de pago.');
  }
}

function habilitarEdicionTasaRpf(planFormaPagoId) {
  state.tasaRpfEnEdicion.add(planFormaPagoId);
  renderApp();
}

function cancelarEdicionTasaRpf(planFormaPagoId) {
  state.tasaRpfEnEdicion.delete(planFormaPagoId);
  renderApp();
}

async function guardarTasaRpf(planFormaPagoId, planId, form) {
  const tasa_rpf = Number(form.tasa_rpf.value);

  try {
    const fila = await api.put(`/admin/plan-formas-pago/${planFormaPagoId}`, { tasa_rpf });
    const entry = state.formasPagoPorPlan[planId];
    const idx = entry?.datos.findIndex((f) => f.id === Number(planFormaPagoId));
    if (entry && idx !== -1) entry.datos[idx] = { ...entry.datos[idx], ...fila };
    state.tasaRpfEnEdicion.delete(Number(planFormaPagoId));
    mostrarBanner('success', 'Tasa RPF actualizada.');
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la tasa RPF.');
  }
}

// ---------------------------------------------------------------------------
// Tasas: carga y acciones
// ---------------------------------------------------------------------------

async function seleccionarRamoTasas(ramoId) {
  // ramos.id es un código de texto ('mrc', 'incendio', ...), no numérico — a diferencia
  // de plan_id/cobertura_id. Nunca castear con Number acá (ver renderPlanes, que ya trata
  // ramo_id como string).
  state.ramoTasasSeleccionado = ramoId || null;
  renderApp();
  if (!state.ramoTasasSeleccionado) return;
  const tareas = [cargarTasasDeRamo(state.ramoTasasSeleccionado), cargarCatalogoDeRamo(state.ramoTasasSeleccionado)];
  if (ramoUsaRubrosActividad(state.ramoTasasSeleccionado) && state.rubrosActividad.datos == null) {
    tareas.push(cargarRubrosActividad());
  }
  await Promise.all(tareas);
}

// rubros_actividad es compartida entre MRC e Incendio (no tiene ramo_id propio) —
// se muestra solo cuando el ramo seleccionado es uno de esos dos (nombre = slug, no
// nombre_display), evita mostrarla para Vida/AP u otros ramos que no la usan.
function ramoUsaRubrosActividad(ramoId) {
  const ramo = state.ramos.find((r) => String(r.id) === String(ramoId));
  return ramo?.nombre === 'mrc' || ramo?.nombre === 'incendio';
}

async function cargarRubrosActividad() {
  state.rubrosActividad = { loading: true, error: '', datos: state.rubrosActividad.datos ?? [] };
  renderApp();
  try {
    const datos = await api.get('/admin/rubros-actividad');
    state.rubrosActividad = { loading: false, error: '', datos };
  } catch (err) {
    state.rubrosActividad = {
      loading: false,
      error: err.message || 'No se pudieron cargar los tipos de riesgo.',
      datos: [],
    };
  }
  renderApp();
}

function habilitarEdicionRubroActividad(id) {
  state.rubroActividadEnEdicion.add(id);
  renderApp();
}

function cancelarEdicionRubroActividad(id) {
  state.rubroActividadEnEdicion.delete(id);
  renderApp();
}

async function guardarRubroActividadTasas(id, form) {
  // A diferencia de prima_tecnica_minima/monto/franquicia, el schema de este endpoint
  // (editarRubroActividadSchema) NO acepta null — tasa_edificio/tasa_contenido son
  // z.number().nonnegative().optional(), así que acá siempre se manda un número.
  const tasa_edificio = Number(form.tasa_edificio.value);
  const tasa_contenido = Number(form.tasa_contenido.value);

  if (Number.isNaN(tasa_edificio) || Number.isNaN(tasa_contenido)) {
    mostrarBanner('error', 'Ingresá valores numéricos válidos para ambas tasas.');
    return;
  }

  try {
    const fila = await api.put(`/admin/rubros-actividad/${id}`, { tasa_edificio, tasa_contenido });
    const datos = state.rubrosActividad.datos ?? [];
    const idx = datos.findIndex((r) => r.id === Number(id));
    if (idx !== -1) datos[idx] = { ...datos[idx], ...fila };
    state.rubroActividadEnEdicion.delete(Number(id));
    mostrarBanner('success', 'Tipo de riesgo actualizado.');
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar el tipo de riesgo.');
  }
}

async function eliminarTasa(id) {
  const ramoId = state.ramoTasasSeleccionado;
  const entry = state.tasasPorRamo[ramoId];
  const tasa = entry?.historial.find((t) => t.id === id);
  const nombreCobertura = tasa?.coberturas_catalogo?.nombre ?? 'esta tasa';
  if (!confirm(`¿Eliminar la versión de "${nombreCobertura}" cargada el ${tasa?.vigente_desde ?? ''}? Si era la vigente, vuelve a regir la versión anterior.`)) return;

  try {
    await api.delete(`/admin/tasas/${id}`);
    mostrarBanner('success', 'Tasa eliminada.');
    await cargarTasasDeRamo(ramoId);
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar la tasa.');
  }
}

async function cargarTasasDeRamo(ramoId) {
  state.tasasPorRamo[ramoId] = { loading: true, error: '', historial: state.tasasPorRamo[ramoId]?.historial ?? [] };
  renderApp();
  try {
    const historial = await api.get(`/admin/ramos/${ramoId}/tasas`);
    state.tasasPorRamo[ramoId] = { loading: false, error: '', historial };
  } catch (err) {
    state.tasasPorRamo[ramoId] = {
      loading: false,
      error: err.message || 'No se pudo cargar el historial de tasas.',
      historial: [],
    };
  }
  renderApp();
}

async function cargarCatalogoDeRamo(ramoId) {
  if (state.catalogoPorRamo[ramoId]) return; // catálogo de coberturas no cambia en la sesión
  try {
    state.catalogoPorRamo[ramoId] = await api.get(`/ramos/${ramoId}/coberturas-catalogo`);
  } catch {
    state.catalogoPorRamo[ramoId] = [];
  }
}

function abrirModalTasa() {
  state.modalTasa = {
    error: '',
    guardando: false,
    cobertura_id: '',
    tasa_valor: '',
    unidad: 'permil',
    vigente_desde: new Date().toISOString().slice(0, 10),
  };
  renderApp();
}

function cerrarModalTasa() {
  state.modalTasa = null;
  renderApp();
}

async function guardarModalTasa(form) {
  const ramoId = state.ramoTasasSeleccionado;
  const cobertura_id = Number(form.cobertura_id.value);
  const tasa_valor = Number(form.tasa_valor.value);
  const unidad = form.unidad.value;
  const vigente_desde = form.vigente_desde.value;

  if (!cobertura_id) {
    state.modalTasa.error = 'Elegí una cobertura.';
    renderApp();
    return;
  }
  if (Number.isNaN(tasa_valor)) {
    state.modalTasa.error = 'Ingresá un valor de tasa válido.';
    renderApp();
    return;
  }

  state.modalTasa.error = '';
  state.modalTasa.guardando = true;
  renderApp();

  try {
    await api.post('/admin/tasas', { ramo_id: Number(ramoId), cobertura_id, tasa_valor, unidad, vigente_desde });
    cerrarModalTasa();
    mostrarBanner('success', 'Nueva versión de tasa creada.');
    await cargarTasasDeRamo(ramoId);
  } catch (err) {
    state.modalTasa.guardando = false;
    state.modalTasa.error = err.message || 'No se pudo crear la tasa.';
    renderApp();
  }
}

// ---------------------------------------------------------------------------
// Coberturas por plan: carga y acciones
// ---------------------------------------------------------------------------

async function seleccionarRamoCoberturas(ramoId) {
  // Mismo criterio que ramoTasasSeleccionado: guardar el string crudo del <select>,
  // castear con Number() recién al armar el payload que va al backend.
  state.ramoCoberturasSeleccionado = ramoId || null;
  state.planCoberturasSeleccionado = null;
  renderApp();
  if (!state.ramoCoberturasSeleccionado) return;
  await Promise.all([
    cargarPlanesDeRamoCob(state.ramoCoberturasSeleccionado),
    cargarCatalogoDeRamo(state.ramoCoberturasSeleccionado),
  ]);
}

async function cargarPlanesDeRamoCob(ramoId) {
  state.planesPorRamoCob[ramoId] = { loading: true, error: '', datos: [] };
  renderApp();
  try {
    const datos = await api.get(`/admin/planes?ramoId=${encodeURIComponent(ramoId)}`);
    state.planesPorRamoCob[ramoId] = { loading: false, error: '', datos };
  } catch (err) {
    state.planesPorRamoCob[ramoId] = {
      loading: false,
      error: err.message || 'No se pudieron cargar los planes del ramo.',
      datos: [],
    };
  }
  renderApp();
}

async function seleccionarPlanCoberturas(planId) {
  state.planCoberturasSeleccionado = planId || null;
  renderApp();
  if (!state.planCoberturasSeleccionado) return;
  await cargarCoberturasDelPlan(state.planCoberturasSeleccionado);
}

async function cargarCoberturasDelPlan(planId) {
  state.coberturasDelPlan[planId] = { loading: true, error: '', datos: [] };
  renderApp();
  try {
    const datos = await api.get(`/admin/planes/${planId}/coberturas`);
    state.coberturasDelPlan[planId] = { loading: false, error: '', datos };
  } catch (err) {
    state.coberturasDelPlan[planId] = {
      loading: false,
      error: err.message || 'No se pudieron cargar las coberturas del plan.',
      datos: [],
    };
  }
  renderApp();
}

async function toggleCoberturaDefecto(planCoberturaId, planId, incluidaPorDefecto) {
  try {
    const fila = await api.put(`/admin/plan-coberturas/${planCoberturaId}`, { incluida_por_defecto: incluidaPorDefecto });
    const entry = state.coberturasDelPlan[planId];
    const idx = entry?.datos.findIndex((c) => c.id === Number(planCoberturaId));
    if (entry && idx !== -1) entry.datos[idx] = { ...entry.datos[idx], ...fila };
    mostrarBanner('success', `Cobertura ${incluidaPorDefecto ? 'marcada' : 'desmarcada'} por defecto.`);
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la cobertura.');
  }
}

function habilitarEdicionCobertura(planCoberturaId) {
  state.coberturaEnEdicion.add(planCoberturaId);
  renderApp();
}

function cancelarEdicionCobertura(planCoberturaId) {
  state.coberturaEnEdicion.delete(planCoberturaId);
  renderApp();
}

async function guardarMontoFranquicia(planCoberturaId, planId, form) {
  const montoValor = form.monto.value;
  const franquiciaValor = form.franquicia.value;
  const monto = montoValor === '' ? null : Number(montoValor);
  const franquicia = franquiciaValor === '' ? null : Number(franquiciaValor);

  try {
    const fila = await api.put(`/admin/plan-coberturas/${planCoberturaId}`, { monto, franquicia });
    const entry = state.coberturasDelPlan[planId];
    const idx = entry?.datos.findIndex((c) => c.id === Number(planCoberturaId));
    if (entry && idx !== -1) entry.datos[idx] = { ...entry.datos[idx], ...fila };
    state.coberturaEnEdicion.delete(Number(planCoberturaId));
    mostrarBanner('success', 'Cobertura actualizada.');
    renderApp();
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo actualizar la cobertura.');
  }
}

async function eliminarCoberturaDelPlan(planCoberturaId, planId) {
  if (!confirm('¿Quitar esta cobertura del plan?')) return;
  try {
    await api.delete(`/admin/plan-coberturas/${planCoberturaId}`);
    mostrarBanner('success', 'Cobertura quitada del plan.');
    await cargarCoberturasDelPlan(planId);
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo quitar la cobertura.');
  }
}

function abrirModalCobertura() {
  state.modalCobertura = {
    error: '',
    guardando: false,
    cobertura_id: '',
    incluida_por_defecto: true,
    monto: '',
    franquicia: '',
  };
  renderApp();
}

function cerrarModalCobertura() {
  state.modalCobertura = null;
  renderApp();
}

async function guardarModalCobertura(form) {
  const planId = state.planCoberturasSeleccionado;
  const cobertura_id = Number(form.cobertura_id.value);
  const incluida_por_defecto = form.incluida_por_defecto.checked;
  const montoValor = form.monto.value;
  const franquiciaValor = form.franquicia.value;

  if (!cobertura_id) {
    state.modalCobertura.error = 'Elegí una cobertura.';
    renderApp();
    return;
  }

  state.modalCobertura.error = '';
  state.modalCobertura.guardando = true;
  renderApp();

  try {
    await api.post(`/admin/planes/${planId}/coberturas`, {
      cobertura_id,
      incluida_por_defecto,
      monto: montoValor === '' ? null : Number(montoValor),
      franquicia: franquiciaValor === '' ? null : Number(franquiciaValor),
    });
    cerrarModalCobertura();
    mostrarBanner('success', 'Cobertura agregada al plan.');
    await cargarCoberturasDelPlan(planId);
  } catch (err) {
    state.modalCobertura.guardando = false;
    state.modalCobertura.error = err.message || 'No se pudo agregar la cobertura.';
    renderApp();
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderApp() {
  // app.innerHTML se reemplaza entero en cada render, así que .admin-content es un nodo
  // nuevo con scrollTop = 0 — sin esto, cualquier acción (ej. "Editar" en una tasa) tira
  // al usuario arriba de todo aunque estaba scrolleado abajo.
  const scrollAnterior = app.querySelector('.admin-content')?.scrollTop ?? 0;

  app.innerHTML = `
    ${renderTopbar()}
    <div class="app-body">
      ${renderSidebar()}
      <div class="main">
        <div class="main-header">
          <div>
            <div class="main-header__title">Administración</div>
            <div class="main-header__subtitle">Gestión de usuarios, coberturas, tasas y planes</div>
          </div>
        </div>
        <div class="admin-content">
          ${renderBanner()}
          ${renderSeccion()}
        </div>
      </div>
    </div>
    ${state.modal ? renderModal() : ''}
    ${state.modalRol ? renderModalRol() : ''}
    ${state.modalTasa ? renderModalTasa() : ''}
    ${state.modalCobertura ? renderModalCobertura() : ''}
  `;
  bindEvents();

  const contenido = app.querySelector('.admin-content');
  if (contenido) contenido.scrollTop = scrollAnterior;
}

function renderTopbar() {
  return `
    <div class="topbar">
      <div class="topbar__red-block">
        <img class="topbar__logo" src="../login/assets/logo-rojo-con-negro.svg" alt="Aseguradora Tajy" />
        <div class="topbar__brand-text">
          <div class="topbar__brand-sub">Sistema de Cotización de Pólizas</div>
        </div>
      </div>
      <div class="topbar__crumb-area">
        <div class="topbar__breadcrumb">
          <span class="topbar__crumb-item topbar__crumb-item--current">Panel de Administración</span>
        </div>
        ${renderTopbarUser('admin')}
      </div>
    </div>
  `;
}

function renderSidebar() {
  const items = seccionesVisibles().map((s) => `
    <div
      class="nav-item nav-item--icon ${s.id === state.seccion ? 'nav-item--active' : ''}"
      data-action="select-seccion"
      data-seccion="${s.id}"
    >
      <span class="nav-item__badge">${SECCION_ICONOS[s.id] ?? ''}</span>
      <span>${s.label}</span>
      ${!s.disponible ? '<span class="nav-item__badge-pill">Pronto</span>' : ''}
    </div>
  `).join('');

  return `
    <div class="sidebar">
      <div class="sidebar__nav">
        <div class="sidebar__section-label">Secciones</div>
        ${items}
      </div>
      <div class="sidebar__footer">
        <div class="sidebar__section-label">Gestión</div>
        ${renderSidebarFooter('admin')}
      </div>
    </div>
  `;
}

function renderBanner() {
  if (!state.banner) return '';
  return `<div class="admin-banner admin-banner--${state.banner.tipo}">${escapeHtml(state.banner.texto)}</div>`;
}

function renderSeccion() {
  if (!state.seccion) {
    return `
      <div class="empty-state">
        <div class="empty-state__title">Sin secciones habilitadas</div>
        <div class="empty-state__subtitle">Tu usuario no tiene permiso para ninguna sección del panel admin. Pedile a un administrador que te habilite acceso.</div>
      </div>
    `;
  }
  const seccion = seccionesVisibles().find((s) => s.id === state.seccion);
  if (!seccion?.disponible) return renderProximamente(seccion);
  if (state.seccion === 'usuarios') return renderUsuarios();
  if (state.seccion === 'coberturas') return renderCoberturas();
  if (state.seccion === 'planes') return renderPlanes();
  if (state.seccion === 'tasas') return renderTasas();
  return renderProximamente(seccion);
}

function renderProximamente(seccion) {
  return `
    <div class="empty-state">
      <div class="empty-state__title">${escapeHtml(seccion?.label ?? '')}</div>
      <div class="empty-state__subtitle">Esta sección todavía no está implementada — próximamente.</div>
    </div>
  `;
}

function renderUsuarios() {
  return `
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Usuarios</span>
        <button class="btn-primary btn-primary--sm" data-action="crear-usuario">+ Nuevo usuario</button>
      </div>
      <div class="card__body">
        ${renderTablaUsuarios()}
      </div>
    </div>
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Roles</span>
        <button class="btn-primary btn-primary--sm" data-action="crear-rol">+ Crear rol</button>
      </div>
      <div class="card__body">
        ${renderTablaRoles()}
      </div>
    </div>
  `;
}

function renderTablaRoles() {
  if (state.loadingRoles) {
    return '<div class="empty-state__subtitle">Cargando roles…</div>';
  }
  if (state.rolesError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.rolesError)}</div>`;
  }
  if (!state.roles.length) {
    return '<div class="empty-state__subtitle">Todavía no hay roles cargados.</div>';
  }

  const filas = state.roles.map((r) => `
    <tr>
      <td>${capitalizar(escapeHtml(r.nombre))}</td>
      <td>${crearBadge(r.puede_gestionar_usuarios ? 'Sí' : 'No', r.puede_gestionar_usuarios ? 'success' : 'neutral')}</td>
      <td>${crearBadge(r.puede_editar_coberturas ? 'Sí' : 'No', r.puede_editar_coberturas ? 'success' : 'neutral')}</td>
      <td>${crearBadge(r.puede_editar_tasas ? 'Sí' : 'No', r.puede_editar_tasas ? 'success' : 'neutral')}</td>
      <td>${crearBadge(r.puede_editar_planes ? 'Sí' : 'No', r.puede_editar_planes ? 'success' : 'neutral')}</td>
      <td>
        <div class="admin-table__actions">
          ${r.es_sistema
            ? '<button class="btn-outline" disabled title="Rol del sistema — no se puede editar">Editar</button>'
            : `<button class="btn-outline" data-action="editar-rol" data-id="${r.id}">Editar</button>`}
          ${r.es_sistema
            ? '<button class="btn-outline" disabled title="Rol del sistema — no se puede eliminar">Eliminar</button>'
            : `<button class="btn-outline" data-action="eliminar-rol" data-id="${r.id}">Eliminar</button>`}
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Rol</th>
          <th>Gestiona usuarios</th>
          <th>Edita coberturas</th>
          <th>Edita tasas</th>
          <th>Edita planes</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderTablaUsuarios() {
  if (state.loadingUsuarios) {
    return '<div class="empty-state__subtitle">Cargando usuarios…</div>';
  }
  if (state.usuariosError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.usuariosError)}</div>`;
  }
  if (!state.usuarios.length) {
    return '<div class="empty-state__subtitle">Todavía no hay usuarios cargados.</div>';
  }

  const usuarioActual = auth.getUsuario();
  const usuarioActualId = usuarioActual?.id;
  const solicitanteEsAdmin = usuarioActual?.rol === 'admin';

  const filas = state.usuarios.map((u) => {
    // Mismo criterio que el service (admin.service.js#asegurarPuedeModificarAdmin /
    // #eliminarUsuario): un usuario admin solo puede ser tocado (editado, desactivado,
    // password reseteado, eliminado) por otro admin, sin importar qué permisos booleanos
    // tenga el rol custom de quien está mirando el panel.
    const puedeModificar = u.rol !== 'admin' || solicitanteEsAdmin;
    const puedeEliminar = u.id !== usuarioActualId && puedeModificar;
    return `
    <tr>
      <td>${escapeHtml(u.nombre)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${crearBadge(capitalizar(u.rol), u.rol === 'admin' ? 'primary' : 'neutral')}</td>
      <td>${crearBadge(u.activo ? 'Activo' : 'Inactivo', u.activo ? 'success' : 'neutral')}</td>
      <td>
        <div class="admin-table__actions">
          ${puedeModificar ? `<button class="btn-outline" data-action="editar-usuario" data-id="${u.id}">Editar</button>` : ''}
          ${puedeModificar ? `<button class="btn-outline" data-action="password-usuario" data-id="${u.id}">Resetear password</button>` : ''}
          ${u.activo && puedeModificar ? `<button class="btn-outline" data-action="desactivar-usuario" data-id="${u.id}">Desactivar</button>` : ''}
          ${puedeEliminar ? `<button class="btn-outline" data-action="eliminar-usuario" data-id="${u.id}">Eliminar</button>` : ''}
        </div>
      </td>
    </tr>
  `;
  }).join('');

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Email</th>
          <th>Rol</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderPlanes() {
  const opcionesRamo = state.ramos.map((r) => `
    <option value="${r.id}" ${state.ramoFiltro === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `).join('');

  return `
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Planes</span>
        <select class="field-input" style="width: auto;" data-action="filtrar-ramo">
          <option value="todos" ${state.ramoFiltro === 'todos' ? 'selected' : ''}>Todos los ramos</option>
          ${opcionesRamo}
        </select>
      </div>
      <div class="card__body">
        ${renderTablaPlanes()}
      </div>
    </div>
  `;
}

function renderTablaPlanes() {
  if (state.loadingPlanes) {
    return '<div class="empty-state__subtitle">Cargando planes…</div>';
  }
  if (state.planesError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.planesError)}</div>`;
  }

  const planesFiltrados = state.ramoFiltro === 'todos'
    ? state.planes
    : state.planes.filter((p) => String(p.ramo_id) === state.ramoFiltro);

  if (!planesFiltrados.length) {
    return '<div class="empty-state__subtitle">No hay planes para mostrar.</div>';
  }

  const filas = planesFiltrados.map((p) => `
    <tr>
      <td>${escapeHtml(p.nombre)}</td>
      <td>${escapeHtml(p.ramos?.nombre_display ?? '')}</td>
      <td>
        <label class="admin-modal__checkbox">
          <input type="checkbox" data-action="toggle-plan-activo" data-id="${p.id}" ${p.activo ? 'checked' : ''} />
          ${p.activo ? 'Activo' : 'Inactivo'}
        </label>
      </td>
      <td>${renderCampoPrimaTecnicaMinima(p)}</td>
      <td>
        <button class="btn-outline" data-action="toggle-formas-pago" data-id="${p.id}">
          ${state.planExpandido === p.id ? 'Ocultar' : 'Formas de pago'}
        </button>
      </td>
    </tr>
    ${state.planExpandido === p.id ? `<tr class="admin-subrow"><td colspan="5">${renderFormasPagoDelPlan(p.id)}</td></tr>` : ''}
  `).join('');

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Plan</th>
          <th>Ramo</th>
          <th>Estado</th>
          <th>Prima técnica mínima</th>
          <th>Formas de pago</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderFormasPagoDelPlan(planId) {
  const entry = state.formasPagoPorPlan[planId];
  if (!entry || entry.loading) {
    return '<div class="empty-state__subtitle">Cargando formas de pago…</div>';
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`;
  }
  if (!entry.datos.length) {
    return '<div class="empty-state__subtitle">Este plan no tiene formas de pago configuradas.</div>';
  }

  const filas = entry.datos.map((f) => `
    <tr>
      <td>${escapeHtml(f.formas_pago?.nombre_display ?? '')}</td>
      <td>${renderCampoTasaRpf(f, planId)}</td>
      <td>
        <label class="admin-modal__checkbox">
          <input type="checkbox" data-action="toggle-forma-pago-habilitada" data-id="${f.id}" data-plan-id="${planId}" ${f.habilitada ? 'checked' : ''} />
          ${f.habilitada ? 'Habilitada' : 'Deshabilitada'}
        </label>
      </td>
    </tr>
  `).join('');

  return `
    <table class="admin-table admin-table--nested">
      <thead>
        <tr>
          <th>Forma de pago</th>
          <th>Tasa RPF (%)</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderCampoPrimaTecnicaMinima(plan) {
  if (!state.primaEnEdicion.has(plan.id)) {
    return `
      <div class="admin-valor-fijo">
        <span>${plan.prima_tecnica_minima != null ? escapeHtml(fmtGs(plan.prima_tecnica_minima)) : '—'}</span>
        <button class="btn-outline" data-action="editar-prima-tecnica-minima" data-id="${plan.id}">Editar</button>
      </div>
    `;
  }
  return `
    <form class="admin-inline-form" data-form-action="prima-tecnica-minima" data-id="${plan.id}">
      <input class="field-input field-input--sm" type="number" step="0.01" name="prima_tecnica_minima" value="${plan.prima_tecnica_minima ?? ''}" autofocus />
      <button class="btn-outline" type="submit">Guardar</button>
      <button class="btn-outline" type="button" data-action="cancelar-prima-tecnica-minima" data-id="${plan.id}">Cancelar</button>
    </form>
  `;
}

function renderCampoTasaRpf(formaPagoPlan, planId) {
  if (!state.tasaRpfEnEdicion.has(formaPagoPlan.id)) {
    return `
      <div class="admin-valor-fijo">
        <span>${escapeHtml(String(formaPagoPlan.tasa_rpf))}</span>
        <button class="btn-outline" data-action="editar-tasa-rpf" data-id="${formaPagoPlan.id}" data-plan-id="${planId}">Editar</button>
      </div>
    `;
  }
  return `
    <form class="admin-inline-form" data-form-action="tasa-rpf" data-id="${formaPagoPlan.id}" data-plan-id="${planId}">
      <input class="field-input field-input--sm" type="number" step="0.001" name="tasa_rpf" value="${formaPagoPlan.tasa_rpf}" autofocus />
      <button class="btn-outline" type="submit">Guardar</button>
      <button class="btn-outline" type="button" data-action="cancelar-tasa-rpf" data-id="${formaPagoPlan.id}">Cancelar</button>
    </form>
  `;
}

function renderTasas() {
  const puedeEditar = Boolean(auth.getUsuario()?.puede_editar_tasas);
  const opcionesRamo = state.ramos.map((r) => `
    <option value="${r.id}" ${String(state.ramoTasasSeleccionado) === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `).join('');

  return `
    ${!puedeEditar ? '<div class="admin-banner admin-banner--error">Tu usuario no tiene permiso para editar tasas — podés ver el historial, pero no cargar versiones nuevas.</div>' : ''}
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Tasas</span>
        <div class="card__title__actions">
          <select class="field-input" style="width: auto;" data-action="seleccionar-ramo-tasas">
            <option value="">Elegí un ramo…</option>
            ${opcionesRamo}
          </select>
          ${puedeEditar && state.ramoTasasSeleccionado ? '<button class="btn-primary btn-primary--sm" data-action="crear-tasa">+ Nueva versión de tasa</button>' : ''}
        </div>
      </div>
      <div class="card__body">
        ${renderTablaTasas()}
      </div>
    </div>
    ${ramoUsaRubrosActividad(state.ramoTasasSeleccionado) ? `
      <div class="panel card">
        <div class="card__title">Tasas por Tipo de Riesgo</div>
        <div class="card__body">
          ${renderTablaRubrosActividad()}
        </div>
      </div>
    ` : ''}
  `;
}

function renderTablaRubrosActividad() {
  const entry = state.rubrosActividad;
  if (entry.loading) {
    return '<div class="empty-state__subtitle">Cargando tipos de riesgo…</div>';
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`;
  }
  if (!entry.datos?.length) {
    return '<div class="empty-state__subtitle">Todavía no hay tipos de riesgo cargados.</div>';
  }

  const filas = entry.datos.map((r) => `
    <tr>
      <td>${escapeHtml(r.nombre)}</td>
      <td>${escapeHtml(r.categoria ?? '—')}</td>
      <td colspan="2">${renderCamposTasaEdificioContenido(r)}</td>
    </tr>
  `).join('');

  return `
    <table class="admin-table admin-table--nested">
      <thead>
        <tr>
          <th>Tipo de Riesgo</th>
          <th>Categoría</th>
          <th colspan="2">Tasa Edificio / Contenido (‰)</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderCamposTasaEdificioContenido(rubro) {
  const puedeEditar = Boolean(auth.getUsuario()?.puede_editar_tasas);
  if (!state.rubroActividadEnEdicion.has(rubro.id)) {
    return `
      <div class="admin-valor-fijo">
        <span>${rubro.tasa_edificio != null ? escapeHtml(String(rubro.tasa_edificio)) : '—'} / ${rubro.tasa_contenido != null ? escapeHtml(String(rubro.tasa_contenido)) : '—'}</span>
        ${puedeEditar ? `<button class="btn-outline" data-action="editar-tasa-edificio-contenido" data-id="${rubro.id}">Editar</button>` : ''}
      </div>
    `;
  }
  return `
    <form class="admin-inline-form" data-form-action="rubro-actividad-tasas" data-id="${rubro.id}">
      <input class="field-input field-input--sm" type="number" step="0.001" name="tasa_edificio" placeholder="Edificio" value="${rubro.tasa_edificio ?? ''}" autofocus />
      <input class="field-input field-input--sm" type="number" step="0.001" name="tasa_contenido" placeholder="Contenido" value="${rubro.tasa_contenido ?? ''}" />
      <button class="btn-outline" type="submit">Guardar</button>
      <button class="btn-outline" type="button" data-action="cancelar-tasa-edificio-contenido" data-id="${rubro.id}">Cancelar</button>
    </form>
  `;
}

function renderTablaTasas() {
  if (!state.ramoTasasSeleccionado) {
    return '<div class="empty-state__subtitle">Elegí un ramo para ver su historial de tasas.</div>';
  }

  const entry = state.tasasPorRamo[state.ramoTasasSeleccionado];
  if (!entry || entry.loading) {
    return '<div class="empty-state__subtitle">Cargando tasas…</div>';
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`;
  }
  if (!entry.historial.length) {
    return '<div class="empty-state__subtitle">Este ramo todavía no tiene tasas cargadas.</div>';
  }

  const puedeEditar = Boolean(auth.getUsuario()?.puede_editar_tasas);

  // El historial ya viene ordenado por vigente_desde descendente — la primera fila de
  // cada cobertura es la vigente, el resto queda como versión anterior.
  const vistaPorCobertura = new Set();
  const filas = entry.historial.map((t) => {
    const codigo = t.coberturas_catalogo?.codigo ?? String(t.cobertura_id);
    const esVigente = !vistaPorCobertura.has(codigo);
    vistaPorCobertura.add(codigo);
    return `
      <tr>
        <td>${escapeHtml(t.coberturas_catalogo?.nombre ?? '—')}</td>
        <td>${escapeHtml(String(t.tasa_valor))}</td>
        <td>${t.unidad === 'permil' ? '‰' : '%'}</td>
        <td>${escapeHtml(t.vigente_desde)}</td>
        <td>${crearBadge(esVigente ? 'Vigente' : 'Histórica', esVigente ? 'success' : 'neutral')}</td>
        <td>${puedeEditar ? `<button class="btn-outline" data-action="eliminar-tasa" data-id="${t.id}">Eliminar</button>` : ''}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Cobertura</th>
          <th>Tasa</th>
          <th>Unidad</th>
          <th>Vigente desde</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderCoberturas() {
  const opcionesRamo = state.ramos.map((r) => `
    <option value="${r.id}" ${String(state.ramoCoberturasSeleccionado) === String(r.id) ? 'selected' : ''}>${escapeHtml(r.nombre_display)}</option>
  `).join('');

  const planesEntry = state.ramoCoberturasSeleccionado ? state.planesPorRamoCob[state.ramoCoberturasSeleccionado] : null;
  const opcionesPlan = (planesEntry?.datos ?? []).map((p) => `
    <option value="${p.id}" ${String(state.planCoberturasSeleccionado) === String(p.id) ? 'selected' : ''}>${escapeHtml(p.nombre)}</option>
  `).join('');

  return `
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Coberturas por plan</span>
        <div class="card__title__actions">
          <select class="field-input" style="width: auto;" data-action="seleccionar-ramo-coberturas">
            <option value="">Elegí un ramo…</option>
            ${opcionesRamo}
          </select>
          ${state.ramoCoberturasSeleccionado ? `
            <select class="field-input" style="width: auto;" data-action="seleccionar-plan-coberturas">
              <option value="">Elegí un plan…</option>
              ${opcionesPlan}
            </select>
          ` : ''}
          ${state.planCoberturasSeleccionado ? '<button class="btn-primary btn-primary--sm" data-action="agregar-cobertura">+ Agregar cobertura</button>' : ''}
        </div>
      </div>
      <div class="card__body">
        ${renderTablaCoberturasPlan()}
      </div>
    </div>
  `;
}

function renderTablaCoberturasPlan() {
  if (!state.ramoCoberturasSeleccionado) {
    return '<div class="empty-state__subtitle">Elegí un ramo para ver sus planes.</div>';
  }
  const planesEntry = state.planesPorRamoCob[state.ramoCoberturasSeleccionado];
  if (!planesEntry || planesEntry.loading) {
    return '<div class="empty-state__subtitle">Cargando planes…</div>';
  }
  if (planesEntry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(planesEntry.error)}</div>`;
  }
  if (!state.planCoberturasSeleccionado) {
    return '<div class="empty-state__subtitle">Elegí un plan para ver sus coberturas.</div>';
  }

  const entry = state.coberturasDelPlan[state.planCoberturasSeleccionado];
  if (!entry || entry.loading) {
    return '<div class="empty-state__subtitle">Cargando coberturas…</div>';
  }
  if (entry.error) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(entry.error)}</div>`;
  }
  if (!entry.datos.length) {
    return '<div class="empty-state__subtitle">Este plan todavía no tiene coberturas cargadas.</div>';
  }

  const planId = state.planCoberturasSeleccionado;
  const filas = entry.datos.map((c) => `
    <tr>
      <td>${escapeHtml(c.coberturas_catalogo?.nombre ?? '—')}</td>
      <td>${escapeHtml(c.coberturas_catalogo?.categoria ?? '—')}</td>
      <td>
        <label class="admin-modal__checkbox">
          <input type="checkbox" data-action="toggle-cobertura-defecto" data-id="${c.id}" data-plan-id="${planId}" ${c.incluida_por_defecto ? 'checked' : ''} />
          ${c.incluida_por_defecto ? 'Por defecto' : 'Opcional'}
        </label>
      </td>
      <td colspan="2">${renderCamposMontoFranquicia(c, planId)}</td>
      <td>
        <button class="btn-outline" data-action="eliminar-cobertura-plan" data-id="${c.id}" data-plan-id="${planId}">Quitar</button>
      </td>
    </tr>
  `).join('');

  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Cobertura</th>
          <th>Categoría</th>
          <th>Por defecto</th>
          <th colspan="2">Monto / Franquicia</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderCamposMontoFranquicia(planCobertura, planId) {
  if (!state.coberturaEnEdicion.has(planCobertura.id)) {
    return `
      <div class="admin-valor-fijo">
        <span>${planCobertura.monto != null ? escapeHtml(fmtGs(planCobertura.monto)) : '—'} / ${planCobertura.franquicia != null ? escapeHtml(fmtGs(planCobertura.franquicia)) : '—'}</span>
        <button class="btn-outline" data-action="editar-cobertura-plan" data-id="${planCobertura.id}" data-plan-id="${planId}">Editar</button>
      </div>
    `;
  }
  return `
    <form class="admin-inline-form" data-form-action="monto-franquicia" data-id="${planCobertura.id}" data-plan-id="${planId}">
      <input class="field-input field-input--sm" type="number" step="0.01" name="monto" placeholder="Monto" value="${planCobertura.monto ?? ''}" autofocus />
      <input class="field-input field-input--sm" type="number" step="0.01" name="franquicia" placeholder="Franquicia" value="${planCobertura.franquicia ?? ''}" />
      <button class="btn-outline" type="submit">Guardar</button>
      <button class="btn-outline" type="button" data-action="cancelar-cobertura-plan" data-id="${planCobertura.id}">Cancelar</button>
    </form>
  `;
}

function renderModalCobertura() {
  const m = state.modalCobertura;
  const catalogo = state.catalogoPorRamo[state.ramoCoberturasSeleccionado] ?? [];
  const yaAgregadas = new Set((state.coberturasDelPlan[state.planCoberturasSeleccionado]?.datos ?? []).map((c) => c.cobertura_id));
  const opcionesCobertura = catalogo
    .filter((c) => !yaAgregadas.has(c.id))
    .map((c) => `
      <option value="${c.id}" ${String(m.cobertura_id) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>
    `).join('');

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-cobertura-backdrop">
      <div class="admin-modal" data-stop-propagation="true">
        <div class="admin-modal__title">Agregar cobertura al plan</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-cobertura-form">
          <div class="admin-modal__field">
            <label>Cobertura</label>
            <select class="field-input" name="cobertura_id">
              <option value="">Elegí una cobertura…</option>
              ${opcionesCobertura}
            </select>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="incluida_por_defecto" ${m.incluida_por_defecto ? 'checked' : ''} />
              Incluida por defecto
            </label>
          </div>
          <div class="admin-modal__field">
            <label>Monto (opcional)</label>
            <input class="field-input" type="number" step="0.01" name="monto" value="${escapeHtml(m.monto)}" />
          </div>
          <div class="admin-modal__field">
            <label>Franquicia (opcional)</label>
            <input class="field-input" type="number" step="0.01" name="franquicia" value="${escapeHtml(m.franquicia)}" />
          </div>
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal-cobertura">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderModal() {
  const m = state.modal;
  let titulo = '';
  let cuerpo = '';

  if (m.tipo === 'crear') {
    titulo = 'Nuevo usuario';
    cuerpo = `
      <div class="admin-modal__field">
        <label>Nombre</label>
        <input class="field-input" type="text" name="nombre" value="${escapeHtml(m.nombre)}" />
      </div>
      <div class="admin-modal__field">
        <label>Email</label>
        <input class="field-input" type="email" name="email" value="${escapeHtml(m.email)}" />
      </div>
      <div class="admin-modal__field">
        <label>Rol</label>
        <select class="field-input" name="rol_id">
          ${renderOpcionesRoles(m.rol_id)}
        </select>
      </div>
      <div class="admin-modal__field">
        <label>Contraseña (mín. 8 caracteres)</label>
        <input class="field-input" type="password" name="password" autocomplete="new-password" />
      </div>
    `;
  } else if (m.tipo === 'editar') {
    titulo = `Editar ${escapeHtml(m.usuario.nombre)}`;
    cuerpo = `
      <div class="admin-modal__field">
        <label>Nombre</label>
        <input class="field-input" type="text" name="nombre" value="${escapeHtml(m.nombre)}" />
      </div>
      <div class="admin-modal__field">
        <label>Email</label>
        <input class="field-input" type="email" name="email" value="${escapeHtml(m.email)}" />
      </div>
      <div class="admin-modal__field">
        <label>Rol</label>
        <select class="field-input" name="rol_id">
          ${renderOpcionesRoles(m.rol_id)}
        </select>
      </div>
      <div class="admin-modal__field">
        <label class="admin-modal__checkbox">
          <input type="checkbox" name="activo" ${m.activo ? 'checked' : ''} />
          Activo
        </label>
      </div>
      <div class="admin-modal__field">
        <label>Descuento máx. propio (%) — vacío = usa el tope del plan</label>
        <input class="field-input" type="number" step="0.01" min="0" max="100" name="descuento_maximo_pct" value="${m.descuento_maximo_pct ?? ''}" />
      </div>
      <div class="admin-modal__field">
        <label>Recargo máx. propio (%) — vacío = usa el tope del plan</label>
        <input class="field-input" type="number" step="0.01" min="0" max="100" name="recargo_maximo_pct" value="${m.recargo_maximo_pct ?? ''}" />
      </div>
    `;
  } else if (m.tipo === 'password') {
    titulo = `Resetear contraseña de ${escapeHtml(m.usuario.nombre)}`;
    cuerpo = `
      <div class="admin-modal__field">
        <label>Nueva contraseña (mín. 8 caracteres)</label>
        <input class="field-input" type="password" name="password" autocomplete="new-password" />
      </div>
    `;
  }

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-backdrop">
      <div class="admin-modal" data-stop-propagation="true">
        <div class="admin-modal__title">${titulo}</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-form">
          ${cuerpo}
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderOpcionesRoles(rolIdSeleccionado) {
  return state.roles.map((r) => `
    <option value="${r.id}" ${String(rolIdSeleccionado) === String(r.id) ? 'selected' : ''}>${capitalizar(escapeHtml(r.nombre))}</option>
  `).join('');
}

function renderModalRol() {
  const m = state.modalRol;
  const titulo = m.tipo === 'crear' ? 'Crear rol' : `Editar rol: ${escapeHtml(m.nombre)}`;

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-rol-backdrop">
      <div class="admin-modal" data-stop-propagation="true">
        <div class="admin-modal__title">${titulo}</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-rol-form">
          <div class="admin-modal__field">
            <label>Nombre del rol</label>
            <input class="field-input" type="text" name="nombre" maxlength="30" value="${escapeHtml(m.nombre)}" />
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_gestionar_usuarios" ${m.puede_gestionar_usuarios ? 'checked' : ''} />
              Puede gestionar usuarios
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_editar_coberturas" ${m.puede_editar_coberturas ? 'checked' : ''} />
              Puede editar coberturas por plan
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_editar_tasas" ${m.puede_editar_tasas ? 'checked' : ''} />
              Puede editar tasas
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_editar_planes" ${m.puede_editar_planes ? 'checked' : ''} />
              Puede editar planes
            </label>
          </div>
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal-rol">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderModalTasa() {
  const m = state.modalTasa;
  const catalogo = state.catalogoPorRamo[state.ramoTasasSeleccionado] ?? [];
  const opcionesCobertura = catalogo.map((c) => `
    <option value="${c.id}" ${String(m.cobertura_id) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>
  `).join('');

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-tasa-backdrop">
      <div class="admin-modal" data-stop-propagation="true">
        <div class="admin-modal__title">Nueva versión de tasa</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-tasa-form">
          <div class="admin-modal__field">
            <label>Cobertura</label>
            <select class="field-input" name="cobertura_id">
              <option value="">Elegí una cobertura…</option>
              ${opcionesCobertura}
            </select>
          </div>
          <div class="admin-modal__field">
            <label>Valor de la tasa</label>
            <input class="field-input" type="number" step="0.001" name="tasa_valor" value="${escapeHtml(m.tasa_valor)}" />
          </div>
          <div class="admin-modal__field">
            <label>Unidad</label>
            <select class="field-input" name="unidad">
              <option value="permil" ${m.unidad === 'permil' ? 'selected' : ''}>‰ (por mil)</option>
              <option value="porcentaje" ${m.unidad === 'porcentaje' ? 'selected' : ''}>% (porcentaje)</option>
            </select>
          </div>
          <div class="admin-modal__field">
            <label>Vigente desde</label>
            <input class="field-input" type="date" name="vigente_desde" value="${escapeHtml(m.vigente_desde)}" />
          </div>
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal-tasa">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

function bindEvents() {
  app.querySelectorAll('[data-action]').forEach((el) => {
    const evento = el.tagName === 'SELECT' || el.tagName === 'INPUT' ? 'change' : 'click';
    el.addEventListener(evento, onActionClick);
  });

  app.querySelectorAll('[data-form-action]').forEach((form) => {
    form.addEventListener('submit', onInlineFormSubmit);
  });

  const backdrop = app.querySelector('.admin-modal-backdrop');
  if (backdrop) {
    backdrop.querySelector('.admin-modal')?.addEventListener('click', (e) => e.stopPropagation());
  }

  const form = document.getElementById('admin-modal-form');
  if (form) {
    form.addEventListener('submit', onModalSubmit);
  }

  const backdropTasa = app.querySelector('.admin-modal-backdrop[data-action="cerrar-modal-tasa-backdrop"]');
  if (backdropTasa) {
    backdropTasa.querySelector('.admin-modal')?.addEventListener('click', (e) => e.stopPropagation());
  }

  const formTasa = document.getElementById('admin-modal-tasa-form');
  if (formTasa) {
    formTasa.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarModalTasa(e.target);
    });
  }

  const backdropCobertura = app.querySelector('.admin-modal-backdrop[data-action="cerrar-modal-cobertura-backdrop"]');
  if (backdropCobertura) {
    backdropCobertura.querySelector('.admin-modal')?.addEventListener('click', (e) => e.stopPropagation());
  }

  const formCobertura = document.getElementById('admin-modal-cobertura-form');
  if (formCobertura) {
    formCobertura.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarModalCobertura(e.target);
    });
  }

  const backdropRol = app.querySelector('.admin-modal-backdrop[data-action="cerrar-modal-rol-backdrop"]');
  if (backdropRol) {
    backdropRol.querySelector('.admin-modal')?.addEventListener('click', (e) => e.stopPropagation());
  }

  const formRol = document.getElementById('admin-modal-rol-form');
  if (formRol) {
    formRol.addEventListener('submit', (e) => {
      e.preventDefault();
      guardarModalRol(e.target);
    });
  }
}

function onActionClick(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;

  if (action === 'select-seccion') {
    state.seccion = el.dataset.seccion;
    state.banner = null;
    renderApp();
    if (state.seccion === 'usuarios') {
      if (!state.usuarios.length && !state.loadingUsuarios) cargarUsuarios();
      if (!state.roles.length && !state.loadingRoles) cargarRoles();
    }
    if (state.seccion === 'planes' && !state.planes.length && !state.loadingPlanes) {
      cargarPlanes();
    }
    if ((state.seccion === 'tasas' || state.seccion === 'coberturas') && !state.ramos.length) {
      api.get('/ramos').then((ramos) => {
        state.ramos = ramos;
        renderApp();
      });
    }
    return;
  }
  if (action === 'logout') {
    cerrarSesion();
    return;
  }
  if (action === 'crear-usuario') {
    abrirModalCrear();
    return;
  }
  if (action === 'editar-usuario') {
    abrirModalEditar(Number(el.dataset.id));
    return;
  }
  if (action === 'password-usuario') {
    abrirModalPassword(Number(el.dataset.id));
    return;
  }
  if (action === 'desactivar-usuario') {
    desactivarUsuario(Number(el.dataset.id));
    return;
  }
  if (action === 'eliminar-usuario') {
    eliminarUsuario(Number(el.dataset.id));
    return;
  }
  if (action === 'cerrar-modal' || action === 'cerrar-modal-backdrop') {
    cerrarModal();
    return;
  }
  if (action === 'crear-rol') {
    abrirModalRolCrear();
    return;
  }
  if (action === 'editar-rol') {
    abrirModalRolEditar(Number(el.dataset.id));
    return;
  }
  if (action === 'eliminar-rol') {
    eliminarRol(Number(el.dataset.id));
    return;
  }
  if (action === 'cerrar-modal-rol' || action === 'cerrar-modal-rol-backdrop') {
    cerrarModalRol();
    return;
  }
  if (action === 'filtrar-ramo') {
    state.ramoFiltro = el.value;
    renderApp();
    return;
  }
  if (action === 'toggle-plan-activo') {
    togglePlanActivo(el.dataset.id, el.checked);
    return;
  }
  if (action === 'toggle-formas-pago') {
    toggleFormasPago(Number(el.dataset.id));
    return;
  }
  if (action === 'toggle-forma-pago-habilitada') {
    toggleFormaPagoHabilitada(el.dataset.id, Number(el.dataset.planId), el.checked);
    return;
  }
  if (action === 'editar-prima-tecnica-minima') {
    habilitarEdicionPrima(Number(el.dataset.id));
    return;
  }
  if (action === 'cancelar-prima-tecnica-minima') {
    cancelarEdicionPrima(Number(el.dataset.id));
    return;
  }
  if (action === 'editar-tasa-rpf') {
    habilitarEdicionTasaRpf(Number(el.dataset.id));
    return;
  }
  if (action === 'cancelar-tasa-rpf') {
    cancelarEdicionTasaRpf(Number(el.dataset.id));
    return;
  }
  if (action === 'seleccionar-ramo-tasas') {
    seleccionarRamoTasas(el.value);
    return;
  }
  if (action === 'crear-tasa') {
    abrirModalTasa();
    return;
  }
  if (action === 'eliminar-tasa') {
    eliminarTasa(Number(el.dataset.id));
    return;
  }
  if (action === 'cerrar-modal-tasa' || action === 'cerrar-modal-tasa-backdrop') {
    cerrarModalTasa();
    return;
  }
  if (action === 'editar-tasa-edificio-contenido') {
    habilitarEdicionRubroActividad(Number(el.dataset.id));
    return;
  }
  if (action === 'cancelar-tasa-edificio-contenido') {
    cancelarEdicionRubroActividad(Number(el.dataset.id));
    return;
  }
  if (action === 'seleccionar-ramo-coberturas') {
    seleccionarRamoCoberturas(el.value);
    return;
  }
  if (action === 'seleccionar-plan-coberturas') {
    seleccionarPlanCoberturas(el.value);
    return;
  }
  if (action === 'toggle-cobertura-defecto') {
    toggleCoberturaDefecto(el.dataset.id, Number(el.dataset.planId), el.checked);
    return;
  }
  if (action === 'editar-cobertura-plan') {
    habilitarEdicionCobertura(Number(el.dataset.id));
    return;
  }
  if (action === 'cancelar-cobertura-plan') {
    cancelarEdicionCobertura(Number(el.dataset.id));
    return;
  }
  if (action === 'eliminar-cobertura-plan') {
    eliminarCoberturaDelPlan(el.dataset.id, Number(el.dataset.planId));
    return;
  }
  if (action === 'agregar-cobertura') {
    abrirModalCobertura();
    return;
  }
  if (action === 'cerrar-modal-cobertura' || action === 'cerrar-modal-cobertura-backdrop') {
    cerrarModalCobertura();
  }
}

function onInlineFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const accion = form.dataset.formAction;
  if (accion === 'prima-tecnica-minima') {
    guardarPrimaTecnicaMinima(form.dataset.id, form);
  } else if (accion === 'tasa-rpf') {
    guardarTasaRpf(form.dataset.id, Number(form.dataset.planId), form);
  } else if (accion === 'monto-franquicia') {
    guardarMontoFranquicia(form.dataset.id, Number(form.dataset.planId), form);
  } else if (accion === 'rubro-actividad-tasas') {
    guardarRubroActividadTasas(form.dataset.id, form);
  }
}

function onModalSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const tipo = state.modal.tipo;
  if (tipo === 'crear') guardarModalCrear(form);
  else if (tipo === 'editar') guardarModalEditar(form);
  else if (tipo === 'password') guardarModalPassword(form);
}

init();
