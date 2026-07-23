import jwt from 'jsonwebtoken';
import * as usuariosRepository from '../repositories/usuarios.repository.js';
import { httpError } from '../utils/http-error.js';

/**
 * Verifica el JWT del header Authorization y adjunta `req.usuario`. Va a buscar el
 * usuario actual a la base (no confía solo en el payload del token): un admin puede
 * desactivar a otro usuario y ese token viejo no debe seguir sirviendo.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw httpError(401, 'Falta el token de autenticación');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      throw httpError(401, 'Token inválido o expirado');
    }

    const usuario = await usuariosRepository.findById(payload.sub);
    if (!usuario || !usuario.activo) {
      throw httpError(401, 'Usuario inválido o inactivo');
    }

    req.usuario = {
      id: usuario.id,
      rol: usuario.rol,
      puede_editar_tasas: usuario.puede_editar_tasas,
      puede_gestionar_usuarios: usuario.puede_gestionar_usuarios,
      puede_editar_coberturas: usuario.puede_editar_coberturas,
      puede_editar_planes: usuario.puede_editar_planes,
      nombre: usuario.nombre,
      email: usuario.email,
      descuento_maximo_pct: usuario.descuento_maximo_pct,
      recargo_maximo_pct: usuario.recargo_maximo_pct,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return next(httpError(403, 'No tenés permiso para acceder a este recurso'));
    }
    next();
  };
}

export function requireTasasEdit(req, res, next) {
  if (!req.usuario || !req.usuario.puede_editar_tasas) {
    return next(httpError(403, 'No tenés permiso para editar tasas'));
  }
  next();
}

export function requireUsuariosEdit(req, res, next) {
  if (!req.usuario || !req.usuario.puede_gestionar_usuarios) {
    return next(httpError(403, 'No tenés permiso para gestionar usuarios'));
  }
  next();
}

export function requireCoberturasEdit(req, res, next) {
  if (!req.usuario || !req.usuario.puede_editar_coberturas) {
    return next(httpError(403, 'No tenés permiso para editar coberturas'));
  }
  next();
}

export function requirePlanesEdit(req, res, next) {
  if (!req.usuario || !req.usuario.puede_editar_planes) {
    return next(httpError(403, 'No tenés permiso para editar planes'));
  }
  next();
}
