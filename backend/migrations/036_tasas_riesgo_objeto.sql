-- 036_tasas_riesgo_objeto.sql
-- Tercera migración del cambio "incendio-3-planes-y-moneda". Modelo genérico de tasas para la
-- tercera mecánica de Incendio: tasa global por tipo de riesgo, desglosada en 4 objetos de
-- riesgo (Edificio, Instalaciones, Contenido Mueble y Equipos, Contenido Mercadería). Dos
-- tablas nuevas en vez de extender `rubros_actividad` (que ya sirve a MRC e Incendio simple
-- con semántica distinta) — ver "Architecture Decisions" de design.md para la justificación
-- completa.
--
-- `tasa_valor` en `tasas_riesgo_objeto` guarda el valor OFICIAL ya redondeado de Kevin (ej.
-- 0.90%, no el 0.896% que daría 40% × 2.24% sin redondear) — `factor_porcentaje` es solo
-- documentación de la derivación, nunca se recalcula en runtime (ver design.md).
--
-- `plan_id` nullable en `tasas_riesgo_objeto`: NULL = tasa genérica del tipo de riesgo,
-- valor = override específico de ese plan. Los 3 planes nuevos comparten tasa hoy (confirmado)
-- pero pueden divergir a futuro sin necesitar un refactor de schema.

CREATE TABLE tipos_riesgo_incendio (
  id BIGSERIAL PRIMARY KEY,
  ramo_id BIGINT NOT NULL REFERENCES ramos(id),
  nombre TEXT NOT NULL,                        -- 'VIVIENDA FAMILIAR'
  tasa_global NUMERIC(8, 4) NOT NULL,           -- 2.2400
  tasa_minima NUMERIC(8, 4),                    -- 0.6000
  tasa_maxima NUMERIC(8, 4),                    -- 35.4800
  unidad TEXT NOT NULL DEFAULT 'porcentaje'
    CHECK (unidad IN ('permil', 'porcentaje')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ramo_id, nombre)
);

CREATE TABLE tasas_riesgo_objeto (
  id BIGSERIAL PRIMARY KEY,
  tipo_riesgo_id BIGINT NOT NULL REFERENCES tipos_riesgo_incendio(id) ON DELETE CASCADE,
  plan_id BIGINT NULL REFERENCES planes(id),    -- NULL = tasa genérica del tipo de riesgo
  objeto_riesgo TEXT NOT NULL CHECK (objeto_riesgo IN
    ('edificio', 'instalaciones', 'contenido_mueble_equipos', 'contenido_mercaderia')),
  tasa_valor NUMERIC(8, 4) NOT NULL,            -- 0.9000 / 1.3400 (dato oficial, ya redondeado)
  factor_porcentaje NUMERIC(5, 2),              -- 40.00 / 60.00 — documenta la derivación
  unidad TEXT NOT NULL DEFAULT 'porcentaje'
    CHECK (unidad IN ('permil', 'porcentaje')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- UNIQUE con NULL: Postgres trata cada NULL como distinto entre sí, así que hacen falta dos
-- índices parciales para modelar "una sola tasa genérica por tipo de riesgo/objeto" y "una sola
-- tasa por tipo de riesgo/objeto/plan" simultáneamente.
CREATE UNIQUE INDEX ux_tasas_riesgo_objeto_generica
  ON tasas_riesgo_objeto (tipo_riesgo_id, objeto_riesgo) WHERE plan_id IS NULL;
CREATE UNIQUE INDEX ux_tasas_riesgo_objeto_plan
  ON tasas_riesgo_objeto (tipo_riesgo_id, objeto_riesgo, plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX ix_tasas_riesgo_objeto_tipo ON tasas_riesgo_objeto (tipo_riesgo_id);
