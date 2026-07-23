import { loginSchema, cambiarPasswordSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';

export async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const resultado = await authService.login(email, password);
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    res.json({ usuario: req.usuario });
  } catch (err) {
    next(err);
  }
}

// Self-service: NO es el endpoint de reseteo de admin.controller.js (que gestiona
// contraseñas de OTROS usuarios y exige puede_gestionar_usuarios). Este lo usa
// cualquier usuario autenticado sobre su propia cuenta, con su contraseña actual.
export async function cambiarPassword(req, res, next) {
  try {
    const { password_actual, password_nueva } = cambiarPasswordSchema.parse(req.body);
    await authService.cambiarPassword(req.usuario.id, password_actual, password_nueva);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Invalida el token con el que se llamó (y cualquier otro vigente de este usuario) vía
// token_version. req.usuario ya viene armado por requireAuth, que además ya validó que
// el token es válido antes de llegar acá.
export async function logout(req, res, next) {
  try {
    await authService.logout(req.usuario.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
