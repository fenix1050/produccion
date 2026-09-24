import { z } from 'zod'

const texto = (max) => z.string().trim().max(max).optional()

// The risk description lives inside the "Detalle de cobertura" card on page 1 of the Formal
// Proposal PDF, which cannot be split across pages. Measured on the four-page layout (the last
// fallback) with the worst real case (14 coverages, long address): 27 rendered rows and ~130
// characters per row. With these limits the worst admissible text takes ~22 rows, leaving a
// safety margin. frontend/propuestas/propuestas.js mirrors both values (a test keeps them equal).
export const DESCRIPCION_DETALLADA_MAX_CARACTERES = 1000
export const DESCRIPCION_DETALLADA_MAX_LINEAS = 15

const normalizarSaltos = (value) => String(value ?? '').replace(/\r\n?/g, '\n')

export function contarLineas(value) {
  const normalizado = normalizarSaltos(value).trim()
  return normalizado ? normalizado.split('\n').length : 0
}

export function descripcionDetalladaExcedeLimite(value) {
  const normalizado = normalizarSaltos(value).trim()
  return (
    normalizado.length > DESCRIPCION_DETALLADA_MAX_CARACTERES ||
    contarLineas(normalizado) > DESCRIPCION_DETALLADA_MAX_LINEAS
  )
}

const descripcionDetalladaSchema = z
  .string()
  .transform((value) => normalizarSaltos(value).trim())
  .refine((value) => value.length <= DESCRIPCION_DETALLADA_MAX_CARACTERES, {
    message: `La descripción detallada admite como máximo ${DESCRIPCION_DETALLADA_MAX_CARACTERES} caracteres.`,
  })
  .refine((value) => contarLineas(value) <= DESCRIPCION_DETALLADA_MAX_LINEAS, {
    message: `La descripción detallada admite como máximo ${DESCRIPCION_DETALLADA_MAX_LINEAS} líneas.`,
  })
  .optional()
const jsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const jsonValue = z.lazy(() => z.union([jsonScalar, z.array(jsonValue), z.record(jsonValue)]))

export const propuestaIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const listarCartasAptasQuerySchema = z.object({
  busqueda: z.string().trim().max(120).optional().default(''),
  limite: z.coerce.number().int().min(1).max(100).optional().default(50),
})

const aseguradoSchema = z
  .object({
    tipo_persona: z.enum(['fisica', 'juridica']).optional(),
    nombre_razon_social: texto(200),
    documento_tipo: z.enum(['ci', 'ruc']).optional(),
    documento: texto(50),
    ruc: texto(50),
    telefono: texto(30),
    email: z.union([z.literal(''), z.string().trim().email().max(120)]).optional(),
    direccion: texto(500),
    actividad_economica: texto(200),
  })
  .passthrough()

const personaSchema = aseguradoSchema
  .extend({
    fecha_nacimiento: z.string().date().optional(),
    sexo: z.enum(['Femenino', 'Masculino']).optional(),
    nacionalidad: texto(80),
    estado_civil: texto(60),
    ocupacion: texto(160),
    ciudad: texto(100),
    ingreso_mensual: z.number().nonnegative().nullable().optional(),
    lugar_trabajo: texto(200),
  })
  .passthrough()

export const draftPropuestaSchema = z
  .object({
    partes: z
      .object({
        asegurado: personaSchema.optional(),
        tomador_igual_asegurado: z.boolean().optional(),
        tomador: personaSchema.optional(),
        representante_legal: z
          .object({ nombre: texto(200), documento: texto(50), cargo: texto(120) })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    pla_ft: z
      .object({
        es_pep: z.boolean().nullable().optional(),
        pep_institucion: texto(150),
        pep_cargo: texto(100),
        sujeto_obligado: z.boolean().nullable().optional(),
        origen_fondos_descripcion: texto(500),
        proveedor_estado: z.boolean().nullable().optional(),
      })
      .passthrough()
      .optional(),
    descripcion_detallada: descripcionDetalladaSchema,
    observaciones: texto(2000),
    tipo_firma: z.enum(['manual', 'digital']).optional(),
  })
  .catchall(jsonValue)

export const actualizarBorradorSchema = z.object({
  revision: z.number().int().positive(),
  cotizacion_variante_id: z.number().int().positive().nullable(),
  cotizacion_plan_pago_id: z.number().int().positive().nullable(),
  draft_json: draftPropuestaSchema,
})

export const emitirPropuestaSchema = z.object({
  revision: z.number().int().positive(),
})

export const anularPropuestaSchema = z.object({
  motivo: z.string().trim().min(3).max(1000),
})

export const listarPropuestasQuerySchema = z.object({
  busqueda: z.string().trim().max(120).optional(),
  estado: z
    .enum([
      'activa',
      'borrador',
      'en_revision',
      'generando_pdf',
      'emitida',
      'error_pdf',
      'reemplazada',
      'anulada',
    ])
    .optional(),
  carta_oferta_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export const publicarTextoPropuestaSchema = z.object({
  clave: z.string().trim().min(1).max(80),
  contenido: z.string().trim().min(1).max(30000),
  motivo: z.string().trim().min(3).max(500),
})
