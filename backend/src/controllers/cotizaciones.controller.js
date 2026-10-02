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

// `:id` no numérico llegaba crudo a Supabase (`22P02` -> 500): se valida antes de llamar al service.
function parsearIdCotizacion(params) {
  const parseo = cotizacionIdParamsSchema.safeParse(params)
  if (!parseo.success) {
    throw httpError(400, parseo.error.issues.map((issue) => issue.message).join('; '))
  }
  return parseo.data.id
}

export async function obtener(req, res, next) {
  try {
    const id = parsearIdCotizacion(req.params)
    const cotizacion = await cotizacionService.obtenerCotizacion(id, req.usuario)
    res.json(cotizacion)
  } catch (err) {
    next(err)
  }
}

export async function actualizar(req, res, next) {
  try {
    const id = parsearIdCotizacion(req.params)
    const cotizacion = await cotizacionService.actualizarCotizacion(id, req.body, req.usuario)
    res.json(cotizacion)
  } catch (err) {
    next(err)
  }
}

export async function pdfOferta(req, res, next) {
  try {
    const id = parsearIdCotizacion(req.params)
    const pdfBuffer = await cotizacionService.generarPdfOferta(id, req.usuario)
    res.setHeader('Content-Type', 'application/pdf')
    res.send(pdfBuffer)
  } catch (err) {
    next(err)
  }
}
