import {
  actualizarBorradorSchema,
  listarCartasAptasQuerySchema,
  propuestaIdParamsSchema,
  emitirPropuestaSchema,
  anularPropuestaSchema,
  publicarTextoPropuestaSchema,
} from '../schemas/propuestas.schema.js'
import * as borradoresService from '../services/propuestas/borradores.service.js'
import * as elegibilidadService from '../services/propuestas/elegibilidad.service.js'
import * as emisionService from '../services/propuestas/emision.service.js'
import { httpError } from '../utils/http-error.js'

function parsear(schema, value) {
  const resultado = schema.safeParse(value)
  if (!resultado.success) {
    throw httpError(400, resultado.error.issues.map((issue) => issue.message).join('; '))
  }
  return resultado.data
}

export async function listarCartas(req, res, next) {
  try {
    const query = parsear(listarCartasAptasQuerySchema, req.query)
    res.json(await elegibilidadService.listarCartasAptas(query, req.usuario))
  } catch (error) {
    next(error)
  }
}

export async function obtenerCarta(req, res, next) {
  try {
    const { id } = parsear(propuestaIdParamsSchema, req.params)
    res.json(await elegibilidadService.obtenerCartaApta(id, req.usuario))
  } catch (error) {
    next(error)
  }
}

export async function crearBorrador(req, res, next) {
  try {
    const { id } = parsear(propuestaIdParamsSchema, req.params)
    const propuesta = await borradoresService.crearORecuperarBorrador(id, req.usuario)
    res.status(propuesta.creado ? 201 : 200).json(propuesta)
  } catch (error) {
    next(error)
  }
}

export async function obtenerBorrador(req, res, next) {
  try {
    const { id } = parsear(propuestaIdParamsSchema, req.params)
    res.json(await borradoresService.obtenerBorrador(id, req.usuario))
  } catch (error) {
    next(error)
  }
}

export async function actualizarBorrador(req, res, next) {
  try {
    const { id } = parsear(propuestaIdParamsSchema, req.params)
    const input = parsear(actualizarBorradorSchema, req.body)
    res.json(await borradoresService.actualizarBorrador(id, input, req.usuario))
  } catch (error) {
    next(error)
  }
}

export async function emitir(req, res, next) {
  try {
    const { id } = parsear(propuestaIdParamsSchema, req.params)
    const input = parsear(emitirPropuestaSchema, req.body)
    res.status(201).json(await emisionService.emitirPropuesta(id, input, req.usuario))
  } catch (error) {
    next(error)
  }
}

export async function pdf(req, res, next) {
  try {
    const { id } = parsear(propuestaIdParamsSchema, req.params)
    const { pdf, propuesta } = await emisionService.descargarPropuesta(id, req.usuario)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="propuesta-${propuesta.numero_propuesta}.pdf"`
    )
    res.send(pdf)
  } catch (error) {
    next(error)
  }
}

export async function anular(req, res, next) {
  try {
    const { id } = parsear(propuestaIdParamsSchema, req.params)
    const input = parsear(anularPropuestaSchema, req.body)
    res.json(await emisionService.anularPropuesta(id, input, req.usuario))
  } catch (error) {
    next(error)
  }
}

export async function listarTextos(req, res, next) {
  try {
    res.json(await emisionService.listarTextos(req.usuario))
  } catch (error) {
    next(error)
  }
}

export async function publicarTexto(req, res, next) {
  try {
    const input = parsear(publicarTextoPropuestaSchema, req.body)
    res.status(201).json(await emisionService.publicarTexto(input, req.usuario))
  } catch (error) {
    next(error)
  }
}
