import { z } from 'zod'

const texto = (max) => z.string().trim().max(max).optional()
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
    documento: texto(50),
    telefono: texto(30),
    email: z.union([z.literal(''), z.string().trim().email().max(120)]).optional(),
    direccion: texto(500),
    actividad_economica: texto(200),
  })
  .passthrough()

const personaSchema = aseguradoSchema
  .extend({
    fecha_nacimiento: z.string().date().optional(),
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
    descripcion_detallada: texto(2000),
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

export const publicarTextoPropuestaSchema = z.object({
  clave: z.string().trim().min(1).max(80),
  contenido: z.string().trim().min(1).max(30000),
  motivo: z.string().trim().min(3).max(500),
})
