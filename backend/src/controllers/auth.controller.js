import { loginSchema, cambiarPasswordSchema } from '../schemas/auth.schema.js'
import * as authService from '../services/auth.service.js'
import { setCookiesSesion, limpiarCookiesSesion } from '../utils/cookies.js'

// Cambio session-httponly-cookie (D1 de design.md): authService.login() sigue puro y
// devuelve { token, csrfToken, usuario }; el controller es quien toca res — setea las
// cookies y responde solo { usuario }, sin exponer el JWT en el body.
export async function login(req, res, next) {
  try {
    const { email, password } = loginSchema.parse(req.body)
    const { token, csrfToken, usuario } = await authService.login(email, password)
    setCookiesSesion(res, token, csrfToken)
    res.json({ usuario })
  } catch (err) {
    next(err)
  }
}

export async function me(req, res, next) {
  try {
    res.json({ usuario: req.usuario })
  } catch (err) {
    next(err)
  }
}

// Self-service: NO es el endpoint de reseteo de admin.controller.js (que gestiona
// contraseñas de OTROS usuarios y exige puede_gestionar_usuarios). Este lo usa
// cualquier usuario autenticado sobre su propia cuenta, con su contraseña actual.
// Ya incrementa token_version (D7 de design.md), así que la cookie propia queda inválida
// de todos modos — se limpia igual para no dejar al cliente en un estado "logueado"
// imposible (cookie viva mientras el servidor ya la rechaza).
export async function cambiarPassword(req, res, next) {
  try {
    const { password_actual, password_nueva } = cambiarPasswordSchema.parse(req.body)
    await authService.cambiarPassword(req.usuario.id, password_actual, password_nueva)
    limpiarCookiesSesion(res)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

// Invalida el token con el que se llamó (y cualquier otro vigente de este usuario) vía
// token_version. req.usuario ya viene armado por requireAuth, que además ya validó que
// el token es válido antes de llegar acá. Limpia ambas cookies con los MISMOS atributos
// con los que fueron seteadas (ver utils/cookies.js) — divergir acá es el modo de falla
// más probable de dejar una cookie "zombie".
export async function logout(req, res, next) {
  try {
    await authService.logout(req.usuario.id)
    limpiarCookiesSesion(res)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}
