import { z } from 'zod'

import { LIMITE_DESCRIPCION_AJUSTE, textoMax } from './limites-texto.js'

export const ajusteSchema = z
  .object({
    descripcion: textoMax(LIMITE_DESCRIPCION_AJUSTE, 'La descripción del ajuste'),
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
