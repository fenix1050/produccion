-- 022_desactivar_comercio_proteccion_total.sql
-- "COMERCIO PROTECCION TOTAL" (migración 012) nunca tuvo RPF/prima técnica mínima confirmados
-- contra el sistema de escritorio y hoy corta con 422 explicativo al intentar cotizarlo. Kevin
-- pidió sacarlo del cotizador mientras tanto por ser probable que quede sin uso. Mismo patrón que
-- 014_fix_plan_incendio_sin_rpf.sql: se desactiva en vez de borrarse, para no perder el catálogo
-- de coberturas ya cargado si más adelante se confirma su RPF.

UPDATE planes
SET activo = FALSE
WHERE nombre = 'COMERCIO PROTECCION TOTAL'
  AND ramo_id = (SELECT id FROM ramos WHERE nombre = 'mrc');
