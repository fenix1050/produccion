-- 014_fix_plan_incendio_sin_rpf.sql
-- Fix de fiabilidad detectado en review-reliability sobre 013_seed_incendio.sql:
-- "INCENDIO - EDIFICIO Y CONTENIDO" quedó activo=TRUE (default) sin ninguna fila en
-- plan_formas_pago ni prima_tecnica_minima/descuento_maximo/recargo_maximo. Un plan activo sin
-- RPF configurado sería seleccionable desde la API en cuanto exista el listado de planes, pero
-- cualquier intento de cotizar con él fallaría o daría resultados vacíos.
-- Se desactiva hasta que llegue la confirmación del RPF (mismo pendiente ya registrado en
-- docs/ESTADO_PROYECTO.md). Mismo riesgo pendiente, no corregido acá, para "COMERCIO PROTECCION
-- TOTAL" (migración 012) — queda anotado para resolver junto con este.

UPDATE planes
SET activo = FALSE
WHERE nombre = 'INCENDIO - EDIFICIO Y CONTENIDO'
  AND ramo_id = (SELECT id FROM ramos WHERE nombre = 'incendio');