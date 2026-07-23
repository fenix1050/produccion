import * as usuariosService from '../services/admin/usuarios.service.js';
import * as rolesService from '../services/admin/roles.service.js';
import * as planesService from '../services/admin/planes.service.js';
import * as tasasCoberturaService from '../services/admin/tasas-cobertura.service.js';
import * as rubrosActividadService from '../services/admin/rubros-actividad.service.js';
import {
  crearUsuarioSchema,
  editarUsuarioSchema,
  resetPasswordSchema,
  crearRolSchema,
  editarRolSchema,
  agregarCoberturaAPlanSchema,
  editarPlanCoberturaSchema,
  crearTasaSchema,
  editarRubroActividadSchema,
  editarPlanSchema,
  editarPlanFormaPagoSchema,
} from '../schemas/admin.schema.js';

// --- Usuarios ---

export async function listarUsuarios(_req, res, next) {
  try {
    res.json(await usuariosService.listarUsuarios());
  } catch (err) {
    next(err);
  }
}

export async function crearUsuario(req, res, next) {
  try {
    const datos = crearUsuarioSchema.parse(req.body);
    const usuario = await usuariosService.crearUsuario(datos, req.usuario);
    res.status(201).json(usuario);
  } catch (err) {
    next(err);
  }
}

export async function editarUsuario(req, res, next) {
  try {
    const cambios = editarUsuarioSchema.parse(req.body);
    const usuario = await usuariosService.editarUsuario(req.params.id, cambios, req.usuario);
    res.json(usuario);
  } catch (err) {
    next(err);
  }
}

export async function resetearPassword(req, res, next) {
  try {
    const { password } = resetPasswordSchema.parse(req.body);
    await usuariosService.resetearPassword(req.params.id, password, req.usuario);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function eliminarUsuario(req, res, next) {
  try {
    await usuariosService.eliminarUsuario(req.params.id, req.usuario);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// --- Roles ---

export async function listarRoles(_req, res, next) {
  try {
    res.json(await rolesService.listarRoles());
  } catch (err) {
    next(err);
  }
}

export async function crearRol(req, res, next) {
  try {
    const datos = crearRolSchema.parse(req.body);
    const rol = await rolesService.crearRol(datos, req.usuario);
    res.status(201).json(rol);
  } catch (err) {
    next(err);
  }
}

export async function editarRol(req, res, next) {
  try {
    const cambios = editarRolSchema.parse(req.body);
    const rol = await rolesService.editarRol(req.params.id, cambios, req.usuario);
    res.json(rol);
  } catch (err) {
    next(err);
  }
}

export async function eliminarRol(req, res, next) {
  try {
    await rolesService.eliminarRol(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// --- Plan coberturas ---

export async function listarCoberturasDePlan(req, res, next) {
  try {
    res.json(await planesService.listarCoberturasDePlan(req.params.planId));
  } catch (err) {
    next(err);
  }
}

export async function agregarCoberturaAPlan(req, res, next) {
  try {
    const datos = agregarCoberturaAPlanSchema.parse(req.body);
    const fila = await planesService.agregarCoberturaAPlan(req.params.planId, datos);
    res.status(201).json(fila);
  } catch (err) {
    next(err);
  }
}

export async function editarPlanCobertura(req, res, next) {
  try {
    const cambios = editarPlanCoberturaSchema.parse(req.body);
    const fila = await planesService.editarPlanCobertura(req.params.id, cambios);
    res.json(fila);
  } catch (err) {
    next(err);
  }
}

export async function eliminarPlanCobertura(req, res, next) {
  try {
    await planesService.eliminarCoberturaDePlan(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// --- Tasas ---

export async function listarTasasDeRamo(req, res, next) {
  try {
    res.json(await tasasCoberturaService.listarTasasDeRamo(req.params.ramoId));
  } catch (err) {
    next(err);
  }
}

export async function crearTasa(req, res, next) {
  try {
    const { ramo_id, ...datos } = crearTasaSchema.parse(req.body);
    const tasa = await tasasCoberturaService.crearVersionDeTasa(ramo_id, datos);
    res.status(201).json(tasa);
  } catch (err) {
    next(err);
  }
}

export async function eliminarTasa(req, res, next) {
  try {
    await tasasCoberturaService.eliminarTasa(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function listarRubrosActividad(req, res, next) {
  try {
    res.json(await rubrosActividadService.listarRubrosActividad(req.query.grupo));
  } catch (err) {
    next(err);
  }
}

export async function editarRubroActividad(req, res, next) {
  try {
    const cambios = editarRubroActividadSchema.parse(req.body);
    const fila = await rubrosActividadService.editarRubroActividad(req.params.id, cambios);
    res.json(fila);
  } catch (err) {
    next(err);
  }
}

// --- Planes ---

export async function listarPlanes(req, res, next) {
  try {
    res.json(await planesService.listarPlanes(req.query.ramoId));
  } catch (err) {
    next(err);
  }
}

export async function editarPlan(req, res, next) {
  try {
    const cambios = editarPlanSchema.parse(req.body);
    const plan = await planesService.editarPlan(req.params.id, cambios);
    res.json(plan);
  } catch (err) {
    next(err);
  }
}

export async function listarFormasPagoDePlan(req, res, next) {
  try {
    res.json(await planesService.listarFormasPagoDePlan(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function editarPlanFormaPago(req, res, next) {
  try {
    const cambios = editarPlanFormaPagoSchema.parse(req.body);
    const fila = await planesService.editarPlanFormaPago(req.params.id, cambios);
    res.json(fila);
  } catch (err) {
    next(err);
  }
}
