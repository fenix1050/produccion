import { z } from 'zod';

// ---- Usuarios ----

export const crearUsuarioSchema = z.object({
  nombre: z.string().min(1, 'nombre es requerido'),
  email: z.string().email('email inválido'),
  rol: z.enum(['agente', 'admin']),
  puede_editar_tasas: z.boolean().default(false),
  password: z.string().min(8, 'password debe tener al menos 8 caracteres'),
});

export const editarUsuarioSchema = z.object({
  rol: z.enum(['agente', 'admin']).optional(),
  puede_editar_tasas: z.boolean().optional(),
  activo: z.boolean().optional(),
  // NULL = el usuario no tiene tope propio, se respeta el tope del plan tal cual.
  descuento_maximo_pct: z.number().min(0).max(100).nullable().optional(),
  recargo_maximo_pct: z.number().min(0).max(100).nullable().optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'password debe tener al menos 8 caracteres'),
});

// ---- Plan coberturas ----

export const agregarCoberturaAPlanSchema = z.object({
  cobertura_id: z.number().int().positive(),
  incluida_por_defecto: z.boolean().default(true),
  monto: z.number().nullable().optional(),
  franquicia: z.number().nullable().optional(),
});

export const editarPlanCoberturaSchema = z.object({
  incluida_por_defecto: z.boolean().optional(),
  monto: z.number().nullable().optional(),
  franquicia: z.number().nullable().optional(),
});

// ---- Tasas ----

export const crearTasaSchema = z.object({
  ramo_id: z.number().int().positive(),
  cobertura_id: z.number().int().positive(),
  tasa_valor: z.number(),
  unidad: z.enum(['permil', 'porcentaje']).default('permil'),
  vigente_desde: z.string().optional(), // fecha ISO; default = hoy si no se envía
});

export const editarRubroActividadSchema = z.object({
  tasa_edificio: z.number().nonnegative().optional(),
  tasa_contenido: z.number().nonnegative().optional(),
});

// ---- Planes ----

export const editarPlanSchema = z.object({
  activo: z.boolean().optional(),
  prima_tecnica_minima: z.number().nullable().optional(),
});

export const editarPlanFormaPagoSchema = z.object({
  tasa_rpf: z.number().optional(),
  habilitada: z.boolean().optional(),
});
