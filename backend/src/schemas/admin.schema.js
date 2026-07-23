import { z } from 'zod';

// ---- Usuarios ----

export const crearUsuarioSchema = z.object({
  nombre: z.string().min(1, 'nombre es requerido'),
  email: z.string().email('email inválido'),
  rol_id: z.number().int().positive(),
  password: z.string().min(8, 'password debe tener al menos 8 caracteres'),
});

export const editarUsuarioSchema = z.object({
  nombre: z.string().min(1, 'nombre es requerido').optional(),
  email: z.string().email('email inválido').optional(),
  rol_id: z.number().int().positive().optional(),
  activo: z.boolean().optional(),
  // NULL = el usuario no tiene tope propio, se respeta el tope del plan tal cual.
  descuento_maximo_pct: z.number().min(0).max(100).nullable().optional(),
  recargo_maximo_pct: z.number().min(0).max(100).nullable().optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'password debe tener al menos 8 caracteres'),
});

// ---- Roles (migración 031) ----

export const crearRolSchema = z.object({
  nombre: z.string().min(1, 'nombre es requerido').max(30, 'nombre debe tener como máximo 30 caracteres'),
  puede_editar_tasas: z.boolean().default(false),
  puede_gestionar_usuarios: z.boolean().default(false),
  puede_editar_coberturas: z.boolean().default(false),
  puede_editar_planes: z.boolean().default(false),
});

// Los roles nuevos (es_sistema = false) son totalmente editables, incluido el nombre.
// Los roles del sistema (admin/agente) se rechazan en el service con 409 antes de
// llegar a actualizar() — ver services/admin/roles.service.js editarRol.
export const editarRolSchema = z.object({
  nombre: z.string().min(1).max(30).optional(),
  puede_editar_tasas: z.boolean().optional(),
  puede_gestionar_usuarios: z.boolean().optional(),
  puede_editar_coberturas: z.boolean().optional(),
  puede_editar_planes: z.boolean().optional(),
  activo: z.boolean().optional(),
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
