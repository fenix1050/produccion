import { z } from 'zod'

export const ajusteSchema = z
  .object({
    descripcion: z.string(),
    catalogo_id: z.number().int().optional(),
    porcentaje: z.number().nonnegative().optional(),
    monto: z.number().nonnegative().optional(),
  })
  .superRefine((ajuste, context) => {
    if ((ajuste.monto == null) === (ajuste.porcentaje == null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debe indicar exactamente uno de monto o porcentaje',
      })
    }
  })
