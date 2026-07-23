import { z } from 'zod';

export const ajusteSchema = z.object({
  descripcion: z.string(),
  catalogo_id: z.number().int().optional(),
  porcentaje: z.number().optional(),
  monto: z.number().optional(),
});
