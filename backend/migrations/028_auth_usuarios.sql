-- 028_auth_usuarios.sql
-- Fase 5 / WU1: agrega soporte de auth a la tabla `usuarios` (login con JWT propio)
-- y siembra al usuario admin inicial de Kevin.

ALTER TABLE usuarios
  ADD COLUMN password_hash TEXT,
  ADD COLUMN ultima_sesion TIMESTAMPTZ;

-- Hash bcrypt (12 rounds) generado con bcryptjs, correspondiente al password que
-- Kevin definió para su usuario admin. El password en texto plano NUNCA se guarda
-- ni se repite acá — solo el hash, verificado localmente contra bcrypt.compareSync
-- antes de aplicar esta migración.
INSERT INTO usuarios (nombre, email, rol, puede_editar_tasas, activo, password_hash)
VALUES (
  'Kevin Ruiz',
  'kevinruiz@tajy.com.py',
  'admin',
  TRUE,
  TRUE,
  '$2b$12$lO0c5KzWJUn10yDeZ/mLPePXAfqiwgCAg8RtuKY/vADl3GES/YrW6'
);
