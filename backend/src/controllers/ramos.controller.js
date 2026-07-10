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
