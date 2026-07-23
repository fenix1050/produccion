import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as usuariosRepository from '../repositories/usuarios.repository.js';

const JWT_EXPIRES_IN = '8h';
const BCRYPT_ROUNDS = 12;

// Mensaje genérico a propósito: no debe diferir según si el email existe o no,
// para no filtrar qué emails están registrados en el sistema.
function credencialesInvalidas() {
  const err = new Error('Email o contraseña incorrectos');
  err.status = 401;
  return err;
}

export async function login(email, password) {
  const usuario = await usuariosRepository.findByEmail(email);
  if (!usuario || !usuario.password_hash) {
    throw credencialesInvalidas();
  }

  if (!usuario.activo) {
    throw credencialesInvalidas();
  }

  const passwordOk = await bcrypt.compare(password, usuario.password_hash);
  if (!passwordOk) {
    throw credencialesInvalidas();
  }

  await usuariosRepository.actualizarUltimaSesion(usuario.id);

  const token = jwt.sign(
    { sub: usuario.id, rol: usuario.rol, puede_editar_tasas: usuario.puede_editar_tasas },
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
  const err = new Error('Contraseña actual incorrecta');
  err.status = 401;
  return err;
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
}
