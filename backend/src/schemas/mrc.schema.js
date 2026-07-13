import { z } from 'zod';

// Datos específicos del riesgo para MRC (Multirriesgo Comercio) — van dentro de
// `cotizaciones.riesgo_datos` (JSONB). Cédula/dirección viven acá porque `cotizaciones`
// no tiene columnas propias para datos de contacto del cliente (solo cliente_nombre/contacto).
export const riesgoMrcSchema = z
  .object({
    cedula: z.string().min(1),
    direccion: z.string().min(1),
    rubro_actividad: z.string().min(1),
    ciudad: z.string().min(1),
    capital_edificio: z.number().nonnegative().default(0),
    capital_contenido: z.number().nonnegative().default(0),
    coberturas_adicionales: z
      .array(
        z.object({
          codigo: z.string().min(1),
          suma_asegurada: z.number().positive(),
        })
      )
      .default([]),
    // Franquicia/deducible que el agente elige por cobertura en "Detalle del plan" — puramente
    // informativo para la propuesta, no afecta el cálculo de la prima (ver FRANQUICIA_OPCIONES en
    // cotizar.js). Mapa codigo -> monto (null = "sin deducible"). Igual que en el frontend, está
    // indexado por código de cobertura, no por línea — si el agente repite un código con distinta
    // suma asegurada, comparten la misma franquicia elegida.
    franquicias_por_cobertura: z.record(z.string(), z.number().nonnegative().nullable()).default({}),
  })
  .refine((d) => d.capital_edificio > 0 || d.capital_contenido > 0, {
    message: 'Debe indicar al menos un capital (edificio o contenido) mayor a cero',
    path: ['capital_edificio'],
  });

const ajusteSchema = z.object({
  descripcion: z.string(),
  catalogo_id: z.number().int().optional(),
  porcentaje: z.number().optional(),
  monto: z.number().optional(),
});

// Body de POST /api/cotizaciones/calcular y POST /api/cotizaciones para ramo = 'mrc'.
export const cotizarMrcSchema = z.object({
  plan_id: z.number().int(),
  capital_asegurado: z.number().nonnegative(),
  riesgo_datos: riesgoMrcSchema,
  descuentos: z.array(ajusteSchema).default([]),
  recargos: z.array(ajusteSchema).default([]),
  cliente_nombre: z.string().optional(),
  cliente_contacto: z.string().optional(),
  // Cantidad de cuotas elegida por el agente. Si no viene, el service usa plan.cuotas_default.
  cuotas: z.number().int().positive().optional(),
});
