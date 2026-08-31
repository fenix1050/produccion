import {
  cotizacionIdParamsSchema,
  listarCotizacionesQuerySchema,
} from '../schemas/cotizaciones.schema.js'
import * as cotizacionService from '../services/cotizacion.service.js'
import { httpError } from '../utils/http-error.js'

export async function calcular(req, res, next) {
  try {
    const resultado = await cotizacionService.calcularPreview(req.body, req.usuario)
    res.json(resultado)
  } catch (err) {
    next(err)
  }
}

export async function crear(req, res, next) {
  try {
    const cotizacion = await cotizacionService.crearCotizacion(req.body, req.usuario)
    res.status(201).json(cotizacion)
  } catch (err) {
    next(err)
  }
}

export async function listar(req, res, next) {
  try {
    const parseo = listarCotizacionesQuerySchema.safeParse(req.query)
    if (!parseo.success) {
      throw httpError(400, parseo.error.issues.map((i) => i.message).join('; '))
    }
    const resultado = await cotizacionService.listarCotizaciones(parseo.data, req.usuario)
    res.json(resultado)
  } catch (err) {
    next(err)
  }
}

export async function obtener(req, res, next) {
  try {
    const cotizacion = await cotizacionService.obtenerCotizacion(req.params.id, req.usuario)
    res.json(cotizacion)
  } catch (err) {
    next(err)
  }
}

export async function actualizar(req, res, next) {
  try {
    const cotizacion = await cotizacionService.actualizarCotizacion(
      req.params.id,
      req.body,
      req.usuario
    )
    res.json(cotizacion)
  } catch (err) {
    next(err)
  }
}

export async function pdfOferta(req, res, next) {
  try {
    const parseo = cotizacionIdParamsSchema.safeParse(req.params)
    if (!parseo.success) {
      throw httpError(400, parseo.error.issues.map((issue) => issue.message).join('; '))
    }
    const pdfBuffer = await cotizacionService.generarPdfOferta(parseo.data.id, req.usuario)
    res.setHeader('Content-Type', 'application/pdf')
    res.send(pdfBuffer)
  } catch (err) {
    next(err)
  }
}

// ---- Fase 4 ----

export async function aceptar(req, res, next) {
  try {
    const cotizacion = await cotizacionService.aceptarCotizacion(req.params.id, req.body)
    res.json(cotizacion)
  } catch (err) {
    next(err)
  }
}

export async function pdfPropuesta(req, res, next) {
  try {
    const pdfBuffer = await cotizacionService.generarPdfPropuestaFormal(req.params.id)
    res.setHeader('Content-Type', 'application/pdf')
    res.send(pdfBuffer)
  } catch (err) {
    next(err)
  }
}
