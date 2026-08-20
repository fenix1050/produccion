import { z } from 'zod'

// ---- Usuarios ----

export const crearUsuarioSchema = z.object({
  nombre: z.string().min(1, 'nombre es requerido'),
  email: z.string().email('email inválido'),
  rol_id: z.number().int().positive(),
  password: z.string().min(8, 'password debe tener al menos 8 caracteres'),
  // Opcional: usado en el bloque de firma de la Carta Oferta (ver templates/oferta/mrc.js,
  // Ajuste MC.xlsx ítem #8) — no todos los roles emiten cartas oferta, así que no es requerido.
  telefono: z.string().max(30).nullable().optional(),
})

export const editarUsuarioSchema = z.object({
  nombre: z.string().min(1, 'nombre es requerido').optional(),
  email: z.string().email('email inválido').optional(),
  rol_id: z.number().int().positive().optional(),
  activo: z.boolean().optional(),
  // NULL = el usuario no tiene tope propio, se respeta el tope del plan tal cual.
  descuento_maximo_pct: z.number().min(0).max(100).nullable().optional(),
  recargo_maximo_pct: z.number().min(0).max(100).nullable().optional(),
  telefono: z.string().max(30).nullable().optional(),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'password debe tener al menos 8 caracteres'),
})

// ---- Roles (migración 031) ----

export const crearRolSchema = z.object({
  nombre: z
    .string()
    .min(1, 'nombre es requerido')
    .max(30, 'nombre debe tener como máximo 30 caracteres'),
  puede_editar_tasas: z.boolean().default(false),
  puede_gestionar_usuarios: z.boolean().default(false),
  puede_editar_coberturas: z.boolean().default(false),
  puede_editar_planes: z.boolean().default(false),
  puede_editar_descuento_plan: z.boolean().default(false),
  puede_ver_descuento_plan: z.boolean().default(true),
  puede_agregar_cobertura_libre: z.boolean().default(true),
  puede_seleccionar_franquicia: z.boolean().default(false),
})

// Los roles nuevos (es_sistema = false) son totalmente editables, incluido el nombre.
// Los roles del sistema (admin/agente) se rechazan en el service con 409 antes de
// llegar a actualizar() — ver services/admin/roles.service.js editarRol.
export const editarRolSchema = z.object({
  nombre: z.string().min(1).max(30).optional(),
  puede_editar_tasas: z.boolean().optional(),
  puede_gestionar_usuarios: z.boolean().optional(),
  puede_editar_coberturas: z.boolean().optional(),
  puede_editar_planes: z.boolean().optional(),
  puede_editar_descuento_plan: z.boolean().optional(),
  puede_ver_descuento_plan: z.boolean().optional(),
  puede_agregar_cobertura_libre: z.boolean().optional(),
  puede_seleccionar_franquicia: z.boolean().optional(),
  activo: z.boolean().optional(),
})

// ---- Plan coberturas ----

export const agregarCoberturaAPlanSchema = z.object({
  cobertura_id: z.number().int().positive(),
  incluida_por_defecto: z.boolean().default(true),
  monto: z.number().nullable().optional(),
  franquicia: z.number().nullable().optional(),
})

export const editarPlanCoberturaSchema = z.object({
  incluida_por_defecto: z.boolean().optional(),
  monto: z.number().nullable().optional(),
  franquicia: z.number().nullable().optional(),
})

// ---- Tasas ----

export const crearTasaSchema = z.object({
  ramo_id: z.number().int().positive(),
  cobertura_id: z.number().int().positive(),
  tasa_valor: z.number(),
  unidad: z.enum(['permil', 'porcentaje']).default('permil'),
  vigente_desde: z.string().optional(), // fecha ISO; default = hoy si no se envía
})

export const editarRubroActividadSchema = z.object({
  tasa_edificio: z.number().nonnegative().optional(),
  tasa_contenido: z.number().nonnegative().optional(),
  categoria: z.string().min(1).max(20).optional(),
})

// ---- Planes ----

export const editarPlanSchema = z.object({
  activo: z.boolean().optional(),
  nombre: z.string().trim().min(1).max(150).optional(),
  prima_tecnica_minima: z.number().nullable().optional(),
  prima_tecnica_minima_usd: z.number().nullable().optional(),
})

export const editarPlanTopesSchema = z.object({
  descuento_maximo: z.number().min(0).max(100).nullable().optional(),
  recargo_maximo: z.number().min(0).max(100).nullable().optional(),
})

export const editarPlanFormaPagoSchema = z.object({
  tasa_rpf: z.number().optional(),
  habilitada: z.boolean().optional(),
})

// ---- R.P.F. por cuotas (migración 058, cambio `rpf-variable-mrc`) ----

// Escritura BULK de la curva global (33 celdas = 11 cuotas x 3 formas de pago) en un solo
// upsert atómico, en vez de un endpoint per-celda (ver design.md Decisión 7): 33 PUTs
// secuenciales dejarían la curva a medio editar en vivo para otros usuarios. `cuotas` acepta
// hasta 24 a propósito (no hardcodeado a 11) para permitir extender el rango sin migración —
// ver design.md Decisión 5 y "Open Questions".
export const editarCurvaRpfSchema = z.object({
  celdas: z
    .array(
      z.object({
        forma_pago_id: z.number().int().positive(),
        cuotas: z.number().int().min(1).max(24),
        tasa_rpf: z.number().min(0),
      })
    )
    .min(1)
    .max(100),
})

// ---- Ramos ----

export const editarRamoSchema = z
  .object({
    activo: z.boolean().optional(),
    nombre_display: z.string().trim().min(1).max(100).optional(),
  })
  .refine((datos) => datos.activo !== undefined || datos.nombre_display !== undefined, {
    message: 'Debe enviarse activo y/o nombre_display',
  })
