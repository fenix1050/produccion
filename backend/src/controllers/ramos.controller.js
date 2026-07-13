import * as ramosService from '../services/ramos.service.js';

export async function listarRamos(_req, res, next) {
  try {
    const ramos = await ramosService.listarRamosActivos();
    res.json(ramos);
  } catch (err) {
    next(err);
  }
}

export async function listarPlanesDeRamo(req, res, next) {
  try {
    const planes = await ramosService.listarPlanesDeRamo(req.params.id);
    res.json(planes);
  } catch (err) {
    next(err);
  }
}

export async function listarCoberturasDePlan(req, res, next) {
  try {
    const coberturas = await ramosService.listarCoberturasDePlan(req.params.id);
    res.json(coberturas);
  } catch (err) {
    next(err);
  }
}

export async function listarRubrosActividad(req, res, next) {
  try {
    const rubros = await ramosService.listarRubrosActividad(req.query.grupo);
    res.json(rubros);
  } catch (err) {
    next(err);
  }
}

// Catálogo completo de coberturas del ramo (coberturas_catalogo) — a diferencia de
// listarCoberturasDePlan (plan_coberturas), que solo trae lo pre-cargado por plan
// (hoy, en MRC, solo los sublímites por defecto). Lo usa el frontend para poblar el
// selector de "Coberturas adicionales" con TODAS las coberturas/sublímites disponibles.
export async function listarCoberturasCatalogoDeRamo(req, res, next) {
  try {
    const coberturas = await ramosService.listarCoberturasCatalogoDeRamo(req.params.id);
    res.json(coberturas);
  } catch (err) {
    next(err);
  }
}
