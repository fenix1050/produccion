import bcrypt from 'bcryptjs';
import * as usuariosRepository from '../../repositories/usuarios.repository.js';
import * as rolesRepository from '../../repositories/roles.repository.js';
import { httpError } from '../../utils/http-error.js';
import { BCRYPT_ROUNDS } from '../../utils/security.js';
import { logSeguridad } from '../../utils/seguridad-logger.js';

const CODIGO_FOREIGN_KEY_VIOLATION = '23503'; // Postgres: foreign_key_violation

// --- Usuarios ---

export async function listarUsuarios() {
  return usuariosRepository.findAll();
}

// solicitante: quien pide el alta (req.usuario). Antes crearUsuario() no recibía al
// solicitante y no validaba rol_id — un usuario con rol custom puede_gestionar_usuarios=true
// podía crear directamente un usuario nuevo con rol_id = admin, evadiendo por completo el
// chequeo de asegurarPuedeAsignarRol (que hasta ahora solo corría en editarUsuario). Mismo
// criterio que ese chequeo: solo un solicitante 'admin' puede dar de alta un usuario admin.
export async function crearUsuario({ nombre, email, rol_id, password }, solicitante) {
  await asegurarPuedeAsignarRol(rol_id, solicitante);

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

// cambios.rol_id llega sin restricción desde el schema Zod (cualquier id positivo): sin este
// chequeo, un usuario con rol custom puede_gestionar_usuarios=true podía autopromoverse (o
// promover a otro) al rol 'admin' mandando ese id directamente, evadiendo por completo el
// chequeo de asegurarPuedeModificarAdmin (que solo mira el rol ACTUAL del objetivo).
async function asegurarPuedeAsignarRol(rolId, solicitante) {
  if (rolId === undefined) return;
  const rolDestino = await rolesRepository.findById(rolId);
  if (rolDestino?.nombre === 'admin' && solicitante.rol !== 'admin') {
    logSeguridad(
      'intento_escalada_rol_admin_rechazado',
      { solicitanteId: solicitante.id, solicitanteEmail: solicitante.email, rolIdDestino: rolId },
      'error'
    );
    throw httpError(
      403,
      'No tenés permiso para asignar el rol administrador',
      'No tenés permiso para asignar el rol administrador'
    );
  }
}

// editarUsuario es el único punto que escribe estos dos campos (ver schemas/admin.schema.js):
// un solicitante no-admin editándose a sí mismo podía subir su propio tope de descuento/recargo
// (o volverlo NULL, que hereda el tope — más alto — del plan) usando el mismo permiso
// puede_gestionar_usuarios que ya tiene para gestionar a otros usuarios. El tope propio lo
// tiene que fijar otra persona (un admin real), nunca uno mismo.
function asegurarNoAutoAjustaTope(idObjetivo, cambios, solicitante) {
  if (solicitante.rol === 'admin') return;
  if (String(idObjetivo) !== String(solicitante.id)) return;
  if (cambios.descuento_maximo_pct === undefined && cambios.recargo_maximo_pct === undefined) return;
  logSeguridad(
    'intento_auto_ajuste_tope_rechazado',
    { solicitanteId: solicitante.id, solicitanteEmail: solicitante.email },
    'error'
  );
  throw httpError(
    403,
    'No podés modificar tu propio tope de descuento/recargo',
    'No podés modificar tu propio tope de descuento/recargo'
  );
}

export async function editarUsuario(id, cambios, solicitante) {
  const usuarioActual = await usuariosRepository.findById(id);
  if (!usuarioActual) {
    throw httpError(404, 'Usuario no encontrado');
  }
  asegurarPuedeModificarAdmin(usuarioActual, solicitante);
  await asegurarPuedeAsignarRol(cambios.rol_id, solicitante);
  asegurarNoAutoAjustaTope(id, cambios, solicitante);

  if (cambios.email && cambios.email !== usuarioActual.email) {
    const existente = await usuariosRepository.findByEmail(cambios.email);
    if (existente && String(existente.id) !== String(id)) {
      throw httpError(409, 'Ya existe un usuario con ese email', 'Ya existe un usuario con ese email');
    }
  }

  if (cambios.rol_id !== undefined && cambios.rol_id !== usuarioActual.rol_id) {
    logSeguridad('cambio_rol_usuario', {
      solicitanteId: solicitante.id,
      solicitanteEmail: solicitante.email,
      usuarioObjetivoId: id,
      rolIdAnterior: usuarioActual.rol_id,
      rolIdNuevo: cambios.rol_id,
    });
  }

  const usuario = await usuariosRepository.actualizar(id, cambios);
  if (!usuario) {
    throw httpError(404, 'Usuario no encontrado');
  }
  // Desactivación (soft-delete): aunque ya queda bloqueado por el chequeo de `activo` en
  // requireAuth, también se invalida el token_version por consistencia con el resto de
  // los puntos que cierran sesiones (logout, cambio de contraseña, reset por admin).
  if (cambios.activo === false) {
    logSeguridad('usuario_desactivado', {
      solicitanteId: solicitante.id,
      solicitanteEmail: solicitante.email,
      usuarioObjetivoId: id,
      usuarioObjetivoEmail: usuarioActual.email,
    });
    await usuariosRepository.incrementarTokenVersion(id);
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
  logSeguridad('reset_password_por_admin', {
    solicitanteId: solicitante.id,
    solicitanteEmail: solicitante.email,
    usuarioObjetivoId: id,
    usuarioObjetivoEmail: usuario.email,
  });
  // El reseteo por admin también debe cerrar cualquier sesión abierta con la contraseña
  // anterior — mismo criterio que el cambio de contraseña self-service.
  await usuariosRepository.incrementarTokenVersion(id);
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
    logSeguridad('usuario_eliminado', {
      solicitanteId: solicitante.id,
      solicitanteEmail: solicitante.email,
      usuarioObjetivoId: id,
      usuarioObjetivoEmail: usuario.email,
    });
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
