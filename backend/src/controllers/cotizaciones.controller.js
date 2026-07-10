import * as cotizacionService from '../services/cotizacion.service.js';

export async function calcular(req, res, next) {
  try {
    const resultado = await cotizacionService.calcularPreview(req.body);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function crear(req, res, next) {
  try {
    const cotizacion = await cotizacionService.crearCotizacion(req.body);
    res.status(201).json(cotizacion);
  } catch (err) {
    next(err);
  }
}

export async function listar(req, res, next) {
  try {
    const resultado = await cotizacionService.listarCotizaciones(req.query);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function obtener(req, res, next) {
  try {
    const cotizacion = await cotizacionService.obtenerCotizacion(req.params.id);
    res.json(cotizacion);
  } catch (err) {
    next(err);
  }
}

export async function pdfOferta(req, res, next) {
  try {
    const pdfBuffer = await cotizacionService.generarPdfOferta(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

// ---- Fase 4 ----

export async function aceptar(req, res, next) {
  try {
    const cotizacion = await cotizacionService.aceptarCotizacion(req.params.id, req.body);
    res.json(cotizacion);
  } catch (err) {
    next(err);
  }
}

export async function pdfPropuesta(req, res, next) {
  try {
    const pdfBuffer = await cotizacionService.generarPdfPropuestaFormal(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}
