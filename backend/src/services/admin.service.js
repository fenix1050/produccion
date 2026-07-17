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
// IMPORTANTE: `coberturasRepository.findTasasCoberturaRamo` (usado por los calculadores en
// tiempo de cotización, ver mrc.calculator.js/incendio.calculator.js) NO filtra por
// vigente_desde — trae TODAS las versiones de todas las coberturas del ramo sin importar la
// fecha, y el calculador arma un Map indexado por código de cobertura quedándose con lo último
// que aparezca en el array (orden de la respuesta de Supabase, no necesariamente la versión
// vigente por fecha). Esto es un bug preexistente: en cuanto se inserte una segunda versión de
// una tasa (este WU3 lo habilita desde el admin), el resultado de cotización puede volverse no
// determinístico según el orden de retorno de la query. Reportado, NO corregido acá (fuera de
// alcance de WU3 — lógica de cálculo de cotización en producción).

export async function listarTasasDeRamo(ramoId) {
  return coberturasRepository.findTasasCoberturaRamoConHistorial(ramoId);
}

export async function crearVersionDeTasa(ramoId, datos) {
  return coberturasRepository.crearTasaCoberturaRamo(ramoId, datos);
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
