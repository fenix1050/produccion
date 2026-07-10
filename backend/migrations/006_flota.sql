-- 006_flota.sql
-- Vehículos de una cotización de flota

CREATE TABLE cotizacion_flota_vehiculos (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
  item INT NOT NULL,
  marca VARCHAR(80),
  modelo VARCHAR(80),
  anio INT NOT NULL,
  matricula VARCHAR(20),
  capital_asegurado NUMERIC(14,2) NOT NULL,
  prima_individual NUMERIC(14,2)
);
