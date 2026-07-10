import { z } from 'zod';

// Una fila de la pestaña de tasas de Auto: [capital_min, capital_max, tasa_porcentaje].
// El Excel no trae encabezados — se parsea por posición (ver services/tasas.service.js).
export const filaTasaCapitalSchema = z
  .object({
    capital_min: z.number(),
    capital_max: z.number(),
    tasa_porcentaje: z.number(),
  })
  .refine((fila) => fila.capital_min <= fila.capital_max, {
    message: 'capital_min no puede ser mayor a capital_max',
  });
