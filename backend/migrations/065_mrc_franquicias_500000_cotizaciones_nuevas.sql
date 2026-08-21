-- Configura la franquicia informativa por plan y cobertura para cotizaciones MRC futuras.
-- La fuente de verdad es plan_coberturas.franquicia; los snapshots históricos no se modifican.
-- Las asociaciones nuevas son solo de configuración: no incluyen la cobertura por defecto.
WITH ramo_mrc AS (
  SELECT id
  FROM ramos
  WHERE nombre = 'mrc'
),
planes_mrc AS (
  SELECT p.id
  FROM planes AS p
  JOIN ramo_mrc AS r ON r.id = p.ramo_id
),
coberturas_aplicables AS (
  SELECT c.id, c.codigo
  FROM coberturas_catalogo AS c
  JOIN ramo_mrc AS r ON r.id = c.ramo_id
  WHERE c.activo = TRUE
    AND (
      c.codigo IN ('incendio_edificio', 'incendio_contenido')
      OR EXISTS (
        SELECT 1
        FROM tasas_cobertura_ramo AS t
        WHERE t.ramo_id = r.id
          AND t.cobertura_id = c.id
          AND t.vigente_desde <= CURRENT_DATE
      )
    )
)
INSERT INTO plan_coberturas (
  plan_id,
  cobertura_id,
  incluida_por_defecto,
  monto,
  franquicia
)
SELECT
  p.id,
  c.id,
  FALSE,
  NULL,
  CASE
    WHEN c.codigo IN ('incendio_edificio', 'incendio_contenido') THEN NULL
    ELSE 500000
  END
FROM planes_mrc AS p
CROSS JOIN coberturas_aplicables AS c
ON CONFLICT (plan_id, cobertura_id) DO UPDATE
SET franquicia = EXCLUDED.franquicia;
