import * as coberturasRepository from '../../repositories/coberturas.repository.js'
import * as ramosRepository from '../../repositories/ramos.repository.js'
import * as tasasRepository from '../../repositories/tasas.repository.js'
import { httpError } from '../../utils/http-error.js'
import { CODIGO_FOREIGN_KEY_VIOLATION } from '../../utils/postgres-errors.js'

// --- Plan coberturas ---

async function canonicalizarFranquiciaMrc(planId, cobertura, franquicia) {
  const plan = await ramosRepository.findPlanById(planId)
  if (!plan) throw httpError(404, 'Plan no encontrado')
  if (!cobertura || cobertura.ramo_id !== plan.ramo_id) {
    throw httpError(422, 'La cobertura no pertenece al ramo del plan')
  }
  const ramo = await ramosRepository.findRamoById(plan.ramo_id)
  if (ramo.calculador !== 'mrc') return franquicia

  if (franquicia == null || franquicia === 0) return null
  if (Number.isFinite(franquicia) && franquicia > 0) return franquicia
  throw httpError(
    422,
    `La franquicia MRC de "${cobertura.nombre}" no puede ser negativa.`,
    'La franquicia MRC no puede ser negativa.'
  )
}

export async function listarCoberturasDePlan(planId) {
  return coberturasRepository.findPlanCoberturasByPlanId(planId)
}

export async function agregarCoberturaAPlan(planId, datos) {
  const cobertura = await coberturasRepository.findCoberturaCatalogoById(datos.cobertura_id)
  const franquicia = await canonicalizarFranquiciaMrc(planId, cobertura, datos.franquicia ?? null)
  return coberturasRepository.crearPlanCobertura(planId, { ...datos, franquicia })
}

export async function editarPlanCobertura(id, cambios) {
  if (Object.hasOwn(cambios, 'franquicia')) {
    const existente = await coberturasRepository.findPlanCoberturaById(id)
    if (!existente) throw httpError(404, 'Cobertura de plan no encontrada')
    cambios = {
      ...cambios,
      franquicia: await canonicalizarFranquiciaMrc(
        existente.plan_id,
        existente.coberturas_catalogo,
        cambios.franquicia
      ),
    }
  }
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

// --- R.P.F. por cuotas (migración 058, cambio `rpf-variable-mrc`) ---
// Curva GLOBAL compartida por los ramos con `usa_rpf_por_cuotas = true` — no hay filtro por
// plan/ramo acá, la invalidación de caché (invalidarCacheCatalogos) queda a cargo del
// controller, mismo patrón que crearTasa/eliminarTasa/editarRubroActividad.

export async function listarCurvaRpf() {
  return ramosRepository.findCurvaRpf()
}

export async function editarCurvaRpf(celdas) {
  return tasasRepository.upsertCurvaRpf(celdas)
}
