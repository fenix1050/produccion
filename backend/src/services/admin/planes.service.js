import * as coberturasRepository from '../../repositories/coberturas.repository.js';
import * as tasasRepository from '../../repositories/tasas.repository.js';
import * as ramosRepository from '../../repositories/ramos.repository.js';
import { httpError } from '../../utils/http-error.js';

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
    throw httpError(404, 'Cobertura de plan no encontrada');
  }
  return fila;
}

export async function eliminarCoberturaDePlan(id) {
  await coberturasRepository.eliminarPlanCobertura(id);
}

// --- Planes ---

export async function listarPlanes(ramoId) {
  return tasasRepository.findAllPlanes(ramoId);
}

export async function editarPlan(id, cambios) {
  const plan = await tasasRepository.actualizarPlan(id, cambios);
  if (!plan) {
    throw httpError(404, 'Plan no encontrado');
  }
  return plan;
}

export async function listarFormasPagoDePlan(planId) {
  return ramosRepository.findFormasPagoDelPlanTodas(planId);
}

export async function editarPlanFormaPago(id, cambios) {
  const fila = await tasasRepository.actualizarPlanFormaPago(id, cambios);
  if (!fila) {
    throw httpError(404, 'Forma de pago de plan no encontrada');
  }
  return fila;
}
