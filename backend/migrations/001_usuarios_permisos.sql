-- 001_usuarios_permisos.sql
-- Usuarios/agentes y límites de descuento por cargo (ver PLAN_DESARROLLO.md sección 4)

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  email VARCHAR(150) UNIQUE,
  rol VARCHAR(30) NOT NULL DEFAULT 'agente',   -- 'agente' | 'admin' | (otros roles a futuro)
  puede_editar_tasas BOOLEAN DEFAULT FALSE,     -- solo true para admin y roles autorizados
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE descuento_limites_por_cargo (
  id SERIAL PRIMARY KEY,
  cargo VARCHAR(60) NOT NULL,          -- 'Gerencia General', 'Analistas', 'Supervisores'...
  descuento_global_max NUMERIC(6,3),
  descuento_especial_max NUMERIC(6,3),
  descuento_flota_max NUMERIC(6,3)
);
