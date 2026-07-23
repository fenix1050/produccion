import * as rolesRepository from '../../repositories/roles.repository.js';
import { httpError } from '../../utils/http-error.js';

const CODIGO_UNIQUE_VIOLATION = '23505'; // Postgres: unique_violation
const CODIGO_FOREIGN_KEY_VIOLATION = '23503'; // Postgres: foreign_key_violation

// --- Roles (migración 031) ---

export async function listarRoles() {
  return rolesRepository.findAll();
}

export async function crearRol(datos) {
  try {
    return await rolesRepository.crear(datos);
  } catch (err) {
    if (err.code === CODIGO_UNIQUE_VIOLATION) {
      throw httpError(409, 'Ya existe un rol con ese nombre', 'Ya existe un rol con ese nombre');
    }
    throw err;
  }
}

// Los roles del sistema (admin/agente, es_sistema = true) son inmutables desde el panel:
// ni nombre ni los 4 permisos se pueden cambiar, porque `req.usuario.rol === 'admin'` se
// usa fuera de este panel (ownership de Historial, ver cotizacion.service.js) — ver
// docs/ESTADO_PROYECTO.md y la migración 031.
export async function editarRol(id, cambios) {
  const rol = await rolesRepository.findById(id);
  if (!rol) {
    throw httpError(404, 'Rol no encontrado', 'Rol no encontrado');
  }
  if (rol.es_sistema) {
    throw httpError(409, 'Este rol es del sistema y no se puede editar', 'Este rol es del sistema y no se puede editar');
  }
  try {
    return await rolesRepository.actualizar(id, cambios);
  } catch (err) {
    if (err.code === CODIGO_UNIQUE_VIOLATION) {
      throw httpError(409, 'Ya existe un rol con ese nombre', 'Ya existe un rol con ese nombre');
    }
    throw err;
  }
}

// Mismo criterio que editarRol: los roles del sistema son inmutables. Un rol custom en
// uso (algún usuario con ese rol_id) tampoco se puede borrar — Postgres lo rechaza por
// la FK usuarios.rol_id y acá lo traducimos a un 409 explicativo.
export async function eliminarRol(id) {
  const rol = await rolesRepository.findById(id);
  if (!rol) {
    throw httpError(404, 'Rol no encontrado', 'Rol no encontrado');
  }
  if (rol.es_sistema) {
    throw httpError(409, 'Este rol es del sistema y no se puede eliminar', 'Este rol es del sistema y no se puede eliminar');
  }
  try {
    await rolesRepository.eliminar(id);
  } catch (err) {
    if (err.code === CODIGO_FOREIGN_KEY_VIOLATION) {
      throw httpError(
        409,
        'Hay usuarios con este rol asignado. Reasignalos antes de eliminarlo.',
        'Hay usuarios con este rol asignado. Reasignalos antes de eliminarlo.'
      );
    }
    throw err;
  }
}
