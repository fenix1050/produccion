-- 003_coberturas_servicios_ajustes.sql
-- Catálogos de Coberturas, Servicios, Descuentos/Recargos y Cláusulas (v1, ver sección 6 del plan)

CREATE TABLE coberturas_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  codigo VARCHAR(50) NOT NULL,                -- 'robo_hurto', 'granizo', 'gastos_medicos'
  nombre VARCHAR(150) NOT NULL,               -- 'Pérdida total por robo/hurto'
  categoria VARCHAR(50),                      -- 'A mi vehículo' / 'A los demás' / 'Especiales'
  texto_legal TEXT,
  texto_exclusiones TEXT,
  monto_default NUMERIC(14,2),
  franquicia_default NUMERIC(14,2),
  es_opcional BOOLEAN DEFAULT FALSE,
  activo BOOLEAN DEFAULT TRUE
);

ALTER TABLE planes
  ADD CONSTRAINT fk_planes_cobertura_referencia
  FOREIGN KEY (cobertura_referencia_id) REFERENCES coberturas_catalogo(id);

CREATE TABLE plan_coberturas (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES planes(id),
  cobertura_id INT NOT NULL REFERENCES coberturas_catalogo(id),
  incluida_por_defecto BOOLEAN DEFAULT TRUE,
  monto NUMERIC(14,2),
  franquicia NUMERIC(14,2),
  UNIQUE(plan_id, cobertura_id)
);

CREATE TABLE servicios_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  nombre VARCHAR(150) NOT NULL,          -- 'Asistencia al Vehículo', 'Carta Verde'
  texto_legal TEXT,
  es_opcional BOOLEAN DEFAULT FALSE,
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE plan_servicios (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES planes(id),
  servicio_id INT NOT NULL REFERENCES servicios_catalogo(id),
  incluido_por_defecto BOOLEAN DEFAULT TRUE,
  UNIQUE(plan_id, servicio_id)
);

CREATE TABLE descuentos_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT REFERENCES ramos(id),
  nombre VARCHAR(150) NOT NULL,
  porcentaje_default NUMERIC(6,3),
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE recargos_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT REFERENCES ramos(id),
  nombre VARCHAR(150) NOT NULL,
  porcentaje_default NUMERIC(6,3),
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE clausulas_catalogo (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  nombre VARCHAR(150) NOT NULL,
  texto_legal TEXT NOT NULL,
  activo BOOLEAN DEFAULT TRUE
);

-- Monto base de franquicia fija para Auto - Importación Directa. Configurable en vez de
-- hardcodeado, porque puede variar según criterios (a definir — hoy solo hay un valor base).
CREATE TABLE franquicia_auto_importacion_directa (
  id SERIAL PRIMARY KEY,
  criterio VARCHAR(100) NOT NULL DEFAULT 'default',
  monto NUMERIC(14,2) NOT NULL,          -- Gs. 350.000 (valor base actual)
  vigente_desde DATE DEFAULT CURRENT_DATE
);

INSERT INTO franquicia_auto_importacion_directa (monto) VALUES (350000);
