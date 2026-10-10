import { z } from 'zod'

import { ajusteSchema } from './shared/ajuste.schema.js'
import {
  LIMITE_CEDULA,
  LIMITE_CIUDAD,
  LIMITE_CONTACTO,
  LIMITE_DIRECCION,
  LIMITE_NOMBRE,
  LIMITE_RUBRO,
  textoMax,
} from './shared/limites-texto.js'

// Tope de sanidad de los montos: las columnas de dinero son NUMERIC(14,2) (< 1e12). Un valor
// mayor (o Infinity/1e308, que JSON.parse acepta) terminaba en un 500 por `22003` al persistir.
const MONTO_MAXIMO = 999_999_999_999

function monto(etiqueta) {
  const mensaje = `${etiqueta} supera el máximo permitido.`
  return z
    .number({ invalid_type_error: `${etiqueta} debe ser un número.` })
    .finite(mensaje)
    .max(MONTO_MAXIMO, mensaje)
}

// Datos específicos del riesgo para MRC (Multirriesgo Comercio) — van dentro de
// `cotizaciones.riesgo_datos` (JSONB). Cédula/dirección viven acá porque `cotizaciones`
// no tiene columnas propias para datos de contacto del cliente (solo cliente_nombre/contacto).
export const riesgoMrcSchema = z
  .object({
    cedula: textoMax(LIMITE_CEDULA, 'La cédula o RUC').min(1),
    direccion: textoMax(LIMITE_DIRECCION, 'La dirección').min(1),
    rubro_actividad: textoMax(LIMITE_RUBRO, 'El rubro de actividad').min(1),
    ciudad: textoMax(LIMITE_CIUDAD, 'La ciudad').min(1),
    capital_edificio: monto('El capital de edificio').nonnegative().default(0),
    capital_contenido: monto('El capital de contenido').nonnegative().default(0),
    coberturas_adicionales: z
      .array(
        z.object({
          codigo: z.string().min(1),
          suma_asegurada: monto('La suma asegurada de la cobertura adicional').positive(),
        })
      )
      .default([]),
    // Franquicia/deducible que el agente elige por cobertura en "Detalle del plan" — puramente
    // informativo para la propuesta, no afecta el cálculo de la prima (ver FRANQUICIA_OPCIONES en
    // cotizar.js). Mapa codigo -> monto (null = "sin deducible"). Igual que en el frontend, está
    // indexado por código de cobertura, no por línea — si el agente repite un código con distinta
    // suma asegurada, comparten la misma franquicia elegida.
    franquicias_por_cobertura: z
      .record(z.string(), z.number().nonnegative().nullable())
      .default({}),
  })
  .refine((d) => d.capital_edificio > 0 || d.capital_contenido > 0, {
    message: 'Debe indicar al menos un capital (edificio o contenido) mayor a cero',
    path: ['capital_edificio'],
  })

// Body de POST /api/cotizaciones/calcular y POST /api/cotizaciones para ramo = 'mrc'.
export const cotizarMrcSchema = z.object({
  plan_id: z.number().int(),
  capital_asegurado: monto('El capital asegurado').nonnegative(),
  riesgo_datos: riesgoMrcSchema,
  descuentos: z.array(ajusteSchema).max(10).default([]),
  recargos: z.array(ajusteSchema).max(10).default([]),
  cliente_nombre: textoMax(LIMITE_NOMBRE, 'El nombre del cliente').optional(),
  cliente_contacto: textoMax(LIMITE_CONTACTO, 'El contacto del cliente').optional(),
  // Cantidad de cuotas elegida por el agente. Si no viene, el service usa plan.cuotas_default.
  cuotas: z.number().int().positive().optional(),
})
