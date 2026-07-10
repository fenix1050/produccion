-- 004_tarifacion.sql
-- Tasas por capital (Auto), rubros de actividad y tasas por línea de cobertura (Otros Riesgos)

CREATE TABLE tasas_capital (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES planes(id),
  capital_min NUMERIC(14,2) NOT NULL,
  capital_max NUMERIC(14,2) NOT NULL,
  tasa_porcentaje NUMERIC(10,6) NOT NULL,
  vigente_desde DATE DEFAULT CURRENT_DATE
);

CREATE TABLE rubros_actividad (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,          -- 'BAZAR', 'FARMACIA', 'DEPOSITO', 'NEGOCIO - VIVIENDA'...
  categoria VARCHAR(20),                 -- 'CATEGORIA A' .. 'CATEGORIA I'
  grupo VARCHAR(10),                     -- 'MRC' (Grupo A) o 'TRO' (Grupo B), null para riesgos de vivienda pura
  tasa_edificio NUMERIC(10,6),           -- ‰ — usado por Incendio simple
  tasa_contenido NUMERIC(10,6)           -- ‰ — usado por Incendio simple
);

CREATE TABLE tasas_cobertura_ramo (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),         -- incendio / mrc / tro / transporte
  cobertura_id INT NOT NULL REFERENCES coberturas_catalogo(id),
  tasa_valor NUMERIC(10,6) NOT NULL,
  unidad VARCHAR(15) NOT NULL DEFAULT 'permil',       -- 'permil' (Incendio/MRC/TRO) o 'porcentaje' (Transporte)
  vigente_desde DATE DEFAULT CURRENT_DATE
);

CREATE TABLE tarifas_generico (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  plan_id INT REFERENCES planes(id),
  variables JSONB NOT NULL,     -- ej: {"suma_min": 0, "suma_max": 5000000, "tasa": 0.012}
  vigente_desde DATE DEFAULT CURRENT_DATE
);

CREATE TABLE recargo_antiguedad_tabla (
  id SERIAL PRIMARY KEY,
  antiguedad_anios_min INT NOT NULL,
  antiguedad_anios_max INT NOT NULL,
  porcentaje_recargo NUMERIC(6,3) NOT NULL
);

-- Recargo por antigüedad (Auto/Flota), del manual de suscripción — recalcular cada año calendario
INSERT INTO recargo_antiguedad_tabla (antiguedad_anios_min, antiguedad_anios_max, porcentaje_recargo) VALUES
  (0, 0, 0.0),
  (1, 14, 11.1),
  (15, 15, 18.1),
  (16, 16, 19.6),
  (17, 17, 21.1),
  (18, 18, 22.6),
  (19, 19, 24.6),
  (20, 20, 26.1),
  (21, 21, 27.1),
  (22, 22, 28.1),
  (23, 23, 29.1),
  (24, 24, 30.1),
  (25, 25, 31.1);
