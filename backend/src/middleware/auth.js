import jwt from 'jsonwebtoken';
import * as usuariosRepository from '../repositories/usuarios.repository.js';

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
      const err = new Error('Falta el token de autenticación');
      err.status = 401;
      throw err;
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      const err = new Error('Token inválido o expirado');
      err.status = 401;
      throw err;
    }

    const usuario = await usuariosRepository.findById(payload.sub);
    if (!usuario || !usuario.activo) {
      const err = new Error('Usuario inválido o inactivo');
      err.status = 401;
      throw err;
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
      const err = new Error('No tenés permiso para acceder a este recurso');
      err.status = 403;
      return next(err);
    }
    next();
  };
}

export function requireTasasEdit(req, res, next) {
  if (!req.usuario || !req.usuario.puede_editar_tasas) {
    const err = new Error('No tenés permiso para editar tasas');
    err.status = 403;
    return next(err);
  }
  next();
}

export function requireUsuariosEdit(req, res, next) {
  if (!req.usuario || !req.usuario.puede_gestionar_usuarios) {
    const err = new Error('No tenés permiso para gestionar usuarios');
    err.status = 403;
    return next(err);
  }
  next();
}

export function requireCoberturasEdit(req, res, next) {
  if (!req.usuario || !req.usuario.puede_editar_coberturas) {
    const err = new Error('No tenés permiso para editar coberturas');
    err.status = 403;
    return next(err);
  }
  next();
}

export function requirePlanesEdit(req, res, next) {
  if (!req.usuario || !req.usuario.puede_editar_planes) {
    const err = new Error('No tenés permiso para editar planes');
    err.status = 403;
    return next(err);
  }
  next();
}
