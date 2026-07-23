import { z } from 'zod';
import { ajusteSchema } from './shared/ajuste.schema.js';

// Datos específicos del riesgo para Auto — van dentro de `cotizaciones.riesgo_datos` (JSONB).
export const riesgoAutoSchema = z.object({
  marca: z.string().min(1),
  modelo: z.string().min(1),
  anio_fabricacion: z.number().int().gte(1980).lte(new Date().getFullYear() + 1),
  destino: z.enum(['PARTICULAR', 'COMERCIAL', 'PARTICULAR Y COMERCIAL', 'TRANSPORTE']),
  via_importacion: z.enum(['REPRESENTANTE', 'IMPORTACION DIRECTA']),
  asientos: z.number().int().positive().default(5),
  area_circulacion: z.string().optional(), // informativo, no afecta tasa (ver PLAN_DESARROLLO.md sección 4)
});

// Body de POST /api/cotizaciones/calcular y POST /api/cotizaciones
export const cotizarAutoSchema = z.object({
  plan_id: z.number().int(),
  capital_asegurado: z.number().positive(),
  riesgo_datos: riesgoAutoSchema,
  descuentos: z.array(ajusteSchema).default([]),
  recargos: z.array(ajusteSchema).default([]),
  cliente_nombre: z.string().optional(),
  cliente_contacto: z.string().optional(),
});
