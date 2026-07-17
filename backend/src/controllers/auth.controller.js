import { loginSchema } from '../schemas/auth.schema.js';
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
