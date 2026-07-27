-- 035_planes_tipo_mecanica_y_umbral.sql
-- Segunda migración del cambio "incendio-3-planes-y-moneda". Reemplaza el discriminador
-- implícito `plan.nombre === 'MAQUINARIA BASICO'` (hardcodeado en incendio.calculator.js) por
-- un campo explícito de datos, para que los 3 planes nuevos (Hipotecario, con Inspección, sin
-- Inspección — seed en la migración 038) puedan compartir una tercera mecánica de tarifación
-- sin duplicar código ni volver a hardcodear por nombre. Aditiva: `tipo_mecanica` con DEFAULT
-- que preserva el comportamiento de todos los planes existentes; el resto de las columnas son
-- nullable.
--
-- El dispatch en el calculador (fuera de alcance de este PR — llega en el PR 2, grupo 3)
-- conserva además un fallback a `plan.nombre === 'MAQUINARIA BASICO'` mientras la columna
-- pueda ser NULL, como red de seguridad de rollback nivel 2 (ver proposal.md).

ALTER TABLE planes
  ADD COLUMN tipo_mecanica TEXT NOT NULL DEFAULT 'edificio_contenido'
    CHECK (tipo_mecanica IN ('edificio_contenido', 'maquinaria', 'objeto_riesgo')),
  ADD COLUMN requiere_inspeccion BOOLEAN,        -- NULL = la regla de umbral no aplica a este plan
  ADD COLUMN umbral_inspeccion_monto NUMERIC(14, 2),
  ADD COLUMN umbral_inspeccion_moneda CHAR(3) CHECK (umbral_inspeccion_moneda IN ('PYG', 'USD'));

UPDATE planes SET tipo_mecanica = 'maquinaria' WHERE nombre = 'MAQUINARIA BASICO';

-- "INCENDIO - EDIFICIO Y CONTENIDO" y "MAQUINARIA BASICO" quedan con `requiere_inspeccion` NULL
-- (valor por defecto de la columna nueva) — la regla de umbral de inspección no les aplica; solo
-- aplicará a los 2 planes nuevos "con Inspección"/"sin Inspección" que se seedean en 038.
