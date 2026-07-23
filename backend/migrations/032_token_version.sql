-- Migración 032: invalidación server-side de sesiones JWT.
-- El JWT ahora lleva un claim `token_version` que se compara contra esta columna en cada
-- request (requireAuth). Incrementar `token_version` invalida de inmediato cualquier token
-- ya emitido para ese usuario, sin depender de que expire solo — necesario porque el
-- transporte sigue siendo Bearer/localStorage (no hay revocación de cookies httpOnly) y el
-- TTL del token se acortó a 45m pero seguía sin haber forma de cerrar sesión del lado server.
ALTER TABLE usuarios ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
