import * as coberturasRepository from '../../repositories/coberturas.repository.js'
import * as ramosRepository from '../../repositories/ramos.repository.js'
import * as tasasRepository from '../../repositories/tasas.repository.js'
import { httpError } from '../../utils/http-error.js'

const CODIGO_FOREIGN_KEY_VIOLATION = '23503' // Postgres: foreign_key_violation

// --- Plan coberturas ---

export async function listarCoberturasDePlan(planId) {
  return coberturasRepository.findPlanCoberturasByPlanId(planId)
}

export async function agregarCoberturaAPlan(planId, datos) {
  return coberturasRepository.crearPlanCobertura(planId, datos)
}

export async function editarPlanCobertura(id, cambios) {
  const fila = await coberturasRepository.actualizarPlanCobertura(id, cambios)
  if (!fila) {
    throw httpError(404, 'Cobertura de plan no encontrada')
  }
  return fila
}

export async function eliminarCoberturaDePlan(id) {
  await coberturasRepository.eliminarPlanCobertura(id)
}

// --- Planes ---

export async function listarPlanes(ramoId) {
  return tasasRepository.findAllPlanes(ramoId)
}

export async function editarPlan(id, cambios) {
  const plan = await tasasRepository.actualizarPlan(id, cambios)
  if (!plan) {
    throw httpError(404, 'Plan no encontrado')
  }
  return plan
}

// Un plan con cotizaciones asociadas no se puede borrar — Postgres lo rechaza por la FK
// cotizaciones.plan_id y acá lo traducimos a un 409 explicativo. Para ese caso el flujo
// correcto es desactivarlo (checkbox "Activo"), no eliminarlo.
export async function eliminarPlan(id) {
  const plan = await tasasRepository.findPlanById(id)
  if (!plan) {
    throw httpError(404, 'Plan no encontrado')
  }
  try {
    await tasasRepository.eliminarPlan(id)
  } catch (err) {
    if (err.code === CODIGO_FOREIGN_KEY_VIOLATION) {
      throw httpError(
        409,
        'Este plan tiene cotizaciones asociadas. Desactivalo en vez de eliminarlo.',
        'Este plan tiene cotizaciones asociadas. Desactivalo en vez de eliminarlo.'
      )
    }
    throw err
  }
}

export async function listarFormasPagoDePlan(planId) {
  return ramosRepository.findFormasPagoDelPlanTodas(planId)
}

export async function editarPlanFormaPago(id, cambios) {
  const fila = await tasasRepository.actualizarPlanFormaPago(id, cambios)
  if (!fila) {
    throw httpError(404, 'Forma de pago de plan no encontrada')
  }
  return fila
}
