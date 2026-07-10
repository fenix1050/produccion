-- 010_planes_codigo_tasa.sql
-- Agrega el código de pestaña del Excel de tasas ("Automovil_Listado_de_Tasa.xlsx")
-- a cada plan de Auto, para que el importador (backend/src/services/tasas.service.js)
-- pueda resolver a qué plan corresponde cada hoja del archivo sin depender del nombre.

ALTER TABLE planes ADD COLUMN codigo_tasa VARCHAR(10) UNIQUE;

COMMENT ON COLUMN planes.codigo_tasa IS
  'Código de la pestaña del Excel de tasas de Auto (ej. "107") usado por el importador de tasas_capital. NULL para ramos/planes que no importan tasas desde ese archivo.';

UPDATE planes SET codigo_tasa = '107' WHERE nombre = 'PLAN TAJY PREMIUM';
UPDATE planes SET codigo_tasa = '103' WHERE nombre = 'PLAN TAJY SUPERIOR';
UPDATE planes SET codigo_tasa = '102' WHERE nombre = 'PLAN TAJY FUERTE';
UPDATE planes SET codigo_tasa = '101' WHERE nombre = 'PLAN TAJY NOBLE';
