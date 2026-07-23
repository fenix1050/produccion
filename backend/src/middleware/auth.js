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

    // Compara contra el valor fresco de la DB, no contra el que traía el token viejo:
    // logout, cambio de contraseña o reseteo por admin incrementan token_version, así que
    // un token firmado con una versión anterior queda inválido aunque no haya expirado.
    if (payload.token_version !== usuario.token_version) {
      throw httpError(401, 'Token inválido o expirado');
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

function requirePermiso(campo, mensaje) {
  return (req, res, next) => {
    if (!req.usuario || !req.usuario[campo]) {
      return next(httpError(403, mensaje));
    }
    next();
  };
}

export const requireTasasEdit = requirePermiso('puede_editar_tasas', 'No tenés permiso para editar tasas');
export const requireUsuariosEdit = requirePermiso(
  'puede_gestionar_usuarios',
  'No tenés permiso para gestionar usuarios'
);
export const requireCoberturasEdit = requirePermiso(
  'puede_editar_coberturas',
  'No tenés permiso para editar coberturas'
);
export const requirePlanesEdit = requirePermiso('puede_editar_planes', 'No tenés permiso para editar planes');
