-- 005_cotizaciones.sql
-- Cabecera de cotización, variantes de franquicia, y plan de pago por forma de pago

CREATE TABLE correlativos (
  ramo_id INT PRIMARY KEY REFERENCES ramos(id),
  ultimo_numero INT NOT NULL DEFAULT 0
);

INSERT INTO correlativos (ramo_id, ultimo_numero) SELECT id, 0 FROM ramos;

CREATE TABLE cotizaciones (
  id SERIAL PRIMARY KEY,
  numero_cotizacion VARCHAR(20) NOT NULL UNIQUE,
  ramo_id INT NOT NULL REFERENCES ramos(id),
  plan_id INT NOT NULL REFERENCES planes(id),
  agente_id INT REFERENCES usuarios(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_dias INT DEFAULT 30,

  cliente_nombre VARCHAR(150),
  cliente_contacto VARCHAR(100),

  riesgo_datos JSONB NOT NULL,
  capital_asegurado NUMERIC(14,2),

  estado VARCHAR(20) DEFAULT 'borrador',  -- borrador / cotizada / aceptada / vencida / convertida
  pdf_carta_oferta_url TEXT,
  pdf_propuesta_formal_url TEXT,

  es_flota BOOLEAN DEFAULT FALSE,
  descuento_comision_agente NUMERIC(6,3) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cotizacion_variantes (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  numero_variante VARCHAR(20) NOT NULL UNIQUE,
  tipo_franquicia VARCHAR(15) NOT NULL,          -- 'sin_franquicia' / 'con_franquicia'
  franquicia_monto NUMERIC(14,2) DEFAULT 0,
  prima NUMERIC(14,2) NOT NULL
);

CREATE TABLE cotizacion_plan_pago (
  id SERIAL PRIMARY KEY,
  variante_id INT NOT NULL REFERENCES cotizacion_variantes(id) ON DELETE CASCADE,
  forma_pago_id INT NOT NULL REFERENCES formas_pago(id),
  cantidad_cuotas INT NOT NULL DEFAULT 11,
  rpf_porcentaje NUMERIC(10,6),
  rpf_monto NUMERIC(14,2),
  iva_monto NUMERIC(14,2),
  premio_total NUMERIC(14,2) NOT NULL,
  monto_inicial NUMERIC(14,2),
  monto_cuota NUMERIC(14,2),
  UNIQUE(variante_id, forma_pago_id)
);

CREATE TABLE cotizacion_coberturas (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  cobertura_id INT NOT NULL REFERENCES coberturas_catalogo(id),
  nombre_snapshot VARCHAR(150) NOT NULL,
  texto_legal_snapshot TEXT,
  texto_exclusiones_snapshot TEXT,
  monto NUMERIC(14,2),
  franquicia NUMERIC(14,2),
  incluida BOOLEAN DEFAULT TRUE
);

CREATE TABLE cotizacion_servicios (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  servicio_id INT NOT NULL REFERENCES servicios_catalogo(id),
  nombre_snapshot VARCHAR(150) NOT NULL,
  texto_legal_snapshot TEXT,
  incluido BOOLEAN DEFAULT TRUE
);

CREATE TABLE cotizacion_ajustes (
  id SERIAL PRIMARY KEY,
  variante_id INT NOT NULL REFERENCES cotizacion_variantes(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL,             -- 'descuento' / 'recargo'
  catalogo_id INT,
  descripcion VARCHAR(150) NOT NULL,
  porcentaje NUMERIC(6,3),
  monto NUMERIC(14,2) NOT NULL
);

CREATE TABLE cotizacion_clausulas (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  clausula_id INT NOT NULL REFERENCES clausulas_catalogo(id),
  texto_legal_snapshot TEXT
);
