import { z } from 'zod'

// Cambio "incendio-tasas-por-rubro": el catálogo de rubros de actividad
// (GET /ramos/rubros-actividad y GET /admin/rubros-actividad) pasa a exigir
// `ramo_id`, resuelto vía la relación muchos-a-muchos `rubro_actividad_ramo` en
// vez del escalar legacy `rubros_actividad.grupo`. Fallar cerrado (400 sin el
// parámetro) es el punto del cambio: un default permisivo reintroduce el bug
// original de mezclar rubros entre ramos.
export const rubrosActividadQuerySchema = z.object({
  ramo_id: z.coerce.number().int().positive(),
})
