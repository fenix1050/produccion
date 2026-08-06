-- 060_mrc_quitar_murallas_cercos.sql
-- A pedido de Kevin (2026-08-06): "Sublímite Murallas y Cercos" no se usa en MRC — se retira
-- del catálogo del ramo (coberturas_catalogo.id = 13) para que deje de aparecer como opción
-- en las 3 cotizaciones de MRC (COMERCIO PROTECCION TOTAL, MULTIRRIESGO COMERCIO - NORMAL,
-- MULTIRRIESGO COMERCIO - SEGUCOOP). Solo afecta cotizaciones nuevas de acá en adelante — las
-- ya emitidas (ej. MRC-375) quedan intactas, `riesgo_datos` es JSONB propio de cada fila.
--
-- `coberturas_catalogo.activo = FALSE` alcanza para bloquearla: `findCoberturasCatalogoByRamoId`
-- (backend/src/repositories/coberturas.repository.js) filtra `.eq('activo', true)`, así que deja
-- de aparecer en `catalogoRamo` y cualquier intento de cargarla como cobertura adicional corta
-- con el 422 explícito ya existente ("no existe o no está activa en el catálogo").
--
-- Se borran también sus 3 filas de `plan_coberturas` (todas con incluida_por_defecto = TRUE,
-- monto = Gs. 1.000.000) para que el panel admin ("Coberturas por plan") no siga mostrando un
-- sub-límite fantasma en los 3 planes de MRC.
--
-- Rollback: UPDATE coberturas_catalogo SET activo = TRUE WHERE id = 13; y volver a insertar las
-- 3 filas de plan_coberturas (plan_id 4, 6... revisar valores reales antes de reinsertar, no
-- estaban compuestos aquí a propósito porque no es el camino esperado de rollback).

DELETE FROM plan_coberturas
WHERE cobertura_id = 13;

UPDATE coberturas_catalogo
SET activo = FALSE
WHERE id = 13
  AND codigo = 'sublimite_murallas_cercos';
