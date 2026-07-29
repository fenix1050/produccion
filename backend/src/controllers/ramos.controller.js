import { rubrosActividadQuerySchema } from '../schemas/ramos.schema.js'
import * as ramosService from '../services/ramos.service.js'
import { httpError } from '../utils/http-error.js'

export async function listarRamos(_req, res, next) {
  try {
    const ramos = await ramosService.listarRamosActivos()
    res.json(ramos)
  } catch (err) {
    next(err)
  }
}

export async function listarPlanesDeRamo(req, res, next) {
  try {
    const planes = await ramosService.listarPlanesDeRamo(req.params.id)
    res.json(planes)
  } catch (err) {
    next(err)
  }
}

export async function listarCoberturasDePlan(req, res, next) {
  try {
    const coberturas = await ramosService.listarCoberturasDePlan(req.params.id)
    res.json(coberturas)
  } catch (err) {
    next(err)
  }
}

// Cláusulas legales OBLIGATORIAS de ESE plan (clausulas_catalogo.plan_id, migración 038) —
// ej. las 5 cláusulas de "INCENDIO HIPOTECARIO". No confundir con el catálogo genérico de
// cláusulas del ramo, que se selecciona a mano por cotización (cotizacion_clausulas).
export async function listarClausulasObligatoriasDePlan(req, res, next) {
  try {
    const clausulas = await ramosService.listarClausulasObligatoriasDePlan(req.params.id)
    res.json(clausulas)
  } catch (err) {
    next(err)
  }
}

// Cambio "incendio-tasas-por-rubro": `ramo_id` es OBLIGATORIO — sin él, no
// numérico o <=0, 400 en vez de la lista completa (fallar cerrado es el punto
// del cambio, ver spec "Ramo-scoped risk-type catalog endpoint"). El parámetro
// legacy `grupo` deja de interpretarse.
export async function listarRubrosActividad(req, res, next) {
  try {
    const parseo = rubrosActividadQuerySchema.safeParse(req.query)
    if (!parseo.success) {
      throw httpError(400, parseo.error.issues.map((i) => i.message).join('; '))
    }
    const rubros = await ramosService.listarRubrosActividad(parseo.data.ramo_id)
    res.json(rubros)
  } catch (err) {
    next(err)
  }
}

// Catálogo completo de coberturas del ramo (coberturas_catalogo) — a diferencia de
// listarCoberturasDePlan (plan_coberturas), que solo trae lo pre-cargado por plan
// (hoy, en MRC, solo los sublímites por defecto). Lo usa el frontend para poblar el
// selector de "Coberturas adicionales" con TODAS las coberturas/sublímites disponibles.
export async function listarCoberturasCatalogoDeRamo(req, res, next) {
  try {
    const coberturas = await ramosService.listarCoberturasCatalogoDeRamo(req.params.id)
    res.json(coberturas)
  } catch (err) {
    next(err)
  }
}
