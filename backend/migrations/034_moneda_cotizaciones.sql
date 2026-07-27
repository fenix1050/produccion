-- 034_moneda_cotizaciones.sql
-- Primera migración del cambio "incendio-3-planes-y-moneda" (ver openspec/changes/
-- incendio-3-planes-y-moneda/). Modela `moneda` como dato tipado de cada cotización, en vez
-- de la inconsistencia actual: el plan "MAQUINARIA BASICO" se cotiza en USD por acuerdo verbal
-- (migración 013) pero el sistema no lo marca en ningún lado y el frontend lo formatea con
-- `fmtGs` — gap documentado desde esa migración. Aditiva: columnas nuevas nullable o con
-- DEFAULT, sin DROP ni cambio de tipo de columnas existentes.
--
-- `moneda` NOT NULL DEFAULT 'PYG' en vez de nullable: toda cotización histórica ya emitida se
-- asume Gs. salvo Maquinaria Básico (backfill explícito abajo) — así lo confirma la propuesta
-- ("no se reexpresan cotizaciones históricas ya emitidas").
--
-- `tipo_cambio_snapshot/_fuente/_fecha` quedan NULL para toda cotización en Gs. (no hubo
-- conversión) y se completan solo cuando `moneda = 'USD'` y el flujo de emisión (fuera de
-- alcance de este PR — llega en el PR 3, grupo 5) efectivamente resuelve un tipo de cambio.
--
-- `planes.prima_tecnica_minima_usd` es un piso propio por moneda, explícito y sin conversión
-- implícita (decisión de design.md): "MAQUINARIA BASICO" es el único plan con ese piso
-- confirmado hoy (Usd. 100, migración 013) — se backfillea desde la columna Gs. existente
-- porque esa columna YA contenía el valor en USD (nunca se convirtió, es el mismo gap que
-- esta migración cierra).

ALTER TABLE cotizaciones
  ADD COLUMN moneda CHAR(3) NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG', 'USD')),
  ADD COLUMN tipo_cambio_snapshot NUMERIC(12, 4),
  ADD COLUMN tipo_cambio_fuente TEXT,
  ADD COLUMN tipo_cambio_fecha TIMESTAMPTZ;

ALTER TABLE planes
  ADD COLUMN monedas_permitidas TEXT[] NOT NULL DEFAULT ARRAY['PYG'],
  ADD COLUMN prima_tecnica_minima_usd NUMERIC(14, 2);

-- Backfill: "MAQUINARIA BASICO" es el único plan que ya operaba en USD (gap de la migración
-- 013). Su `prima_tecnica_minima` (Gs. 100 según esa migración) en realidad siempre fue un
-- valor en USD mal etiquetado — se copia tal cual a la columna nueva, no se convierte.
UPDATE planes
SET monedas_permitidas = ARRAY['USD'], prima_tecnica_minima_usd = prima_tecnica_minima
WHERE nombre = 'MAQUINARIA BASICO';

UPDATE cotizaciones
SET moneda = 'USD'
WHERE plan_id = (SELECT id FROM planes WHERE nombre = 'MAQUINARIA BASICO');
