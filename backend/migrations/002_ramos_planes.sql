-- 002_ramos_planes.sql
-- Catálogo base de ramos y planes, con la configuración real por plan
-- (prima técnica mínima, cotización combinada, franquicia, descuentos/recargos máximos)

CREATE TABLE ramos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE,        -- 'auto', 'auto-flota', 'incendio', 'hogar', 'mrc', 'tro', 'transporte', 'vida-ap'
  nombre_display VARCHAR(100) NOT NULL,       -- 'Automóviles', 'Incendio', ...
  activo BOOLEAN DEFAULT TRUE,
  calculador VARCHAR(50) NOT NULL             -- coincide con la clave del registro en backend/src/calculators/index.js
);

CREATE TABLE planes (
  id SERIAL PRIMARY KEY,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  nombre VARCHAR(100) NOT NULL,               -- 'PLAN TAJY PREMIUM'
  prima_tecnica_minima NUMERIC(14,2),         -- valor tal cual lo usa el cotizador real (piso de la Prima)
  cotizacion_combinada BOOLEAN DEFAULT FALSE, -- si Sí, permite variante SIN/CON franquicia (junto con vía de importación)
  tipo_franquicia VARCHAR(30),                -- 'monto_fijo_por_siniestro' | otros a definir
  franquicia_porcentaje NUMERIC(6,3),         -- ej. 12% para Premium/Superior/Fuerte
  descuento_default NUMERIC(6,3),             -- ej. 20%
  descuento_maximo NUMERIC(6,3),              -- varía por plan (Premium/Superior 20%, Fuerte 55%)
  recargo_maximo NUMERIC(6,3),                -- ej. 100%
  cobertura_referencia_id INT,                -- FK a coberturas_catalogo (se agrega en 003 con ALTER, por orden de creación)
  cuotas_default INT DEFAULT 11,
  cuotas_maximo INT DEFAULT 11,
  puede_modificar_cuotas BOOLEAN DEFAULT TRUE,
  activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE formas_pago (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL UNIQUE,   -- 'contado', 'cobrador', 'boca_cobranza', 'tarjeta_credito'
  nombre_display VARCHAR(50) NOT NULL,  -- 'Contado', 'Crédito (Cobrador)', 'Boca de Cobranza', 'Tarjeta de Crédito'
  tiene_rpf BOOLEAN DEFAULT TRUE        -- false para 'contado'
);

-- Tasa RPF FIJA por forma de pago y por plan (NO varía por cantidad de cuotas —
-- corrección confirmada contra la pantalla real del cotizador, ver PLAN_DESARROLLO.md sección 5)
CREATE TABLE plan_formas_pago (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES planes(id),
  forma_pago_id INT NOT NULL REFERENCES formas_pago(id),
  tasa_rpf NUMERIC(10,6) NOT NULL,      -- ej. Cobrador=1.6, Boca de Cobranza=1.35, Tarjeta=1, Contado=0
  habilitada BOOLEAN DEFAULT TRUE,
  UNIQUE(plan_id, forma_pago_id)
);

INSERT INTO formas_pago (codigo, nombre_display, tiene_rpf) VALUES
  ('contado', 'Contado', FALSE),
  ('cobrador', 'Crédito (Cobrador)', TRUE),
  ('boca_cobranza', 'Boca de Cobranza', TRUE),
  ('tarjeta_credito', 'Tarjeta de Crédito', TRUE);

INSERT INTO ramos (nombre, nombre_display, calculador) VALUES
  ('auto', 'Automóviles', 'auto'),
  ('auto-flota', 'Automóviles - Flota', 'auto-flota'),
  ('incendio', 'Incendio', 'incendio'),
  ('hogar', 'Multirriesgo Hogar', 'hogar'),
  ('mrc', 'Multirriesgo Comercio', 'mrc'),
  ('tro', 'Todo Riesgo Operativo', 'tro'),
  ('transporte', 'Transporte de Mercadería', 'transporte'),
  ('vida-ap', 'Vida y Accidentes Personales', 'vida-ap');
