import { z } from 'zod'

import { ajusteSchema } from './shared/ajuste.schema.js'

// Datos específicos del riesgo para Incendio — tres formas según el plan (ver
// incendio.calculator.js): "Edificio y Contenido" (rubro + 2 capitales, tasa por rubro),
// "Maquinaria Básico" (un solo capital, tasa fija), o "objeto_riesgo" (Hipotecario, con/sin
// Inspección — 4 capitales opcionales, uno por objeto de riesgo, tasa por objeto). El schema
// acepta los tres shapes sin cruzarlos entre sí — el calculador ya valida de más (capital
// insuficiente, rubro/tipo de riesgo inexistente, etc.) y corta con 422 explicativo, no hace
// falta duplicar esa lógica de negocio acá.
export const riesgoIncendioSchema = z.object({
  rubro_actividad: z.string().optional(),
  capital_edificio: z.number().nonnegative().optional(),
  capital_contenido: z.number().nonnegative().optional(),
  // Sublímites informativos (a primer riesgo absoluto, % de la suma ya declarada) — no afectan
  // la prima, ver comentario en incendio.calculator.js.
  sublimite_fenomenos_naturales_porcentaje: z.number().min(0).max(100).optional(),
  capital_maquinaria: z.number().nonnegative().optional(),
  sublimite_vandalismo_porcentaje: z.number().min(0).max(100).optional(),
  // Mecánica "objeto_riesgo" (migración 035/036) — los 4 objetos son opcionales; el calculador
  // exige al menos uno declarado con capital > 0 (422 si ninguno).
  capital_instalaciones: z.number().nonnegative().optional(),
  capital_contenido_mueble_equipos: z.number().nonnegative().optional(),
  capital_contenido_mercaderia: z.number().nonnegative().optional(),
})

// Body de POST /api/cotizaciones/calcular y POST /api/cotizaciones para ramo = 'incendio'.
export const cotizarIncendioSchema = z.object({
  plan_id: z.number().int(),
  capital_asegurado: z.number().nonnegative().default(0),
  riesgo_datos: riesgoIncendioSchema,
  descuentos: z.array(ajusteSchema).default([]),
  recargos: z.array(ajusteSchema).default([]),
  cliente_nombre: z.string().optional(),
  cliente_contacto: z.string().optional(),
  cuotas: z.number().int().positive().optional(),
  // Moneda de la cotización (migración 034) — default 'PYG' para no romper flujos legacy que
  // todavía no envían este campo.
  moneda: z.enum(['PYG', 'USD']).default('PYG'),
})
