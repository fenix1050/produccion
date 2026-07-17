import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as usuariosRepository from '../repositories/usuarios.repository.js';

const JWT_EXPIRES_IN = '8h';

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
    },
  };
}
