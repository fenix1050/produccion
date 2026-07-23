import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as usuariosRepository from '../repositories/usuarios.repository.js';
import { httpError } from '../utils/http-error.js';
import { BCRYPT_ROUNDS } from '../utils/security.js';
import { logSeguridad } from '../utils/seguridad-logger.js';

// Acortado de 8h a 45m (2026-07-23, hardening de sesión): con token_version como
// mecanismo de revocación server-side, ya no hace falta un TTL largo para tolerar la
// falta de invalidación — un token robado ahora expira solo en minutos, no en horas.
const JWT_EXPIRES_IN = '45m';

// Mensaje genérico a propósito: no debe diferir según si el email existe o no,
// para no filtrar qué emails están registrados en el sistema. El logging interno (motivo)
// SÍ puede distinguir el caso, pero nunca expone password ni hash — solo el email y un
// motivo genérico ('credenciales_invalidas' / 'usuario_inactivo'), ver logSeguridad.
function credencialesInvalidas(email, motivo) {
  logSeguridad('login_fallido', { email, motivo }, 'warn');
  return httpError(401, 'Email o contraseña incorrectos');
}

export async function login(email, password) {
  const usuario = await usuariosRepository.findByEmail(email);
  if (!usuario || !usuario.password_hash) {
    throw credencialesInvalidas(email, 'credenciales_invalidas');
  }

  if (!usuario.activo) {
    throw credencialesInvalidas(email, 'usuario_inactivo');
  }

  const passwordOk = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordOk) {
    throw credencialesInvalidas(email, 'credenciales_invalidas');
  }

  await usuariosRepository.actualizarUltimaSesion(usuario.id);
  logSeguridad('login_exitoso', { usuarioId: usuario.id, email: usuario.email }, 'warn');

  const token = jwt.sign(
    {
      sub: usuario.id,
      rol: usuario.rol,
      puede_editar_tasas: usuario.puede_editar_tasas,
      token_version: usuario.token_version,
    },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      puede_editar_tasas: usuario.puede_editar_tasas,
      puede_gestionar_usuarios: usuario.puede_gestionar_usuarios,
      puede_editar_coberturas: usuario.puede_editar_coberturas,
      puede_editar_planes: usuario.puede_editar_planes,
      descuento_maximo_pct: usuario.descuento_maximo_pct,
      recargo_maximo_pct: usuario.recargo_maximo_pct,
      // Snapshot tomado ANTES de actualizarUltimaSesion() de arriba: es la sesión previa
      // a esta, que es lo que la pantalla de Configuración debe mostrar como "último inicio".
      ultima_sesion: usuario.ultima_sesion,
    },
  };
}

// Self-service: el propio usuario autenticado cambia su contraseña (a diferencia de
// usuariosService.resetearPassword (services/admin/usuarios.service.js), acá SÍ se valida
// la contraseña actual con bcrypt.compare
// antes de permitir el cambio). req.usuario (armado por middleware/auth.js) no trae
// password_hash, por eso se vuelve a buscar el usuario completo por id acá.
function passwordActualIncorrecta() {
  return httpError(401, 'Contraseña actual incorrecta');
}

export async function cambiarPassword(usuarioId, passwordActual, passwordNueva) {
  const usuario = await usuariosRepository.findById(usuarioId);
  if (!usuario || !usuario.password_hash) {
    throw passwordActualIncorrecta();
  }

  const passwordOk = await bcrypt.compare(passwordActual, usuario.password_hash);
  if (!passwordOk) {
    throw passwordActualIncorrecta();
  }

  const password_hash = await bcrypt.hash(passwordNueva, BCRYPT_ROUNDS);
  await usuariosRepository.actualizarPassword(usuario.id, password_hash);
  // Un cambio de contraseña propio debe cerrar cualquier otra sesión activa con la
  // contraseña anterior (ej. un token robado que todavía no expiró).
  await usuariosRepository.incrementarTokenVersion(usuario.id);
}

// Logout explícito: el único efecto es invalidar el token con el que se llamó (y
// cualquier otro token vigente de este usuario) incrementando token_version. No hay
// estado de sesión que borrar del lado server más allá de eso (Bearer, no cookies).
export async function logout(usuarioId) {
  await usuariosRepository.incrementarTokenVersion(usuarioId);
}
