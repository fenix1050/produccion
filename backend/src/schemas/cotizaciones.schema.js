import { z } from 'zod'

// GET /cotizaciones (historial) — antes de este schema, `limit` llegaba a
// findCotizaciones()/.range() sin ningún tope: un cliente podía pedir un límite
// arbitrariamente grande y forzar un scan/transferencia enorme contra Supabase.
export const listarCotizacionesQuerySchema = z.object({
  ramo_id: z.coerce.number().int().positive().optional(),
  estado: z.string().optional(),
  cliente: z.string().optional(),
  fecha_desde: z.string().optional(),
  fecha_hasta: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

// Tope = máximo de un integer de Postgres: un id mayor nunca existe y llegaría a la DB como
// `22003` (out of range) -> 500. Se rechaza acá con 400.
export const ID_MAXIMO = 2147483647

// Se valida ANTES de buscar el plan en la DB: un plan_id ausente, null, negativo, decimal o
// gigante llegaba a Supabase como `22P02`/`22003`/`PGRST116` y terminaba en 500.
export const planIdBodySchema = z.object({
  plan_id: z
    .number({
      required_error: 'plan_id es obligatorio',
      invalid_type_error: 'plan_id debe ser un número',
    })
    .int('plan_id debe ser un número entero')
    .positive('plan_id debe ser positivo')
    .max(ID_MAXIMO, 'plan_id es demasiado grande'),
})

export const cotizacionIdParamsSchema = z.object({
  id: z.coerce
    .number({ invalid_type_error: 'El id de la cotización debe ser un número' })
    .int('El id de la cotización debe ser un número entero')
    .positive('El id de la cotización debe ser positivo')
    .max(ID_MAXIMO, 'El id de la cotización es demasiado grande'),
})
