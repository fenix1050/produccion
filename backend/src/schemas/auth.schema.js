import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'email es requerido'),
  password: z.string().min(1, 'password es requerido'),
});
