import bcrypt from 'bcryptjs';
import * as usuariosRepository from '../../repositories/usuarios.repository.js';
import { httpError } from '../../utils/http-error.js';

const BCRYPT_ROUNDS = 12;
const CODIGO_FOREIGN_KEY_VIOLATION = '23503'; // Postgres: foreign_key_violation

// --- Usuarios ---

export async function listarUsuarios() {
  return usuariosRepository.findAll();
}

export async function crearUsuario({ nombre, email, rol_id, password }) {
  const existente = await usuariosRepository.findByEmail(email);
  if (existente) {
    throw httpError(409, 'Ya existe un usuario con ese email', 'Ya existe un usuario con ese email');
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return usuariosRepository.crear({ nombre, email, rol_id, password_hash });
}

// Un rol custom con puede_gestionar_usuarios no puede tocar (editar, desactivar, resetear
// password) a un usuario admin — mismo criterio que eliminarUsuario más abajo. Un admin
// editándose a sí mismo sigue permitido (acá solicitante.rol también es 'admin').
function asegurarPuedeModificarAdmin(usuarioObjetivo, solicitante) {
  if (usuarioObjetivo.rol === 'admin' && solicitante.rol !== 'admin') {
    throw httpError(
      403,
      'No tenés permiso para modificar a un usuario administrador',
      'No tenés permiso para modificar a un usuario administrador'
    );
  }
}

export async function editarUsuario(id, cambios, solicitante) {
  const usuarioActual = await usuariosRepository.findById(id);
  if (!usuarioActual) {
    throw httpError(404, 'Usuario no encontrado');
  }
  asegurarPuedeModificarAdmin(usuarioActual, solicitante);

  if (cambios.email && cambios.email !== usuarioActual.email) {
    const existente = await usuariosRepository.findByEmail(cambios.email);
    if (existente && String(existente.id) !== String(id)) {
      throw httpError(409, 'Ya existe un usuario con ese email', 'Ya existe un usuario con ese email');
    }
  }

  const usuario = await usuariosRepository.actualizar(id, cambios);
  if (!usuario) {
    throw httpError(404, 'Usuario no encontrado');
  }
  return usuario;
}

export async function resetearPassword(id, password, solicitante) {
  const usuario = await usuariosRepository.findById(id);
  if (!usuario) {
    throw httpError(404, 'Usuario no encontrado');
  }
  asegurarPuedeModificarAdmin(usuario, solicitante);

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await usuariosRepository.actualizarPassword(id, password_hash);
}

// solicitante: usuario autenticado que pide el borrado (req.usuario) — no puede eliminarse
// a sí mismo (evita quedarse sin acceso por error) y, si el objetivo es rol 'admin', quien
// pide el borrado también tiene que ser 'admin' — un rol custom con puede_gestionar_usuarios
// (ej. "Jefe de Análisis de Riesgo") puede gestionar usuarios normales, pero no debería poder
// borrar al admin real del sistema solo porque tiene ese permiso booleano.
export async function eliminarUsuario(id, solicitante) {
  const usuario = await usuariosRepository.findById(id);
  if (!usuario) {
    throw httpError(404, 'Usuario no encontrado');
  }
  if (String(id) === String(solicitante.id)) {
    throw httpError(409, 'No podés eliminar tu propio usuario', 'No podés eliminar tu propio usuario');
  }
  if (usuario.rol === 'admin' && solicitante.rol !== 'admin') {
    throw httpError(
      403,
      'No tenés permiso para eliminar a un usuario administrador',
      'No tenés permiso para eliminar a un usuario administrador'
    );
  }
  try {
    await usuariosRepository.eliminar(id);
  } catch (err) {
    if (err.code === CODIGO_FOREIGN_KEY_VIOLATION) {
      throw httpError(
        409,
        'Este usuario tiene cotizaciones asociadas y no se puede eliminar. Podés desactivarlo en su lugar.',
        'Este usuario tiene cotizaciones asociadas y no se puede eliminar. Podés desactivarlo en su lugar.'
      );
    }
    throw err;
  }
}
