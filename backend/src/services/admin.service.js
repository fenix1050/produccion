import bcrypt from 'bcryptjs';
import * as usuariosRepository from '../repositories/usuarios.repository.js';
import * as coberturasRepository from '../repositories/coberturas.repository.js';
import * as tasasRepository from '../repositories/tasas.repository.js';
import * as ramosRepository from '../repositories/ramos.repository.js';
import * as rolesRepository from '../repositories/roles.repository.js';

const BCRYPT_ROUNDS = 12;
const CODIGO_UNIQUE_VIOLATION = '23505'; // Postgres: unique_violation
const CODIGO_FOREIGN_KEY_VIOLATION = '23503'; // Postgres: foreign_key_violation

// --- Usuarios ---

export async function listarUsuarios() {
  return usuariosRepository.findAll();
}

export async function crearUsuario({ nombre, email, rol_id, password }) {
  const existente = await usuariosRepository.findByEmail(email);
  if (existente) {
    const err = new Error('Ya existe un usuario con ese email');
    err.status = 409;
    err.publicMessage = err.message;
    throw err;
  }

  const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return usuariosRepository.crear({ nombre, email, rol_id, password_hash });
}

// Un rol custom con puede_gestionar_usuarios no puede tocar (editar, desactivar, resetear
// password) a un usuario admin — mismo criterio que eliminarUsuario más abajo. Un admin
// editándose a sí mismo sigue permitido (acá solicitante.rol también es 'admin').
function asegurarPuedeModificarAdmin(usuarioObjetivo, solicitante) {
  if (usuarioObjetivo.rol === 'admin' && solicitante.rol !== 'admin') {
    const err = new Error('No tenés permiso para modificar a un usuario administrador');
    err.status = 403;
    err.publicMessage = err.message;
    throw err;
  }
}

export async function editarUsuario(id, cambios, solicitante) {
  const usuarioActual = await usuariosRepository.findById(id);
  if (!usuarioActual) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }
  asegurarPuedeModificarAdmin(usuarioActual, solicitante);

  if (cambios.email && cambios.email !== usuarioActual.email) {
    const existente = await usuariosRepository.findByEmail(cambios.email);
    if (existente && String(existente.id) !== String(id)) {
      const err = new Error('Ya existe un usuario con ese email');
      err.status = 409;
      err.publicMessage = err.message;
      throw err;
    }
  }

  const usuario = await usuariosRepository.actualizar(id, cambios);
  if (!usuario) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }
  return usuario;
}

export async function resetearPassword(id, password, solicitante) {
  const usuario = await usuariosRepository.findById(id);
  if (!usuario) {
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
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
    const err = new Error('Usuario no encontrado');
    err.status = 404;
    throw err;
  }
  if (String(id) === String(solicitante.id)) {
    const err = new Error('No podés eliminar tu propio usuario');
    err.status = 409;
    err.publicMessage = err.message;
    throw err;
  }
  if (usuario.rol === 'admin' && solicitante.rol !== 'admin') {
    const err = new Error('No tenés permiso para eliminar a un usuario administrador');
    err.status = 403;
    err.publicMessage = err.message;
    throw err;
  }
  try {
    await usuariosRepository.eliminar(id);
  } catch (err) {
    if (err.code === CODIGO_FOREIGN_KEY_VIOLATION) {
      const fk = new Error('Este usuario tiene cotizaciones asociadas y no se puede eliminar. Podés desactivarlo en su lugar.');
      fk.status = 409;
      fk.publicMessage = fk.message;
      throw fk;
    }
    throw err;
  }
}

// --- Roles (migración 031) ---

export async function listarRoles() {
  return rolesRepository.findAll();
}

export async function crearRol(datos) {
  try {
    return await rolesRepository.crear(datos);
  } catch (err) {
    if (err.code === CODIGO_UNIQUE_VIOLATION) {
      const dup = new Error('Ya existe un rol con ese nombre');
      dup.status = 409;
      dup.publicMessage = dup.message;
      throw dup;
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
    const err = new Error('Rol no encontrado');
    err.status = 404;
    err.publicMessage = err.message;
    throw err;
  }
  if (rol.es_sistema) {
    const err = new Error('Este rol es del sistema y no se puede editar');
    err.status = 409;
    err.publicMessage = err.message;
    throw err;
  }
  try {
    return await rolesRepository.actualizar(id, cambios);
  } catch (err) {
    if (err.code === CODIGO_UNIQUE_VIOLATION) {
      const dup = new Error('Ya existe un rol con ese nombre');
      dup.status = 409;
      dup.publicMessage = dup.message;
      throw dup;
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
    const err = new Error('Rol no encontrado');
    err.status = 404;
    err.publicMessage = err.message;
    throw err;
  }
  if (rol.es_sistema) {
    const err = new Error('Este rol es del sistema y no se puede eliminar');
    err.status = 409;
    err.publicMessage = err.message;
    throw err;
  }
  try {
    await rolesRepository.eliminar(id);
  } catch (err) {
    if (err.code === CODIGO_FOREIGN_KEY_VIOLATION) {
      const fk = new Error('Hay usuarios con este rol asignado. Reasignalos antes de eliminarlo.');
      fk.status = 409;
      fk.publicMessage = fk.message;
      throw fk;
    }
    throw err;
  }
}

// --- Plan coberturas ---

export async function listarCoberturasDePlan(planId) {
  return coberturasRepository.findPlanCoberturasByPlanId(planId);
}

export async function agregarCoberturaAPlan(planId, datos) {
  return coberturasRepository.crearPlanCobertura(planId, datos);
}

export async function editarPlanCobertura(id, cambios) {
  const fila = await coberturasRepository.actualizarPlanCobertura(id, cambios);
  if (!fila) {
    const err = new Error('Cobertura de plan no encontrada');
    err.status = 404;
    throw err;
  }
  return fila;
}

export async function eliminarCoberturaDePlan(id) {
  await coberturasRepository.eliminarPlanCobertura(id);
}

// --- Tasas ---
// `coberturasRepository.findTasasCoberturaRamo` (usado por los calculadores en tiempo de
// cotización, ver mrc.calculator.js/incendio.calculator.js) SÍ filtra por vigente_desde <= hoy
// y se queda con la versión más reciente por cobertura (dedup vía Map, ver el propio repository)
// — verificado 2026-07-17 al confirmar que las ediciones de tasas del panel admin (WU3/WU5) se
// reflejan en vivo en el cotizador para cualquier rol, sin caché ni reinicio de por medio.

export async function listarTasasDeRamo(ramoId) {
  return coberturasRepository.findTasasCoberturaRamoConHistorial(ramoId);
}

export async function crearVersionDeTasa(ramoId, datos) {
  return coberturasRepository.crearTasaCoberturaRamo(ramoId, datos);
}

export async function eliminarTasa(id) {
  return coberturasRepository.eliminarTasaCoberturaRamo(id);
}

// rubros_actividad no tiene vigente_desde/versionado (a diferencia de
// tasas_cobertura_ramo) — se edita con UPDATE directo, mismo patrón que editarPlan.
export async function listarRubrosActividad(grupo) {
  return coberturasRepository.findRubrosActividad(grupo);
}

export async function editarRubroActividad(id, cambios) {
  const fila = await coberturasRepository.actualizarRubroActividad(id, cambios);
  if (!fila) {
    const err = new Error('Tipo de riesgo no encontrado');
    err.status = 404;
    throw err;
  }
  return fila;
}

// --- Planes ---

export async function listarPlanes(ramoId) {
  return tasasRepository.findAllPlanes(ramoId);
}

export async function editarPlan(id, cambios) {
  const plan = await tasasRepository.actualizarPlan(id, cambios);
  if (!plan) {
    const err = new Error('Plan no encontrado');
    err.status = 404;
    throw err;
  }
  return plan;
}

export async function listarFormasPagoDePlan(planId) {
  return ramosRepository.findFormasPagoDelPlanTodas(planId);
}

export async function editarPlanFormaPago(id, cambios) {
  const fila = await tasasRepository.actualizarPlanFormaPago(id, cambios);
  if (!fila) {
    const err = new Error('Forma de pago de plan no encontrada');
    err.status = 404;
    throw err;
  }
  return fila;
}
