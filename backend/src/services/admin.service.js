import bcrypt from 'bcryptjs';
import * as usuariosRepository from '../repositories/usuarios.repository.js';
import * as coberturasRepository from '../repositories/coberturas.repository.js';
import * as tasasRepository from '../repositories/tasas.repository.js';
import * as ramosRepository from '../repositories/ramos.repository.js';

const BCRYPT_ROUNDS = 12;

// --- Usuarios ---

export async function listarUsuarios() {
  return usuariosRepository.findAll();
}

export async function crearUsuario({ nombre, email, rol, puede_editar_tasas, password }) {
  const existente = await usuariosRepository.findByEmail(email);
  if (existente) {
    const err = new Error('Ya existe un usuario con ese email');
    err.status = 409;
    throw err;
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return usuariosRepository.crear({ nombre, email, rol, puede_editar_tasas, password_hash });
}

export async function editarUsuario(id, cambios) {
  const usuario = await usuariosRepository.actualizar(id, cambios);
  if (!usuario) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }
  return usuario;
}

export async function resetearPassword(id, password) {
  const usuario = await usuariosRepository.findById(id);
  if (!usuario) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }
  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await usuariosRepository.actualizarPassword(id, password_hash);
}

// --- Plan coberturas ---

export async function listarCoberturasDePlan(planId) {
  return coberturasRepository.findPlanCoberturasByPlanId(planId);
}

export async function agregarCoberturaAPlan(planId, datos) {
  return coberturasRepository.crearPlanCobertura(planId, datos);
}

export async function editarPlanCobertura(id, cambios) {
  const fila = await coberturasRepository.actualizarPlanCobertura(id, cambios);
  if (!fila) {
    const err = new Error('Cobertura de plan no encontrada');
    err.status = 404;
    throw err;
  }
  return fila;
}

export async function eliminarCoberturaDePlan(id) {
  await coberturasRepository.eliminarPlanCobertura(id);
}

// --- Tasas ---
// `coberturasRepository.findTasasCoberturaRamo` (usado por los calculadores en tiempo de
// cotización, ver mrc.calculator.js/incendio.calculator.js) SÍ filtra por vigente_desde <= hoy
// y se queda con la versión más reciente por cobertura (dedup vía Map, ver el propio repository)
// — verificado 2026-07-17 al confirmar que las ediciones de tasas del panel admin (WU3/WU5) se
// reflejan en vivo en el cotizador para cualquier rol, sin caché ni reinicio de por medio.

export async function listarTasasDeRamo(ramoId) {
  return coberturasRepository.findTasasCoberturaRamoConHistorial(ramoId);
}

export async function crearVersionDeTasa(ramoId, datos) {
  return coberturasRepository.crearTasaCoberturaRamo(ramoId, datos);
}

// rubros_actividad no tiene vigente_desde/versionado (a diferencia de
// tasas_cobertura_ramo) — se edita con UPDATE directo, mismo patrón que editarPlan.
export async function listarRubrosActividad(grupo) {
  return coberturasRepository.findRubrosActividad(grupo);
}

export async function editarRubroActividad(id, cambios) {
  const fila = await coberturasRepository.actualizarRubroActividad(id, cambios);
  if (!fila) {
    const err = new Error('Tipo de riesgo no encontrado');
    err.status = 404;
    throw err;
  }
  return fila;
}

// --- Planes ---

export async function listarPlanes(ramoId) {
  return tasasRepository.findAllPlanes(ramoId);
}

export async function editarPlan(id, cambios) {
  const plan = await tasasRepository.actualizarPlan(id, cambios);
  if (!plan) {
    const err = new Error('Plan no encontrado');
    err.status = 404;
    throw err;
  }
  return plan;
}

export async function listarFormasPagoDePlan(planId) {
  return ramosRepository.findFormasPagoDelPlanTodas(planId);
}

export async function editarPlanFormaPago(id, cambios) {
  const fila = await tasasRepository.actualizarPlanFormaPago(id, cambios);
  if (!fila) {
    const err = new Error('Forma de pago de plan no encontrada');
    err.status = 404;
    throw err;
  }
  return fila;
}
