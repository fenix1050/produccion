import * as adminService from '../services/admin.service.js';
import {
  crearUsuarioSchema,
  editarUsuarioSchema,
  resetPasswordSchema,
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
    res.json(await adminService.listarUsuarios());
  } catch (err) {
    next(err);
  }
}

export async function crearUsuario(req, res, next) {
  try {
    const datos = crearUsuarioSchema.parse(req.body);
    const usuario = await adminService.crearUsuario(datos);
    res.status(201).json(usuario);
  } catch (err) {
    next(err);
  }
}

export async function editarUsuario(req, res, next) {
  try {
    const cambios = editarUsuarioSchema.parse(req.body);
    const usuario = await adminService.editarUsuario(req.params.id, cambios);
    res.json(usuario);
  } catch (err) {
    next(err);
  }
}

export async function resetearPassword(req, res, next) {
  try {
    const { password } = resetPasswordSchema.parse(req.body);
    await adminService.resetearPassword(req.params.id, password);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// --- Plan coberturas ---

export async function listarCoberturasDePlan(req, res, next) {
  try {
    res.json(await adminService.listarCoberturasDePlan(req.params.planId));
  } catch (err) {
    next(err);
  }
}

export async function agregarCoberturaAPlan(req, res, next) {
  try {
    const datos = agregarCoberturaAPlanSchema.parse(req.body);
    const fila = await adminService.agregarCoberturaAPlan(req.params.planId, datos);
    res.status(201).json(fila);
  } catch (err) {
    next(err);
  }
}

export async function editarPlanCobertura(req, res, next) {
  try {
    const cambios = editarPlanCoberturaSchema.parse(req.body);
    const fila = await adminService.editarPlanCobertura(req.params.id, cambios);
    res.json(fila);
  } catch (err) {
    next(err);
  }
}

export async function eliminarPlanCobertura(req, res, next) {
  try {
    await adminService.eliminarCoberturaDePlan(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// --- Tasas ---

export async function listarTasasDeRamo(req, res, next) {
  try {
    res.json(await adminService.listarTasasDeRamo(req.params.ramoId));
  } catch (err) {
    next(err);
  }
}

export async function crearTasa(req, res, next) {
  try {
    const { ramo_id, ...datos } = crearTasaSchema.parse(req.body);
    const tasa = await adminService.crearVersionDeTasa(ramo_id, datos);
    res.status(201).json(tasa);
  } catch (err) {
    next(err);
  }
}

export async function listarRubrosActividad(req, res, next) {
  try {
    res.json(await adminService.listarRubrosActividad(req.query.grupo));
  } catch (err) {
    next(err);
  }
}

export async function editarRubroActividad(req, res, next) {
  try {
    const cambios = editarRubroActividadSchema.parse(req.body);
    const fila = await adminService.editarRubroActividad(req.params.id, cambios);
    res.json(fila);
  } catch (err) {
    next(err);
  }
}

// --- Planes ---

export async function listarPlanes(req, res, next) {
  try {
    res.json(await adminService.listarPlanes(req.query.ramoId));
  } catch (err) {
    next(err);
  }
}

export async function editarPlan(req, res, next) {
  try {
    const cambios = editarPlanSchema.parse(req.body);
    const plan = await adminService.editarPlan(req.params.id, cambios);
    res.json(plan);
  } catch (err) {
    next(err);
  }
}

export async function listarFormasPagoDePlan(req, res, next) {
  try {
    res.json(await adminService.listarFormasPagoDePlan(req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function editarPlanFormaPago(req, res, next) {
  try {
    const cambios = editarPlanFormaPagoSchema.parse(req.body);
    const fila = await adminService.editarPlanFormaPago(req.params.id, cambios);
    res.json(fila);
  } catch (err) {
    next(err);
  }
}
