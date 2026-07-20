-- Migración 031: roles configurables del panel admin.
-- Reemplaza el rol binario 'agente'/'admin' + 4 booleanos sueltos por usuario
-- (puede_editar_tasas, puede_gestionar_usuarios, puede_editar_coberturas, puede_editar_planes)
-- por una tabla roles con nombre propio, donde cada rol agrupa esos 4 permisos como
-- columnas fijas, y cada usuario referencia un rol vía FK (usuarios.rol_id).
--
-- es_sistema: los roles admin/agente sembrados acá quedan inmutables desde el panel
-- (nombre y permisos) porque `req.usuario.rol === 'admin'` sigue siendo un string mágico
-- usado FUERA del panel admin, en cotizacion.service.js, para resolver ownership de
-- Historial (ver docs/ESTADO_PROYECTO.md). Si alguien renombra o despermisiona ese rol
-- desde el panel, rompe ese caso especial. Kevin decidió NO tocar esa lógica de ownership
-- en este cambio — 'admin' queda reservado tal cual, protegido por es_sistema = TRUE.

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(30) UNIQUE NOT NULL,
  puede_editar_tasas BOOLEAN NOT NULL DEFAULT FALSE,
  puede_gestionar_usuarios BOOLEAN NOT NULL DEFAULT FALSE,
  puede_editar_coberturas BOOLEAN NOT NULL DEFAULT FALSE,
  puede_editar_planes BOOLEAN NOT NULL DEFAULT FALSE,
  es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (nombre, puede_editar_tasas, puede_gestionar_usuarios, puede_editar_coberturas, puede_editar_planes, es_sistema)
VALUES
  ('admin', TRUE, TRUE, TRUE, TRUE, TRUE),
  ('agente', FALSE, FALSE, FALSE, FALSE, TRUE);

ALTER TABLE usuarios ADD COLUMN rol_id INT REFERENCES roles(id);

-- Backfill lossless: solo 3 usuarios reales hoy (ids 1, 2, 8), sin divergencias entre
-- el string `rol` y sus 4 booleanos sueltos (verificado antes de aplicar esta migración).
UPDATE usuarios u SET rol_id = r.id FROM roles r WHERE r.nombre = u.rol;

ALTER TABLE usuarios ALTER COLUMN rol_id SET NOT NULL;

ALTER TABLE usuarios DROP COLUMN rol;
ALTER TABLE usuarios DROP COLUMN puede_editar_tasas;
ALTER TABLE usuarios DROP COLUMN puede_gestionar_usuarios;
ALTER TABLE usuarios DROP COLUMN puede_editar_coberturas;
ALTER TABLE usuarios DROP COLUMN puede_editar_planes;
