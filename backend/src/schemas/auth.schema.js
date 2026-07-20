import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'email es requerido'),
  password: z.string().min(1, 'password es requerido'),
});

// Self-service: el propio usuario cambia su contraseña (distinto del reseteo admin
// en admin.schema.js resetPasswordSchema, que no exige la contraseña actual).
export const cambiarPasswordSchema = z.object({
  password_actual: z.string().min(1, 'password_actual es requerido'),
  password_nueva: z.string().min(8, 'password_nueva debe tener al menos 8 caracteres'),
});
