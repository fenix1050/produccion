-- 007_kyc.sql
-- Datos KYC / PLA-FT — se completan solo al aceptar la cotización (Fase 4)

CREATE TABLE cliente_kyc (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL UNIQUE REFERENCES cotizaciones(id) ON DELETE CASCADE,
  tipo_persona VARCHAR(15) NOT NULL,        -- 'fisica' / 'juridica'
  nombre_razon_social VARCHAR(200) NOT NULL,
  documento VARCHAR(50),
  ruc VARCHAR(20),
  fecha_nacimiento DATE,
  estado_civil VARCHAR(30),
  nacionalidad VARCHAR(60),
  direccion_particular TEXT,
  direccion_comercial TEXT,
  ciudad VARCHAR(80),
  telefono VARCHAR(30),
  email VARCHAR(120),
  actividad VARCHAR(150),
  monto_ingreso_mensual NUMERIC(14,2),
  es_proveedor_estado BOOLEAN DEFAULT FALSE,
  es_pep BOOLEAN DEFAULT FALSE,
  pep_institucion VARCHAR(150),
  pep_cargo VARCHAR(100),
  declaracion_lavado_activos BOOLEAN,
  declaracion_paises_no_cooperantes BOOLEAN,
  declaracion_sujeto_obligado BOOLEAN,
  tipo_firma VARCHAR(30),                   -- 'digital' / 'facsimilar' / 'manuscrita'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
