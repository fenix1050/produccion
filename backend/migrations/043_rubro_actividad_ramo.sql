-- 043_rubro_actividad_ramo.sql
-- Cambio "incendio-tasas-por-rubro" — ver openspec/changes/incendio-tasas-por-rubro/
-- (proposal.md, design.md, specs/incendio-planes-objeto-riesgo/spec.md).
--
-- Reemplaza el escalar `rubros_actividad.grupo` (VARCHAR(10), migración 004/012, un solo
-- valor por rubro) por la relación muchos-a-muchos `rubro_actividad_ramo`: un rubro puede
-- pertenecer a más de un ramo a la vez (ej. "CONSULTORIO MEDICO" es de MRC e Incendio).
-- `grupo` NO se toca en esta migración (ni UPDATE ni DROP): queda legacy de solo lectura
-- hasta el follow-up explícito de `DROP COLUMN` (ver docs/ESTADO_PROYECTO.md).
--
-- PENDIENTE DE APLICAR: este archivo NO fue ejecutado contra Supabase — queda listo para
-- que Kevin lo aplique manualmente (o confirme su aplicación) contra la base real. Ver
-- tasks.md 1.5.

BEGIN;

CREATE TABLE rubro_actividad_ramo (
  rubro_id  INT NOT NULL REFERENCES rubros_actividad(id) ON DELETE CASCADE,
  ramo_id   INT NOT NULL REFERENCES ramos(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rubro_id, ramo_id)
);

CREATE INDEX ix_rubro_actividad_ramo_ramo ON rubro_actividad_ramo (ramo_id);

-- ============ BLOQUE 1 — backfill 1:1 de los rubros con grupo NOT NULL ============
-- INSERT..SELECT sobre WHERE grupo IS NOT NULL (nunca una lista escrita a mano): mapea
-- `grupo` (mayúscula, ej. 'MRC', 'TRO') a `ramos.nombre` (minúscula) vía lower(ra.grupo).

INSERT INTO rubro_actividad_ramo (rubro_id, ramo_id)
SELECT ra.id, r.id
FROM rubros_actividad ra
JOIN ramos r ON r.nombre = lower(ra.grupo)
WHERE ra.grupo IS NOT NULL
ON CONFLICT DO NOTHING;

-- Assert: el backfill 1:1 no puede perder ningún rubro con grupo NOT NULL (si el mapeo
-- lower(grupo) -> ramos.nombre tuviera un residuo sin JOIN, el filtro nuevo dejaría el
-- selector de ese ramo con menos rubros que antes).
DO $$
DECLARE
  esperado INT;
  insertado INT;
BEGIN
  SELECT count(*) INTO esperado FROM rubros_actividad WHERE grupo IS NOT NULL;
  SELECT count(DISTINCT rubro_id) INTO insertado
    FROM rubro_actividad_ramo rar
    JOIN rubros_actividad ra ON ra.id = rar.rubro_id
    WHERE ra.grupo IS NOT NULL;
  IF insertado <> esperado THEN
    RAISE EXCEPTION
      'Backfill 1:1 incompleto: % rubros con grupo NOT NULL, solo % con fila en rubro_actividad_ramo (mapeo grupo->ramos.nombre con residuo)',
      esperado, insertado;
  END IF;
END $$;

-- ============ BLOQUE 2 — 8 filas explícitas para los 5 rubros con grupo = NULL ============
-- Asignaciones confirmadas por Kevin (2026-07-28, ver proposal.md "Decisiones confirmadas"):
-- VIVIENDA -> incendio; SILOS -> incendio; CONSULTORIO MEDICO -> {mrc, incendio};
-- CHANCHERIAS -> {mrc, incendio}; GRANJA EN GENERAL -> {mrc, incendio}. Nunca un default
-- masivo: cada fila sale de un JOIN por nombre exacto contra rubros_actividad y ramos.

INSERT INTO rubro_actividad_ramo (rubro_id, ramo_id)
SELECT ra.id, r.id
FROM (VALUES
  ('VIVIENDA', 'incendio'),
  ('SILOS', 'incendio'),
  ('CONSULTORIO MEDICO', 'mrc'),
  ('CONSULTORIO MEDICO', 'incendio'),
  ('CHANCHERIAS', 'mrc'),
  ('CHANCHERIAS', 'incendio'),
  ('GRANJA EN GENERAL', 'mrc'),
  ('GRANJA EN GENERAL', 'incendio')
) AS asignacion(rubro_nombre, ramo_nombre)
JOIN rubros_actividad ra ON ra.nombre = asignacion.rubro_nombre
JOIN ramos r ON r.nombre = asignacion.ramo_nombre
ON CONFLICT DO NOTHING;

-- Assert: las 8 filas deben existir. Si algún nombre no matcheó (typo, rubro no existe
-- todavía, etc.) el JOIN lo habría descartado en silencio — este assert lo hace ruidoso.
DO $$
DECLARE
  filas INT;
BEGIN
  SELECT count(*) INTO filas
  FROM rubro_actividad_ramo rar
  JOIN rubros_actividad ra ON ra.id = rar.rubro_id
  JOIN ramos r ON r.id = rar.ramo_id
  WHERE (ra.nombre, r.nombre) IN (
    ('VIVIENDA', 'incendio'),
    ('SILOS', 'incendio'),
    ('CONSULTORIO MEDICO', 'mrc'),
    ('CONSULTORIO MEDICO', 'incendio'),
    ('CHANCHERIAS', 'mrc'),
    ('CHANCHERIAS', 'incendio'),
    ('GRANJA EN GENERAL', 'mrc'),
    ('GRANJA EN GENERAL', 'incendio')
  );
  IF filas <> 8 THEN
    RAISE EXCEPTION
      'Bloque 2 incompleto: se esperaban 8 filas de pertenencia explícita para los 5 rubros antes NULL, se encontraron %',
      filas;
  END IF;
END $$;

-- ============ ASSERT FINAL ============
-- Ningún rubro de rubros_actividad puede quedar sin al menos una fila en la tabla nueva
-- (invisible en todos los ramos).
DO $$
DECLARE
  huerfanos INT;
BEGIN
  SELECT count(*) INTO huerfanos
  FROM rubros_actividad ra
  WHERE NOT EXISTS (SELECT 1 FROM rubro_actividad_ramo rar WHERE rar.rubro_id = ra.id);
  IF huerfanos > 0 THEN
    RAISE EXCEPTION '% rubros en rubros_actividad sin ninguna fila en rubro_actividad_ramo', huerfanos;
  END IF;
END $$;

COMMIT;
