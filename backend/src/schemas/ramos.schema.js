import { z } from 'zod'

import { ID_MAXIMO } from './cotizaciones.schema.js'

// Cambio "incendio-tasas-por-rubro": el catálogo de rubros de actividad
// (GET /ramos/rubros-actividad y GET /admin/rubros-actividad) pasa a exigir
// `ramo_id`, resuelto vía la relación muchos-a-muchos `rubro_actividad_ramo` en
// vez del escalar legacy `rubros_actividad.grupo`. Fallar cerrado (400 sin el
// parámetro) es el punto del cambio: un default permisivo reintroduce el bug
// original de mezclar rubros entre ramos.
export const rubrosActividadQuerySchema = z.object({
  ramo_id: z.coerce.number().int().positive().max(ID_MAXIMO, 'ramo_id es demasiado grande'),
})

// `:id` no numérico o fuera de rango llegaba crudo a Supabase (`22P02`/`22003`) y terminaba en 500
// (QA adversarial 2026-10-13). Se valida antes de llamar al service.
const idDeRuta = (sujeto) =>
  z.object({
    id: z.coerce
      .number({ invalid_type_error: `El id del ${sujeto} debe ser un número` })
      .int(`El id del ${sujeto} debe ser un número entero`)
      .positive(`El id del ${sujeto} debe ser positivo`)
      .max(ID_MAXIMO, `El id del ${sujeto} es demasiado grande`),
  })

export const ramoIdParamsSchema = idDeRuta('ramo')
export const planIdParamsSchema = idDeRuta('plan')
