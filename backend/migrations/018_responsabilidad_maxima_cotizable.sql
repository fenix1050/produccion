-- 018_responsabilidad_maxima_cotizable.sql
-- Agrega el tope de suma asegurada cotizable por plan ("Responsabilidad Máx. Cotizable" en la
-- pantalla "Configuración para Cotizador" del sistema de escritorio) — dato que no estaba
-- modelado todavía. Confirmado por Kevin (2026-07-13) contra esa pantalla para
-- "MULTIRRIESGO COMERCIO - NORMAL": Gs. 7.200.000.000.

ALTER TABLE planes
  ADD COLUMN responsabilidad_maxima_cotizable NUMERIC(14,2);

UPDATE planes
SET responsabilidad_maxima_cotizable = 7200000000
FROM ramos
WHERE planes.ramo_id = ramos.id
  AND ramos.nombre = 'mrc'
  AND planes.nombre = 'MULTIRRIESGO COMERCIO - NORMAL';
