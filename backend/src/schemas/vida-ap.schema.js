import { z } from 'zod';
import { ajusteSchema } from './shared/ajuste.schema.js';

// Datos específicos del riesgo para Vida y Accidentes Personales — ver vida-ap.calculator.js.
// Solo 3 de 7 planes tienen calculador implementado hoy; los otros 4 cortan con 422 desde el
// calculador (tarifican por saldo mensual, sin fórmula confirmada) — el schema no distingue
// planes, esa regla vive en el calculador.
export const riesgoVidaApSchema = z.object({
  capital_asegurado: z.number().nonnegative().default(0),
  edad: z.number().int().nonnegative().nullable().optional(),
  // Renta Diaria (Accidentes Personales): recargo opcional sobre la tasa básica.
  incluye_renta_diaria: z.boolean().optional(),
  suma_renta_diaria: z.number().nonnegative().optional(),
});

// Body de POST /api/cotizaciones/calcular y POST /api/cotizaciones para ramo = 'vida-ap'.
export const cotizarVidaApSchema = z.object({
  plan_id: z.number().int(),
  capital_asegurado: z.number().nonnegative().default(0),
  riesgo_datos: riesgoVidaApSchema,
  descuentos: z.array(ajusteSchema).default([]),
  recargos: z.array(ajusteSchema).default([]),
  cliente_nombre: z.string().optional(),
  cliente_contacto: z.string().optional(),
  cuotas: z.number().int().positive().optional(),
});
