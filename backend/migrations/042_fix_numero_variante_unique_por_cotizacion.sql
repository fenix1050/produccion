-- 042_fix_numero_variante_unique_por_cotizacion.sql
-- `cotizacion_variantes.numero_variante` se pobla desde un correlativo POR RAMO
-- (`cotizaciones.service.js`, `insertarCoberturasYVariantes`: `nextNumeroCorrelativo(ramoId)`),
-- pero la migración 005 la declaró UNIQUE a nivel de toda la tabla. Dos ramos distintos avanzan
-- su correlativo de forma independiente, así que en cuanto sus contadores coinciden en un mismo
-- valor (ej. ramo Incendio y ramo MRC llegando los dos a "7"), el segundo INSERT revienta con
-- duplicate key en `cotizacion_variantes_numero_variante_key` — aunque no haya ningún conflicto
-- real de negocio, porque `numero_variante` es un dato puramente interno (no aparece en frontend
-- ni en ningún template de PDF, confirmado con `rg -n "numero_variante"`). La unicidad que
-- realmente se necesita es una variante no repetida DENTRO de la misma cotización, no global.
ALTER TABLE cotizacion_variantes DROP CONSTRAINT cotizacion_variantes_numero_variante_key;
ALTER TABLE cotizacion_variantes ADD CONSTRAINT cotizacion_variantes_cotizacion_id_numero_variante_key UNIQUE (cotizacion_id, numero_variante);
