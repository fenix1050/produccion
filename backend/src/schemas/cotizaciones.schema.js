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

export const cotizacionIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
})
